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
      },
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
