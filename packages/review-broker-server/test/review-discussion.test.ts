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

describe('review-broker-server discussion flows', () => {
  it('stores chronological discussion and promotes claimed reviews into submitted on first message', async () => {
    const harness = createHarness([
      '2026-03-21T10:00:00.000Z',
      '2026-03-21T10:01:00.000Z',
      '2026-03-21T10:02:00.000Z',
      '2026-03-21T10:03:00.000Z',
    ]);

    const created = await harness.service.createReview({
      title: 'Chronological discussion review',
      description: 'Verify message ordering and active-discussion promotion.',
      diff: readFixture('valid-review.diff'),
      authorId: 'agent-author',
      priority: 'normal',
    });

    await harness.service.claimReview({
      reviewId: created.review.reviewId,
      claimantId: 'agent-reviewer',
    });

    const reviewerMessage = await harness.service.addMessage({
      reviewId: created.review.reviewId,
      actorId: 'agent-reviewer',
      body: 'Started reviewing the proposal and left inline feedback.',
    });
    const proposerMessage = await harness.service.addMessage({
      reviewId: created.review.reviewId,
      actorId: 'agent-author',
      body: 'Acknowledged the inline notes and answered the open question.',
    });

    expect(reviewerMessage.review).toMatchObject({
      reviewId: created.review.reviewId,
      status: 'submitted',
      claimedBy: 'agent-reviewer',
      currentRound: 1,
      latestVerdict: null,
      counterPatchStatus: 'none',
      lastMessageAt: '2026-03-21T10:02:00.000Z',
      lastActivityAt: '2026-03-21T10:02:00.000Z',
    });
    expect(reviewerMessage.message).toMatchObject({
      reviewId: created.review.reviewId,
      actorId: 'agent-reviewer',
      authorRole: 'reviewer',
      body: 'Started reviewing the proposal and left inline feedback.',
      createdAt: '2026-03-21T10:02:00.000Z',
    });
    expect(proposerMessage.review).toMatchObject({
      reviewId: created.review.reviewId,
      status: 'submitted',
      currentRound: 1,
      lastMessageAt: '2026-03-21T10:03:00.000Z',
      lastActivityAt: '2026-03-21T10:03:00.000Z',
    });

    const discussion = await harness.service.getDiscussion({ reviewId: created.review.reviewId });
    expect(discussion.review).toMatchObject({
      reviewId: created.review.reviewId,
      status: 'submitted',
      currentRound: 1,
      lastMessageAt: '2026-03-21T10:03:00.000Z',
    });
    expect(discussion.messages).toEqual([
      {
        messageId: expect.any(Number),
        reviewId: created.review.reviewId,
        actorId: 'agent-reviewer',
        authorRole: 'reviewer',
        body: 'Started reviewing the proposal and left inline feedback.',
        createdAt: '2026-03-21T10:02:00.000Z',
      },
      {
        messageId: expect.any(Number),
        reviewId: created.review.reviewId,
        actorId: 'agent-author',
        authorRole: 'proposer',
        body: 'Acknowledged the inline notes and answered the open question.',
        createdAt: '2026-03-21T10:03:00.000Z',
      },
    ]);

    expect(harness.context.messages.listForReview(created.review.reviewId).map((message) => message.roundNumber)).toEqual([1, 1]);

    const activity = await harness.service.getActivityFeed({ reviewId: created.review.reviewId });
    expect(activity.activity.map((entry) => entry.eventType)).toEqual([
      'review.created',
      'review.claimed',
      'review.submitted',
      'review.message_added',
      'review.message_added',
    ]);
    expect(activity.activity[2]).toMatchObject({
      summary: 'Review entered active discussion.',
    });
    expect(activity.activity[3]).toMatchObject({
      summary: 'Reviewer added a discussion message for round 1.',
      metadata: {
        reviewId: created.review.reviewId,
        roundNumber: 1,
        authorRole: 'reviewer',
      },
    });

    const messageMetadataRows = harness.context.db
      .prepare<unknown[], { metadata_json: string }>(
        "SELECT metadata_json FROM audit_events WHERE review_id = ? AND event_type = 'review.message_added' ORDER BY audit_event_id ASC",
      )
      .all(created.review.reviewId);

    expect(messageMetadataRows).toHaveLength(2);
    for (const row of messageMetadataRows) {
      expect(row.metadata_json).not.toContain('Started reviewing the proposal and left inline feedback.');
      expect(row.metadata_json).not.toContain('Acknowledged the inline notes and answered the open question.');
    }
  });

  it('requeues proposer follow-up after changes_requested into the next round and marks a pending counter-patch', async () => {
    const harness = createHarness([
      '2026-03-21T11:00:00.000Z',
      '2026-03-21T11:01:00.000Z',
      '2026-03-21T11:02:00.000Z',
      '2026-03-21T11:03:00.000Z',
      '2026-03-21T11:04:00.000Z',
    ]);

    const created = await harness.service.createReview({
      title: 'Requeue review',
      description: 'Verify proposer follow-up requeues a changes-requested review.',
      diff: readFixture('valid-review.diff'),
      authorId: 'agent-author',
      priority: 'high',
    });

    await harness.service.claimReview({
      reviewId: created.review.reviewId,
      claimantId: 'agent-reviewer',
    });
    await harness.service.addMessage({
      reviewId: created.review.reviewId,
      actorId: 'agent-reviewer',
      body: 'Please add regression coverage before approval.',
    });

    const verdict = await harness.service.submitVerdict({
      reviewId: created.review.reviewId,
      actorId: 'agent-reviewer',
      verdict: 'changes_requested',
      reason: 'Regression coverage is still missing.',
    });
    const statusBeforeRequeue = await harness.service.getReviewStatus({ reviewId: created.review.reviewId });
    const queueWaiter = harness.service.listReviews({
      wait: true,
      sinceVersion: verdict.version,
      timeoutMs: 500,
    });
    const statusWaiter = harness.service.getReviewStatus({
      reviewId: created.review.reviewId,
      wait: true,
      sinceVersion: statusBeforeRequeue.version,
      timeoutMs: 500,
    });

    await new Promise((resolve) => setTimeout(resolve, 20));

    const requeued = await harness.service.addMessage({
      reviewId: created.review.reviewId,
      actorId: 'agent-author',
      body: 'Added the missing regression coverage and requeued the review.',
    });
    const queueUpdate = await queueWaiter;
    const statusUpdate = await statusWaiter;

    expect(verdict.review).toMatchObject({
      reviewId: created.review.reviewId,
      status: 'changes_requested',
      currentRound: 1,
      latestVerdict: 'changes_requested',
      verdictReason: 'Regression coverage is still missing.',
      counterPatchStatus: 'none',
    });
    expect(requeued.review).toMatchObject({
      reviewId: created.review.reviewId,
      status: 'pending',
      claimedBy: null,
      claimedAt: null,
      currentRound: 2,
      latestVerdict: 'changes_requested',
      verdictReason: 'Regression coverage is still missing.',
      counterPatchStatus: 'pending',
      lastMessageAt: '2026-03-21T11:04:00.000Z',
      lastActivityAt: '2026-03-21T11:04:00.000Z',
    });
    expect(requeued.message).toMatchObject({
      reviewId: created.review.reviewId,
      actorId: 'agent-author',
      authorRole: 'proposer',
      body: 'Added the missing regression coverage and requeued the review.',
      createdAt: '2026-03-21T11:04:00.000Z',
    });
    expect(queueUpdate.version).toBeGreaterThan(verdict.version);
    expect(queueUpdate.reviews.find((review) => review.reviewId === created.review.reviewId)).toMatchObject({
      status: 'pending',
      currentRound: 2,
      counterPatchStatus: 'pending',
    });
    expect(statusUpdate.version).toBeGreaterThan(statusBeforeRequeue.version);
    expect(statusUpdate.review).toMatchObject({
      reviewId: created.review.reviewId,
      status: 'pending',
      currentRound: 2,
      counterPatchStatus: 'pending',
    });

    const proposal = await harness.service.getProposal({ reviewId: created.review.reviewId });
    expect(proposal.proposal).toMatchObject({
      reviewId: created.review.reviewId,
      currentRound: 2,
      latestVerdict: 'changes_requested',
      verdictReason: 'Regression coverage is still missing.',
      counterPatchStatus: 'pending',
      lastMessageAt: '2026-03-21T11:04:00.000Z',
      lastActivityAt: '2026-03-21T11:04:00.000Z',
    });

    expect(harness.context.messages.listForReview(created.review.reviewId).map((message) => message.roundNumber)).toEqual([1, 2]);
    expect(harness.context.messages.getLatestForRound(created.review.reviewId, 2)).toMatchObject({
      actorId: 'agent-author',
      authorRole: 'proposer',
      roundNumber: 2,
    });

    const discussion = await harness.service.getDiscussion({ reviewId: created.review.reviewId });
    expect(discussion.messages.map((message) => message.body)).toEqual([
      'Please add regression coverage before approval.',
      'Added the missing regression coverage and requeued the review.',
    ]);

    const activity = await harness.service.getActivityFeed({ reviewId: created.review.reviewId });
    expect(activity.activity.map((entry) => entry.eventType)).toEqual([
      'review.created',
      'review.claimed',
      'review.submitted',
      'review.message_added',
      'review.changes_requested',
      'review.requeued',
      'review.message_added',
    ]);
    expect(activity.activity[5]).toMatchObject({
      summary: 'Proposer requeued the review with follow-up changes.',
      metadata: {
        reviewId: created.review.reviewId,
        roundNumber: 2,
        counterPatchStatus: 'pending',
      },
    });
    expect(activity.activity[6]).toMatchObject({
      summary: 'Proposer added a follow-up message for round 2.',
    });
  });

  it('requeues proposer follow-up with a replacement diff and updates the canonical proposal payload', async () => {
    const harness = createHarness([
      '2026-03-21T12:00:00.000Z',
      '2026-03-21T12:01:00.000Z',
      '2026-03-21T12:02:00.000Z',
      '2026-03-21T12:03:00.000Z',
    ]);

    const originalDiff = readFixture('valid-review.diff');
    const replacementDiff = [
      'diff --git a/packages/review-broker-server/src/runtime/_proposal_fixture_round2.ts b/packages/review-broker-server/src/runtime/_proposal_fixture_round2.ts',
      'new file mode 100644',
      'index 0000000..6c55ed8',
      '--- /dev/null',
      '+++ b/packages/review-broker-server/src/runtime/_proposal_fixture_round2.ts',
      '@@ -0,0 +1,3 @@',
      "+export const proposalFixtureRound2 = 'round2';",
      '+',
      '+console.log(proposalFixtureRound2);',
      '',
    ].join('\n');

    const created = await harness.service.createReview({
      title: 'Counter-patch diff replacement review',
      description: 'Verify proposer follow-up can replace the canonical proposal diff.',
      diff: originalDiff,
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
      reason: 'Please revise and resubmit the proposal patch.',
    });

    const requeued = await harness.service.addMessage({
      reviewId: created.review.reviewId,
      actorId: 'agent-author',
      body: 'Posted round-two patch with requested fixes.',
      diff: replacementDiff,
    });

    expect(requeued.review).toMatchObject({
      reviewId: created.review.reviewId,
      status: 'pending',
      currentRound: 2,
      counterPatchStatus: 'pending',
      lastMessageAt: '2026-03-21T12:03:00.000Z',
    });

    const proposal = await harness.service.getProposal({ reviewId: created.review.reviewId });
    expect(proposal.proposal.diff).toBe(replacementDiff);
    expect(proposal.proposal.affectedFiles).toEqual([
      'packages/review-broker-server/src/runtime/_proposal_fixture_round2.ts',
    ]);

    const activity = await harness.service.getActivityFeed({ reviewId: created.review.reviewId });
    const requeueEvent = activity.activity.find((entry) => entry.eventType === 'review.requeued');
    expect(requeueEvent).toBeDefined();
    expect(requeueEvent?.metadata).toMatchObject({
      proposalUpdated: true,
      fileCount: 1,
    });
  });
});

function createHarness(timestamps: string[]): { context: AppContext; service: ReturnType<typeof createBrokerService> } {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'review-broker-discussion-'));
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
