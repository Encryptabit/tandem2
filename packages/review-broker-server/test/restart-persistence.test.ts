import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { AppContext } from '../src/runtime/app-context.js';
import { createAppContext } from '../src/runtime/app-context.js';
import { startBroker } from '../src/index.js';
import { createBrokerService } from '../src/runtime/broker-service.js';
import { afterEach, describe, expect, it } from 'vitest';

const WORKTREE_ROOT = '/home/cari/repos/tandem2/.gsd/worktrees/M001';
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

describe('review-broker-server restart persistence', () => {
  it('reopens the same SQLite file through a fresh runtime instance and preserves S02 lifecycle metadata', async () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), 'review-broker-restart-'));
    tempDirectories.push(directory);

    const dbPath = path.join(directory, 'broker.sqlite');
    const firstRuntime = createContext(dbPath);
    const firstService = createBrokerService(firstRuntime, {
      now: createNow([
        '2026-03-21T15:00:00.000Z',
        '2026-03-21T15:01:00.000Z',
        '2026-03-21T15:02:00.000Z',
        '2026-03-21T15:03:00.000Z',
        '2026-03-21T15:04:00.000Z',
        '2026-03-21T15:05:00.000Z',
      ]),
    });

    const created = await firstService.createReview({
      title: 'Restart persistence lifecycle review',
      description: 'The standalone runtime should preserve lifecycle metadata across reopen.',
      diff: readFixture('valid-review.diff'),
      authorId: 'agent-author',
      priority: 'urgent',
    });

    await firstService.claimReview({
      reviewId: created.review.reviewId,
      claimantId: 'agent-reviewer',
    });
    await firstService.addMessage({
      reviewId: created.review.reviewId,
      actorId: 'agent-reviewer',
      body: 'Please add the missing regression coverage before approval.',
    });
    await firstService.submitVerdict({
      reviewId: created.review.reviewId,
      actorId: 'agent-reviewer',
      verdict: 'changes_requested',
      reason: 'Regression coverage is still missing for the failure path.',
    });
    await firstService.addMessage({
      reviewId: created.review.reviewId,
      actorId: 'agent-author',
      body: 'Added the missing coverage and requeued the proposal.',
    });
    await firstService.acceptCounterPatch({
      reviewId: created.review.reviewId,
      actorId: 'agent-reviewer',
      note: 'Counter-patch resolves the requested changes.',
    });

    closeContext(firstRuntime);

    const reopenedRuntime = createContext(dbPath);
    const reopenedService = createBrokerService(reopenedRuntime);
    const reopenedStatus = await reopenedService.getReviewStatus({ reviewId: created.review.reviewId });
    const reopenedProposal = await reopenedService.getProposal({ reviewId: created.review.reviewId });
    const reopenedDiscussion = await reopenedService.getDiscussion({ reviewId: created.review.reviewId });
    const reopenedActivity = await reopenedService.getActivityFeed({ reviewId: created.review.reviewId });
    const persistedCounterPatch = reopenedRuntime.reviews.getCounterPatchDecision(created.review.reviewId);
    const persistedRounds = reopenedRuntime.messages.listForReview(created.review.reviewId).map((message) => message.roundNumber);
    const schemaMigrations = reopenedRuntime.db
      .prepare<unknown[], { id: string }>('SELECT id FROM schema_migrations ORDER BY id ASC')
      .all();

    expect(reopenedRuntime.appliedMigrations.map((migration) => migration.id)).toEqual([
      '001_init',
      '002_review_lifecycle_parity',
      '003_reviewer_lifecycle',
    ]);
    expect(schemaMigrations).toEqual([
      { id: '001_init' },
      { id: '002_review_lifecycle_parity' },
      { id: '003_reviewer_lifecycle' },
    ]);
    expect(reopenedStatus.review).toMatchObject({
      reviewId: created.review.reviewId,
      status: 'pending',
      claimedBy: null,
      claimedAt: null,
      claimGeneration: 1,
      currentRound: 2,
      latestVerdict: 'changes_requested',
      verdictReason: 'Regression coverage is still missing for the failure path.',
      counterPatchStatus: 'accepted',
      lastMessageAt: '2026-03-21T15:04:00.000Z',
      lastActivityAt: '2026-03-21T15:05:00.000Z',
    });
    expect(reopenedProposal.proposal).toMatchObject({
      reviewId: created.review.reviewId,
      priority: 'urgent',
      currentRound: 2,
      latestVerdict: 'changes_requested',
      verdictReason: 'Regression coverage is still missing for the failure path.',
      counterPatchStatus: 'accepted',
      lastMessageAt: '2026-03-21T15:04:00.000Z',
      lastActivityAt: '2026-03-21T15:05:00.000Z',
      affectedFiles: ['packages/review-broker-server/src/runtime/_proposal_fixture_valid.ts'],
    });
    expect(reopenedDiscussion.messages.map((message) => message.body)).toEqual([
      'Please add the missing regression coverage before approval.',
      'Added the missing coverage and requeued the proposal.',
    ]);
    expect(persistedRounds).toEqual([1, 2]);
    expect(persistedCounterPatch).toEqual({
      reviewId: created.review.reviewId,
      status: 'accepted',
      actorId: 'agent-reviewer',
      note: 'Counter-patch resolves the requested changes.',
      decidedAt: '2026-03-21T15:05:00.000Z',
    });
    expect(reopenedActivity.activity.map((entry) => entry.eventType)).toEqual([
      'review.created',
      'review.claimed',
      'review.submitted',
      'review.message_added',
      'review.changes_requested',
      'review.requeued',
      'review.message_added',
      'review.counter_patch_accepted',
    ]);
    expect(reopenedActivity.activity.at(-1)).toMatchObject({
      eventType: 'review.counter_patch_accepted',
      summary: 'Reviewer accepted the counter-patch.',
      metadata: {
        reviewId: created.review.reviewId,
        counterPatchStatus: 'accepted',
        notePresent: true,
      },
      createdAt: '2026-03-21T15:05:00.000Z',
    });
  });

  it('reconciles stale reviewer sessions on restart, reclaims only claimed and submitted reviews, and preserves inspectable startup-recovery evidence', async () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), 'review-broker-restart-recovery-'));
    tempDirectories.push(directory);

    const dbPath = path.join(directory, 'broker.sqlite');
    const firstRuntime = createContext(dbPath);
    const firstService = createBrokerService(firstRuntime, {
      now: createNow([
        '2026-03-21T17:00:00.000Z',
        '2026-03-21T17:01:00.000Z',
        '2026-03-21T17:02:00.000Z',
        '2026-03-21T17:03:00.000Z',
        '2026-03-21T17:04:00.000Z',
        '2026-03-21T17:05:00.000Z',
        '2026-03-21T17:06:00.000Z',
        '2026-03-21T17:07:00.000Z',
        '2026-03-21T17:08:00.000Z',
      ]),
    });

    const spawned = await firstService.spawnReviewer({
      reviewerId: 'restart-reviewer-1',
      command: process.execPath,
      args: [path.join(WORKTREE_ROOT, 'packages', 'review-broker-server', 'test', 'fixtures', 'reviewer-worker.mjs')],
      cwd: 'packages/review-broker-server',
    });
    const claimedReview = await firstService.createReview({
      title: 'Restart claimed review',
      description: 'Claimed reviews should be reclaimed during startup recovery.',
      diff: readFixture('valid-review.diff'),
      authorId: 'agent-author',
      priority: 'high',
    });
    const submittedReview = await firstService.createReview({
      title: 'Restart submitted review',
      description: 'Submitted reviews should also be reclaimed during startup recovery.',
      diff: readFixture('valid-review.diff'),
      authorId: 'agent-author',
      priority: 'urgent',
    });
    const approvedReview = await firstService.createReview({
      title: 'Restart approved review',
      description: 'Approved reviews are not limbo-prone and should remain untouched.',
      diff: readFixture('valid-review.diff'),
      authorId: 'agent-author',
      priority: 'normal',
    });

    await firstService.claimReview({
      reviewId: claimedReview.review.reviewId,
      claimantId: 'restart-reviewer-1',
    });
    await firstService.claimReview({
      reviewId: submittedReview.review.reviewId,
      claimantId: 'restart-reviewer-1',
    });
    await firstService.addMessage({
      reviewId: submittedReview.review.reviewId,
      actorId: 'restart-reviewer-1',
      body: 'Submitted before simulating the stale-session restart.',
    });
    await firstService.claimReview({
      reviewId: approvedReview.review.reviewId,
      claimantId: 'restart-reviewer-1',
    });
    await firstService.submitVerdict({
      reviewId: approvedReview.review.reviewId,
      actorId: 'restart-reviewer-1',
      verdict: 'approved',
      reason: 'Approved before the startup recovery restart proof.',
    });

    expect(spawned.reviewer.pid).toEqual(expect.any(Number));

    closeContext(firstRuntime);

    const reopenedRuntime = startBroker({
      cwd: WORKTREE_ROOT,
      dbPath,
      handleSignals: false,
      now: createNow([
        '2026-03-21T18:00:00.000Z',
        '2026-03-21T18:01:00.000Z',
        '2026-03-21T18:02:00.000Z',
        '2026-03-21T18:03:00.000Z',
        '2026-03-21T18:04:00.000Z',
      ]),
    });
    openContexts.push(reopenedRuntime.context);

    const claimedStatus = await reopenedRuntime.service.getReviewStatus({ reviewId: claimedReview.review.reviewId });
    const submittedStatus = await reopenedRuntime.service.getReviewStatus({ reviewId: submittedReview.review.reviewId });
    const approvedStatus = await reopenedRuntime.service.getReviewStatus({ reviewId: approvedReview.review.reviewId });
    const reviewers = await reopenedRuntime.service.listReviewers({});
    const claimedActivity = await reopenedRuntime.service.getActivityFeed({ reviewId: claimedReview.review.reviewId });
    const submittedActivity = await reopenedRuntime.service.getActivityFeed({ reviewId: submittedReview.review.reviewId });
    const approvedActivity = await reopenedRuntime.service.getActivityFeed({ reviewId: approvedReview.review.reviewId });
    const startupRecovery = reopenedRuntime.getStartupRecoverySnapshot();
    const reviewerAuditRows = reopenedRuntime.context.db
      .prepare<unknown[], { event_type: string; metadata_json: string }>(
        `
          SELECT event_type, metadata_json
          FROM audit_events
          WHERE review_id IS NULL
          ORDER BY audit_event_id ASC
        `,
      )
      .all();

    expect(startupRecovery).toEqual(
      expect.objectContaining({
        completedAt: '2026-03-21T18:03:00.000Z',
        recoveredReviewerIds: ['restart-reviewer-1'],
        reclaimedReviewIds: expect.arrayContaining([claimedReview.review.reviewId, submittedReview.review.reviewId]),
        staleReviewIds: [],
        unrecoverableReviewIds: [],
        reviewers: [
          expect.objectContaining({
            reviewerId: 'restart-reviewer-1',
            reclaimedReviewIds: expect.arrayContaining([claimedReview.review.reviewId, submittedReview.review.reviewId]),
            staleReviewIds: [],
            unrecoverableReviewIds: [],
          }),
        ],
      }),
    );
    expect(claimedStatus.review).toMatchObject({
      reviewId: claimedReview.review.reviewId,
      status: 'pending',
      claimedBy: null,
      claimedAt: null,
      claimGeneration: 2,
    });
    expect(submittedStatus.review).toMatchObject({
      reviewId: submittedReview.review.reviewId,
      status: 'pending',
      claimedBy: null,
      claimedAt: null,
      claimGeneration: 2,
    });
    expect(approvedStatus.review).toMatchObject({
      reviewId: approvedReview.review.reviewId,
      status: 'approved',
      claimedBy: 'restart-reviewer-1',
      claimGeneration: 1,
      latestVerdict: 'approved',
      verdictReason: 'Approved before the startup recovery restart proof.',
    });
    expect(reviewers.reviewers).toEqual([
      expect.objectContaining({
        reviewerId: 'restart-reviewer-1',
        status: 'offline',
        currentReviewId: null,
        pid: null,
        offlineReason: 'startup_recovery',
      }),
    ]);
    expect(claimedActivity.activity.at(-1)).toMatchObject({
      eventType: 'review.reclaimed',
      statusFrom: 'claimed',
      metadata: {
        reviewId: claimedReview.review.reviewId,
        reviewerId: 'restart-reviewer-1',
        reclaimCause: 'startup_recovery',
      },
    });
    expect(submittedActivity.activity.at(-1)).toMatchObject({
      eventType: 'review.reclaimed',
      statusFrom: 'submitted',
      metadata: {
        reviewId: submittedReview.review.reviewId,
        reviewerId: 'restart-reviewer-1',
        reclaimCause: 'startup_recovery',
      },
    });
    expect(approvedActivity.activity.at(-1)).toMatchObject({
      eventType: 'review.approved',
    });
    expect(reviewerAuditRows.map((row) => row.event_type)).toEqual([
      'reviewer.spawned',
      'reviewer.offline',
    ]);
    expect(JSON.parse(reviewerAuditRows[1]!.metadata_json)).toMatchObject({
      reviewerId: 'restart-reviewer-1',
      offlineReason: 'startup_recovery',
      reclaimedReviewIds: expect.arrayContaining([claimedReview.review.reviewId, submittedReview.review.reviewId]),
      staleReviewIds: [],
      unrecoverableReviewIds: [],
    });

    reopenedRuntime.close();
    await reopenedRuntime.waitUntilStopped();
    const reopenedIndex = openContexts.indexOf(reopenedRuntime.context);

    if (reopenedIndex >= 0) {
      openContexts.splice(reopenedIndex, 1);
    }
  });
});

function createContext(dbPath: string): AppContext {
  const context = createAppContext({
    cwd: WORKTREE_ROOT,
    dbPath,
  });
  openContexts.push(context);
  return context;
}

function createNow(timestamps: string[]): () => string {
  const queue = [...timestamps];
  return () => queue.shift() ?? new Date().toISOString();
}

function closeContext(context: AppContext): void {
  const index = openContexts.indexOf(context);

  if (index >= 0) {
    openContexts.splice(index, 1);
  }

  context.close();
}

function readFixture(fileName: string): string {
  return readFileSync(path.join(WORKTREE_ROOT, 'packages', 'review-broker-server', 'test', 'fixtures', fileName), 'utf8');
}
