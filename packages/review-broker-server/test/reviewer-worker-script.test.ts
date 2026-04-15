import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
  it('queue mode claims pending review via tandem and submits verdict', async () => {
    const harness = createHarness({ mode: 'queue' });
    const child = spawn(process.execPath, [harness.workerScriptPath], {
      cwd: WORKTREE_ROOT,
      env: {
        ...process.env,
        PATH: `${harness.binDir}:${process.env.PATH ?? ''}`,
        GSD_LOG_PATH: harness.gsdLogPath,
        TANDEM_LOG_PATH: harness.tandemLogPath,
        TANDEM_STATE_PATH: harness.statePath,
        REVIEW_BROKER_REVIEWER_ID: 'reviewer-loop-1',
        REVIEWER_MODEL: 'test-model',
        REVIEWER_POLL_INTERVAL_MS: '25',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    try {
      await waitForTandemCommand(harness.tandemLogPath, 'reviews', 'verdict');
    } finally {
      child.kill('SIGTERM');
      await waitForExit(child);
    }

    const tandemEntries = readLogEntries(harness.tandemLogPath);
    const commands = tandemEntries.map((entry) => `${entry.args[0] ?? ''} ${entry.args[1] ?? ''}`.trim());

    expect(commands).toEqual(
      expect.arrayContaining([
        'reviews list',
        'reviews claim',
        'proposal show',
        'discussion add',
        'reviews verdict',
      ]),
    );

    const gsdEntries = readLogEntries(harness.gsdLogPath);
    expect(gsdEntries.length).toBeGreaterThanOrEqual(1);
    expect(gsdEntries[0]?.args.slice(0, 4)).toEqual(['--print', '--no-session', '--model', 'test-model']);
    expect(gsdEntries[0]?.args.at(-1)).toContain('rvw_queue_1');
    expect(gsdEntries[0]?.args.at(-1)).toContain('diff --git');
  });

  it('single-review mode claims target review and exits after one verdict', async () => {
    const harness = createHarness({ mode: 'single' });
    const child = spawn(process.execPath, [harness.workerScriptPath, 'rvw_single_1'], {
      cwd: WORKTREE_ROOT,
      env: {
        ...process.env,
        PATH: `${harness.binDir}:${process.env.PATH ?? ''}`,
        GSD_LOG_PATH: harness.gsdLogPath,
        TANDEM_LOG_PATH: harness.tandemLogPath,
        TANDEM_STATE_PATH: harness.statePath,
        REVIEW_BROKER_REVIEWER_ID: 'reviewer-single-1',
        REVIEWER_MODEL: 'single-model',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    await waitForExit(child);

    const tandemEntries = readLogEntries(harness.tandemLogPath);
    expect(tandemEntries.map((entry) => `${entry.args[0] ?? ''} ${entry.args[1] ?? ''}`.trim())).toEqual(
      expect.arrayContaining(['reviews claim', 'proposal show', 'discussion add', 'reviews verdict']),
    );

    const claimEntry = tandemEntries.find((entry) => entry.args[0] === 'reviews' && entry.args[1] === 'claim');
    expect(claimEntry?.args[2]).toBe('rvw_single_1');

    const gsdEntries = readLogEntries(harness.gsdLogPath);
    expect(gsdEntries).toHaveLength(1);
    expect(gsdEntries[0]?.args[3]).toBe('single-model');
    expect(gsdEntries[0]?.args.at(-1)).toContain('rvw_single_1');
  });
});

function createHarness(options: { mode: 'queue' | 'single' }): {
  binDir: string;
  gsdLogPath: string;
  tandemLogPath: string;
  statePath: string;
  workerScriptPath: string;
} {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'reviewer-worker-script-'));
  tempDirectories.push(directory);

  const binDir = path.join(directory, 'bin');
  mkdirSync(binDir, { recursive: true });

  const gsdLogPath = path.join(directory, 'gsd-log.jsonl');
  const tandemLogPath = path.join(directory, 'tandem-log.jsonl');
  const statePath = path.join(directory, 'tandem-state.json');

  writeFileSync(
    statePath,
    JSON.stringify(
      {
        mode: options.mode,
        queueClaimed: false,
        singleClaimed: false,
      },
      null,
      2,
    ),
    'utf8',
  );

  const fakeGsdPath = path.join(binDir, 'gsd');
  const fakeGsdBody = `#!/usr/bin/env node
import { appendFileSync } from 'node:fs';
appendFileSync(process.env.GSD_LOG_PATH, JSON.stringify({ args: process.argv.slice(2) }) + '\\n');
process.stdout.write(JSON.stringify({ verdict: 'approved', reason: 'Looks good', message: 'Automated feedback' }));
process.exit(0);
`;

  const fakeTandemPath = path.join(binDir, 'tandem');
  const fakeTandemBody = `#!/usr/bin/env node
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
appendFileSync(process.env.TANDEM_LOG_PATH, JSON.stringify({ args }) + '\\n');

const statePath = process.env.TANDEM_STATE_PATH;
const state = existsSync(statePath)
  ? JSON.parse(readFileSync(statePath, 'utf8'))
  : { mode: 'queue', queueClaimed: false, singleClaimed: false };

function saveState() {
  writeFileSync(statePath, JSON.stringify(state, null, 2));
}

function output(value) {
  process.stdout.write(JSON.stringify(value));
  process.exit(0);
}

if (args[0] === 'reviews' && args[1] === 'list') {
  if (state.mode === 'queue' && !state.queueClaimed) {
    output({ reviews: [{ reviewId: 'rvw_queue_1' }], version: 1 });
  }
  output({ reviews: [], version: 1 });
}

if (args[0] === 'reviews' && args[1] === 'claim') {
  const reviewId = args[2];
  if (reviewId === 'rvw_queue_1' && state.mode === 'queue' && !state.queueClaimed) {
    state.queueClaimed = true;
    saveState();
    output({ outcome: 'claimed', review: { reviewId }, version: 2 });
  }
  if (reviewId === 'rvw_single_1' && state.mode === 'single' && !state.singleClaimed) {
    state.singleClaimed = true;
    saveState();
    output({ outcome: 'claimed', review: { reviewId }, version: 2 });
  }
  output({ outcome: 'not_claimable', review: null, version: 2 });
}

if (args[0] === 'proposal' && args[1] === 'show') {
  const reviewId = args[2];
  output({
    proposal: {
      reviewId,
      title: 'Fixture proposal',
      description: 'Fixture description',
      diff: 'diff --git a/file.ts b/file.ts\\n+change',
      affectedFiles: ['file.ts'],
      priority: 'normal',
      currentRound: 1,
      latestVerdict: null,
      verdictReason: null,
      counterPatchStatus: 'none',
      lastMessageAt: null,
      lastActivityAt: null,
    },
    version: 3,
  });
}

if (args[0] === 'discussion' && args[1] === 'add') {
  const reviewId = args[2];
  output({
    review: { reviewId },
    message: {
      messageId: 1,
      reviewId,
      actorId: 'fixture-reviewer',
      authorRole: 'reviewer',
      body: 'Automated feedback',
      createdAt: '2026-04-15T00:00:00.000Z',
    },
    version: 4,
  });
}

if (args[0] === 'reviews' && args[1] === 'verdict') {
  const reviewId = args[2];
  output({
    review: {
      reviewId,
      status: 'approved',
      latestVerdict: 'approved',
    },
    proposal: {
      reviewId,
      title: 'Fixture proposal',
      description: 'Fixture description',
      diff: 'diff --git a/file.ts b/file.ts\\n+change',
      affectedFiles: ['file.ts'],
      priority: 'normal',
      currentRound: 1,
      latestVerdict: 'approved',
      verdictReason: 'Looks good',
      counterPatchStatus: 'none',
      lastMessageAt: null,
      lastActivityAt: null,
    },
    version: 5,
  });
}

process.stderr.write('Unexpected tandem args: ' + JSON.stringify(args) + '\\n');
process.exit(1);
`;

  writeFileSync(fakeGsdPath, fakeGsdBody, 'utf8');
  writeFileSync(fakeTandemPath, fakeTandemBody, 'utf8');
  chmodSync(fakeGsdPath, 0o755);
  chmodSync(fakeTandemPath, 0o755);

  return {
    binDir,
    gsdLogPath,
    tandemLogPath,
    statePath,
    workerScriptPath: path.join(WORKTREE_ROOT, 'packages', 'review-broker-server', 'scripts', 'reviewer-worker.mjs'),
  };
}

function readLogEntries(logPath: string): Array<{ args: string[] }> {
  if (!existsSync(logPath)) {
    return [];
  }

  const raw = readFileSync(logPath, 'utf8').trim();
  if (!raw) {
    return [];
  }

  return raw
    .split(/\r?\n/u)
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as { args: string[] });
}

async function waitForTandemCommand(logPath: string, noun: string, verb: string): Promise<void> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < 5_000) {
    const entries = readLogEntries(logPath);
    if (entries.some((entry) => entry.args[0] === noun && entry.args[1] === verb)) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  throw new Error(`Timed out waiting for tandem command ${noun} ${verb}`);
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
