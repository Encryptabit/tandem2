import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createBrokerClient,
  createInProcessBrokerClient,
  startInProcessBrokerClient,
  type BrokerClient,
  type BrokerServiceLike,
} from '../src/index.js';

import {
  REVIEWER_FIXTURE_PATH,
  TANDEM_CLI_PATH,
  TSX_PATH,
  WORKTREE_ROOT,
} from '../../review-broker-server/test/test-paths.js';
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
      args: ['test/fixtures/reviewer-worker.mjs'],
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

  it('auto-claims pending reviews when reviewer pool is enabled in-process', async () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), 'review-broker-client-pool-'));
    tempDirectories.push(directory);

    const dbPath = path.join(directory, 'pool.sqlite');
    const configPath = path.join(directory, 'config.json');
    const reviewerWorkerPath = path.join(
      WORKTREE_ROOT,
      'packages',
      'review-broker-server',
      'scripts',
      'reviewer-worker.mjs',
    );
    const gsdStubPath = path.join(directory, 'gsd-stub.mjs');
    const tandemWrapperPath = path.join(directory, 'tandem-wrapper.mjs');

    writeFileSync(
      configPath,
      JSON.stringify(
        {
          reviewer_pool: {
            max_pool_size: 1,
            scaling_ratio: 1,
            idle_timeout_seconds: 300,
            max_ttl_seconds: 600,
            claim_timeout_seconds: 300,
            spawn_cooldown_seconds: 1,
            background_check_interval_seconds: 5,
          },
        },
        null,
        2,
      ) + '\n',
      'utf8',
    );

    writeFileSync(
      gsdStubPath,
      `#!/usr/bin/env node\nprocess.stdout.write(JSON.stringify({ verdict: 'approved', reason: 'pool-test-approval' }) + '\\n');\n`,
      'utf8',
    );

    writeFileSync(
      tandemWrapperPath,
      `#!/usr/bin/env node\n` +
        `import { spawnSync } from 'node:child_process';\n` +
        `const result = spawnSync(${JSON.stringify(TSX_PATH)}, [` +
        `${JSON.stringify(TANDEM_CLI_PATH)}, ...process.argv.slice(2)], {\n` +
        `  cwd: ${JSON.stringify(WORKTREE_ROOT)},\n` +
        `  env: process.env,\n` +
        `  encoding: 'utf8',\n` +
        `});\n` +
        `if (result.stdout) process.stdout.write(result.stdout);\n` +
        `if (result.stderr) process.stderr.write(result.stderr);\n` +
        `process.exit(result.status ?? 1);\n`,
      'utf8',
    );

    chmodSync(gsdStubPath, 0o755);
    chmodSync(tandemWrapperPath, 0o755);

    const previousGsdCommand = process.env.REVIEWER_GSD_COMMAND;
    const previousTandemCommand = process.env.REVIEWER_TANDEM_COMMAND;

    process.env.REVIEWER_GSD_COMMAND = gsdStubPath;
    process.env.REVIEWER_TANDEM_COMMAND = tandemWrapperPath;

    try {
      const started = startInProcessBrokerClient({
        cwd: WORKTREE_ROOT,
        dbPath,
        handleSignals: false,
        env: {
          ...process.env,
          REVIEW_BROKER_CONFIG_PATH: configPath,
        },
        poolSpawnCommand: process.execPath,
        poolSpawnArgs: [reviewerWorkerPath],
      });
      openClients.push(started);

      const created = await started.client.createReview({
        title: 'Pool auto-claim test review',
        description: 'Validates in-process pool spawning + claim propagation.',
        diff: readFixture('valid-review.diff'),
        authorId: 'pool-test-author',
        priority: 'normal',
      });

      const claimed = await waitForClaimedReview(started.client, created.review.reviewId, 8_000);
      expect(claimed.status).toBe('claimed');
      expect(claimed.claimedBy).toMatch(/^reviewer_/);
    } finally {
      if (previousGsdCommand === undefined) {
        delete process.env.REVIEWER_GSD_COMMAND;
      } else {
        process.env.REVIEWER_GSD_COMMAND = previousGsdCommand;
      }

      if (previousTandemCommand === undefined) {
        delete process.env.REVIEWER_TANDEM_COMMAND;
      } else {
        process.env.REVIEWER_TANDEM_COMMAND = previousTandemCommand;
      }
    }
  }, 15_000);

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

async function waitForClaimedReview(
  client: BrokerClient,
  reviewId: string,
  timeoutMs: number,
): Promise<Awaited<ReturnType<BrokerClient['getReviewStatus']>>['review']> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const response = await client.getReviewStatus({ reviewId });
    if (response.review.status === 'claimed') {
      return response.review;
    }

    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  const latest = await client.getReviewStatus({ reviewId });
  throw new Error(
    `Timed out waiting for review ${reviewId} to be claimed. Latest status=${latest.review.status}`,
  );
}

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
