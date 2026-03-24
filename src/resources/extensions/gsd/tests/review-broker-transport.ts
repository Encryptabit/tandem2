import { execFile, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import type {
  ReviewErrorInfo,
  ReviewStatusRecord,
  ReviewTransport,
  ReviewUnitIdentity,
} from '../review/types.ts';

const execFileAsync = promisify(execFile);
const defaultFixturePath = fileURLToPath(new URL('./fixtures/review-broker-fixture.mjs', import.meta.url));

export interface BrokerFixtureScenarioRecord {
  status: ReviewStatusRecord['status'];
  summary?: string;
  feedback?: string;
  error?: ReviewErrorInfo;
  updatedAt?: string;
}

export interface BrokerFixtureScenario {
  submit?: BrokerFixtureScenarioRecord;
  statusSequence?: BrokerFixtureScenarioRecord[];
  submitError?: ReviewErrorInfo;
  reuseOpenReview?: boolean;
}

export interface PersistedBrokerReviewRow {
  reviewId: string;
  unitId: string;
  status: ReviewStatusRecord['status'];
  summary: string | null;
  feedback: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  errorRetryable: boolean;
  updatedAt: string;
  statusCalls: number;
}

export interface StartedReviewBrokerTransport {
  transport: ReviewTransport;
  baseUrl: string;
  dbPath: string;
  pid: number;
  stop(): Promise<void>;
  setUnitScenario(unitId: string, scenario: BrokerFixtureScenario): Promise<void>;
  clearUnitScenario(unitId: string): Promise<void>;
  listFixtureReviews(): Promise<PersistedBrokerReviewRow[]>;
}

export interface StartReviewBrokerTransportArgs {
  rootDir: string;
  dbPath?: string;
  fixturePath?: string;
  host?: string;
  port?: number;
  timeoutMs?: number;
}

function sqlString(value: string | null | undefined): string {
  if (value === null || value === undefined) {
    return 'null';
  }
  return `'${String(value).replace(/'/g, "''")}'`;
}

async function sqliteJson<T>(dbPath: string, sql: string): Promise<T[]> {
  const { stdout } = await execFileAsync('sqlite3', ['-json', dbPath, sql], { maxBuffer: 1024 * 1024 * 4 });
  const text = stdout.trim();
  return text ? (JSON.parse(text) as T[]) : [];
}

function normalizePersistedRow(row: {
  review_id: string;
  unit_id: string;
  status: PersistedBrokerReviewRow['status'];
  summary: string | null;
  feedback: string | null;
  error_code: string | null;
  error_message: string | null;
  error_retryable: number | null;
  updated_at: string;
  status_calls: number | null;
}): PersistedBrokerReviewRow {
  return {
    reviewId: row.review_id,
    unitId: row.unit_id,
    status: row.status,
    summary: row.summary,
    feedback: row.feedback,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    errorRetryable: Number(row.error_retryable ?? 0) === 1,
    updatedAt: row.updated_at,
    statusCalls: Number(row.status_calls ?? 0),
  };
}

export async function readPersistedBrokerReviews(dbPath: string): Promise<PersistedBrokerReviewRow[]> {
  const rows = await sqliteJson<{
    review_id: string;
    unit_id: string;
    status: PersistedBrokerReviewRow['status'];
    summary: string | null;
    feedback: string | null;
    error_code: string | null;
    error_message: string | null;
    error_retryable: number | null;
    updated_at: string;
    status_calls: number | null;
  }>(
    dbPath,
    `
      select review_id, unit_id, status, summary, feedback,
             error_code, error_message, error_retryable,
             updated_at, status_calls
      from reviews
      order by review_id;
    `,
  );

  return rows.map(normalizePersistedRow);
}

export async function readPersistedBrokerReview(
  dbPath: string,
  reviewId: string,
): Promise<PersistedBrokerReviewRow | null> {
  const rows = await sqliteJson<{
    review_id: string;
    unit_id: string;
    status: PersistedBrokerReviewRow['status'];
    summary: string | null;
    feedback: string | null;
    error_code: string | null;
    error_message: string | null;
    error_retryable: number | null;
    updated_at: string;
    status_calls: number | null;
  }>(
    dbPath,
    `
      select review_id, unit_id, status, summary, feedback,
             error_code, error_message, error_retryable,
             updated_at, status_calls
      from reviews
      where review_id = ${sqlString(reviewId)}
      limit 1;
    `,
  );

  return rows[0] ? normalizePersistedRow(rows[0]) : null;
}

async function requestJson<T>(baseUrl: string, pathName: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl}${pathName}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  const payload = (await response.json()) as T | { error?: ReviewErrorInfo };
  if (!response.ok) {
    const error = (payload as { error?: ReviewErrorInfo }).error ?? {
      code: 'review_broker_transport_error',
      message: `Fixture request failed (${response.status}).`,
    };
    throw error;
  }

  return payload as T;
}

