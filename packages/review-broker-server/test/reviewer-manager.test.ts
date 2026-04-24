import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { AppContext } from '../src/runtime/app-context.js';
import { createAppContext } from '../src/runtime/app-context.js';
import { afterEach, describe, expect, it } from 'vitest';

import { REVIEWER_FIXTURE_PATH, WORKTREE_ROOT } from './test-paths.js';
const tempDirectories: string[] = [];
const openContexts: AppContext[] = [];

afterEach(() => {
  while (openContexts.length > 0) {
    openContexts.pop()?.close();
  }

  while (tempDirectories.length > 0) {
    const directory = tempDirectories.pop();

    if (directory) {
      rmSync(directory, { recursive: true, force: true });
    }
  }
});

describe('review-broker-server reviewer manager', () => {
  it('spawns a real reviewer fixture, persists launch and exit metadata, and cleans up tracked listeners', async () => {
    const harness = createHarness();

    const spawned = await harness.context.reviewerManager.spawnReviewer({
      reviewerId: 'reviewer-fixture-1',
      command: process.execPath,
      args: [REVIEWER_FIXTURE_PATH],
      cwd: 'packages/review-broker-server',
    });

    expect(spawned).toMatchObject({
      reviewerId: 'reviewer-fixture-1',
      status: 'idle',
      currentReviewId: null,
      command: path.basename(process.execPath),
      args: ['test/fixtures/reviewer-worker.mjs'],
      cwd: 'packages/review-broker-server',
      offlineAt: null,
      offlineReason: null,
      exitCode: null,
      exitSignal: null,
    });
    expect(spawned.pid).toEqual(expect.any(Number));
    expect(spawned.startedAt).not.toBeNull();
    expect(spawned.lastSeenAt).not.toBeNull();
    expect(harness.context.notifications.currentVersion('reviewer-state')).toBe(1);
    expect(harness.context.reviewerManager.inspect()).toEqual({
      trackedReviewerIds: ['reviewer-fixture-1'],
      trackedPids: [spawned.pid!],
      listenerCounts: {
        'reviewer-fixture-1': {
          exit: 1,
          error: 1,
        },
      },
    });

    const persistedAfterSpawn = harness.context.reviewers.getById('reviewer-fixture-1');
    expect(persistedAfterSpawn).toMatchObject({
      reviewerId: 'reviewer-fixture-1',
      status: 'idle',
      pid: spawned.pid,
      offlineAt: null,
      offlineReason: null,
    });

    const stopped = await harness.context.reviewerManager.stopReviewer('reviewer-fixture-1');

    expect(stopped.outcome).toBe('killed');
    expect(stopped.reviewer).toMatchObject({
      reviewerId: 'reviewer-fixture-1',
      status: 'offline',
      currentReviewId: null,
      pid: null,
      offlineReason: 'operator_kill',
    });
    expect(stopped.reviewer?.exitCode === 0 || stopped.reviewer?.exitSignal === 'SIGTERM').toBe(true);
    expect(stopped.reviewer?.offlineAt).not.toBeNull();
    expect(stopped.reviewer?.lastSeenAt).toBe(stopped.reviewer?.offlineAt);
    expect(harness.context.reviewerManager.inspect()).toEqual({
      trackedReviewerIds: [],
      trackedPids: [],
      listenerCounts: {},
    });
    expect(harness.context.notifications.currentVersion('reviewer-state')).toBe(3);
    expect(() => process.kill(spawned.pid!, 0)).toThrow();

    const persistedAfterStop = harness.context.reviewers.getById('reviewer-fixture-1');
    expect(persistedAfterStop).toMatchObject({
      reviewerId: 'reviewer-fixture-1',
      status: 'offline',
      pid: null,
      offlineReason: 'operator_kill',
    });
    expect(persistedAfterStop?.exitCode === 0 || persistedAfterStop?.exitSignal === 'SIGTERM').toBe(true);

    const reviewerAuditRows = harness.context.db
      .prepare<unknown[], { event_type: string; metadata_json: string }>(
        `
          SELECT event_type, metadata_json
          FROM audit_events
          WHERE review_id IS NULL
          ORDER BY audit_event_id ASC
        `,
      )
      .all();

    expect(reviewerAuditRows.map((row) => row.event_type)).toEqual([
      'reviewer.spawned',
      'reviewer.killed',
      'reviewer.offline',
    ]);
    expect(JSON.parse(reviewerAuditRows[0]!.metadata_json)).toMatchObject({
      reviewerId: 'reviewer-fixture-1',
      pid: spawned.pid,
      command: path.basename(process.execPath),
      args: ['test/fixtures/reviewer-worker.mjs'],
    });
    expect(JSON.parse(reviewerAuditRows[2]!.metadata_json)).toMatchObject({
      reviewerId: 'reviewer-fixture-1',
      offlineReason: 'operator_kill',
    });
  });

  it('passes REVIEW_BROKER_DB_PATH to spawned reviewer processes', async () => {
    const harness = createHarness();
    const envOutputPath = path.join(path.dirname(harness.context.dbPath), 'reviewer-db-path.txt');

    const script = [
      `require('node:fs').writeFileSync(${JSON.stringify(envOutputPath)}, process.env.REVIEW_BROKER_DB_PATH || '', 'utf8');`,
      'setInterval(() => {}, 1000);',
    ].join(' ');

    await harness.context.reviewerManager.spawnReviewer({
      reviewerId: 'reviewer-env-check',
      command: process.execPath,
      args: ['-e', script],
    });

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(readFileSync(envOutputPath, 'utf8')).toBe(harness.context.dbPath);

    const stopped = await harness.context.reviewerManager.stopReviewer('reviewer-env-check');
    expect(stopped.outcome).toBe('killed');
  });

  it('supports detached reviewer spawn that survives context close', async () => {
    const harness = createHarness();

    const detached = await harness.context.reviewerManager.spawnReviewer({
      reviewerId: 'reviewer-detached-1',
      command: process.execPath,
      args: [REVIEWER_FIXTURE_PATH],
      cwd: 'packages/review-broker-server',
      detached: true,
    });

    expect(detached.pid).toEqual(expect.any(Number));
    expect(harness.context.reviewerManager.inspect()).toEqual({
      trackedReviewerIds: [],
      trackedPids: [],
      listenerCounts: {},
    });

    harness.context.close();

    const contextIndex = openContexts.indexOf(harness.context);
    if (contextIndex >= 0) {
      openContexts.splice(contextIndex, 1);
    }

    expect(() => process.kill(detached.pid!, 0)).not.toThrow();

    process.kill(detached.pid!, 'SIGTERM');
  });
});

function createHarness(): { context: AppContext } {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'review-broker-reviewer-manager-'));
  tempDirectories.push(directory);

  const context = createAppContext({
    cwd: WORKTREE_ROOT,
    dbPath: path.join(directory, 'broker.sqlite'),
  });
  openContexts.push(context);

  return { context };
}
