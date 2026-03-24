import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  REVIEW_BROKER_CONFIG_PATH_ENV,
  REVIEW_BROKER_DB_PATH_ENV,
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
