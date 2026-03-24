import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';

export const DEFAULT_BUSY_TIMEOUT_MS = 5_000;

export interface OpenDatabaseOptions {
  dbPath: string;
  busyTimeoutMs?: number;
  migrationsDir?: string;
  readonly?: boolean;
  fileMustExist?: boolean;
}

export interface DatabasePragmas {
  journalMode: string;
  busyTimeoutMs: number;
  foreignKeys: boolean;
  synchronous: 'OFF' | 'NORMAL' | 'FULL' | 'EXTRA' | string;
}

export interface AppliedMigration {
  id: string;
  checksum: string;
  appliedAt: string;
}

export interface OpenDatabaseResult {
  db: Database.Database;
  dbPath: string;
  pragmas: DatabasePragmas;
  appliedMigrations: AppliedMigration[];
  close: () => void;
}

interface SchemaMigrationRow {
  id: string;
  checksum: string;
  applied_at: string;
}

export function openDatabase(options: OpenDatabaseOptions): OpenDatabaseResult {
  const dbPath = path.resolve(options.dbPath);
  const busyTimeoutMs = options.busyTimeoutMs ?? DEFAULT_BUSY_TIMEOUT_MS;
  const migrationsDir = options.migrationsDir ?? resolveMigrationsDirectory();

  ensureDatabaseDirectory(dbPath);

  let db: Database.Database | undefined;

  try {
    const connectionOptions: Database.Options = {};

    if (options.readonly !== undefined) {
      connectionOptions.readonly = options.readonly;
    }

    if (options.fileMustExist !== undefined) {
      connectionOptions.fileMustExist = options.fileMustExist;
    }

    db = new Database(dbPath, connectionOptions);

    applyPragmas(db, busyTimeoutMs);
    ensureSchemaMigrationsTable(db);
    const appliedMigrations = applyMigrations(db, migrationsDir);
    const pragmas = readDatabasePragmas(db);

    return {
      db,
      dbPath,
      pragmas,
      appliedMigrations,
      close: () => db?.close(),
    };
  } catch (error) {
    db?.close();
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to open broker database at ${dbPath}: ${message}`);
  }
}

export function readDatabasePragmas(db: Database.Database): DatabasePragmas {
  return {
    journalMode: String(db.pragma('journal_mode', { simple: true })).toUpperCase(),
    busyTimeoutMs: Number(db.pragma('busy_timeout', { simple: true })),
    foreignKeys: Number(db.pragma('foreign_keys', { simple: true })) === 1,
    synchronous: normalizeSynchronousMode(db.pragma('synchronous', { simple: true })),
  };
}

function applyPragmas(db: Database.Database, busyTimeoutMs: number): void {
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma(`busy_timeout = ${busyTimeoutMs}`);
  db.pragma('foreign_keys = ON');
}

function ensureSchemaMigrationsTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      checksum TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);
}

function applyMigrations(db: Database.Database, migrationsDir: string): AppliedMigration[] {
  const migrationFiles = readdirSync(migrationsDir)
    .filter((fileName) => fileName.endsWith('.sql'))
    .sort((left, right) => left.localeCompare(right));

  const existing = new Map(
    db
      .prepare<unknown[], SchemaMigrationRow>('SELECT id, checksum, applied_at FROM schema_migrations ORDER BY id ASC')
      .all()
      .map((row) => [row.id, row]),
  );

  const insertMigration = db.prepare(
    'INSERT INTO schema_migrations (id, checksum, applied_at) VALUES (@id, @checksum, @appliedAt)',
  );

  const executeMigration = db.transaction((migrationId: string, sql: string, checksum: string, appliedAt: string) => {
    db.exec(sql);
    insertMigration.run({ id: migrationId, checksum, appliedAt });
  });

  for (const fileName of migrationFiles) {
    const migrationId = path.basename(fileName, '.sql');
    const sql = readFileSync(path.join(migrationsDir, fileName), 'utf8');
    const checksum = hashMigration(sql);
    const applied = existing.get(migrationId);

    if (applied) {
      if (applied.checksum !== checksum) {
        throw new Error(
          `Migration checksum mismatch for ${migrationId}. Expected ${applied.checksum}, received ${checksum}.`,
        );
      }

      continue;
    }

    executeMigration(migrationId, sql, checksum, new Date().toISOString());
  }

  return db
    .prepare<unknown[], SchemaMigrationRow>('SELECT id, checksum, applied_at FROM schema_migrations ORDER BY id ASC')
    .all()
    .map((row) => ({
      id: row.id,
      checksum: row.checksum,
      appliedAt: row.applied_at,
    }));
}

function ensureDatabaseDirectory(dbPath: string): void {
  if (dbPath === ':memory:' || dbPath.startsWith('file:')) {
    return;
  }

  mkdirSync(path.dirname(dbPath), { recursive: true });
}

function resolveMigrationsDirectory(): string {
  const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.join(moduleDirectory, 'migrations'),
    path.join(moduleDirectory, '../../src/db/migrations'),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return path.resolve(candidate);
    }
  }

  throw new Error(`Unable to locate migrations directory from ${moduleDirectory}.`);
}

function hashMigration(sql: string): string {
  return createHash('sha256').update(sql).digest('hex');
}

function normalizeSynchronousMode(value: unknown): DatabasePragmas['synchronous'] {
  const numericValue = Number(value);

  switch (numericValue) {
    case 0:
      return 'OFF';
    case 1:
      return 'NORMAL';
    case 2:
      return 'FULL';
    case 3:
      return 'EXTRA';
    default:
      return String(value).toUpperCase();
  }
}
