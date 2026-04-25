import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { AppContext } from '../src/runtime/app-context.js';
import { createAppContext } from '../src/runtime/app-context.js';
import { createBrokerService } from '../src/runtime/broker-service.js';
import { afterEach, describe, expect, it } from 'vitest';

import { WORKTREE_ROOT } from './test-paths.js';
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

describe('review-broker-server verdict and counter-patch flows', () => {
  it('submits approved verdicts, exposes enriched status/proposal payloads, and closes approved reviews', async () => {
    const harness = createHarness([
      '2026-03-21T12:00:00.000Z',
      '2026-03-21T12:01:00.000Z',
      '2026-03-21T12:02:00.000Z',
      '2026-03-21T12:03:00.000Z',
    ]);

    const created = await harness.service.createReview({
      title: 'Approved review',
      description: 'Verify approved verdicts and close transitions.',
      diff: readFixture('valid-review.diff'),
      authorId: 'agent-author',
      priority: 'urgent',
    });

    await harness.service.claimReview({
      reviewId: created.review.reviewId,
      claimantId: 'agent-reviewer',
    });

    const verdict = await harness.service.submitVerdict({
      reviewId: created.review.reviewId,
      actorId: 'agent-reviewer',
      verdict: 'approved',
      reason: 'Looks good after the final pass.',
    });

    expect(verdict.review).toMatchObject({
      reviewId: created.review.reviewId,
      status: 'approved',
      claimedBy: 'agent-reviewer',
      currentRound: 1,
      latestVerdict: 'approved',
      verdictReason: 'Looks good after the final pass.',
      counterPatchStatus: 'none',
      lastMessageAt: null,
      lastActivityAt: '2026-03-21T12:02:00.000Z',
    });
    expect(verdict.proposal).toMatchObject({
      reviewId: created.review.reviewId,
      priority: 'urgent',
      currentRound: 1,
      latestVerdict: 'approved',
      verdictReason: 'Looks good after the final pass.',
      counterPatchStatus: 'none',
      lastMessageAt: null,
      lastActivityAt: '2026-03-21T12:02:00.000Z',
    });

    const statusAfterVerdict = await harness.service.getReviewStatus({ reviewId: created.review.reviewId });
    expect(statusAfterVerdict.review).toEqual(verdict.review);

    const closed = await harness.service.closeReview({
      reviewId: created.review.reviewId,
      actorId: 'agent-reviewer',
    });
    expect(closed.review).toMatchObject({
      reviewId: created.review.reviewId,
      status: 'closed',
      latestVerdict: 'approved',
      verdictReason: 'Looks good after the final pass.',
      lastActivityAt: '2026-03-21T12:03:00.000Z',
    });

    const activity = await harness.service.getActivityFeed({ reviewId: created.review.reviewId });
    expect(activity.activity.map((entry) => entry.eventType)).toEqual([
      'review.created',
      'review.claimed',
      'review.submitted',
      'review.approved',
      'review.closed',
    ]);
    expect(activity.activity[3]).toMatchObject({
      summary: 'Reviewer approved the review.',
      metadata: {
        reviewId: created.review.reviewId,
        verdict: 'approved',
        roundNumber: 1,
      },
    });
    expect(activity.activity[4]).toMatchObject({
      summary: 'Review closed after approval.',
    });
  });

  it('allows a manual approved verdict to override changes_requested without requeueing', async () => {
    const harness = createHarness([
      '2026-03-21T12:30:00.000Z',
      '2026-03-21T12:31:00.000Z',
      '2026-03-21T12:32:00.000Z',
      '2026-03-21T12:33:00.000Z',
    ]);

    const created = await harness.service.createReview({
      title: 'Manual override review',
      description: 'Verify operator approval can unblock a changes_requested review.',
      diff: readFixture('valid-review.diff'),
      authorId: 'agent-author',
      priority: 'normal',
    });

    await harness.service.claimReview({
      reviewId: created.review.reviewId,
      claimantId: 'agent-reviewer',
    });
    await harness.service.submitVerdict({
      reviewId: created.review.reviewId,
      actorId: 'agent-reviewer',
      verdict: 'changes_requested',
      reason: 'Blocking feedback that the operator will override.',
    });

    const override = await harness.service.submitVerdict({
      reviewId: created.review.reviewId,
      actorId: 'user',
      verdict: 'approved',
      reason: 'move it along',
    });

    expect(override.review).toMatchObject({
      reviewId: created.review.reviewId,
      status: 'approved',
      claimedBy: 'agent-reviewer',
      currentRound: 1,
      latestVerdict: 'approved',
      verdictReason: 'move it along',
      lastActivityAt: '2026-03-21T12:33:00.000Z',
    });

    const activity = await harness.service.getActivityFeed({ reviewId: created.review.reviewId });
    expect(activity.activity.map((entry) => entry.eventType)).toEqual([
      'review.created',
      'review.claimed',
      'review.submitted',
      'review.changes_requested',
      'review.approved',
    ]);
    expect(activity.activity.at(-1)).toMatchObject({
      eventType: 'review.approved',
      actorId: 'user',
      statusFrom: 'changes_requested',
      statusTo: 'approved',
      summary: 'Review manually approved after changes were requested.',
      metadata: {
        reviewId: created.review.reviewId,
        verdict: 'approved',
        roundNumber: 1,
      },
    });
  });

  it('accepts pending counter-patches and exposes the decision through review, proposal, repository, and activity surfaces', async () => {
    const harness = createHarness([
      '2026-03-21T13:00:00.000Z',
      '2026-03-21T13:01:00.000Z',
      '2026-03-21T13:02:00.000Z',
      '2026-03-21T13:03:00.000Z',
      '2026-03-21T13:04:00.000Z',
    ]);

    const created = await harness.service.createReview({
      title: 'Accepted counter-patch review',
      description: 'Verify accepted counter-patch decisions stay visible.',
      diff: readFixture('valid-review.diff'),
      authorId: 'agent-author',
      priority: 'high',
    });

    await harness.service.claimReview({
      reviewId: created.review.reviewId,
      claimantId: 'agent-reviewer',
    });
    await harness.service.submitVerdict({
      reviewId: created.review.reviewId,
      actorId: 'agent-reviewer',
      verdict: 'changes_requested',
      reason: 'Please add coverage for the failure path.',
    });
    const requeued = await harness.service.addMessage({
      reviewId: created.review.reviewId,
      actorId: 'agent-author',
      body: 'Added the requested coverage and requeued the review.',
    });

    expect(requeued.review).toMatchObject({
      reviewId: created.review.reviewId,
      status: 'pending',
      currentRound: 2,
      counterPatchStatus: 'pending',
    });

    const accepted = await harness.service.acceptCounterPatch({
      reviewId: created.review.reviewId,
      actorId: 'agent-reviewer',
      note: 'Counter-patch addresses the requested changes.',
    });

    expect(accepted.review).toMatchObject({
      reviewId: created.review.reviewId,
      status: 'pending',
      currentRound: 2,
      latestVerdict: 'changes_requested',
      verdictReason: 'Please add coverage for the failure path.',
      counterPatchStatus: 'accepted',
      lastActivityAt: '2026-03-21T13:04:00.000Z',
    });
    expect(accepted.proposal).toMatchObject({
      reviewId: created.review.reviewId,
      currentRound: 2,
      counterPatchStatus: 'accepted',
      verdictReason: 'Please add coverage for the failure path.',
    });

    const status = await harness.service.getReviewStatus({ reviewId: created.review.reviewId });
    const proposal = await harness.service.getProposal({ reviewId: created.review.reviewId });
    const decision = harness.context.reviews.getCounterPatchDecision(created.review.reviewId);

    expect(status.review.counterPatchStatus).toBe('accepted');
    expect(proposal.proposal.counterPatchStatus).toBe('accepted');
    expect(decision).toEqual({
      reviewId: created.review.reviewId,
      status: 'accepted',
      actorId: 'agent-reviewer',
      note: 'Counter-patch addresses the requested changes.',
      decidedAt: '2026-03-21T13:04:00.000Z',
    });

    const activity = await harness.service.getActivityFeed({ reviewId: created.review.reviewId });
    expect(activity.activity.at(-1)).toMatchObject({
      eventType: 'review.counter_patch_accepted',
      summary: 'Reviewer accepted the counter-patch.',
      metadata: {
        reviewId: created.review.reviewId,
        counterPatchStatus: 'accepted',
        notePresent: true,
      },
      createdAt: '2026-03-21T13:04:00.000Z',
    });
  });

  it('rejects pending counter-patches and preserves the rejection in durable state and activity history', async () => {
    const harness = createHarness([
      '2026-03-21T14:00:00.000Z',
      '2026-03-21T14:01:00.000Z',
      '2026-03-21T14:02:00.000Z',
      '2026-03-21T14:03:00.000Z',
      '2026-03-21T14:04:00.000Z',
    ]);

    const created = await harness.service.createReview({
      title: 'Rejected counter-patch review',
      description: 'Verify rejected counter-patch decisions stay visible.',
      diff: readFixture('valid-review.diff'),
      authorId: 'agent-author',
      priority: 'normal',
    });

    await harness.service.claimReview({
      reviewId: created.review.reviewId,
      claimantId: 'agent-reviewer',
    });
    await harness.service.submitVerdict({
      reviewId: created.review.reviewId,
      actorId: 'agent-reviewer',
      verdict: 'changes_requested',
      reason: 'The new path still needs clearer assertions.',
    });
    await harness.service.addMessage({
      reviewId: created.review.reviewId,
      actorId: 'agent-author',
      body: 'Pushed another patch revision and requeued it for review.',
    });

    const rejected = await harness.service.rejectCounterPatch({
      reviewId: created.review.reviewId,
      actorId: 'agent-reviewer',
    });

    expect(rejected.review).toMatchObject({
      reviewId: created.review.reviewId,
      status: 'pending',
      currentRound: 2,
      counterPatchStatus: 'rejected',
      latestVerdict: 'changes_requested',
      verdictReason: 'The new path still needs clearer assertions.',
    });
    expect(rejected.proposal.counterPatchStatus).toBe('rejected');
    expect(harness.context.reviews.getCounterPatchDecision(created.review.reviewId)).toEqual({
      reviewId: created.review.reviewId,
      status: 'rejected',
      actorId: 'agent-reviewer',
      note: null,
      decidedAt: '2026-03-21T14:04:00.000Z',
    });

    const activity = await harness.service.getActivityFeed({ reviewId: created.review.reviewId });
    expect(activity.activity.at(-1)).toMatchObject({
      eventType: 'review.counter_patch_rejected',
      summary: 'Reviewer rejected the counter-patch.',
      metadata: {
        reviewId: created.review.reviewId,
        counterPatchStatus: 'rejected',
        notePresent: false,
      },
      createdAt: '2026-03-21T14:04:00.000Z',
    });
  });
});

function createHarness(timestamps: string[]): { context: AppContext; service: ReturnType<typeof createBrokerService> } {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'review-broker-verdicts-'));
  tempDirectories.push(directory);

  const context = createAppContext({
    cwd: WORKTREE_ROOT,
    dbPath: path.join(directory, 'broker.sqlite'),
  });
  openContexts.push(context);

  return {
    context,
    service: createBrokerService(context, {
      now: createNow(timestamps),
    }),
  };
}

function createNow(timestamps: string[]): () => string {
  const queue = [...timestamps];
  return () => queue.shift() ?? new Date().toISOString();
}

function readFixture(fileName: string): string {
  return readFileSync(path.join(WORKTREE_ROOT, 'packages', 'review-broker-server', 'test', 'fixtures', fileName), 'utf8');
}
