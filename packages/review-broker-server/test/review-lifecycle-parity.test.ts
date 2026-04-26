import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { StartedBrokerRuntime } from '../src/index.js';
import { inspectBrokerRuntime, startBroker } from '../src/index.js';
import { BrokerServiceError } from '../src/runtime/broker-service.js';

import { WORKTREE_ROOT } from './test-paths.js';
const tempDirectories: string[] = [];
const openRuntimes: StartedBrokerRuntime[] = [];

afterEach(() => {
  while (openRuntimes.length > 0) {
    openRuntimes.pop()?.close();
  }

  while (tempDirectories.length > 0) {
    const directory = tempDirectories.pop();

    if (directory) {
      rmSync(directory, { recursive: true, force: true });
    }
  }
});

describe('review-broker-server lifecycle parity', () => {
  it('proves the changes-requested requeue path through the started broker runtime', async () => {
    const harness = createHarness([
      '2026-03-21T09:59:00.000Z',
      '2026-03-21T10:00:00.000Z',
      '2026-03-21T10:01:00.000Z',
      '2026-03-21T10:02:00.000Z',
      '2026-03-21T10:03:00.000Z',
      '2026-03-21T10:04:00.000Z',
      '2026-03-21T10:05:00.000Z',
    ]);

    const created = await harness.runtime.service.createReview({
      title: 'Parity requeue review',
      description: 'Exercise the full requeue lifecycle through the started runtime.',
      diff: readFixture('valid-review.diff'),
      authorId: 'agent-author',
      priority: 'high',
    });

    await harness.runtime.service.claimReview({
      reviewId: created.review.reviewId,
      claimantId: 'agent-reviewer',
    });

    const reviewerMessage = await harness.runtime.service.addMessage({
      reviewId: created.review.reviewId,
      actorId: 'agent-reviewer',
      body: 'Please add regression coverage and rerun the failure-path assertions.',
    });

    const verdict = await harness.runtime.service.submitVerdict({
      reviewId: created.review.reviewId,
      actorId: 'agent-reviewer',
      verdict: 'changes_requested',
      reason: 'Regression coverage is still missing for the failure path.',
    });

    const requeued = await harness.runtime.service.addMessage({
      reviewId: created.review.reviewId,
      actorId: 'agent-author',
      body: 'Added the requested coverage and requeued the proposal for another pass.',
    });

    const status = await harness.runtime.service.getReviewStatus({ reviewId: created.review.reviewId });
    const proposal = await harness.runtime.service.getProposal({ reviewId: created.review.reviewId });
    const discussion = await harness.runtime.service.getDiscussion({ reviewId: created.review.reviewId });
    const activity = await harness.runtime.service.getActivityFeed({ reviewId: created.review.reviewId });
    const persistedReview = harness.runtime.context.reviews.getById(created.review.reviewId);
    const counterPatchDecision = harness.runtime.context.reviews.getCounterPatchDecision(created.review.reviewId);
    const snapshot = inspectBrokerRuntime(harness.runtime.context);

    expect(reviewerMessage.review).toMatchObject({
      reviewId: created.review.reviewId,
      status: 'submitted',
      currentRound: 1,
      latestVerdict: null,
      counterPatchStatus: 'none',
      lastMessageAt: '2026-03-21T10:03:00.000Z',
      lastActivityAt: '2026-03-21T10:03:00.000Z',
    });
    expect(verdict.review).toMatchObject({
      reviewId: created.review.reviewId,
      status: 'changes_requested',
      currentRound: 1,
      latestVerdict: 'changes_requested',
      verdictReason: 'Regression coverage is still missing for the failure path.',
      counterPatchStatus: 'none',
      lastActivityAt: '2026-03-21T10:04:00.000Z',
    });
    expect(requeued.review).toMatchObject({
      reviewId: created.review.reviewId,
      status: 'pending',
      claimedBy: null,
      claimedAt: null,
      currentRound: 2,
      latestVerdict: 'changes_requested',
      verdictReason: 'Regression coverage is still missing for the failure path.',
      counterPatchStatus: 'pending',
      lastMessageAt: '2026-03-21T10:05:00.000Z',
      lastActivityAt: '2026-03-21T10:05:00.000Z',
    });

    expect(status.review).toMatchObject({
      reviewId: created.review.reviewId,
      status: 'pending',
      currentRound: 2,
      latestVerdict: 'changes_requested',
      verdictReason: 'Regression coverage is still missing for the failure path.',
      counterPatchStatus: 'pending',
      lastMessageAt: '2026-03-21T10:05:00.000Z',
      lastActivityAt: '2026-03-21T10:05:00.000Z',
    });
    expect(proposal.proposal).toMatchObject({
      reviewId: created.review.reviewId,
      currentRound: 2,
      latestVerdict: 'changes_requested',
      verdictReason: 'Regression coverage is still missing for the failure path.',
      counterPatchStatus: 'pending',
      lastMessageAt: '2026-03-21T10:05:00.000Z',
      lastActivityAt: '2026-03-21T10:05:00.000Z',
    });
    expect(discussion.messages.map((message) => message.body)).toEqual([
      'Please add regression coverage and rerun the failure-path assertions.',
      'Added the requested coverage and requeued the proposal for another pass.',
    ]);
    expect(harness.runtime.context.messages.listForReview(created.review.reviewId).map((message) => message.roundNumber)).toEqual([
      1,
      2,
    ]);
    expect(activity.activity.map((entry) => entry.eventType)).toEqual([
      'review.created',
      'review.claimed',
      'review.submitted',
      'review.message_added',
      'review.changes_requested',
      'review.requeued',
      'review.message_added',
    ]);
    expect(activity.activity.at(-2)).toMatchObject({
      eventType: 'review.requeued',
      summary: 'Proposer requeued the review with follow-up changes.',
      metadata: {
        reviewId: created.review.reviewId,
        roundNumber: 2,
        counterPatchStatus: 'pending',
      },
    });
    expect(activity.activity.at(-1)).toMatchObject({
      eventType: 'review.message_added',
      summary: 'Proposer added a follow-up message for round 2.',
    });
    expect(persistedReview).toMatchObject({
      reviewId: created.review.reviewId,
      status: 'pending',
      currentRound: 2,
      latestVerdict: 'changes_requested',
      verdictReason: 'Regression coverage is still missing for the failure path.',
      counterPatchStatus: 'pending',
      lastMessageAt: '2026-03-21T10:05:00.000Z',
      lastActivityAt: '2026-03-21T10:05:00.000Z',
    });
    expect(counterPatchDecision).toEqual({
      reviewId: created.review.reviewId,
      status: 'pending',
      actorId: null,
      note: null,
      decidedAt: null,
    });
    expect(snapshot).toMatchObject({
      reviewCount: 1,
      messageCount: 2,
      auditEventCount: 7,
      migrationCount: 5,
      statusCounts: {
        pending: 1,
      },
      counterPatchStatusCounts: {
        pending: 1,
      },
      latestReview: {
        reviewId: created.review.reviewId,
        status: 'pending',
        currentRound: 2,
        latestVerdict: 'changes_requested',
        counterPatchStatus: 'pending',
        lastMessageAt: '2026-03-21T10:05:00.000Z',
        lastActivityAt: '2026-03-21T10:05:00.000Z',
      },
    });
  });

  it('proves the approve-and-close path with ordered activity output through the started broker runtime', async () => {
    const harness = createHarness([
      '2026-03-21T11:59:00.000Z',
      '2026-03-21T12:00:00.000Z',
      '2026-03-21T12:01:00.000Z',
      '2026-03-21T12:02:00.000Z',
      '2026-03-21T12:03:00.000Z',
      '2026-03-21T12:04:00.000Z',
    ]);

    const created = await harness.runtime.service.createReview({
      title: 'Parity close review',
      description: 'Exercise the approve and close path through the started runtime.',
      diff: readFixture('valid-review.diff'),
      authorId: 'agent-author',
      priority: 'urgent',
    });

    await harness.runtime.service.claimReview({
      reviewId: created.review.reviewId,
      claimantId: 'agent-reviewer',
    });

    const approved = await harness.runtime.service.submitVerdict({
      reviewId: created.review.reviewId,
      actorId: 'agent-reviewer',
      verdict: 'approved',
      reason: 'Everything looks good after the final review pass.',
    });

    const closed = await harness.runtime.service.closeReview({
      reviewId: created.review.reviewId,
      actorId: 'agent-reviewer',
    });

    const activity = await harness.runtime.service.getActivityFeed({ reviewId: created.review.reviewId });

    expect(approved.review).toMatchObject({
      reviewId: created.review.reviewId,
      status: 'approved',
      currentRound: 1,
      latestVerdict: 'approved',
      verdictReason: 'Everything looks good after the final review pass.',
      counterPatchStatus: 'none',
      lastMessageAt: null,
      lastActivityAt: '2026-03-21T12:03:00.000Z',
    });
    expect(closed.review).toMatchObject({
      reviewId: created.review.reviewId,
      status: 'closed',
      currentRound: 1,
      latestVerdict: 'approved',
      verdictReason: 'Everything looks good after the final review pass.',
      counterPatchStatus: 'none',
      lastMessageAt: null,
      lastActivityAt: '2026-03-21T12:04:00.000Z',
    });
    expect(activity.activity).toEqual([
      expect.objectContaining({
        eventType: 'review.created',
        createdAt: '2026-03-21T12:01:00.000Z',
      }),
      expect.objectContaining({
        eventType: 'review.claimed',
        createdAt: '2026-03-21T12:02:00.000Z',
      }),
      expect.objectContaining({
        eventType: 'review.submitted',
        createdAt: '2026-03-21T12:03:00.000Z',
      }),
      expect.objectContaining({
        eventType: 'review.approved',
        createdAt: '2026-03-21T12:03:00.000Z',
        summary: 'Reviewer approved the review.',
      }),
      expect.objectContaining({
        eventType: 'review.closed',
        createdAt: '2026-03-21T12:04:00.000Z',
        summary: 'Review closed after approval.',
      }),
    ]);
  });

  it('invalid lifecycle transitions remain inspectable', async () => {
    const harness = createHarness([
      '2026-03-21T12:59:00.000Z',
      '2026-03-21T13:00:00.000Z',
      '2026-03-21T13:01:00.000Z',
      '2026-03-21T13:02:00.000Z',
      '2026-03-21T13:03:00.000Z',
      '2026-03-21T13:04:00.000Z',
      '2026-03-21T13:05:00.000Z',
    ]);

    const created = await harness.runtime.service.createReview({
      title: 'Inspectable invalid transition review',
      description: 'Ensure invalid lifecycle operations leave durable inspection surfaces behind.',
      diff: readFixture('valid-review.diff'),
      authorId: 'agent-author',
      priority: 'normal',
    });

    await harness.runtime.service.claimReview({
      reviewId: created.review.reviewId,
      claimantId: 'agent-reviewer',
    });
    await harness.runtime.service.submitVerdict({
      reviewId: created.review.reviewId,
      actorId: 'agent-reviewer',
      verdict: 'approved',
      reason: 'Approved before the invalid transition check.',
    });
    await harness.runtime.service.closeReview({
      reviewId: created.review.reviewId,
      actorId: 'agent-reviewer',
    });

    await expect(
      harness.runtime.service.reclaimReview({
        reviewId: created.review.reviewId,
        actorId: 'agent-reviewer',
      }),
    ).rejects.toMatchObject<BrokerServiceError>({
      code: 'INVALID_REVIEW_TRANSITION',
      reviewId: created.review.reviewId,
    });

    const status = await harness.runtime.service.getReviewStatus({ reviewId: created.review.reviewId });
    const proposal = await harness.runtime.service.getProposal({ reviewId: created.review.reviewId });
    const activity = await harness.runtime.service.getActivityFeed({ reviewId: created.review.reviewId });

    expect(status.review).toMatchObject({
      reviewId: created.review.reviewId,
      status: 'closed',
      currentRound: 1,
      latestVerdict: 'approved',
      verdictReason: 'Approved before the invalid transition check.',
      counterPatchStatus: 'none',
      lastMessageAt: null,
      lastActivityAt: '2026-03-21T13:04:00.000Z',
    });
    expect(proposal.proposal).toMatchObject({
      reviewId: created.review.reviewId,
      currentRound: 1,
      latestVerdict: 'approved',
      verdictReason: 'Approved before the invalid transition check.',
      counterPatchStatus: 'none',
    });
    expect(activity.activity.at(-1)).toMatchObject({
      eventType: 'review.transition_rejected',
      actorId: 'agent-reviewer',
      statusFrom: 'closed',
      statusTo: 'pending',
      errorCode: 'INVALID_REVIEW_TRANSITION',
      createdAt: '2026-03-21T13:05:00.000Z',
      metadata: {
        reviewId: created.review.reviewId,
        attemptedEvent: 'reclaim',
        outcome: 'invalid_transition',
      },
    });
  });
});

function createHarness(timestamps: string[]): { runtime: StartedBrokerRuntime } {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'review-broker-parity-'));
  tempDirectories.push(directory);

  const runtime = startBroker({
    cwd: WORKTREE_ROOT,
    dbPath: path.join(directory, 'broker.sqlite'),
    handleSignals: false,
    now: createNow(timestamps),
  });
  openRuntimes.push(runtime);

  return { runtime };
}

function createNow(timestamps: string[]): () => string {
  const queue = [...timestamps];
  return () => queue.shift() ?? new Date().toISOString();
}

function readFixture(fileName: string): string {
  return readFileSync(path.join(WORKTREE_ROOT, 'packages', 'review-broker-server', 'test', 'fixtures', fileName), 'utf8');
}
