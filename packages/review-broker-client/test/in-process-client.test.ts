import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createBrokerClient, createInProcessBrokerClient, startInProcessBrokerClient, type BrokerServiceLike } from '../src/index.js';

import { REVIEWER_FIXTURE_PATH, WORKTREE_ROOT } from '../../review-broker-server/test/test-paths.js';
const tempDirectories: string[] = [];
const openClients: Array<{ close(): void; waitUntilStopped(): Promise<void> }> = [];

afterEach(async () => {
  while (openClients.length > 0) {
    const clientRuntime = openClients.pop();

    if (!clientRuntime) {
      continue;
    }

    clientRuntime.close();
    await clientRuntime.waitUntilStopped().catch(() => undefined);
  }

  while (tempDirectories.length > 0) {
    const directory = tempDirectories.pop();

    if (directory) {
      rmSync(directory, { recursive: true, force: true });
    }
  }
});

describe('review-broker-client in-process client', () => {
  it('wraps an existing broker service and preserves review wait/version semantics', async () => {
    const harness = startHarness({
      now: createNow([
        '2026-03-21T14:59:00.000Z',
        '2026-03-21T15:00:00.000Z',
        '2026-03-21T15:01:00.000Z',
        '2026-03-21T15:02:00.000Z',
        '2026-03-21T15:03:00.000Z',
        '2026-03-21T15:04:00.000Z',
      ]),
    });
    const client = createInProcessBrokerClient(harness.runtime.service as BrokerServiceLike);

    const initialList = await client.listReviews({});
    expect(initialList).toEqual({ reviews: [], version: 0 });

    const waitedForQueue = client.listReviews({
      wait: true,
      sinceVersion: initialList.version,
      timeoutMs: 500,
    });

    await new Promise((resolve) => setTimeout(resolve, 20));
    const created = await client.createReview({
      title: 'Client wait semantics review',
      description: 'Ensure the typed client shares the broker queue version contract.',
      diff: readFixture('valid-review.diff'),
      authorId: 'agent-author',
      priority: 'high',
    });
    const waited = await waitedForQueue;

    expect(created.review).toMatchObject({
      reviewId: expect.stringMatching(/^rvw_/),
      status: 'pending',
      priority: 'high',
      authorId: 'agent-author',
      currentRound: 1,
      latestVerdict: null,
      counterPatchStatus: 'none',
      lastMessageAt: null,
    });
    expect(created.review.lastActivityAt).toBe(created.review.updatedAt);
    expect(created.proposal).toMatchObject({
      reviewId: created.review.reviewId,
      title: 'Client wait semantics review',
      affectedFiles: expect.arrayContaining([
        'packages/review-broker-server/src/runtime/_proposal_fixture_valid.ts',
      ]),
      currentRound: 1,
      latestVerdict: null,
      counterPatchStatus: 'none',
      lastActivityAt: created.review.lastActivityAt,
    });
    expect(waited.version).toBeGreaterThan(initialList.version);
    expect(waited.reviews).toEqual([created.review]);

    const claimed = await client.claimReview({
      reviewId: created.review.reviewId,
      claimantId: 'agent-reviewer',
    });
    const approved = await client.submitVerdict({
      reviewId: created.review.reviewId,
      actorId: 'agent-reviewer',
      verdict: 'approved',
      reason: 'The typed client exercised the shared runtime successfully.',
    });
    const closed = await client.closeReview({
      reviewId: created.review.reviewId,
      actorId: 'agent-reviewer',
    });

    expect(claimed).toMatchObject({
      outcome: 'claimed',
      review: {
        reviewId: created.review.reviewId,
        status: 'claimed',
        claimedBy: 'agent-reviewer',
      },
    });
    expect(approved.review).toMatchObject({
      reviewId: created.review.reviewId,
      status: 'approved',
      latestVerdict: 'approved',
      verdictReason: 'The typed client exercised the shared runtime successfully.',
    });
    expect(closed.review).toMatchObject({
      reviewId: created.review.reviewId,
      status: 'closed',
      latestVerdict: 'approved',
    });

    await expect(
      client.reclaimReview({
        reviewId: created.review.reviewId,
        actorId: 'agent-reviewer',
      }),
    ).rejects.toMatchObject({
      name: 'BrokerServiceError',
      code: 'INVALID_REVIEW_TRANSITION',
      reviewId: created.review.reviewId,
    });
  });

  it('starts a real runtime through the convenience helper and exercises reviewer operations', async () => {
    const started = startHarness();
    const { client } = started;

    const initialReviewers = await client.listReviewers({});
    expect(initialReviewers).toEqual({ reviewers: [], version: 0 });

    const waitedForReviewer = client.listReviewers({
      wait: true,
      sinceVersion: initialReviewers.version,
      timeoutMs: 500,
    });

    await new Promise((resolve) => setTimeout(resolve, 20));
    const spawned = await client.spawnReviewer({
      reviewerId: 'reviewer-client-1',
      command: process.execPath,
      args: [REVIEWER_FIXTURE_PATH],
      cwd: 'packages/review-broker-server',
    });
    const waited = await waitedForReviewer;

    expect(spawned.reviewer).toMatchObject({
      reviewerId: 'reviewer-client-1',
      status: 'idle',
      currentReviewId: null,
      command: path.basename(process.execPath),
      args: ['packages/review-broker-server/test/fixtures/reviewer-worker.mjs'],
      cwd: 'packages/review-broker-server',
      offlineAt: null,
      offlineReason: null,
    });
    expect(waited.version).toBeGreaterThan(initialReviewers.version);
    expect(waited.reviewers).toEqual([spawned.reviewer]);

    const created = await client.createReview({
      title: 'Started runtime review',
      description: 'Exercise reviewer lifecycle through the started client helper.',
      diff: readFixture('valid-review.diff'),
      authorId: 'agent-author',
      priority: 'normal',
    });

    const claimed = await client.claimReview({
      reviewId: created.review.reviewId,
      claimantId: 'reviewer-client-1',
    });
    const assigned = await client.listReviewers({});
    const killed = await client.killReviewer({ reviewerId: 'reviewer-client-1' });
    const requeuedStatus = await client.getReviewStatus({ reviewId: created.review.reviewId });
    const offline = await client.listReviewers({ status: 'offline' });

    expect(claimed).toMatchObject({
      outcome: 'claimed',
      review: {
        reviewId: created.review.reviewId,
        status: 'claimed',
        claimedBy: 'reviewer-client-1',
      },
    });
    expect(assigned.reviewers).toEqual([
      expect.objectContaining({
        reviewerId: 'reviewer-client-1',
        status: 'assigned',
        currentReviewId: created.review.reviewId,
      }),
    ]);
    expect(killed).toMatchObject({
      outcome: 'killed',
      message: 'Reviewer reviewer-client-1 received a shutdown signal.',
      reviewer: {
        reviewerId: 'reviewer-client-1',
        status: 'offline',
        currentReviewId: null,
        offlineReason: 'operator_kill',
      },
    });
    expect(requeuedStatus.review).toMatchObject({
      reviewId: created.review.reviewId,
      status: 'pending',
      claimedBy: null,
      claimGeneration: 2,
    });
    expect(offline.reviewers).toEqual([
      expect.objectContaining({
        reviewerId: 'reviewer-client-1',
        status: 'offline',
        currentReviewId: null,
        offlineReason: 'operator_kill',
      }),
    ]);
  });

  it('rejects invalid requests before dispatching to the wrapped service', async () => {
    const harness = startHarness();
    const createReviewSpy = vi.fn(harness.runtime.service.createReview.bind(harness.runtime.service));
    const client = createInProcessBrokerClient(
      new Proxy(harness.runtime.service as BrokerServiceLike, {
        get(target, property, receiver) {
          if (property === 'createReview') {
            return createReviewSpy;
          }

          return Reflect.get(target, property, receiver);
        },
      }),
    );

    await expect(
      client.createReview({
        title: '',
        description: 'Missing title should fail client-side schema parsing.',
        diff: readFixture('valid-review.diff'),
        authorId: 'agent-author',
        priority: 'normal',
      }),
    ).rejects.toMatchObject({
      name: 'ZodError',
    });

    expect(createReviewSpy).not.toHaveBeenCalled();
  });

  it('rejects malformed service responses through the shared response schemas', async () => {
    const client = createBrokerClient({
      async call(methodName) {
        if (methodName === 'listReviews') {
          return { reviews: 'not-an-array', version: 'broken' };
        }

        throw new Error(`Unexpected test method ${methodName}`);
      },
    });

    await expect(client.listReviews({})).rejects.toMatchObject({
      name: 'ZodError',
    });
  });
});

function startHarness(options: Parameters<typeof startInProcessBrokerClient>[0] = {}) {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'review-broker-client-'));
  tempDirectories.push(directory);

  const started = startInProcessBrokerClient({
    cwd: WORKTREE_ROOT,
    dbPath: path.join(directory, 'broker.sqlite'),
    handleSignals: false,
    ...options,
  });
  openClients.push(started);

  return started;
}

function createNow(timestamps: string[]): () => string {
  const queue = [...timestamps];
  return () => queue.shift() ?? new Date().toISOString();
}

function readFixture(fileName: string): string {
  return readFileSync(path.join(WORKTREE_ROOT, 'packages', 'review-broker-server', 'test', 'fixtures', fileName), 'utf8');
}
