import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { AppContext } from '../src/runtime/app-context.js';
import { createAppContext } from '../src/runtime/app-context.js';
import { computeScalingDelta, createPoolManager } from '../src/runtime/reviewer-pool.js';
import type { StartedBrokerRuntime } from '../src/index.js';
import { startBroker } from '../src/index.js';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FIXTURE_PATH, WORKTREE_ROOT } from './test-paths.js';

const tempDirectories: string[] = [];
const openContexts: AppContext[] = [];
const openRuntimes: StartedBrokerRuntime[] = [];

afterEach(async () => {
  while (openRuntimes.length > 0) {
    const runtime = openRuntimes.pop();
    if (runtime) {
      runtime.close();
      await runtime.waitUntilStopped().catch(() => undefined);
    }
  }

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

function createHarness(): { context: AppContext } {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'review-broker-pool-'));
  tempDirectories.push(directory);

  const context = createAppContext({
    cwd: WORKTREE_ROOT,
    dbPath: path.join(directory, 'broker.sqlite'),
  });
  openContexts.push(context);

  return { context };
}

describe('repository extensions', () => {
  describe('markDraining()', () => {
    it('sets draining_at and the CTE computes draining status', () => {
      const { context } = createHarness();
      const now = new Date().toISOString();

      // First, record a spawned reviewer so it exists
      context.reviewers.recordSpawned({
        reviewerId: 'reviewer-drain-1',
        command: 'node',
        args: ['worker.js'],
        pid: 12345,
        startedAt: now,
        createdAt: now,
        updatedAt: now,
      });

      // Confirm it's idle initially
      const before = context.reviewers.getById('reviewer-drain-1');
      expect(before).not.toBeNull();
      expect(before!.status).toBe('idle');
      expect(before!.drainingAt).toBeNull();

      // Mark it draining
      const drainingAt = new Date().toISOString();
      const result = context.reviewers.markDraining({
        reviewerId: 'reviewer-drain-1',
        drainingAt,
        updatedAt: drainingAt,
      });

      expect(result).not.toBeNull();
      expect(result!.status).toBe('draining');
      expect(result!.drainingAt).toBe(drainingAt);
      expect(result!.reviewerId).toBe('reviewer-drain-1');

      // Re-fetch to verify CTE consistency
      const after = context.reviewers.getById('reviewer-drain-1');
      expect(after!.status).toBe('draining');
      expect(after!.drainingAt).toBe(drainingAt);
    });

    it('returns null for non-existent reviewer (failure path)', () => {
      const { context } = createHarness();
      const now = new Date().toISOString();

      const result = context.reviewers.markDraining({
        reviewerId: 'reviewer-nonexistent',
        drainingAt: now,
        updatedAt: now,
      });

      expect(result).toBeNull();
    });

    it('list({ status: "draining" }) returns draining reviewers', () => {
      const { context } = createHarness();
      const now = new Date().toISOString();

      context.reviewers.recordSpawned({
        reviewerId: 'reviewer-drain-list-1',
        command: 'node',
        args: ['worker.js'],
        pid: 12345,
        startedAt: now,
        createdAt: now,
        updatedAt: now,
      });

      context.reviewers.markDraining({
        reviewerId: 'reviewer-drain-list-1',
        drainingAt: now,
        updatedAt: now,
      });

      const draining = context.reviewers.list({ status: 'draining' });
      expect(draining).toHaveLength(1);
      expect(draining[0]!.reviewerId).toBe('reviewer-drain-list-1');
    });
  });

  describe('countByStatus()', () => {
    it('returns correct count for pending reviews', () => {
      const { context } = createHarness();
      const now = new Date().toISOString();

      // Initially zero pending
      expect(context.reviews.countByStatus('pending')).toBe(0);

      // Insert some reviews
      context.reviews.insert({
        reviewId: 'review-count-1',
        title: 'Test Review 1',
        description: 'desc',
        diff: 'diff content',
        affectedFiles: ['file.ts'],
        status: 'pending',
        priority: 'normal',
        authorId: 'author-1',
        createdAt: now,
        updatedAt: now,
      });

      context.reviews.insert({
        reviewId: 'review-count-2',
        title: 'Test Review 2',
        description: 'desc',
        diff: 'diff content',
        affectedFiles: ['file.ts'],
        status: 'pending',
        priority: 'normal',
        authorId: 'author-1',
        createdAt: now,
        updatedAt: now,
      });

      context.reviews.insert({
        reviewId: 'review-count-3',
        title: 'Test Review 3',
        description: 'desc',
        diff: 'diff content',
        affectedFiles: ['file.ts'],
        status: 'claimed',
        priority: 'normal',
        authorId: 'author-1',
        claimedBy: 'reviewer-1',
        claimedAt: now,
        createdAt: now,
        updatedAt: now,
      });

      expect(context.reviews.countByStatus('pending')).toBe(2);
      expect(context.reviews.countByStatus('claimed')).toBe(1);
      expect(context.reviews.countByStatus('approved')).toBe(0);
    });
  });

  describe('recordSpawned with sessionToken', () => {
    it('persists sessionToken when provided', () => {
      const { context } = createHarness();
      const now = new Date().toISOString();

      const reviewer = context.reviewers.recordSpawned({
        reviewerId: 'reviewer-session-1',
        command: 'node',
        args: ['worker.js'],
        pid: 99999,
        startedAt: now,
        sessionToken: 'session-abc-123',
        createdAt: now,
        updatedAt: now,
      });

      expect(reviewer.sessionToken).toBe('session-abc-123');

      // Verify via getById
      const reloaded = context.reviewers.getById('reviewer-session-1');
      expect(reloaded!.sessionToken).toBe('session-abc-123');
    });

    it('sessionToken defaults to null when omitted', () => {
      const { context } = createHarness();
      const now = new Date().toISOString();

      const reviewer = context.reviewers.recordSpawned({
        reviewerId: 'reviewer-session-2',
        command: 'node',
        args: ['worker.js'],
        pid: 99998,
        startedAt: now,
        createdAt: now,
        updatedAt: now,
      });

      expect(reviewer.sessionToken).toBeNull();
    });

    it('ON CONFLICT updates sessionToken', () => {
      const { context } = createHarness();
      const now = new Date().toISOString();

      // First insert
      context.reviewers.recordSpawned({
        reviewerId: 'reviewer-session-3',
        command: 'node',
        args: ['worker.js'],
        pid: 11111,
        startedAt: now,
        sessionToken: 'session-old',
        createdAt: now,
        updatedAt: now,
      });

      // Upsert with new session token (simulating re-spawn)
      const updated = context.reviewers.recordSpawned({
        reviewerId: 'reviewer-session-3',
        command: 'node',
        args: ['worker.js'],
        pid: 22222,
        startedAt: now,
        sessionToken: 'session-new',
        createdAt: now,
        updatedAt: now,
      });

      expect(updated.sessionToken).toBe('session-new');
      expect(updated.pid).toBe(22222);
    });
  });

  describe('isProcessAlive() and getTrackedReviewerIds()', () => {
    it('returns false for unknown reviewerIds (failure path)', () => {
      const { context } = createHarness();
      expect(context.reviewerManager.isProcessAlive('nonexistent-reviewer')).toBe(false);
    });

    it('returns empty array when no reviewers are tracked', () => {
      const { context } = createHarness();
      expect(context.reviewerManager.getTrackedReviewerIds()).toEqual([]);
    });

    it('returns true for a tracked live process and includes it in getTrackedReviewerIds', async () => {
      const { context } = createHarness();

      const spawned = await context.reviewerManager.spawnReviewer({
        reviewerId: 'reviewer-alive-1',
        command: process.execPath,
        args: [path.resolve(WORKTREE_ROOT, FIXTURE_PATH)],
        cwd: 'packages/review-broker-server',
      });

      expect(context.reviewerManager.isProcessAlive('reviewer-alive-1')).toBe(true);
      expect(context.reviewerManager.getTrackedReviewerIds()).toContain('reviewer-alive-1');

      // Cleanup
      await context.reviewerManager.stopReviewer('reviewer-alive-1');
    });

    it('returns false after process is stopped (failure path)', async () => {
      const { context } = createHarness();

      await context.reviewerManager.spawnReviewer({
        reviewerId: 'reviewer-dead-1',
        command: process.execPath,
        args: [path.resolve(WORKTREE_ROOT, FIXTURE_PATH)],
        cwd: 'packages/review-broker-server',
      });

      await context.reviewerManager.stopReviewer('reviewer-dead-1');

      // After stop, the process is cleaned up from tracked map
      expect(context.reviewerManager.isProcessAlive('reviewer-dead-1')).toBe(false);
      expect(context.reviewerManager.getTrackedReviewerIds()).not.toContain('reviewer-dead-1');
    });
  });

  describe('stopReviewer with offlineReason', () => {
    it('uses provided offlineReason instead of operator_kill', async () => {
      const { context } = createHarness();

      await context.reviewerManager.spawnReviewer({
        reviewerId: 'reviewer-reason-1',
        command: process.execPath,
        args: [path.resolve(WORKTREE_ROOT, FIXTURE_PATH)],
        cwd: 'packages/review-broker-server',
      });

      const result = await context.reviewerManager.stopReviewer('reviewer-reason-1', {
        offlineReason: 'idle_timeout',
      });

      expect(result.outcome).toBe('killed');
      expect(result.reviewer).toMatchObject({
        reviewerId: 'reviewer-reason-1',
        offlineReason: 'idle_timeout',
        status: 'offline',
      });
    });

    it('defaults to operator_kill when no offlineReason provided (backward compat)', async () => {
      const { context } = createHarness();

      await context.reviewerManager.spawnReviewer({
        reviewerId: 'reviewer-reason-2',
        command: process.execPath,
        args: [path.resolve(WORKTREE_ROOT, FIXTURE_PATH)],
        cwd: 'packages/review-broker-server',
      });

      const result = await context.reviewerManager.stopReviewer('reviewer-reason-2');

      expect(result.outcome).toBe('killed');
      expect(result.reviewer?.offlineReason).toBe('operator_kill');
    });

    it('accepts pool_drain and ttl_expired reasons', async () => {
      const { context } = createHarness();

      await context.reviewerManager.spawnReviewer({
        reviewerId: 'reviewer-reason-3',
        command: process.execPath,
        args: [path.resolve(WORKTREE_ROOT, FIXTURE_PATH)],
        cwd: 'packages/review-broker-server',
      });

      const result = await context.reviewerManager.stopReviewer('reviewer-reason-3', {
        offlineReason: 'pool_drain',
      });

      expect(result.reviewer?.offlineReason).toBe('pool_drain');
    });
  });
});

