import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  REVIEW_BROKER_CONFIG_PATH_ENV,
  REVIEW_BROKER_DB_PATH_ENV,
  TANDEM_BROKER_DB_ENV,
  findWorkspaceRoot,
  resolveBrokerPaths,
} from '../src/runtime/path-resolution.js';

const tempDirectories: string[] = [];

afterEach(() => {
  while (tempDirectories.length > 0) {
    const directory = tempDirectories.pop();

    if (directory) {
      rmSync(directory, { recursive: true, force: true });
    }
  }
});

describe('review-broker-server path resolution', () => {
  it('prefers an explicit dbPath argument over env and default fallbacks', () => {
    const { workspaceRoot, nestedCwd } = createWorkspaceFixture();

    const resolved = resolveBrokerPaths({
      cwd: nestedCwd,
      dbPath: './runtime/explicit.sqlite',
      env: {
        HOME: '/home/tester',
        [REVIEW_BROKER_DB_PATH_ENV]: './runtime/from-env.sqlite',
      },
    });

    expect(resolved.workspaceRoot).toBe(workspaceRoot);
    expect(resolved.dbPathSource).toBe('argument');
    expect(resolved.dbPath).toBe(path.resolve(nestedCwd, './runtime/explicit.sqlite'));
    expect(resolved.configPathSource).toBe('default');
    expect(resolved.configPath).toBe(path.join(workspaceRoot, '.gsd', 'review-broker', 'config.json'));
  });

  it('uses env overrides when no explicit dbPath argument is provided', () => {
    const { nestedCwd } = createWorkspaceFixture();

    const resolved = resolveBrokerPaths({
      cwd: nestedCwd,
      env: {
        HOME: '/home/tester',
        [REVIEW_BROKER_DB_PATH_ENV]: './runtime/from-env.sqlite',
        [REVIEW_BROKER_CONFIG_PATH_ENV]: './runtime/review-broker.config.json',
      },
    });

    expect(resolved.dbPathSource).toBe('env');
    expect(resolved.dbPath).toBe(path.resolve(nestedCwd, './runtime/from-env.sqlite'));
    expect(resolved.configPathSource).toBe('env');
    expect(resolved.configPath).toBe(path.resolve(nestedCwd, './runtime/review-broker.config.json'));
  });

  it('falls back to an XDG-style per-user database path and finds the workspace root from nested directories', () => {
    const { workspaceRoot, nestedCwd } = createWorkspaceFixture();

    const resolved = resolveBrokerPaths({
      cwd: nestedCwd,
      homeDir: '/home/tester',
      env: {
        HOME: '/home/tester',
        XDG_STATE_HOME: '/tmp/test-state-home',
      },
    });

    expect(findWorkspaceRoot(nestedCwd)).toBe(workspaceRoot);
    expect(resolved.dbPathSource).toBe('default');
    expect(resolved.dbPath).toBe(path.join('/tmp/test-state-home', 'tandem2', 'review-broker.sqlite'));
    expect(resolved.configPath).toBe(path.join(workspaceRoot, '.gsd', 'review-broker', 'config.json'));
  });

  it('can prefer the local Tandem extension database when the extension database is present', () => {
    const { workspaceRoot, nestedCwd } = createWorkspaceFixture();
    installLocalTandemExtensionMarker(workspaceRoot);
    installLocalTandemBrokerDb(workspaceRoot);

    const resolved = resolveBrokerPaths({
      cwd: nestedCwd,
      homeDir: '/home/tester',
      env: {
        HOME: '/home/tester',
        XDG_STATE_HOME: '/tmp/test-state-home',
      },
      preferLocalExtensionDb: true,
    });

    expect(resolved.dbPathSource).toBe('local-extension');
    expect(resolved.dbPath).toBe(path.join(workspaceRoot, '.gsd', 'review-broker', 'broker.db'));
  });

  it('falls back to the global default when a local Tandem extension exists without a local database', () => {
    const { workspaceRoot, nestedCwd } = createWorkspaceFixture();
    installLocalTandemExtensionMarker(workspaceRoot);

    const resolved = resolveBrokerPaths({
      cwd: nestedCwd,
      homeDir: '/home/tester',
      env: {
        HOME: '/home/tester',
        XDG_STATE_HOME: '/tmp/test-state-home',
      },
      preferLocalExtensionDb: true,
    });

    expect(resolved.dbPathSource).toBe('default');
    expect(resolved.dbPath).toBe(path.join('/tmp/test-state-home', 'tandem2', 'review-broker.sqlite'));
  });

  it('uses TANDEM_BROKER_DB when preferring a local Tandem extension database', () => {
    const { workspaceRoot, nestedCwd } = createWorkspaceFixture();
    installLocalTandemExtensionMarker(workspaceRoot);

    const resolved = resolveBrokerPaths({
      cwd: nestedCwd,
      env: {
        HOME: '/home/tester',
        [TANDEM_BROKER_DB_ENV]: './custom/local-broker.sqlite',
      },
      preferLocalExtensionDb: true,
    });

    expect(resolved.dbPathSource).toBe('local-extension');
    expect(resolved.dbPath).toBe(path.resolve(nestedCwd, './custom/local-broker.sqlite'));
  });

  it('keeps env and argument database overrides above local Tandem extension discovery', () => {
    const { workspaceRoot, nestedCwd } = createWorkspaceFixture();
    installLocalTandemExtensionMarker(workspaceRoot);

    const envResolved = resolveBrokerPaths({
      cwd: nestedCwd,
      env: {
        HOME: '/home/tester',
        [REVIEW_BROKER_DB_PATH_ENV]: './runtime/from-env.sqlite',
      },
      preferLocalExtensionDb: true,
    });

    expect(envResolved.dbPathSource).toBe('env');
    expect(envResolved.dbPath).toBe(path.resolve(nestedCwd, './runtime/from-env.sqlite'));

    const argumentResolved = resolveBrokerPaths({
      cwd: nestedCwd,
      dbPath: './runtime/explicit.sqlite',
      env: {
        HOME: '/home/tester',
        [REVIEW_BROKER_DB_PATH_ENV]: './runtime/from-env.sqlite',
      },
      preferLocalExtensionDb: true,
    });

    expect(argumentResolved.dbPathSource).toBe('argument');
    expect(argumentResolved.dbPath).toBe(path.resolve(nestedCwd, './runtime/explicit.sqlite'));
  });

  it('falls back to the global default when local extension DB preference is requested without a local install', () => {
    const { nestedCwd } = createWorkspaceFixture();

    const resolved = resolveBrokerPaths({
      cwd: nestedCwd,
      homeDir: '/home/tester',
      env: {
        HOME: '/home/tester',
        XDG_STATE_HOME: '/tmp/test-state-home',
      },
      preferLocalExtensionDb: true,
    });

    expect(resolved.dbPathSource).toBe('default');
    expect(resolved.dbPath).toBe(path.join('/tmp/test-state-home', 'tandem2', 'review-broker.sqlite'));
  });
});

