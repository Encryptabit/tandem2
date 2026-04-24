import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { ensureReviewBrokerConfigDefaults } from '../src/config-defaults.js';

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'review-broker-ext-config-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe('ensureReviewBrokerConfigDefaults', () => {
  it('creates config.json with reviewer and reviewer_pool defaults when missing', () => {
    const root = makeTempDir();

    const result = ensureReviewBrokerConfigDefaults({
      projectRoot: root,
      workerCommand: 'node',
      workerScriptPath: '/tmp/reviewer-worker.mjs',
    });

    expect(result.created).toBe(true);
    expect(result.updated).toBe(true);
    expect(result.providerName).toBe('codex');

    const configPath = path.join(root, '.gsd', 'review-broker', 'config.json');
    const parsed = JSON.parse(readFileSync(configPath, 'utf8'));

    expect(parsed.reviewer.provider).toBe('codex');
    expect(parsed.reviewer.providers.codex).toEqual({
      command: 'node',
      args: ['/tmp/reviewer-worker.mjs'],
    });
    expect(parsed.reviewer_pool).toMatchObject({
      max_pool_size: 3,
      scaling_ratio: 1,
      idle_timeout_seconds: 300,
      max_ttl_seconds: 3600,
      claim_timeout_seconds: 1800,
      spawn_cooldown_seconds: 5,
      background_check_interval_seconds: 10,
    });
  });

  it('is idempotent and does not override existing provider command/args', () => {
    const root = makeTempDir();

    ensureReviewBrokerConfigDefaults({
      projectRoot: root,
      workerCommand: 'node',
      workerScriptPath: '/tmp/initial-worker.mjs',
    });

    const second = ensureReviewBrokerConfigDefaults({
      projectRoot: root,
      workerCommand: 'node-custom',
      workerScriptPath: '/tmp/other-worker.mjs',
    });

    expect(second.created).toBe(false);
    expect(second.updated).toBe(false);

    const configPath = path.join(root, '.gsd', 'review-broker', 'config.json');
    const parsed = JSON.parse(readFileSync(configPath, 'utf8'));

    expect(parsed.reviewer.providers.codex).toEqual({
      command: 'node',
      args: ['/tmp/initial-worker.mjs'],
    });
  });

  it('upgrades legacy relative worker script path when a resolvable absolute path is available', () => {
    const root = makeTempDir();
    const configPath = path.join(root, '.gsd', 'review-broker', 'config.json');
    mkdirSync(path.dirname(configPath), { recursive: true });

    writeFileSync(
      configPath,
      JSON.stringify(
        {
          reviewer: {
            provider: 'claude',
            providers: {
              claude: {
                command: 'node',
                args: ['packages/review-broker-server/scripts/reviewer-worker.mjs'],
              },
            },
          },
          reviewer_pool: {},
        },
        null,
        2,
      ) + '\n',
      'utf8',
    );

    const result = ensureReviewBrokerConfigDefaults({
      projectRoot: root,
      workerScriptPath: '/opt/reviewer-worker.mjs',
    });

    expect(result.updated).toBe(true);

    const parsed = JSON.parse(readFileSync(configPath, 'utf8'));
    expect(parsed.reviewer.providers.claude.args).toEqual(['/opt/reviewer-worker.mjs']);
  });

  it('preserves existing provider settings and backfills missing pool keys', () => {
    const root = makeTempDir();
    const configPath = path.join(root, '.gsd', 'review-broker', 'config.json');
    mkdirSync(path.dirname(configPath), { recursive: true });

    writeFileSync(
      configPath,
      JSON.stringify(
        {
          reviewer: {
            provider: 'custom',
            providers: {
              custom: {
                command: '/usr/local/bin/custom-reviewer',
                args: ['--loop'],
              },
            },
          },
          reviewer_pool: {
            max_pool_size: 2,
          },
        },
        null,
        2,
      ) + '\n',
      'utf8',
    );

    const result = ensureReviewBrokerConfigDefaults({
      projectRoot: root,
      workerCommand: 'node',
      workerScriptPath: '/tmp/default-worker.mjs',
    });

    expect(result.created).toBe(false);
    expect(result.updated).toBe(true);
    expect(result.providerName).toBe('custom');

    const parsed = JSON.parse(readFileSync(configPath, 'utf8'));

    expect(parsed.reviewer.providers.custom).toEqual({
      command: '/usr/local/bin/custom-reviewer',
      args: ['--loop'],
    });
    expect(parsed.reviewer_pool.max_pool_size).toBe(2);
    expect(parsed.reviewer_pool.scaling_ratio).toBe(1);
    expect(parsed.reviewer_pool.background_check_interval_seconds).toBe(10);
  });

  it('upgrades legacy pool timeout defaults but preserves custom values', () => {
    const root = makeTempDir();
    const configPath = path.join(root, '.gsd', 'review-broker', 'config.json');
    mkdirSync(path.dirname(configPath), { recursive: true });

    writeFileSync(
      configPath,
      JSON.stringify(
        {
          reviewer: {
            provider: 'codex',
            providers: {
              codex: {
                command: 'node',
                args: ['/tmp/reviewer-worker.mjs'],
              },
            },
          },
          reviewer_pool: {
            max_pool_size: 2,
            max_ttl_seconds: 600,
            claim_timeout_seconds: 300,
            idle_timeout_seconds: 900,
          },
        },
        null,
        2,
      ) + '\n',
      'utf8',
    );

    const result = ensureReviewBrokerConfigDefaults({
      projectRoot: root,
      workerCommand: 'node',
      workerScriptPath: '/tmp/reviewer-worker.mjs',
    });

    expect(result.updated).toBe(true);

    const parsed = JSON.parse(readFileSync(configPath, 'utf8'));
    expect(parsed.reviewer_pool.max_ttl_seconds).toBe(3600);
    expect(parsed.reviewer_pool.claim_timeout_seconds).toBe(1800);
    expect(parsed.reviewer_pool.idle_timeout_seconds).toBe(900);
  });
});