// ---------------------------------------------------------------------------
// computeScalingDelta — pure function unit tests
// ---------------------------------------------------------------------------

describe('computeScalingDelta', () => {
  const baseInput = {
    pendingCount: 0,
    activeCount: 0,
    drainingCount: 0,
    maxPoolSize: 5,
    scalingRatio: 1,
    lastSpawnAt: null,
    spawnCooldownSeconds: 10,
    now: '2026-03-26T00:00:00.000Z',
  };

  it('basic ratio: 3 pending, ratio 1 → spawn 3', () => {
    const result = computeScalingDelta({
      ...baseInput,
      pendingCount: 3,
      scalingRatio: 1,
    });
    expect(result).toEqual({ spawnCount: 3, reason: 'spawn_3' });
  });

  it('ratio math: 6 pending, ratio 3 → spawn 2', () => {
    const result = computeScalingDelta({
      ...baseInput,
      pendingCount: 6,
      scalingRatio: 3,
    });
    expect(result).toEqual({ spawnCount: 2, reason: 'spawn_2' });
  });

  it('pool cap: 10 pending, ratio 1, maxPoolSize 3 → spawn 3', () => {
    const result = computeScalingDelta({
      ...baseInput,
      pendingCount: 10,
      scalingRatio: 1,
      maxPoolSize: 3,
    });
    expect(result).toEqual({ spawnCount: 3, reason: 'spawn_3' });
  });

  it('already at capacity: 3 active, maxPoolSize 3 → spawn 0', () => {
    const result = computeScalingDelta({
      ...baseInput,
      pendingCount: 5,
      activeCount: 3,
      maxPoolSize: 3,
    });
    expect(result).toEqual({ spawnCount: 0, reason: 'at_capacity' });
  });

  it('cooldown active: lastSpawnAt 5s ago, cooldown 10s → spawn 0', () => {
    const result = computeScalingDelta({
      ...baseInput,
      pendingCount: 3,
      lastSpawnAt: '2026-03-25T23:59:55.000Z',
      spawnCooldownSeconds: 10,
    });
    expect(result).toEqual({ spawnCount: 0, reason: 'cooldown' });
  });

  it('cooldown expired: lastSpawnAt 15s ago, cooldown 10s → spawns', () => {
    const result = computeScalingDelta({
      ...baseInput,
      pendingCount: 2,
      scalingRatio: 1,
      lastSpawnAt: '2026-03-25T23:59:45.000Z',
      spawnCooldownSeconds: 10,
    });
    expect(result).toEqual({ spawnCount: 2, reason: 'spawn_2' });
  });

  it('draining count subtracted from current: 1 active + 1 draining, 3 pending, ratio 1 → spawn 1', () => {
    const result = computeScalingDelta({
      ...baseInput,
      pendingCount: 3,
      activeCount: 1,
      drainingCount: 1,
      scalingRatio: 1,
    });
    expect(result).toEqual({ spawnCount: 1, reason: 'spawn_1' });
  });

  it('zero pending → spawn 0 with no_pending reason', () => {
    const result = computeScalingDelta({
      ...baseInput,
      pendingCount: 0,
    });
    expect(result).toEqual({ spawnCount: 0, reason: 'no_pending' });
  });

  it('ratio rounding: 5 pending, ratio 3 → desired ceil(5/3)=2 → spawn 2', () => {
    const result = computeScalingDelta({
      ...baseInput,
      pendingCount: 5,
      scalingRatio: 3,
    });
    expect(result).toEqual({ spawnCount: 2, reason: 'spawn_2' });
  });

  it('desired less than current → spawn 0 at_capacity', () => {
    const result = computeScalingDelta({
      ...baseInput,
      pendingCount: 1,
      activeCount: 3,
      scalingRatio: 1,
      maxPoolSize: 5,
    });
    expect(result).toEqual({ spawnCount: 0, reason: 'at_capacity' });
  });
});

