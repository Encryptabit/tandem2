import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { mkdir, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { startInProcessBrokerClient, type BrokerClient } from 'review-broker-client';

import { createTandemReviewExtension } from '../src/index.js';
import type {
  ReviewStatusRecord,
  ReviewTransport,
  ReviewUnitIdentity,
} from '../src/types.js';

const WORKTREE_ROOT = path.resolve(__dirname, '..', '..', '..');
const VALID_DIFF = readFileSync(
  path.join(
    WORKTREE_ROOT,
    'packages',
    'review-broker-server',
    'test',
    'fixtures',
    'valid-review.diff',
  ),
  'utf8',
);

const tmpRoot = path.join(process.cwd(), '.tmp-ext-e2e-tests');
const brokerRuntimes: Array<{ close(): void; waitUntilStopped(): Promise<void> }> = [];
const tmpBrokerDirs: string[] = [];

function createBrokerBackedTransport(client: BrokerClient): ReviewTransport {
  function mapReviewSummaryToStatusRecord(review: {
    reviewId: string;
    status: string;
    latestVerdict: 'approved' | 'changes_requested' | null;
    updatedAt: string;
    verdictReason: string | null;
  }): ReviewStatusRecord {
    const mapped: ReviewStatusRecord['status'] =
      review.status === 'pending'
        ? 'pending'
        : review.status === 'claimed'
          ? 'claimed'
          : review.status === 'submitted'
            ? review.latestVerdict === 'approved'
              ? 'approved'
              : review.latestVerdict === 'changes_requested'
                ? 'changes_requested'
                : 'claimed'
            : review.status === 'changes_requested'
              ? 'changes_requested'
              : review.status === 'approved'
                ? 'approved'
                : review.latestVerdict === 'changes_requested'
                  ? 'changes_requested'
                  : 'approved';

    const record: ReviewStatusRecord = {
      reviewId: review.reviewId,
      status: mapped,
      updatedAt: review.updatedAt,
    };
    if (review.verdictReason != null) {
      record.summary = review.verdictReason;
      record.feedback = review.verdictReason;
    }

    return record;
  }

  return {
    async submitReview(unit: ReviewUnitIdentity): Promise<ReviewStatusRecord> {
      const title = `Review: ${unit.milestoneId ?? ''}/${unit.sliceId ?? ''}/${unit.taskId ?? unit.unitId}`;
      const response = await client.createReview({
        title,
        description: `Auto-review for ${unit.unitId}`,
        diff: VALID_DIFF,
        authorId: 'e2e-author',
        priority: 'normal',
      });
      return mapReviewSummaryToStatusRecord(response.review);
    },
    async submitCounterPatch(input): Promise<ReviewStatusRecord> {
      const response = await client.addMessage({
        reviewId: input.reviewId,
        actorId: 'e2e-author',
        body: `Counter-patch update for ${input.unit.unitId}${input.feedback ? `\n\nFeedback addressed:\n${input.feedback}` : ''}`,
      });

      return mapReviewSummaryToStatusRecord(response.review);
    },
    async getStatus(reviewId: string): Promise<ReviewStatusRecord> {
      const response = await client.getReviewStatus({ reviewId });
      return mapReviewSummaryToStatusRecord(response.review);
    },
  };
}

interface MockExtensionAPI {
  cwd: string;
  handlers: Map<string, (event: any, ctx: any) => Promise<any>>;
  commands: Map<string, { description?: string; handler: (args: string, ctx: any) => Promise<void> }>;
  on(event: string, handler: (event: any, ctx: any) => Promise<any>): void;
  registerCommand(
    name: string,
    options: { description?: string; handler: (args: string, ctx: any) => Promise<void> },
  ): void;
}

function createMockExtensionAPI(cwd: string): MockExtensionAPI {
  return {
    cwd,
    handlers: new Map(),
    commands: new Map(),
    on(event, handler) {
      this.handlers.set(event, handler);
    },
    registerCommand(name, options) {
      this.commands.set(name, options);
    },
  };
}

function startBrokerForTest(): { client: BrokerClient; close: () => Promise<void> } {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'ext-e2e-'));
  tmpBrokerDirs.push(dir);
  const started = startInProcessBrokerClient({
    cwd: WORKTREE_ROOT,
    dbPath: path.join(dir, 'broker.sqlite'),
    handleSignals: false,
  });
  brokerRuntimes.push(started);
  return {
    client: started.client,
    async close() {
      started.close();
      await started.waitUntilStopped().catch(() => undefined);
    },
  };
}

