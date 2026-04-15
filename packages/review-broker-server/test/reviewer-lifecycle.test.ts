import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';

import type { StartedBrokerRuntime } from '../src/index.js';
import { inspectBrokerRuntime, startBroker } from '../src/index.js';

import { REVIEWER_FIXTURE_PATH, WORKTREE_ROOT } from './test-paths.js';
const tempDirectories: string[] = [];
const openRuntimes: StartedBrokerRuntime[] = [];

afterEach(async () => {
  while (openRuntimes.length > 0) {
    const runtime = openRuntimes.pop();

    if (!runtime) {
      continue;
    }

    runtime.close();
    await runtime.waitUntilStopped().catch(() => undefined);
  }

  while (tempDirectories.length > 0) {
    const directory = tempDirectories.pop();

    if (directory) {
      rmSync(directory, { recursive: true, force: true });
    }
  }
});

describe('review-broker-server reviewer lifecycle runtime', () => {
  it('exposes public spawn/list/kill methods through the started broker and keeps arbitrary claimants compatible', async () => {
    const harness = createHarness();

    const initialList = await harness.runtime.service.listReviewers({});
    expect(initialList).toEqual({ reviewers: [], version: 0 });

    const waiter = harness.runtime.service.listReviewers({
      wait: true,
      sinceVersion: initialList.version,
      timeoutMs: 500,
    });

    await new Promise((resolve) => setTimeout(resolve, 20));
    const spawned = await harness.runtime.service.spawnReviewer({
      reviewerId: 'reviewer-public-1',
      command: process.execPath,
      args: [REVIEWER_FIXTURE_PATH],
      cwd: 'packages/review-broker-server',
    });

    const waited = await waiter;

    expect(spawned.reviewer).toMatchObject({
      reviewerId: 'reviewer-public-1',
      status: 'idle',
      currentReviewId: null,
      command: path.basename(process.execPath),
      args: ['test/fixtures/reviewer-worker.mjs'],
      cwd: 'packages/review-broker-server',
      offlineAt: null,
      offlineReason: null,
    });
    expect(spawned.reviewer.pid).toEqual(expect.any(Number));
    expect(waited.version).toBeGreaterThan(initialList.version);
    expect(waited.reviewers).toEqual([spawned.reviewer]);

    const trackedReview = await harness.runtime.service.createReview({
      title: 'Tracked reviewer claim',
      description: 'A live reviewer should appear assigned when it owns an active claim.',
      diff: readFixture('valid-review.diff'),
      authorId: 'agent-author',
      priority: 'high',
    });
    const trackedClaim = await harness.runtime.service.claimReview({
      reviewId: trackedReview.review.reviewId,
      claimantId: 'reviewer-public-1',
    });

    const arbitraryReview = await harness.runtime.service.createReview({
      title: 'Arbitrary claimant compatibility',
      description: 'Non-registered claimants must remain valid for additive reviewer lifecycle support.',
      diff: readFixture('valid-review.diff'),
      authorId: 'agent-author',
      priority: 'normal',
    });
    const arbitraryClaim = await harness.runtime.service.claimReview({
      reviewId: arbitraryReview.review.reviewId,
      claimantId: 'external-claimant',
    });

    expect(trackedClaim.outcome).toBe('claimed');
    expect(arbitraryClaim.outcome).toBe('claimed');
    expect(arbitraryClaim.review).toMatchObject({
      reviewId: arbitraryReview.review.reviewId,
      status: 'claimed',
      claimedBy: 'external-claimant',
    });

    const assignedList = await harness.runtime.service.listReviewers({});
    expect(assignedList.reviewers).toHaveLength(1);
    expect(assignedList.reviewers[0]).toMatchObject({
      reviewerId: 'reviewer-public-1',
      status: 'assigned',
      currentReviewId: trackedReview.review.reviewId,
    });

    const snapshot = inspectBrokerRuntime(harness.runtime.context);
    expect(snapshot).toMatchObject({
      reviewCount: 2,
      reviewerCount: 1,
      trackedReviewerCount: 1,
      reviewerStatusCounts: {
        assigned: 1,
      },
      latestReviewer: {
        reviewerId: 'reviewer-public-1',
        status: 'assigned',
        currentReviewId: trackedReview.review.reviewId,
        command: path.basename(process.execPath),
        args: ['test/fixtures/reviewer-worker.mjs'],
        cwd: 'packages/review-broker-server',
      },
    });

    const killed = await harness.runtime.service.killReviewer({ reviewerId: 'reviewer-public-1' });

    expect(killed.outcome).toBe('killed');
    expect(killed.message).toBe('Reviewer reviewer-public-1 received a shutdown signal.');
    expect(killed.reviewer).toMatchObject({
      reviewerId: 'reviewer-public-1',
      status: 'offline',
      currentReviewId: null,
      pid: null,
      offlineReason: 'operator_kill',
    });

    const trackedStatusAfterKill = await harness.runtime.service.getReviewStatus({
      reviewId: trackedReview.review.reviewId,
    });
    expect(trackedStatusAfterKill.review).toMatchObject({
      reviewId: trackedReview.review.reviewId,
      status: 'pending',
      claimedBy: null,
      claimGeneration: 2,
    });

    const offlineList = await harness.runtime.service.listReviewers({ status: 'offline' });
    expect(offlineList.reviewers).toHaveLength(1);
    expect(offlineList.version).toBe(harness.runtime.context.notifications.currentVersion('reviewer-state'));
    expect(offlineList.reviewers[0]).toMatchObject({
      reviewerId: 'reviewer-public-1',
      status: 'offline',
      currentReviewId: null,
      offlineReason: 'operator_kill',
    });

    const reviewerAuditRows = harness.runtime.context.db
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
    expect(JSON.parse(reviewerAuditRows[2]!.metadata_json)).toMatchObject({
      reviewerId: 'reviewer-public-1',
      offlineReason: 'operator_kill',
      reclaimedReviewIds: [trackedReview.review.reviewId],
    });
  });

  it('waits for reviewer shutdown during runtime close and leaves durable offline diagnostics behind', async () => {
    const harness = createHarness();

    const spawned = await harness.runtime.service.spawnReviewer({
      reviewerId: 'reviewer-shutdown-1',
      command: process.execPath,
      args: [REVIEWER_FIXTURE_PATH],
      cwd: 'packages/review-broker-server',
    });
    const pid = spawned.reviewer.pid;

    expect(pid).toEqual(expect.any(Number));

    harness.runtime.close();
    await harness.runtime.waitUntilStopped();

    expect(() => process.kill(pid!, 0)).toThrow();
    expect(harness.runtime.getShutdownSnapshot()).toMatchObject({
      reviewerShutdown: {
        requestedReviewerIds: ['reviewer-shutdown-1'],
        outcomes: {
          killed: 1,
          already_offline: 0,
          not_found: 0,
        },
      },
    });

    const db = new Database(harness.dbPath, { readonly: true, fileMustExist: true });

    try {
      const reviewerRow = db
        .prepare<
          [string],
          {
            pid: number | null;
            offline_reason: string | null;
            exit_code: number | null;
            exit_signal: string | null;
          }
        >(
          `
            SELECT pid, offline_reason, exit_code, exit_signal
            FROM reviewers
            WHERE reviewer_id = ?
          `,
        )
        .get('reviewer-shutdown-1');
      const auditRows = db
        .prepare<unknown[], { event_type: string }>(
          `
            SELECT event_type
            FROM audit_events
            WHERE review_id IS NULL
            ORDER BY audit_event_id ASC
          `,
        )
        .all();

      expect(reviewerRow).toMatchObject({
        pid: null,
        offline_reason: 'operator_kill',
      });
      expect(reviewerRow?.exit_code === 0 || reviewerRow?.exit_signal === 'SIGTERM').toBe(true);
      expect(auditRows.map((row) => row.event_type)).toEqual([
        'reviewer.spawned',
        'reviewer.killed',
        'reviewer.offline',
      ]);
    } finally {
      db.close();
    }
  });
});

function createHarness(): { runtime: StartedBrokerRuntime; dbPath: string } {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'review-broker-reviewer-lifecycle-'));
  tempDirectories.push(directory);

  const dbPath = path.join(directory, 'broker.sqlite');
  const runtime = startBroker({
    cwd: WORKTREE_ROOT,
    dbPath,
    handleSignals: false,
  });
  openRuntimes.push(runtime);

  return { runtime, dbPath };
}

function readFixture(fileName: string): string {
  return readFileSync(path.join(WORKTREE_ROOT, 'packages', 'review-broker-server', 'test', 'fixtures', fileName), 'utf8');
}
