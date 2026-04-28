import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { readLayeredConfig, writeConfig } from '../src/cli/config.js';
import { seedGlobalConfigIfMissing } from '../src/runtime/seed-global-config.js';

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

function makeTempDir(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'tandem-layered-config-'));
  tempDirs.push(dir);
  return dir;
}

describe('readLayeredConfig — per-section fallback', () => {
  it('returns primary alone when fallback path is undefined', () => {
    const dir = makeTempDir();
    const primary = path.join(dir, 'primary.json');
    writeConfig(primary, { reviewer: { provider: 'claude' } });

    const merged = readLayeredConfig(primary, undefined);
    expect(merged).toEqual({ reviewer: { provider: 'claude' } });
  });

  it('fills missing top-level sections from fallback', () => {
    const dir = makeTempDir();
    const primary = path.join(dir, 'primary.json');
    const fallback = path.join(dir, 'fallback.json');
    writeConfig(primary, { reviewer: { provider: 'claude' } });
    writeConfig(fallback, { reviewer_pool: { max_pool_size: 5 } });

    const merged = readLayeredConfig(primary, fallback);
    expect(merged).toEqual({
      reviewer: { provider: 'claude' },
      reviewer_pool: { max_pool_size: 5 },
    });
  });

  it('primary wins when both layers have the same top-level key (no deep merge)', () => {
    const dir = makeTempDir();
    const primary = path.join(dir, 'primary.json');
    const fallback = path.join(dir, 'fallback.json');
    writeConfig(primary, { reviewer: { provider: 'claude' } });
    writeConfig(fallback, { reviewer: { provider: 'codex', extra: 'ignored' } });

    const merged = readLayeredConfig(primary, fallback);
    expect(merged.reviewer).toEqual({ provider: 'claude' });
  });

  it('returns fallback alone when primary file is absent', () => {
    const dir = makeTempDir();
    const primary = path.join(dir, 'never-written.json');
    const fallback = path.join(dir, 'fallback.json');
    writeConfig(fallback, { reviewer_pool: { max_pool_size: 7 } });

    const merged = readLayeredConfig(primary, fallback);
    expect(merged).toEqual({ reviewer_pool: { max_pool_size: 7 } });
  });
});

describe('seedGlobalConfigIfMissing', () => {
  it('writes a default config matching the canonical ams.test shape', () => {
    const dir = makeTempDir();
    const target = path.join(dir, 'tandem', 'config.json');

    const result = seedGlobalConfigIfMissing(target);
    expect(result.seeded).toBe(true);
    expect(result.globalConfigPath).toBe(target);

    const written = JSON.parse(require('node:fs').readFileSync(target, 'utf8')) as Record<string, unknown>;
    expect(written.reviewer_pool).toEqual({
      max_pool_size: 3,
      scaling_ratio: 1,
      idle_timeout_seconds: 300,
      max_ttl_seconds: 3600,
      claim_timeout_seconds: 1800,
      spawn_cooldown_seconds: 5,
      background_check_interval_seconds: 10,
    });
    const reviewer = written.reviewer as Record<string, unknown>;
    expect(reviewer.provider).toBe('codex');
    const codex = (reviewer.providers as Record<string, { command: string; args: string[] }>).codex;
    expect(codex.command).toBe(result.nodeExecPath);
    expect(codex.args[0]).toBe(result.workerScriptPath);
  });

  it('is idempotent — does nothing when the file already exists', () => {
    const dir = makeTempDir();
    const target = path.join(dir, 'config.json');
    writeConfig(target, { reviewer_pool: { max_pool_size: 9 }, custom: 'preserved' });

    const result = seedGlobalConfigIfMissing(target);
    expect(result.seeded).toBe(false);

    const after = JSON.parse(require('node:fs').readFileSync(target, 'utf8')) as Record<string, unknown>;
    expect(after).toEqual({ reviewer_pool: { max_pool_size: 9 }, custom: 'preserved' });
  });
});
