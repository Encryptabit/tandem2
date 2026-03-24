import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { StartBrokerOptions, StartedBrokerRuntime } from '../src/index.js';
import { inspectBrokerRuntime, startBroker } from '../src/index.js';

import { FIXTURE_PATH, WORKTREE_ROOT } from './test-paths.js';
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

describe('review-broker-server reviewer recovery', () => {
  it('reclaims a claimed review after an unexpected reviewer exit and leaves durable recovery diagnostics behind', async () => {
    const harness = createHarness();

    const spawned = await harness.runtime.service.spawnReviewer({
      reviewerId: 'reviewer-exit-1',
      command: process.execPath,
      args: [FIXTURE_PATH],
      cwd: 'packages/review-broker-server',
    });
    const created = await harness.runtime.service.createReview({
      title: 'Reviewer exit recovery',
      description: 'Unexpected reviewer exits should reclaim active reviews safely.',
      diff: readFixture('valid-review.diff'),
      authorId: 'agent-author',
      priority: 'high',
    });

    await harness.runtime.service.claimReview({
      reviewId: created.review.reviewId,
      claimantId: 'reviewer-exit-1',
    });

    process.kill(spawned.reviewer.pid!, 'SIGKILL');

    await waitFor(async () => {
      const status = await harness.runtime.service.getReviewStatus({ reviewId: created.review.reviewId });
      const reviewers = await harness.runtime.service.listReviewers({});
      return (
        status.review.status === 'pending' &&
        reviewers.reviewers[0]?.reviewerId === 'reviewer-exit-1' &&
        reviewers.reviewers[0]?.offlineReason === 'reviewer_exit'
      );
    });

    const status = await harness.runtime.service.getReviewStatus({ reviewId: created.review.reviewId });
    const activity = await harness.runtime.service.getActivityFeed({ reviewId: created.review.reviewId });
    const snapshot = inspectBrokerRuntime(harness.runtime.context);
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

    expect(status.review).toMatchObject({
      reviewId: created.review.reviewId,
      status: 'pending',
      claimedBy: null,
      claimedAt: null,
      claimGeneration: 2,
    });
    expect(activity.activity.map((entry) => entry.eventType)).toEqual([
      'review.created',
      'review.claimed',
      'review.reclaimed',
    ]);
    expect(activity.activity.at(-1)).toMatchObject({
      eventType: 'review.reclaimed',
      statusFrom: 'claimed',
      statusTo: 'pending',
      metadata: {
        reviewId: created.review.reviewId,
        reviewerId: 'reviewer-exit-1',
        reclaimCause: 'reviewer_exit',
        expectedClaimGeneration: 1,
        claimGeneration: 2,
      },
    });
    expect(reviewerAuditRows.map((row) => row.event_type)).toEqual(['reviewer.spawned', 'reviewer.offline']);
    expect(JSON.parse(reviewerAuditRows[1]!.metadata_json)).toMatchObject({
      reviewerId: 'reviewer-exit-1',
      offlineReason: 'reviewer_exit',
      reclaimedReviewIds: [created.review.reviewId],
      staleReviewIds: [],
      unrecoverableReviewIds: [],
    });
    expect(snapshot).toMatchObject({
      reviewerCount: 1,
      trackedReviewerCount: 0,
      reviewerStatusCounts: {
        offline: 1,
      },
      latestReviewer: {
        reviewerId: 'reviewer-exit-1',
        status: 'offline',
        currentReviewId: null,
        offlineReason: 'reviewer_exit',
        pid: null,
      },
    });
    expect(snapshot.latestAuditEvent).toEqual(
      expect.objectContaining({
        eventType: expect.stringMatching(/^(review\.reclaimed|reviewer\.offline)$/),
        metadata: expect.objectContaining({
          reviewerId: 'reviewer-exit-1',
        }),
      }),
    );
  });

  it('reclaims a submitted review on operator kill and records the recovery cause in both review and reviewer audit rows', async () => {
    const harness = createHarness();

    await harness.runtime.service.spawnReviewer({
      reviewerId: 'reviewer-kill-1',
      command: process.execPath,
      args: [FIXTURE_PATH],
      cwd: 'packages/review-broker-server',
    });
    const created = await harness.runtime.service.createReview({
      title: 'Operator kill recovery',
      description: 'Operator kills should reclaim limbo-prone submitted reviews.',
      diff: readFixture('valid-review.diff'),
      authorId: 'agent-author',
      priority: 'urgent',
    });

    await harness.runtime.service.claimReview({
      reviewId: created.review.reviewId,
      claimantId: 'reviewer-kill-1',
    });
    await harness.runtime.service.addMessage({
      reviewId: created.review.reviewId,
      actorId: 'reviewer-kill-1',
      body: 'Submitting the review before the operator kill recovery proof.',
    });

    const killed = await harness.runtime.service.killReviewer({ reviewerId: 'reviewer-kill-1' });
    const status = await harness.runtime.service.getReviewStatus({ reviewId: created.review.reviewId });
    const activity = await harness.runtime.service.getActivityFeed({ reviewId: created.review.reviewId });
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

    expect(killed.outcome).toBe('killed');
    expect(killed.reviewer).toMatchObject({
      reviewerId: 'reviewer-kill-1',
      status: 'offline',
      currentReviewId: null,
      offlineReason: 'operator_kill',
      pid: null,
    });
    expect(status.review).toMatchObject({
      reviewId: created.review.reviewId,
      status: 'pending',
      claimedBy: null,
      claimedAt: null,
      claimGeneration: 2,
    });
    expect(activity.activity.map((entry) => entry.eventType)).toEqual([
      'review.created',
      'review.claimed',
      'review.submitted',
      'review.message_added',
      'review.reclaimed',
    ]);
    expect(activity.activity.at(-1)).toMatchObject({
      eventType: 'review.reclaimed',
      statusFrom: 'submitted',
      metadata: {
        reviewId: created.review.reviewId,
        reviewerId: 'reviewer-kill-1',
        reclaimCause: 'operator_kill',
      },
    });
    expect(reviewerAuditRows.map((row) => row.event_type)).toEqual([
      'reviewer.spawned',
      'reviewer.killed',
      'reviewer.offline',
    ]);
    expect(JSON.parse(reviewerAuditRows[2]!.metadata_json)).toMatchObject({
      reviewerId: 'reviewer-kill-1',
      offlineReason: 'operator_kill',
      reclaimedReviewIds: [created.review.reviewId],
    });
  });

  it('does not overwrite a newer claim when reviewer-exit recovery races with a manual reclaim and re-claim', async () => {
    const barrier = createDeferred<void>();
    const release = createDeferred<void>();
    const harness = createHarness({
      yieldForRecoveryRace: async ({ reviewId, reviewerId, cause }) => {
        if (reviewId === barrier.reviewId && reviewerId === 'reviewer-race-1' && cause === 'reviewer_exit') {
          barrier.resolve();
          await release.promise;
        }
      },
    });

    await harness.runtime.service.spawnReviewer({
      reviewerId: 'reviewer-race-1',
      command: process.execPath,
      args: [FIXTURE_PATH],
      cwd: 'packages/review-broker-server',
    });
    const created = await harness.runtime.service.createReview({
      title: 'Reviewer recovery race',
      description: 'Automatic recovery must not clobber a newer claim.',
      diff: readFixture('valid-review.diff'),
      authorId: 'agent-author',
      priority: 'normal',
    });
    barrier.reviewId = created.review.reviewId;

    const claimed = await harness.runtime.service.claimReview({
      reviewId: created.review.reviewId,
      claimantId: 'reviewer-race-1',
    });
    const reviewer = (await harness.runtime.service.listReviewers({})).reviewers[0];

    process.kill(reviewer!.pid!, 'SIGKILL');
    await barrier.promise;

    const manuallyReclaimed = await harness.runtime.service.reclaimReview({
      reviewId: created.review.reviewId,
      actorId: 'operator-reclaimer',
    });
    const newerClaim = await harness.runtime.service.claimReview({
      reviewId: created.review.reviewId,
      claimantId: 'reviewer-race-2',
    });

    expect(claimed.outcome).toBe('claimed');
    expect(manuallyReclaimed.review).toMatchObject({
      reviewId: created.review.reviewId,
      status: 'pending',
      claimGeneration: 2,
    });
    expect(newerClaim.outcome).toBe('claimed');
    expect(newerClaim.review).toMatchObject({
      reviewId: created.review.reviewId,
      status: 'claimed',
      claimedBy: 'reviewer-race-2',
      claimGeneration: 3,
    });

    release.resolve();

    await waitFor(async () => {
      const reviewerList = await harness.runtime.service.listReviewers({});
      return reviewerList.reviewers[0]?.offlineReason === 'reviewer_exit';
    });

    const status = await harness.runtime.service.getReviewStatus({ reviewId: created.review.reviewId });
    const activity = await harness.runtime.service.getActivityFeed({ reviewId: created.review.reviewId });
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

    expect(status.review).toMatchObject({
      reviewId: created.review.reviewId,
      status: 'claimed',
      claimedBy: 'reviewer-race-2',
      claimGeneration: 3,
    });
    expect(activity.activity.map((entry) => entry.eventType)).toEqual([
      'review.created',
      'review.claimed',
      'review.reclaimed',
      'review.claimed',
      'review.transition_rejected',
    ]);
    expect(activity.activity.at(-1)).toMatchObject({
      eventType: 'review.transition_rejected',
      errorCode: 'STALE_CLAIM_GENERATION',
      metadata: {
        reviewId: created.review.reviewId,
        reviewerId: 'reviewer-race-1',
        reclaimCause: 'reviewer_exit',
        outcome: 'stale',
        expectedClaimGeneration: 1,
        actualClaimGeneration: 3,
        actualStatus: 'claimed',
        actualClaimedBy: 'reviewer-race-2',
      },
    });
    expect(JSON.parse(reviewerAuditRows.at(-1)!.metadata_json)).toMatchObject({
      reviewerId: 'reviewer-race-1',
      offlineReason: 'reviewer_exit',
      reclaimedReviewIds: [],
      staleReviewIds: [created.review.reviewId],
    });
  });
});

function createHarness(options: Partial<StartBrokerOptions> = {}): { runtime: StartedBrokerRuntime } {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'review-broker-reviewer-recovery-'));
  tempDirectories.push(directory);

  const runtime = startBroker({
    cwd: WORKTREE_ROOT,
    dbPath: path.join(directory, 'broker.sqlite'),
    handleSignals: false,
    ...options,
  });
  openRuntimes.push(runtime);

  return { runtime };
}

async function waitFor(check: () => Promise<boolean>, timeoutMs = 2_000): Promise<void> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (await check()) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 20));
  }

  throw new Error(`Timed out after ${timeoutMs}ms while waiting for recovery state.`);
}

function readFixture(fileName: string): string {
  return readFileSync(path.join(WORKTREE_ROOT, 'packages', 'review-broker-server', 'test', 'fixtures', fileName), 'utf8');
}

function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value?: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
  reviewId?: string;
} {
  let resolve!: (value?: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });

  return { promise, resolve, reject };
}