beforeEach(async () => {
  await rm(tmpRoot, { recursive: true, force: true });
  await mkdir(path.join(tmpRoot, '.gsd', 'runtime'), { recursive: true });
});

afterEach(async () => {
  while (brokerRuntimes.length > 0) {
    const r = brokerRuntimes.pop();
    if (r) {
      r.close();
      await r.waitUntilStopped().catch(() => undefined);
    }
  }
  while (tmpBrokerDirs.length > 0) {
    const d = tmpBrokerDirs.pop();
    if (d) rmSync(d, { recursive: true, force: true });
  }
});

describe('tandem review extension — end-to-end against real broker', () => {
  it('completes the full pause → verdict → resume flow for approved reviews', async () => {
    const broker = startBrokerForTest();
    const transport = createBrokerBackedTransport(broker.client);
    const register = createTandemReviewExtension({ transport, reviewWaitTimeoutMs: 0 });
    const api = createMockExtensionAPI(tmpRoot);
    await register(api);

    const hookEvent = {
      type: 'before_next_dispatch',
      unitType: 'task',
      unitId: 'M001-S01-T01',
      milestoneId: 'M001',
      status: 'completed' as const,
      cwd: tmpRoot,
    };

    const handler = api.handlers.get('before_next_dispatch')!;

    const firstResult = await handler(hookEvent, {});
    expect(firstResult.action).toBe('pause');
    expect(firstResult.reason).toMatch(/review-waiting|review-blocked|tandem-review/);

    const paused = JSON.parse(
      await readFile(path.join(tmpRoot, '.gsd', 'runtime', 'tandem-review-state.json'), 'utf8'),
    );
    const reviewId = paused.pausedReviewState.reviewGateState.reviewId as string;
    expect(reviewId).toMatch(/^rvw_/);

    await broker.client.claimReview({
      reviewId,
      claimantId: 'e2e-reviewer',
    });
    await broker.client.submitVerdict({
      reviewId,
      actorId: 'e2e-reviewer',
      verdict: 'approved',
      reason: 'Looks correct.',
    });

    const secondResult = await handler(hookEvent, {});
    expect(secondResult.action).toBe('continue');
    expect(secondResult.reason).toMatch(/review-allowed/);
  });

  it('retries on blocked reviews by default (intervene policy) so user guidance can be gathered in-session', async () => {
    const broker = startBrokerForTest();
    const transport = createBrokerBackedTransport(broker.client);
    const register = createTandemReviewExtension({ transport, reviewWaitTimeoutMs: 0 });
    const api = createMockExtensionAPI(tmpRoot);
    await register(api);

    const handler = api.handlers.get('before_next_dispatch')!;
    const hookEvent = {
      type: 'before_next_dispatch',
      unitType: 'task',
      unitId: 'M001-S01-T02',
      milestoneId: 'M001',
      status: 'completed' as const,
      cwd: tmpRoot,
    };

    const firstResult = await handler(hookEvent, {});
    expect(firstResult.action).toBe('pause');

    const paused = JSON.parse(
      await readFile(path.join(tmpRoot, '.gsd', 'runtime', 'tandem-review-state.json'), 'utf8'),
    );
    const reviewId = paused.pausedReviewState.reviewGateState.reviewId as string;

    await broker.client.claimReview({
      reviewId,
      claimantId: 'e2e-reviewer',
    });
    await broker.client.submitVerdict({
      reviewId,
      actorId: 'e2e-reviewer',
      verdict: 'changes_requested',
      reason: 'Please rename the export.',
    });

    const secondResult = await handler(hookEvent, {});
    expect(secondResult.action).toBe('retry');
    expect(secondResult.reason).toMatch(/review-blocked/);
    expect(secondResult.reason).toMatch(/Please rename the export\./);

    const thirdResult = await handler(hookEvent, {});
    expect(thirdResult.action).toBe('pause');
    expect(thirdResult.reason).toMatch(/review-waiting/);

    const requeued = await broker.client.getReviewStatus({ reviewId });
    expect(requeued.review.reviewId).toBe(reviewId);
    expect(requeued.review.status).toBe('pending');
  });

  it('auto-loop policy retries and injects reviewer guidance into next before_agent_start', async () => {
    const broker = startBrokerForTest();
    const transport = createBrokerBackedTransport(broker.client);
    const register = createTandemReviewExtension({
      transport,
      blockedPolicy: 'auto-loop',
      reviewWaitTimeoutMs: 0,
    });
    const api = createMockExtensionAPI(tmpRoot);
    await register(api);

    const hookEvent = {
      type: 'before_next_dispatch',
      unitType: 'task',
      unitId: 'M001-S01-T04',
      milestoneId: 'M001',
      status: 'completed' as const,
      cwd: tmpRoot,
    };

    const hookHandler = api.handlers.get('before_next_dispatch')!;
    const firstResult = await hookHandler(hookEvent, {});
    expect(firstResult.action).toBe('pause');

    const paused = JSON.parse(
      await readFile(path.join(tmpRoot, '.gsd', 'runtime', 'tandem-review-state.json'), 'utf8'),
    );
    const reviewId = paused.pausedReviewState.reviewGateState.reviewId as string;

    await broker.client.claimReview({
      reviewId,
      claimantId: 'e2e-reviewer',
    });
    await broker.client.submitVerdict({
      reviewId,
      actorId: 'e2e-reviewer',
      verdict: 'changes_requested',
      reason: 'Please rename the export.',
    });

    const retryContext: { state: { pendingVerificationRetry?: unknown } } = {
      state: {},
    };

    const secondResult = await hookHandler(hookEvent, retryContext);
    expect(secondResult.action).toBe('retry');
    expect(retryContext.state.pendingVerificationRetry).toMatchObject({
      attempt: 1,
      failureContext: expect.stringContaining('Please rename the export.'),
    });

    const beforeAgentStart = api.handlers.get('before_agent_start')!;
    const injected = await beforeAgentStart({
      systemPrompt: 'BASE SYSTEM PROMPT',
    }, {});

    expect(injected?.systemPrompt).toContain('Tandem broker review guidance');
    expect(injected?.systemPrompt).toContain('Please rename the export.');

    const thirdResult = await hookHandler(hookEvent, {});
    expect(thirdResult.action).toBe('pause');
    expect(thirdResult.reason).toMatch(/review-waiting/);

    const requeued = await broker.client.getReviewStatus({ reviewId });
    expect(requeued.review.reviewId).toBe(reviewId);
    expect(requeued.review.status).toBe('pending');
  });

  it('review command reports live status once the hook has submitted a review', async () => {
    const broker = startBrokerForTest();
    const transport = createBrokerBackedTransport(broker.client);
    const register = createTandemReviewExtension({ transport, reviewWaitTimeoutMs: 0 });
    const api = createMockExtensionAPI(tmpRoot);
    await register(api);

    const handler = api.handlers.get('before_next_dispatch')!;
    await handler(
      {
        type: 'before_next_dispatch',
        unitType: 'task',
        unitId: 'M001-S01-T03',
        status: 'completed' as const,
        cwd: tmpRoot,
      },
      {},
    );

    const command = api.commands.get('review')!;
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: any[]) => logs.push(args.map(String).join(' '));
    try {
      await command.handler('status', {});
    } finally {
      console.log = origLog;
    }

    expect(logs.length).toBeGreaterThan(0);
    expect(logs[0]).toMatch(/rvw_/);
  });
});
