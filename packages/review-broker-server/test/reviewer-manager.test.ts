import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { AppContext } from '../src/runtime/app-context.js';
import { createAppContext } from '../src/runtime/app-context.js';
import { afterEach, describe, expect, it } from 'vitest';

const WORKTREE_ROOT = '/home/cari/repos/tandem2/.gsd/worktrees/M001';
const FIXTURE_PATH = path.join(WORKTREE_ROOT, 'packages', 'review-broker-server', 'test', 'fixtures', 'reviewer-worker.mjs');
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
      args: [FIXTURE_PATH],
      cwd: 'packages/review-broker-server',
    });

    expect(spawned).toMatchObject({
      reviewerId: 'reviewer-fixture-1',
      status: 'idle',
      currentReviewId: null,
      command: path.basename(process.execPath),
      args: ['packages/review-broker-server/test/fixtures/reviewer-worker.mjs'],
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
      args: ['packages/review-broker-server/test/fixtures/reviewer-worker.mjs'],
    });
    expect(JSON.parse(reviewerAuditRows[2]!.metadata_json)).toMatchObject({
      reviewerId: 'reviewer-fixture-1',
      offlineReason: 'operator_kill',
    });
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