function createWorkspaceFixture(): { workspaceRoot: string; nestedCwd: string } {
  const workspaceRoot = mkdtempSync(path.join(os.tmpdir(), 'review-broker-paths-'));
  tempDirectories.push(workspaceRoot);

  mkdirSync(path.join(workspaceRoot, '.git'));
  mkdirSync(path.join(workspaceRoot, '.gsd'));
  writeFileSync(path.join(workspaceRoot, 'package.json'), '{"name":"fixture"}\n');

  const nestedCwd = path.join(workspaceRoot, 'packages', 'review-broker-server', 'src');
  mkdirSync(nestedCwd, { recursive: true });

  return { workspaceRoot, nestedCwd };
}

function installLocalTandemExtensionMarker(workspaceRoot: string): void {
  const extensionPath = path.join(workspaceRoot, '.gsd', 'extensions', 'tandem-review.mjs');
  mkdirSync(path.dirname(extensionPath), { recursive: true });
  writeFileSync(extensionPath, 'export default {};\n', 'utf8');
}

function installLocalTandemBrokerDb(workspaceRoot: string): void {
  const dbPath = path.join(workspaceRoot, '.gsd', 'review-broker', 'broker.db');
  mkdirSync(path.dirname(dbPath), { recursive: true });
  writeFileSync(dbPath, '', 'utf8');
}
