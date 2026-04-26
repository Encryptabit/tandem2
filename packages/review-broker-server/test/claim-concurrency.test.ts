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

describe('review-broker-server claim concurrency', () => {
  it('allows exactly one claimant to win the durable compare-and-set race', async () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), 'review-broker-claim-race-'));
    tempDirectories.push(directory);

    const dbPath = path.join(directory, 'broker.sqlite');
    const writerContext = createContext(dbPath);
    const workerAContext = createContext(dbPath);
    const workerBContext = createContext(dbPath);
    const reopenedContext = createContext(dbPath);

    const writerService = createBrokerService(writerContext);
    const workerAService = createBrokerService(workerAContext);
    const workerBService = createBrokerService(workerBContext);
    const reopenedService = createBrokerService(reopenedContext);

    const created = await writerService.createReview({
      title: 'Concurrent claim race',
      description: 'Exactly one claimant should win once claim_generation fencing is enforced.',
      diff: readFixture('valid-review.diff'),
      authorId: 'agent-author',
      priority: 'urgent',
    });

    const responses = await Promise.all([
      workerAService.claimReview({ reviewId: created.review.reviewId, claimantId: 'worker-a' }),
      workerBService.claimReview({ reviewId: created.review.reviewId, claimantId: 'worker-b' }),
    ]);

    const claimed = responses.filter((response) => response.outcome === 'claimed');
    const stale = responses.filter((response) => response.outcome === 'stale');

    expect(claimed).toHaveLength(1);
    expect(stale).toHaveLength(1);
    expect(stale[0]?.review).toMatchObject({
      status: 'claimed',
      claimedBy: claimed[0]?.review?.claimedBy,
      claimGeneration: 1,
    });

    const persistedStatus = await reopenedService.getReviewStatus({ reviewId: created.review.reviewId });
    expect(persistedStatus.review).toMatchObject({
      reviewId: created.review.reviewId,
      status: 'claimed',
      claimedBy: claimed[0]?.review?.claimedBy,
      claimGeneration: 1,
    });

    const auditEvents = reopenedContext.audit.listForReview(created.review.reviewId);
    expect(auditEvents.filter((event) => event.eventType === 'review.claimed')).toHaveLength(1);
    expect(auditEvents.filter((event) => event.eventType === 'review.transition_rejected')).toHaveLength(1);
    expect(auditEvents.find((event) => event.eventType === 'review.transition_rejected')).toMatchObject({
      errorCode: 'STALE_CLAIM_GENERATION',
      metadata: {
        reviewId: created.review.reviewId,
        outcome: 'stale',
        summary: expect.stringContaining('Claim ignored'),
      },
    });
  });

  it('lets competing workers atomically claim different pending reviews', async () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), 'review-broker-claim-next-'));
    tempDirectories.push(directory);

    const dbPath = path.join(directory, 'broker.sqlite');
    const writerContext = createContext(dbPath);
    const workerAContext = createContext(dbPath);
    const workerBContext = createContext(dbPath);
    const reopenedContext = createContext(dbPath);

    const writerService = createBrokerService(writerContext);
    const workerAService = createBrokerService(workerAContext);
    const workerBService = createBrokerService(workerBContext);

    const first = await writerService.createReview({
      title: 'First next-pending claim',
      description: 'One worker should claim this or the other pending review.',
      diff: readFixture('valid-review.diff'),
      authorId: 'agent-author',
      priority: 'normal',
    });
    const second = await writerService.createReview({
      title: 'Second next-pending claim',
      description: 'The other worker should claim the remaining pending review.',
      diff: readFixture('valid-review.diff'),
      authorId: 'agent-author',
      priority: 'normal',
    });

    const responses = await Promise.all([
      workerAService.claimNextPendingReview({ claimantId: 'worker-a' }),
      workerBService.claimNextPendingReview({ claimantId: 'worker-b' }),
    ]);

    expect(responses.map((response) => response.outcome)).toEqual(['claimed', 'claimed']);
    expect(new Set(responses.map((response) => response.review?.reviewId))).toEqual(
      new Set([first.review.reviewId, second.review.reviewId]),
    );
    expect(new Set(responses.map((response) => response.review?.claimedBy))).toEqual(new Set(['worker-a', 'worker-b']));

    const noPending = await workerAService.claimNextPendingReview({ claimantId: 'worker-a' });
    expect(noPending).toMatchObject({
      outcome: 'not_claimable',
      review: null,
    });

    const claimedEvents = [first.review.reviewId, second.review.reviewId].flatMap((reviewId) =>
      reopenedContext.audit.listForReview(reviewId).filter((event) => event.eventType === 'review.claimed'),
    );
    expect(claimedEvents).toHaveLength(2);
  });

  it('rejects reviewer messages and verdicts from actors that do not own the active claim', async () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), 'review-broker-claim-owner-'));
    tempDirectories.push(directory);

    const dbPath = path.join(directory, 'broker.sqlite');
    const context = createContext(dbPath);
    const service = createBrokerService(context, {
      now: createNow([
        '2026-03-21T10:00:00.000Z',
        '2026-03-21T10:01:00.000Z',
        '2026-03-21T10:02:00.000Z',
        '2026-03-21T10:03:00.000Z',
      ]),
    });

    const created = await service.createReview({
      title: 'Claim ownership guard',
      description: 'Only the active claimant may act as reviewer.',
      diff: readFixture('valid-review.diff'),
      authorId: 'agent-author',
      priority: 'normal',
    });

    await service.claimReview({
      reviewId: created.review.reviewId,
      claimantId: 'reviewer-owner',
    });

    await expect(
      service.addMessage({
        reviewId: created.review.reviewId,
        actorId: 'reviewer-intruder',
        body: 'I should not be able to add reviewer feedback.',
      }),
    ).rejects.toMatchObject<BrokerServiceError>({
      code: 'REVIEW_CLAIM_OWNERSHIP_MISMATCH',
      reviewId: created.review.reviewId,
    });

    await expect(
      service.submitVerdict({
        reviewId: created.review.reviewId,
        actorId: 'reviewer-intruder',
        verdict: 'approved',
        reason: 'I do not own this claim.',
      }),
    ).rejects.toMatchObject<BrokerServiceError>({
      code: 'REVIEW_CLAIM_OWNERSHIP_MISMATCH',
      reviewId: created.review.reviewId,
    });

    const ownerVerdict = await service.submitVerdict({
      reviewId: created.review.reviewId,
      actorId: 'reviewer-owner',
      verdict: 'approved',
      reason: 'The active claimant can still finish the review.',
    });

    expect(ownerVerdict.review).toMatchObject({
      status: 'approved',
      claimedBy: 'reviewer-owner',
      latestVerdict: 'approved',
    });

    const rejectionEvents = context.audit
      .listForReview(created.review.reviewId)
      .filter((event) => event.eventType === 'review.transition_rejected');

    expect(rejectionEvents).toHaveLength(2);
    expect(rejectionEvents.map((event) => event.metadata?.attemptedEvent)).toEqual([
      'add_message',
      'submit_verdict',
    ]);
    expect(rejectionEvents[0]?.metadata).toMatchObject({
      outcome: 'claim_owner_mismatch',
      expectedClaimedBy: 'reviewer-owner',
      actualActorId: 'reviewer-intruder',
      summary: expect.stringContaining('claimed by reviewer-owner'),
    });
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

function readFixture(fileName: string): string {
  return readFileSync(path.join(WORKTREE_ROOT, 'packages', 'review-broker-server', 'test', 'fixtures', fileName), 'utf8');
}

function createNow(timestamps: string[]): () => string {
  const queue = [...timestamps];
  return () => queue.shift() ?? new Date().toISOString();
}