function waitForReady(child: ChildProcessWithoutNullStreams, timeoutMs: number): Promise<{
  baseUrl: string;
  dbPath: string;
  pid: number;
}> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let stdout = '';
    let stderr = '';

    const timeout = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      child.kill('SIGTERM');
      reject(new Error(`review_broker_fixture_timeout:${stderr || stdout || 'fixture did not become ready'}`));
    }, timeoutMs);

    function finish(callback: () => void): void {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      callback();
    }

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
      const lines = stdout.split(/\r?\n/);
      stdout = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.startsWith('READY ')) {
          continue;
        }
        finish(() => resolve(JSON.parse(line.slice('READY '.length))));
        return;
      }
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.once('exit', (code, signal) => {
      finish(() => {
        reject(new Error(`review_broker_fixture_exit:${signal ?? code ?? 'unknown'}:${stderr || stdout}`));
      });
    });

    child.once('error', (error) => {
      finish(() => reject(error));
    });
  });
}

export async function startReviewBrokerTransport(
  args: StartReviewBrokerTransportArgs,
): Promise<StartedReviewBrokerTransport> {
  await mkdir(args.rootDir, { recursive: true });

  const dbPath = args.dbPath ?? path.join(args.rootDir, 'review-broker.sqlite');
  const child = spawn(process.execPath, [args.fixturePath ?? defaultFixturePath], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      REVIEW_BROKER_DB_PATH: dbPath,
      REVIEW_BROKER_HOST: args.host ?? '127.0.0.1',
      REVIEW_BROKER_PORT: String(args.port ?? 0),
    },
  });

  const ready = await waitForReady(child, args.timeoutMs ?? 5_000);
  let stopping: Promise<void> | null = null;

  const transport: ReviewTransport = {
    async submitReview(unit: ReviewUnitIdentity): Promise<ReviewStatusRecord> {
      return requestJson<ReviewStatusRecord>(ready.baseUrl, '/submit', {
        method: 'POST',
        body: JSON.stringify({ unit }),
      });
    },
    async getStatus(reviewId: string): Promise<ReviewStatusRecord> {
      return requestJson<ReviewStatusRecord>(ready.baseUrl, `/status?reviewId=${encodeURIComponent(reviewId)}`);
    },
  };

  return {
    transport,
    baseUrl: ready.baseUrl,
    dbPath: ready.dbPath,
    pid: ready.pid,
    async stop(): Promise<void> {
      if (stopping) {
        return stopping;
      }
      if (child.exitCode !== null || child.killed) {
        return;
      }

      stopping = new Promise((resolve) => {
        child.once('exit', () => resolve());
        child.kill('SIGTERM');
      });
      await stopping;
    },
    async setUnitScenario(unitId: string, scenario: BrokerFixtureScenario): Promise<void> {
      await requestJson<{ ok: boolean }>(ready.baseUrl, '/admin/scenario', {
        method: 'POST',
        body: JSON.stringify({ unitId, scenario }),
      });
    },
    async clearUnitScenario(unitId: string): Promise<void> {
      await requestJson<{ ok: boolean }>(
        ready.baseUrl,
        `/admin/scenario?unitId=${encodeURIComponent(unitId)}`,
        { method: 'DELETE' },
      );
    },
    async listFixtureReviews(): Promise<PersistedBrokerReviewRow[]> {
      return readPersistedBrokerReviews(ready.dbPath);
    },
  };
}
