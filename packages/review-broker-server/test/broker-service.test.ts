import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { AppContext } from '../src/runtime/app-context.js';
import { createAppContext } from '../src/runtime/app-context.js';
import { BrokerServiceError, createBrokerService } from '../src/runtime/broker-service.js';
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

describe('review-broker-server broker service', () => {
  it('creates, lists, inspects, fetches proposals, and reclaims reviews with durable audit rows', async () => {
    const harness = createHarness();
    const validDiff = readFixture('valid-review.diff');

    const created = await harness.service.createReview({
      title: 'Broker service happy path',
      description: 'Exercise the durable create/list/claim/status/proposal/reclaim flow.',
      diff: validDiff,
      authorId: 'agent-author',
      priority: 'high',
    });

    expect(created.review).toMatchObject({
      status: 'pending',
      claimedBy: null,
      claimedAt: null,
      claimGeneration: 0,
      priority: 'high',
      authorId: 'agent-author',
      workspaceRoot: WORKTREE_ROOT,
      projectName: path.basename(WORKTREE_ROOT),
      currentRound: 1,
      latestVerdict: null,
      verdictReason: null,
      counterPatchStatus: 'none',
      lastMessageAt: null,
    });
    expect(created.proposal).toMatchObject({
      reviewId: created.review.reviewId,
      title: 'Broker service happy path',
      description: 'Exercise the durable create/list/claim/status/proposal/reclaim flow.',
      diff: validDiff,
      priority: 'high',
      workspaceRoot: WORKTREE_ROOT,
      projectName: path.basename(WORKTREE_ROOT),
      affectedFiles: ['packages/review-broker-server/src/runtime/_proposal_fixture_valid.ts'],
      currentRound: 1,
      latestVerdict: null,
      verdictReason: null,
      counterPatchStatus: 'none',
      lastMessageAt: null,
    });

    const listed = await harness.service.listReviews({});
    expect(listed.reviews).toHaveLength(1);
    expect(listed.reviews[0]).toEqual(created.review);

    const proposal = await harness.service.getProposal({ reviewId: created.review.reviewId });
    expect(proposal.proposal).toEqual(created.proposal);

    const claimed = await harness.service.claimReview({
      reviewId: created.review.reviewId,
      claimantId: 'agent-reviewer',
    });
    expect(claimed.outcome).toBe('claimed');
    expect(claimed.review).toMatchObject({
      reviewId: created.review.reviewId,
      status: 'claimed',
      claimedBy: 'agent-reviewer',
      claimGeneration: 1,
    });

    const statusAfterClaim = await harness.service.getReviewStatus({ reviewId: created.review.reviewId });
    expect(statusAfterClaim.review).toMatchObject({
      reviewId: created.review.reviewId,
      status: 'claimed',
      claimedBy: 'agent-reviewer',
      claimGeneration: 1,
    });

    const reclaimed = await harness.service.reclaimReview({
      reviewId: created.review.reviewId,
      actorId: 'agent-reviewer',
    });
    expect(reclaimed.review).toMatchObject({
      reviewId: created.review.reviewId,
      status: 'pending',
      claimedBy: null,
      claimedAt: null,
      claimGeneration: 2,
    });
    expect(reclaimed.version).toBeGreaterThan(claimed.version);

    const activity = await harness.service.getActivityFeed({ reviewId: created.review.reviewId });
    expect(activity.review).toMatchObject({
      reviewId: created.review.reviewId,
      status: 'pending',
      currentRound: 1,
      latestVerdict: null,
      counterPatchStatus: 'none',
    });
    expect(activity.activity.map((entry) => entry.eventType)).toEqual([
      'review.created',
      'review.claimed',
      'review.reclaimed',
    ]);
    expect(activity.activity[0]).toMatchObject({
      summary: 'Review created and queued for assignment.',
    });
    expect(activity.activity[2]).toMatchObject({
      summary: 'Review returned to the queue.',
    });

    const auditEvents = harness.context.audit.listForReview(created.review.reviewId);
    expect(auditEvents.map((event) => event.eventType)).toEqual([
      'review.created',
      'review.claimed',
      'review.reclaimed',
    ]);
    expect(auditEvents[0]).toMatchObject({
      statusFrom: null,
      statusTo: 'pending',
      metadata: {
        reviewId: created.review.reviewId,
        affectedFiles: ['packages/review-broker-server/src/runtime/_proposal_fixture_valid.ts'],
      },
    });
    expect(auditEvents[1]).toMatchObject({
      actorId: 'agent-reviewer',
      statusFrom: 'pending',
      statusTo: 'claimed',
      metadata: {
        reviewId: created.review.reviewId,
        outcome: 'claimed',
        claimGeneration: 1,
      },
    });
    expect(auditEvents[2]).toMatchObject({
      actorId: 'agent-reviewer',
      statusFrom: 'claimed',
      statusTo: 'pending',
      metadata: {
        reviewId: created.review.reviewId,
        claimGeneration: 2,
      },
    });
  });

  it('rejects invalid diffs without persisting a review and records a redacted audit event', async () => {
    const harness = createHarness();
    const invalidDiff = readFixture('invalid-review.diff');

    await expect(
      harness.service.createReview({
        title: 'Invalid broker proposal',
        description: 'The broker should reject invalid diffs before persistence.',
        diff: invalidDiff,
        authorId: 'agent-author',
        priority: 'normal',
      }),
    ).rejects.toMatchObject<BrokerServiceError>({
      code: 'INVALID_DIFF',
    });

    expect(harness.context.reviews.list()).toEqual([]);

    const auditRows = harness.context.db
      .prepare<unknown[], { event_type: string; error_code: string | null; metadata_json: string }>(
        'SELECT event_type, error_code, metadata_json FROM audit_events ORDER BY audit_event_id ASC',
      )
      .all();

    expect(auditRows).toHaveLength(1);
    expect(auditRows[0]).toMatchObject({
      event_type: 'review.diff_rejected',
      error_code: 'INVALID_DIFF',
    });
    expect(auditRows[0]?.metadata_json).toContain('packages/review-broker-server/src/runtime/_proposal_fixture_missing.ts');
    expect(auditRows[0]?.metadata_json).not.toContain('diff --git');
  });

  it('wakes review-status waiters when a claimed review changes version', async () => {
    const harness = createHarness();
    const validDiff = readFixture('valid-review.diff');

    const created = await harness.service.createReview({
      title: 'Wait semantics review',
      description: 'Ensure versioned status waits wake on claim transitions.',
      diff: validDiff,
      authorId: 'agent-author',
      priority: 'normal',
    });
    const initialStatus = await harness.service.getReviewStatus({ reviewId: created.review.reviewId });

    const waiter = harness.service.getReviewStatus({
      reviewId: created.review.reviewId,
      wait: true,
      sinceVersion: initialStatus.version,
      timeoutMs: 500,
    });

    await new Promise((resolve) => setTimeout(resolve, 20));
    await harness.service.claimReview({ reviewId: created.review.reviewId, claimantId: 'agent-reviewer' });

    const claimedStatus = await waiter;

    expect(claimedStatus.version).toBeGreaterThan(initialStatus.version);
    expect(claimedStatus.review).toMatchObject({
      reviewId: created.review.reviewId,
      status: 'claimed',
      claimedBy: 'agent-reviewer',
      claimGeneration: 1,
    });
  });
});

function createHarness(): { context: AppContext; service: ReturnType<typeof createBrokerService> } {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'review-broker-service-'));
  tempDirectories.push(directory);

  const context = createAppContext({
    cwd: WORKTREE_ROOT,
    dbPath: path.join(directory, 'broker.sqlite'),
  });
  openContexts.push(context);

  return {
    context,
    service: createBrokerService(context),
  };
}

function readFixture(fileName: string): string {
  return readFileSync(path.join(WORKTREE_ROOT, 'packages', 'review-broker-server', 'test', 'fixtures', fileName), 'utf8');
}