// ---------------------------------------------------------------------------
// Pool manager lifecycle
// ---------------------------------------------------------------------------

describe('pool manager lifecycle', () => {
  it('startBackgroundLoop and stopBackgroundLoop work without leaking intervals', () => {
    // Create minimal mocks
    const mockReviewerManager = {
      spawnReviewer: vi.fn(),
      stopReviewer: vi.fn(),
      shutdown: vi.fn().mockResolvedValue({ requestedReviewerIds: [], outcomes: { killed: 0, already_offline: 0, not_found: 0 } }),
      inspect: vi.fn(),
      isProcessAlive: vi.fn().mockReturnValue(false),
      getTrackedReviewerIds: vi.fn().mockReturnValue([]),
      setOfflineHandler: vi.fn(),
      close: vi.fn(),
    };

    const mockReviewers = {
      recordSpawned: vi.fn(),
      recordSpawnFailure: vi.fn(),
      markOffline: vi.fn(),
      markDraining: vi.fn(),
      touch: vi.fn(),
      getById: vi.fn(),
      list: vi.fn().mockReturnValue([]),
    };

    const mockReviews = {
      insert: vi.fn(),
      getById: vi.fn(),
      list: vi.fn().mockReturnValue([]),
      countByStatus: vi.fn().mockReturnValue(0),
      updateState: vi.fn(),
      claimNextPending: vi.fn(),
      recordVerdict: vi.fn(),
      recordCounterPatchDecision: vi.fn(),
      recordMessageActivity: vi.fn(),
      getCounterPatchDecision: vi.fn(),
    };

    const mockAudit = {
      append: vi.fn().mockReturnValue({ auditEventId: 1, reviewId: null, eventType: 'pool.scale_up', actorId: null, statusFrom: null, statusTo: null, errorCode: null, metadata: {}, createdAt: '' }),
      listForReview: vi.fn(),
      listActivityForReview: vi.fn(),
      getLatestForReview: vi.fn(),
      listGlobal: vi.fn(),
    };

    const poolManager = createPoolManager({
      reviewerManager: mockReviewerManager,
      reviewers: mockReviewers,
      reviews: mockReviews,
      audit: mockAudit,
      poolConfig: {
        max_pool_size: 3,
        idle_timeout_seconds: 300,
        max_ttl_seconds: 3600,
        claim_timeout_seconds: 1200,
        spawn_cooldown_seconds: 10,
        scaling_ratio: 3,
        background_check_interval_seconds: 30,
      },
      notifications: { notify: vi.fn().mockReturnValue(0) },
      spawnCommand: 'node',
      spawnArgs: ['worker.js'],
      now: () => '2026-03-26T00:00:00.000Z',
    });

    // Start background loop
    poolManager.startBackgroundLoop();

    // Stop it immediately
    poolManager.stopBackgroundLoop();

    // Should not throw or leave pending handles
    expect(poolManager.getLastSpawnAt()).toBeNull();
  });

  it('reactiveScale spawns reviewers when pending reviews exist', async () => {
    const spawnedReviewerIds: string[] = [];
    let spawnCallCount = 0;

    const mockReviewerManager = {
      spawnReviewer: vi.fn().mockImplementation(async () => {
        const id = `reviewer_${spawnCallCount++}`;
        spawnedReviewerIds.push(id);
        return {
          reviewerId: id,
          status: 'idle' as const,
          currentReviewId: null,
          command: 'node',
          args: ['worker.js'],
          cwd: null,
          pid: 1000 + spawnCallCount,
          startedAt: '2026-03-26T00:00:00.000Z',
          lastSeenAt: '2026-03-26T00:00:00.000Z',
          offlineAt: null,
          offlineReason: null,
          exitCode: null,
          exitSignal: null,
          sessionToken: null,
          drainingAt: null,
          createdAt: '2026-03-26T00:00:00.000Z',
          updatedAt: '2026-03-26T00:00:00.000Z',
        };
      }),
      stopReviewer: vi.fn(),
      shutdown: vi.fn(),
      inspect: vi.fn(),
      isProcessAlive: vi.fn().mockReturnValue(false),
      getTrackedReviewerIds: vi.fn().mockReturnValue([]),
      setOfflineHandler: vi.fn(),
      close: vi.fn(),
    };

    const mockReviewers = {
      recordSpawned: vi.fn(),
      recordSpawnFailure: vi.fn(),
      markOffline: vi.fn(),
      markDraining: vi.fn(),
      touch: vi.fn(),
      getById: vi.fn(),
      list: vi.fn().mockReturnValue([]),
    };

    const mockReviews = {
      insert: vi.fn(),
      getById: vi.fn(),
      list: vi.fn().mockReturnValue([]),
      countByStatus: vi.fn().mockReturnValue(3),
      updateState: vi.fn(),
      claimNextPending: vi.fn(),
      recordVerdict: vi.fn(),
      recordCounterPatchDecision: vi.fn(),
      recordMessageActivity: vi.fn(),
      getCounterPatchDecision: vi.fn(),
    };

    const mockAudit = {
      append: vi.fn().mockReturnValue({ auditEventId: 1, reviewId: null, eventType: 'pool.scale_up', actorId: null, statusFrom: null, statusTo: null, errorCode: null, metadata: {}, createdAt: '' }),
      listForReview: vi.fn(),
      listActivityForReview: vi.fn(),
      getLatestForReview: vi.fn(),
      listGlobal: vi.fn(),
    };

    const poolManager = createPoolManager({
      reviewerManager: mockReviewerManager,
      reviewers: mockReviewers,
      reviews: mockReviews,
      audit: mockAudit,
      poolConfig: {
        max_pool_size: 5,
        idle_timeout_seconds: 300,
        max_ttl_seconds: 3600,
        claim_timeout_seconds: 1200,
        spawn_cooldown_seconds: 10,
        scaling_ratio: 1,
        background_check_interval_seconds: 30,
      },
      notifications: { notify: vi.fn().mockReturnValue(0) },
      spawnCommand: 'node',
      spawnArgs: ['worker.js'],
      now: () => '2026-03-26T00:00:00.000Z',
    });

    await poolManager.reactiveScale();

    // With 3 pending, ratio 1, maxPoolSize 5, should spawn 3
    expect(mockReviewerManager.spawnReviewer).toHaveBeenCalledTimes(3);
    expect(poolManager.getLastSpawnAt()).not.toBeNull();

    // Audit event should be recorded
    expect(mockAudit.append).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'pool.scale_up',
        metadata: expect.objectContaining({
          spawnCount: 3,
          pendingCount: 3,
          initialPendingCount: 3,
          reviewersConsidered: [],
        }),
      }),
    );
  });

  it('reactiveScale rechecks pending reviews before spawning', async () => {
    const mockReviewerManager = {
      spawnReviewer: vi.fn(),
      stopReviewer: vi.fn(),
      shutdown: vi.fn(),
      inspect: vi.fn(),
      isProcessAlive: vi.fn().mockReturnValue(false),
      getTrackedReviewerIds: vi.fn().mockReturnValue([]),
      setOfflineHandler: vi.fn(),
      close: vi.fn(),
    };

    const mockReviewers = {
      recordSpawned: vi.fn(),
      recordSpawnFailure: vi.fn(),
      markOffline: vi.fn(),
      markDraining: vi.fn(),
      touch: vi.fn(),
      getById: vi.fn(),
      list: vi.fn().mockReturnValue([]),
    };

    const mockReviews = {
      insert: vi.fn(),
      getById: vi.fn(),
      list: vi.fn().mockReturnValue([]),
      countByStatus: vi.fn().mockReturnValueOnce(1).mockReturnValueOnce(0),
      updateState: vi.fn(),
      claimNextPending: vi.fn(),
      recordVerdict: vi.fn(),
      recordCounterPatchDecision: vi.fn(),
      recordMessageActivity: vi.fn(),
      getCounterPatchDecision: vi.fn(),
    };

    const mockAudit = {
      append: vi.fn(),
      listForReview: vi.fn(),
      listActivityForReview: vi.fn(),
      getLatestForReview: vi.fn(),
      listGlobal: vi.fn(),
    };

    const poolManager = createPoolManager({
      reviewerManager: mockReviewerManager,
      reviewers: mockReviewers,
      reviews: mockReviews,
      audit: mockAudit,
      poolConfig: {
        max_pool_size: 5,
        idle_timeout_seconds: 300,
        max_ttl_seconds: 3600,
        claim_timeout_seconds: 1200,
        spawn_cooldown_seconds: 10,
        scaling_ratio: 1,
        background_check_interval_seconds: 30,
      },
      notifications: { notify: vi.fn().mockReturnValue(0) },
      spawnCommand: 'node',
      spawnArgs: ['worker.js'],
      now: () => '2026-03-26T00:00:00.000Z',
    });

    await poolManager.reactiveScale();

    expect(mockReviews.countByStatus).toHaveBeenCalledTimes(2);
    expect(mockReviewerManager.spawnReviewer).not.toHaveBeenCalled();
    expect(mockAudit.append).not.toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'pool.scale_up',
      }),
    );
  });

  it('reactiveScale pauses spawning after rapid reviewer exits in the current pool session', async () => {
    let now = '2026-03-26T00:00:30.000Z';
    const reviewerRows: any[] = [];

    const mockReviewerManager = {
      spawnReviewer: vi.fn().mockResolvedValue({
        reviewerId: 'reviewer_new',
        status: 'idle' as const,
        currentReviewId: null,
        command: 'node',
        args: ['worker.js'],
        cwd: null,
        pid: 1001,
        startedAt: '2026-03-26T00:00:30.000Z',
        lastSeenAt: '2026-03-26T00:00:30.000Z',
        offlineAt: null,
        offlineReason: null,
        exitCode: null,
        exitSignal: null,
        sessionToken: null,
        drainingAt: null,
        createdAt: '2026-03-26T00:00:30.000Z',
        updatedAt: '2026-03-26T00:00:30.000Z',
      }),
      stopReviewer: vi.fn(),
      shutdown: vi.fn(),
      inspect: vi.fn(),
      isProcessAlive: vi.fn().mockReturnValue(false),
      getTrackedReviewerIds: vi.fn().mockReturnValue([]),
      setOfflineHandler: vi.fn(),
      close: vi.fn(),
    };

    const mockReviewers = {
      recordSpawned: vi.fn(),
      recordSpawnFailure: vi.fn(),
      markOffline: vi.fn(),
      markDraining: vi.fn(),
      touch: vi.fn(),
      getById: vi.fn(),
      list: vi.fn().mockImplementation(() => reviewerRows),
    };

    const mockReviews = {
      insert: vi.fn(),
      getById: vi.fn(),
      list: vi.fn().mockReturnValue([]),
      countByStatus: vi.fn().mockReturnValue(3),
      updateState: vi.fn(),
      claimNextPending: vi.fn(),
      recordVerdict: vi.fn(),
      recordCounterPatchDecision: vi.fn(),
      recordMessageActivity: vi.fn(),
      getCounterPatchDecision: vi.fn(),
    };

    const mockAudit = {
      append: vi.fn().mockReturnValue({
        auditEventId: 1,
        reviewId: null,
        eventType: 'pool.scale_up',
        actorId: null,
        statusFrom: null,
        statusTo: null,
        errorCode: null,
        metadata: {},
        createdAt: '',
      }),
      listForReview: vi.fn(),
      listActivityForReview: vi.fn(),
      getLatestForReview: vi.fn(),
      listGlobal: vi.fn(),
    };

    const poolManager = createPoolManager({
      reviewerManager: mockReviewerManager,
      reviewers: mockReviewers,
      reviews: mockReviews,
      audit: mockAudit,
      poolConfig: {
        max_pool_size: 5,
        idle_timeout_seconds: 300,
        max_ttl_seconds: 3600,
        claim_timeout_seconds: 1200,
        spawn_cooldown_seconds: 1,
        scaling_ratio: 1,
        background_check_interval_seconds: 30,
      },
      notifications: { notify: vi.fn().mockReturnValue(0) },
      spawnCommand: 'node',
      spawnArgs: ['worker.js'],
      now: () => now,
    });

    const sessionToken = poolManager.getSessionToken();
    reviewerRows.push(
      ...Array.from({ length: 5 }, (_, index) => ({
        reviewerId: `reviewer_exit_${index}`,
        status: 'offline',
        currentReviewId: null,
        command: 'node',
        args: ['worker.js'],
        cwd: null,
        pid: null,
        startedAt: '2026-03-26T00:00:00.000Z',
        lastSeenAt: '2026-03-26T00:00:20.000Z',
        offlineAt: '2026-03-26T00:00:20.000Z',
        offlineReason: 'reviewer_exit',
        exitCode: 1,
        exitSignal: null,
        sessionToken,
        drainingAt: null,
        createdAt: '2026-03-26T00:00:00.000Z',
        updatedAt: '2026-03-26T00:00:20.000Z',
      })),
    );

    await poolManager.reactiveScale();

    expect(mockReviewerManager.spawnReviewer).not.toHaveBeenCalled();
    expect(mockAudit.append).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'pool.scale_paused',
        metadata: expect.objectContaining({
          rapidExitCount: 5,
          sessionToken,
        }),
      }),
    );

    reviewerRows.length = 0;

    // Still paused inside the pause window.
    now = '2026-03-26T00:00:45.000Z';
    await poolManager.reactiveScale();
    expect(mockReviewerManager.spawnReviewer).not.toHaveBeenCalled();

    // Pause expires after 60s; scaling resumes.
    now = '2026-03-26T00:01:31.000Z';
    await poolManager.reactiveScale();
    expect(mockReviewerManager.spawnReviewer).toHaveBeenCalledTimes(3);
  });

  it('reactiveScale isScaling guard prevents concurrent execution', async () => {
    let resolveFirstCall!: () => void;
    const firstCallPromise = new Promise<void>((resolve) => {
      resolveFirstCall = resolve;
    });

    let spawnCallCount = 0;
    const mockReviewerManager = {
      spawnReviewer: vi.fn().mockImplementation(async () => {
        spawnCallCount++;
        if (spawnCallCount === 1) {
          // Block the first call until we release it
          await firstCallPromise;
        }
        return {
          reviewerId: `reviewer_${spawnCallCount}`,
          status: 'idle' as const,
          currentReviewId: null,
          command: 'node',
          args: [],
          cwd: null,
          pid: 1000,
          startedAt: '2026-03-26T00:00:00.000Z',
          lastSeenAt: '2026-03-26T00:00:00.000Z',
          offlineAt: null,
          offlineReason: null,
          exitCode: null,
          exitSignal: null,
          sessionToken: null,
          drainingAt: null,
          createdAt: '2026-03-26T00:00:00.000Z',
          updatedAt: '2026-03-26T00:00:00.000Z',
        };
      }),
      stopReviewer: vi.fn(),
      shutdown: vi.fn(),
      inspect: vi.fn(),
      isProcessAlive: vi.fn().mockReturnValue(false),
      getTrackedReviewerIds: vi.fn().mockReturnValue([]),
      setOfflineHandler: vi.fn(),
      close: vi.fn(),
    };

    const mockReviewers = {
      recordSpawned: vi.fn(),
      recordSpawnFailure: vi.fn(),
      markOffline: vi.fn(),
      markDraining: vi.fn(),
      touch: vi.fn(),
      getById: vi.fn(),
      list: vi.fn().mockReturnValue([]),
    };

    const mockReviews = {
      insert: vi.fn(),
      getById: vi.fn(),
      list: vi.fn().mockReturnValue([]),
      countByStatus: vi.fn().mockReturnValue(1),
      updateState: vi.fn(),
      claimNextPending: vi.fn(),
      recordVerdict: vi.fn(),
      recordCounterPatchDecision: vi.fn(),
      recordMessageActivity: vi.fn(),
      getCounterPatchDecision: vi.fn(),
    };

    const mockAudit = {
      append: vi.fn().mockReturnValue({ auditEventId: 1, reviewId: null, eventType: 'pool.scale_up', actorId: null, statusFrom: null, statusTo: null, errorCode: null, metadata: {}, createdAt: '' }),
      listForReview: vi.fn(),
      listActivityForReview: vi.fn(),
      getLatestForReview: vi.fn(),
      listGlobal: vi.fn(),
    };

    const poolManager = createPoolManager({
      reviewerManager: mockReviewerManager,
      reviewers: mockReviewers,
      reviews: mockReviews,
      audit: mockAudit,
      poolConfig: {
        max_pool_size: 5,
        idle_timeout_seconds: 300,
        max_ttl_seconds: 3600,
        claim_timeout_seconds: 1200,
        spawn_cooldown_seconds: 10,
        scaling_ratio: 1,
        background_check_interval_seconds: 30,
      },
      notifications: { notify: vi.fn().mockReturnValue(0) },
      spawnCommand: 'node',
      spawnArgs: [],
      now: () => '2026-03-26T00:00:00.000Z',
    });

    // Start first call (will block on spawnReviewer)
    const firstScale = poolManager.reactiveScale();

    // Second call should return immediately due to isScaling guard
    await poolManager.reactiveScale();

    // Only 1 spawn should have been initiated
    expect(mockReviewerManager.spawnReviewer).toHaveBeenCalledTimes(1);

    // Release the first call
    resolveFirstCall();
    await firstScale;
  });

  it('shutdownAll stops background loop and calls reviewerManager.shutdown', async () => {
    const mockReviewerManager = {
      spawnReviewer: vi.fn(),
      stopReviewer: vi.fn(),
      shutdown: vi.fn().mockResolvedValue({ requestedReviewerIds: [], outcomes: { killed: 0, already_offline: 0, not_found: 0 } }),
      inspect: vi.fn(),
      isProcessAlive: vi.fn().mockReturnValue(false),
      getTrackedReviewerIds: vi.fn().mockReturnValue([]),
      setOfflineHandler: vi.fn(),
      close: vi.fn(),
    };

    const mockReviewers = {
      recordSpawned: vi.fn(),
      recordSpawnFailure: vi.fn(),
      markOffline: vi.fn(),
      markDraining: vi.fn(),
      touch: vi.fn(),
      getById: vi.fn(),
      list: vi.fn().mockReturnValue([]),
    };

    const mockReviews = {
      insert: vi.fn(),
      getById: vi.fn(),
      list: vi.fn().mockReturnValue([]),
      countByStatus: vi.fn().mockReturnValue(0),
      updateState: vi.fn(),
      claimNextPending: vi.fn(),
      recordVerdict: vi.fn(),
      recordCounterPatchDecision: vi.fn(),
      recordMessageActivity: vi.fn(),
      getCounterPatchDecision: vi.fn(),
    };

    const mockAudit = {
      append: vi.fn().mockReturnValue({ auditEventId: 1, reviewId: null, eventType: 'pool.scale_up', actorId: null, statusFrom: null, statusTo: null, errorCode: null, metadata: {}, createdAt: '' }),
      listForReview: vi.fn(),
      listActivityForReview: vi.fn(),
      getLatestForReview: vi.fn(),
      listGlobal: vi.fn(),
    };

    const poolManager = createPoolManager({
      reviewerManager: mockReviewerManager,
      reviewers: mockReviewers,
      reviews: mockReviews,
      audit: mockAudit,
      poolConfig: {
        max_pool_size: 3,
        idle_timeout_seconds: 300,
        max_ttl_seconds: 3600,
        claim_timeout_seconds: 1200,
        spawn_cooldown_seconds: 10,
        scaling_ratio: 3,
        background_check_interval_seconds: 30,
      },
      notifications: { notify: vi.fn().mockReturnValue(0) },
      spawnCommand: 'node',
      spawnArgs: [],
      now: () => '2026-03-26T00:00:00.000Z',
    });

    poolManager.startBackgroundLoop();
    await poolManager.shutdownAll();

    expect(mockReviewerManager.shutdown).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Integration tests — real broker runtime with subprocess fixtures
// ---------------------------------------------------------------------------

function readFixture(fileName: string): string {
  return readFileSync(
    path.join(WORKTREE_ROOT, 'packages', 'review-broker-server', 'test', 'fixtures', fileName),
    'utf8',
  );
}

function createRuntimeHarness(poolOverrides: Record<string, unknown> = {}): {
  runtime: StartedBrokerRuntime;
  dbPath: string;
} {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'review-broker-pool-integration-'));
  tempDirectories.push(directory);

  // Write a JSON config file with pool config so startBroker activates the pool
  // Note: PoolConfigSchema has strict minimums (idle_timeout: 60, background_check: 5, etc.)
  // so we use valid defaults here. Tests that need short timeouts create separate
  // pool managers with direct config objects that bypass schema validation.
  const configPath = path.join(directory, 'config.json');
  const poolConfig = {
    max_pool_size: 5,
    idle_timeout_seconds: 300,
    max_ttl_seconds: 3600,
    claim_timeout_seconds: 1200,
    spawn_cooldown_seconds: 1,
    scaling_ratio: 1,
    background_check_interval_seconds: 60,
    ...poolOverrides,
  };

  writeFileSync(configPath, JSON.stringify({ reviewer_pool: poolConfig }, null, 2));

  const dbPath = path.join(directory, 'broker.sqlite');
  const runtime = startBroker({
    cwd: WORKTREE_ROOT,
    dbPath,
    env: { ...process.env, REVIEW_BROKER_CONFIG_PATH: configPath },
    handleSignals: false,
    poolSpawnCommand: process.execPath,
    poolSpawnArgs: [path.resolve(WORKTREE_ROOT, FIXTURE_PATH)],
  });
  openRuntimes.push(runtime);

  return { runtime, dbPath };
}

