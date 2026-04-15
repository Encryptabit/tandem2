import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { WORKTREE_ROOT } from './test-paths.js';

const tempDirectories: string[] = [];

afterEach(() => {
  while (tempDirectories.length > 0) {
    const directory = tempDirectories.pop();
    if (directory) {
      rmSync(directory, { recursive: true, force: true });
    }
  }
});

describe('reviewer worker script', () => {
  it('runs in long-lived queue mode and passes the reviewer id into the gsd prompt', async () => {
    const harness = createHarness();
    const child = spawn(process.execPath, [harness.workerScriptPath], {
      cwd: WORKTREE_ROOT,
      env: {
        ...process.env,
        PATH: `${harness.binDir}:${process.env.PATH ?? ''}`,
        GSD_LOG_PATH: harness.logPath,
        REVIEW_BROKER_REVIEWER_ID: 'reviewer-loop-1',
        REVIEWER_MODEL: 'test-model',
        REVIEWER_POLL_INTERVAL_MS: '25',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    try {
      await waitForLogLine(harness.logPath);
    } finally {
      child.kill('SIGTERM');
      await waitForExit(child);
    }

    const entries = readLogEntries(harness.logPath);
    expect(entries.length).toBeGreaterThanOrEqual(1);
    expect(entries[0]?.args.slice(0, 2)).toEqual(['--print', '--model']);
    expect(entries[0]?.args[2]).toBe('test-model');
    expect(entries[0]?.args.at(-1)).toContain('list_reviews');
    expect(entries[0]?.args.at(-1)).toContain('claim_review');
    expect(entries[0]?.args.at(-1)).toContain('reviewer-loop-1');
  });

  it('runs in one-shot mode when a review id is provided', async () => {
    const harness = createHarness();
    const child = spawn(process.execPath, [harness.workerScriptPath, 'rvw_123'], {
      cwd: WORKTREE_ROOT,
      env: {
        ...process.env,
        PATH: `${harness.binDir}:${process.env.PATH ?? ''}`,
        GSD_LOG_PATH: harness.logPath,
        REVIEW_BROKER_REVIEWER_ID: 'reviewer-single-1',
        REVIEWER_MODEL: 'single-model',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    await waitForExit(child);

    const entries = readLogEntries(harness.logPath);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.args[2]).toBe('single-model');
    expect(entries[0]?.args.at(-1)).toContain('rvw_123');
    expect(entries[0]?.args.at(-1)).toContain('claim_review');
    expect(entries[0]?.args.at(-1)).toContain('reviewer-single-1');
  });
});

function createHarness(): { binDir: string; logPath: string; workerScriptPath: string } {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'reviewer-worker-script-'));
  tempDirectories.push(directory);

  const binDir = path.join(directory, 'bin');
  mkdirSync(binDir, { recursive: true });
  const logPath = path.join(directory, 'gsd-log.jsonl');
  const fakeGsdPath = path.join(binDir, 'gsd');
  const fakeGsdBody = `#!/usr/bin/env node\nimport { appendFileSync } from 'node:fs';\nappendFileSync(process.env.GSD_LOG_PATH, JSON.stringify({ args: process.argv.slice(2) }) + '\\n');\nprocess.exit(0);\n`;

  writeFileSync(fakeGsdPath, fakeGsdBody, 'utf8');
  chmodSync(fakeGsdPath, 0o755);

  return {
    binDir,
    logPath,
    workerScriptPath: path.join(WORKTREE_ROOT, 'packages', 'review-broker-server', 'scripts', 'reviewer-worker.mjs'),
  };
}

function readLogEntries(logPath: string): Array<{ args: string[] }> {
  return readFileSync(logPath, 'utf8')
    .trim()
    .split(/\r?\n/u)
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as { args: string[] });
}

async function waitForLogLine(logPath: string): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 5_000) {
    try {
      const contents = readFileSync(logPath, 'utf8');
      if (contents.trim().length > 0) {
        return;
      }
    } catch {
      // file not written yet
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error('Timed out waiting for fake gsd invocation');
}

async function waitForExit(child: ReturnType<typeof spawn>): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    child.once('exit', () => resolve());
    child.once('error', reject);
  });
}