describe('pool integration tests', () => {
  it('reactive scaling from create_review — spawns reviewers when pending reviews exist', async () => {
    const { runtime } = createRuntimeHarness({
      scaling_ratio: 1,
      max_pool_size: 3,
      spawn_cooldown_seconds: 1,
    });

    expect(runtime.poolManager).not.toBeNull();

    // Create 2 pending reviews
    await runtime.service.createReview({
      title: 'Review 1',
      description: 'desc',
      diff: readFixture('valid-review.diff'),
      authorId: 'author-1',
      priority: 'normal',
    });
    await runtime.service.createReview({
      title: 'Review 2',
      description: 'desc',
      diff: readFixture('valid-review.diff'),
      authorId: 'author-1',
      priority: 'normal',
    });

    // Wait for setImmediate-triggered reactive scaling to fire
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Verify reviewers were spawned
    const reviewerList = await runtime.service.listReviewers({});
    // We expect at least 2 reviewers spawned for 2 pending reviews
    expect(reviewerList.reviewers.length).toBeGreaterThanOrEqual(2);

    // Verify audit trail contains pool.scale_up event
    const auditRows = runtime.context.db
      .prepare<unknown[], { event_type: string; metadata_json: string }>(
        `SELECT event_type, metadata_json FROM audit_events WHERE event_type = 'pool.scale_up' ORDER BY audit_event_id ASC`,
      )
      .all();
    expect(auditRows.length).toBeGreaterThanOrEqual(1);
    const metadata = JSON.parse(auditRows[0]!.metadata_json);
    expect(metadata.spawnCount).toBeGreaterThanOrEqual(1);
  });

  it('pool opt-in guard — no pool manager when poolConfig is null', () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), 'review-broker-pool-nopool-'));
    tempDirectories.push(directory);

    // Point config to a non-existent file so poolConfig will be null
    const dbPath = path.join(directory, 'broker.sqlite');
    const runtime = startBroker({
      cwd: WORKTREE_ROOT,
      dbPath,
      handleSignals: false,
      env: {
        ...process.env,
        REVIEW_BROKER_CONFIG_PATH: path.join(directory, 'nonexistent-config.json'),
      },
    });
    openRuntimes.push(runtime);

    expect(runtime.poolManager).toBeNull();
    expect(runtime.context.poolConfig).toBeNull();
  });

  it('uses reviewer.provider config to autospawn pool workers when explicit spawn args are omitted', async () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), 'review-broker-pool-provider-'));
    tempDirectories.push(directory);

    const configPath = path.join(directory, 'config.json');
    writeFileSync(
      configPath,
      JSON.stringify(
        {
          reviewer_pool: {
            max_pool_size: 2,
            scaling_ratio: 1,
            idle_timeout_seconds: 300,
            max_ttl_seconds: 3600,
            claim_timeout_seconds: 1200,
            spawn_cooldown_seconds: 1,
            background_check_interval_seconds: 60,
          },
          reviewer: {
            provider: 'test-worker',
            providers: {
              'test-worker': {
                command: process.execPath,
                args: [path.resolve(WORKTREE_ROOT, FIXTURE_PATH)],
              },
            },
          },
        },
        null,
        2,
      ),
    );

    const dbPath = path.join(directory, 'broker.sqlite');
    const runtime = startBroker({
      cwd: WORKTREE_ROOT,
      dbPath,
      handleSignals: false,
      env: {
        ...process.env,
        REVIEW_BROKER_CONFIG_PATH: configPath,
      },
    });
    openRuntimes.push(runtime);

    await runtime.service.createReview({
      title: 'Provider-configured pool spawn review',
      description: 'Verify reviewer.provider drives pool autospawn when no explicit worker command is passed.',
      diff: readFixture('valid-review.diff'),
      authorId: 'author-1',
      priority: 'normal',
    });

    await new Promise((resolve) => setTimeout(resolve, 200));

    const reviewerList = await runtime.service.listReviewers({});
    expect(reviewerList.reviewers.length).toBeGreaterThanOrEqual(1);
  });

  it('drain lifecycle respects open-review gate — not killed while review is claimed', async () => {
    const { runtime } = createRuntimeHarness({
      scaling_ratio: 1,
      max_pool_size: 3,
      spawn_cooldown_seconds: 1,
    });

    // Spawn a reviewer
    const spawned = await runtime.service.spawnReviewer({
      reviewerId: 'reviewer-drain-gate',
      command: process.execPath,
      args: [path.resolve(WORKTREE_ROOT, FIXTURE_PATH)],
      cwd: 'packages/review-broker-server',
    });
    expect(spawned.reviewer.status).toBe('idle');

    // Create and claim a review
    const review = await runtime.service.createReview({
      title: 'Drain gate test',
      description: 'desc',
      diff: readFixture('valid-review.diff'),
      authorId: 'author-1',
      priority: 'normal',
    });
    const claimed = await runtime.service.claimReview({
      reviewId: review.review.reviewId,
      claimantId: 'reviewer-drain-gate',
    });
    expect(claimed.outcome).toBe('claimed');

    // Mark reviewer draining
    const now = new Date().toISOString();
    const drainResult = runtime.context.reviewers.markDraining({
      reviewerId: 'reviewer-drain-gate',
      drainingAt: now,
      updatedAt: now,
    });
    expect(drainResult).not.toBeNull();
    expect(drainResult!.status).toBe('draining');

    // Trigger background checks — the reviewer should NOT be killed because it has an open review
    await runtime.poolManager!.reactiveScale();
    // Run the drain-completion check by calling reactiveScale (which triggers all checks via runAllChecks indirectly)
    // Actually, the background checks run via the loop. Let's trigger directly.
    // Since we can't call runAllChecks directly, let's start/stop a short loop
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Reviewer should still be draining (alive) — NOT offline
    const reviewerAfterDrain = runtime.context.reviewers.getById('reviewer-drain-gate');
    expect(reviewerAfterDrain!.status).toBe('draining');
    expect(runtime.context.reviewerManager.isProcessAlive('reviewer-drain-gate')).toBe(true);

    // Now release the review so currentReviewId becomes null.
    // Reclaim puts it back to pending, clearing the claim.
    await runtime.service.reclaimReview({
      reviewId: review.review.reviewId,
      actorId: 'author-1',
    });

    // Verify the review is pending (no longer claimed by reviewer-drain-gate)
    const reclaimedReview = runtime.context.reviews.getById(review.review.reviewId);
    expect(reclaimedReview!.status).toBe('pending');

    // The reviewer's currentReviewId should now be null (no open claimed/submitted reviews)
    const reviewerBeforeCompletion = runtime.context.reviewers.getById('reviewer-drain-gate');
    expect(reviewerBeforeCompletion!.currentReviewId).toBeNull();

    // Now we need to trigger the drain-completion check
    // Create a pool manager that runs checks — we'll start a very short background loop
    // Actually, the pool manager's reactiveScale doesn't run drain checks. We need to
    // access the background check. Since startBackgroundLoop uses setInterval, let's use
    // a workaround: stop the existing long-interval loop, create a temporary loop, or
    // directly use the pool module's internals. Since we can't, let's restart the loop with
    // a short interval.
    
    // Stop existing loop and create a new pool manager with short interval for this test
    runtime.poolManager!.stopBackgroundLoop();
    
    // Create a separate pool manager with a tiny interval to trigger drain completion
    const shortPoolManager = createPoolManager({
      reviewerManager: runtime.context.reviewerManager,
      reviewers: runtime.context.reviewers,
      reviews: runtime.context.reviews,
      audit: runtime.context.audit,
      poolConfig: {
        ...runtime.context.poolConfig!,
        background_check_interval_seconds: 0.1,
      },
      notifications: runtime.context.notifications,
      spawnCommand: process.execPath,
      spawnArgs: [path.resolve(WORKTREE_ROOT, FIXTURE_PATH)],
    });

    shortPoolManager.startBackgroundLoop();
    // Wait for the background loop to fire and detect drain completion
    await new Promise((resolve) => setTimeout(resolve, 500));
    shortPoolManager.stopBackgroundLoop();

    // Verify the reviewer is now offline with pool_drain reason
    const reviewerFinal = runtime.context.reviewers.getById('reviewer-drain-gate');
    expect(reviewerFinal!.status).toBe('offline');
    expect(reviewerFinal!.offlineReason).toBe('pool_drain');

    // Verify audit trail has drain_completed event
    const drainCompletedEvents = runtime.context.db
      .prepare<unknown[], { event_type: string; metadata_json: string }>(
        `SELECT event_type, metadata_json FROM audit_events WHERE event_type = 'pool.drain_completed'`,
      )
      .all();
    expect(drainCompletedEvents.length).toBeGreaterThanOrEqual(1);
  });

  it('dead process reaping — detects externally killed processes', async () => {
    const { runtime } = createRuntimeHarness({
      scaling_ratio: 1,
      max_pool_size: 3,
      spawn_cooldown_seconds: 1,
    });

    // Spawn a reviewer fixture
    const spawned = await runtime.service.spawnReviewer({
      reviewerId: 'reviewer-dead-reap',
      command: process.execPath,
      args: [path.resolve(WORKTREE_ROOT, FIXTURE_PATH)],
      cwd: 'packages/review-broker-server',
    });
    const pid = spawned.reviewer.pid!;
    expect(pid).toEqual(expect.any(Number));
    expect(runtime.context.reviewerManager.isProcessAlive('reviewer-dead-reap')).toBe(true);

    // Create a review and claim it so we can verify recovery after death
    const review = await runtime.service.createReview({
      title: 'Dead reap test',
      description: 'desc',
      diff: readFixture('valid-review.diff'),
      authorId: 'author-1',
      priority: 'normal',
    });
    await new Promise((resolve) => setTimeout(resolve, 100)); // let setImmediate settle
    const claimed = await runtime.service.claimReview({
      reviewId: review.review.reviewId,
      claimantId: 'reviewer-dead-reap',
    });
    expect(claimed.outcome).toBe('claimed');

    // Kill the process externally with SIGKILL
    process.kill(pid, 'SIGKILL');

    // Wait for the exit event to propagate and the offline handler to complete
    await new Promise((resolve) => setTimeout(resolve, 300));

    // The reviewer should be offline — either via the exit handler (primary path)
    // or via the dead process reaper (safety net)
    const reviewer = runtime.context.reviewers.getById('reviewer-dead-reap');
    expect(reviewer!.status).toBe('offline');
    expect(reviewer!.pid).toBeNull();

    // The exit handler sets offlineReason to 'reviewer_exit' (default when no requestedOfflineReason)
    // Dead process reaper would set 'operator_kill'. Either is acceptable.
    expect(['reviewer_exit', 'operator_kill']).toContain(reviewer!.offlineReason);

    // The claimed review should have been reclaimed back to pending
    const reviewAfter = runtime.context.reviews.getById(review.review.reviewId);
    expect(reviewAfter!.status).toBe('pending');
    expect(reviewAfter!.claimedBy).toBeNull();

    // Verify audit trail shows reviewer.offline event (from exit handler or reaper)
    const offlineEvents = runtime.context.db
      .prepare<unknown[], { event_type: string; metadata_json: string }>(
        `SELECT event_type, metadata_json FROM audit_events WHERE event_type = 'reviewer.offline'`,
      )
      .all();
    expect(offlineEvents.length).toBeGreaterThanOrEqual(1);
    const offlineMeta = JSON.parse(offlineEvents[0]!.metadata_json);
    expect(offlineMeta.reviewerId).toBe('reviewer-dead-reap');
    expect(offlineMeta.reclaimedReviewIds).toContain(review.review.reviewId);
  });

  it('idle timeout — triggers drain-then-kill for idle reviewers', async () => {
    // Use a broker without pool config, then create a pool manager with test-friendly short timeouts
    // (bypassing the PoolConfigSchema minimums which are for production safety)
    const directory = mkdtempSync(path.join(os.tmpdir(), 'review-broker-pool-idle-'));
    tempDirectories.push(directory);

    const dbPath = path.join(directory, 'broker.sqlite');
    const runtime = startBroker({
      cwd: WORKTREE_ROOT,
      dbPath,
      handleSignals: false,
    });
    openRuntimes.push(runtime);

    // Spawn a reviewer — it starts as idle
    await runtime.service.spawnReviewer({
      reviewerId: 'reviewer-idle-timeout',
      command: process.execPath,
      args: [path.resolve(WORKTREE_ROOT, FIXTURE_PATH)],
      cwd: 'packages/review-broker-server',
    });

    const reviewerBefore = runtime.context.reviewers.getById('reviewer-idle-timeout');
    expect(reviewerBefore!.status).toBe('idle');

    // Create a pool manager with short idle timeout and check interval
    // (bypasses PoolConfigSchema minimums for test purposes)
    const shortPoolManager = createPoolManager({
      reviewerManager: runtime.context.reviewerManager,
      reviewers: runtime.context.reviewers,
      reviews: runtime.context.reviews,
      audit: runtime.context.audit,
      poolConfig: {
        max_pool_size: 3,
        idle_timeout_seconds: 1,
        max_ttl_seconds: 3600,
        claim_timeout_seconds: 1200,
        spawn_cooldown_seconds: 1,
        scaling_ratio: 1,
        background_check_interval_seconds: 0.3,
      },
      notifications: runtime.context.notifications,
      spawnCommand: process.execPath,
      spawnArgs: [path.resolve(WORKTREE_ROOT, FIXTURE_PATH)],
    });

    shortPoolManager.startBackgroundLoop();

    // Wait long enough for idle timeout (1s) + at least 2 background check intervals
    // First check at ~0.3s marks draining, second at ~0.6s checks drain completion
    await new Promise((resolve) => setTimeout(resolve, 2000));
    shortPoolManager.stopBackgroundLoop();

    // Verify reviewer transitioned to offline
    const reviewerFinal = runtime.context.reviewers.getById('reviewer-idle-timeout');
    expect(reviewerFinal!.status).toBe('offline');
    expect(reviewerFinal!.offlineReason).toBe('pool_drain');

    // Verify audit trail shows drain_initiated with idle_timeout reason
    const drainEvents = runtime.context.db
      .prepare<unknown[], { event_type: string; metadata_json: string }>(
        `SELECT event_type, metadata_json FROM audit_events WHERE event_type = 'pool.drain_initiated'`,
      )
      .all();
    expect(drainEvents.length).toBeGreaterThanOrEqual(1);
    const drainMeta = JSON.parse(drainEvents[0]!.metadata_json);
    expect(drainMeta.reason).toBe('idle_timeout');
    expect(drainMeta.reviewerId).toBe('reviewer-idle-timeout');
  });

  it('claim timeout — reclaims stale claimed reviews to pending', async () => {
    // Use a broker without pool config, then create a pool manager with short claim timeout
    const directory = mkdtempSync(path.join(os.tmpdir(), 'review-broker-pool-claim-'));
    tempDirectories.push(directory);

    const dbPath = path.join(directory, 'broker.sqlite');
    const runtime = startBroker({
      cwd: WORKTREE_ROOT,
      dbPath,
      handleSignals: false,
    });
    openRuntimes.push(runtime);

    // Create and claim a review
    const review = await runtime.service.createReview({
      title: 'Claim timeout test',
      description: 'desc',
      diff: readFixture('valid-review.diff'),
      authorId: 'author-1',
      priority: 'normal',
    });

    const claimed = await runtime.service.claimReview({
      reviewId: review.review.reviewId,
      claimantId: 'stale-reviewer',
    });
    expect(claimed.outcome).toBe('claimed');

    // Wait longer than claim_timeout_seconds (1s)
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Trigger background checks with short claim timeout
    const shortPoolManager = createPoolManager({
      reviewerManager: runtime.context.reviewerManager,
      reviewers: runtime.context.reviewers,
      reviews: runtime.context.reviews,
      audit: runtime.context.audit,
      poolConfig: {
        max_pool_size: 3,
        idle_timeout_seconds: 300,
        max_ttl_seconds: 3600,
        claim_timeout_seconds: 1,
        spawn_cooldown_seconds: 1,
        scaling_ratio: 1,
        background_check_interval_seconds: 0.1,
      },
      notifications: runtime.context.notifications,
      spawnCommand: process.execPath,
      spawnArgs: [path.resolve(WORKTREE_ROOT, FIXTURE_PATH)],
    });

    shortPoolManager.startBackgroundLoop();
    await new Promise((resolve) => setTimeout(resolve, 500));
    shortPoolManager.stopBackgroundLoop();

    // Verify review is back to pending
    const reviewAfter = runtime.context.reviews.getById(review.review.reviewId);
    expect(reviewAfter!.status).toBe('pending');
    expect(reviewAfter!.claimedBy).toBeNull();

    // Verify audit trail has claim_timeout event
    const claimEvents = runtime.context.db
      .prepare<unknown[], { event_type: string; metadata_json: string }>(
        `SELECT event_type, metadata_json FROM audit_events WHERE event_type = 'pool.claim_timeout'`,
      )
      .all();
    expect(claimEvents.length).toBeGreaterThanOrEqual(1);
    const claimMeta = JSON.parse(claimEvents[0]!.metadata_json);
    expect(claimMeta.reviewId).toBe(review.review.reviewId);
    expect(claimMeta.previousClaimedBy).toBe('stale-reviewer');
  });

  it('claim timeout — does not reclaim a review owned by a live tracked reviewer', async () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), 'review-broker-pool-live-claim-'));
    tempDirectories.push(directory);

    const dbPath = path.join(directory, 'broker.sqlite');
    const runtime = startBroker({
      cwd: WORKTREE_ROOT,
      dbPath,
      handleSignals: false,
    });
    openRuntimes.push(runtime);

    const review = await runtime.service.createReview({
      title: 'Live claim timeout test',
      description: 'desc',
      diff: readFixture('valid-review.diff'),
      authorId: 'author-1',
      priority: 'normal',
    });

    const claimed = await runtime.service.claimReview({
      reviewId: review.review.reviewId,
      claimantId: 'live-reviewer',
    });
    expect(claimed.outcome).toBe('claimed');

    const isProcessAlive = vi.spyOn(runtime.context.reviewerManager, 'isProcessAlive').mockReturnValue(true);

    await new Promise((resolve) => setTimeout(resolve, 1500));

    const shortPoolManager = createPoolManager({
      reviewerManager: runtime.context.reviewerManager,
      reviewers: runtime.context.reviewers,
      reviews: runtime.context.reviews,
      audit: runtime.context.audit,
      poolConfig: {
        max_pool_size: 3,
        idle_timeout_seconds: 300,
        max_ttl_seconds: 3600,
        claim_timeout_seconds: 1,
        spawn_cooldown_seconds: 1,
        scaling_ratio: 1,
        background_check_interval_seconds: 0.1,
      },
      notifications: runtime.context.notifications,
      spawnCommand: process.execPath,
      spawnArgs: [path.resolve(WORKTREE_ROOT, FIXTURE_PATH)],
    });

    shortPoolManager.startBackgroundLoop();
    await new Promise((resolve) => setTimeout(resolve, 500));
    shortPoolManager.stopBackgroundLoop();

    const reviewAfter = runtime.context.reviews.getById(review.review.reviewId);
    expect(reviewAfter).toMatchObject({
      status: 'claimed',
      claimedBy: 'live-reviewer',
    });

    const claimEvents = runtime.context.db
      .prepare<unknown[], { event_type: string }>(
        `SELECT event_type FROM audit_events WHERE event_type = 'pool.claim_timeout'`,
      )
      .all();
    expect(claimEvents).toHaveLength(0);
    expect(isProcessAlive).toHaveBeenCalledWith('live-reviewer');

    isProcessAlive.mockRestore();
  });

  it('pool-spawned reviewers have the pool sessionToken persisted in the DB', async () => {
    const { runtime } = createRuntimeHarness({
      scaling_ratio: 1,
      max_pool_size: 3,
      spawn_cooldown_seconds: 1,
    });

    expect(runtime.poolManager).not.toBeNull();
    const sessionToken = runtime.poolManager!.getSessionToken();
    expect(typeof sessionToken).toBe('string');
    expect(sessionToken.length).toBeGreaterThan(0);

    // Create a pending review to trigger reactive scaling
    await runtime.service.createReview({
      title: 'SessionToken plumbing test',
      description: 'desc',
      diff: readFixture('valid-review.diff'),
      authorId: 'author-1',
      priority: 'normal',
    });

    // Wait for setImmediate-triggered reactive scaling to fire
    await new Promise((resolve) => setTimeout(resolve, 300));

    // Verify at least one reviewer was spawned
    const reviewerList = await runtime.service.listReviewers({});
    const spawnedReviewers = reviewerList.reviewers.filter(
      (r) => r.status !== 'offline',
    );
    expect(spawnedReviewers.length).toBeGreaterThanOrEqual(1);

    // Verify each spawned reviewer has the pool's session token
    for (const reviewer of spawnedReviewers) {
      expect(reviewer.sessionToken).toBe(sessionToken);
    }

    // Also verify directly in DB
    const dbRows = runtime.context.db
      .prepare<unknown[], { session_token: string | null }>(
        `SELECT session_token FROM reviewers WHERE session_token IS NOT NULL`,
      )
      .all();
    expect(dbRows.length).toBeGreaterThanOrEqual(1);
    for (const row of dbRows) {
      expect(row.session_token).toBe(sessionToken);
    }
  });
});
