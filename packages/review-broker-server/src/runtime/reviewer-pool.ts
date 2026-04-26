/**
 * Pool management module for automated reviewer scaling.
 *
 * Exports:
 *   - `computeScalingDelta()` — pure function for scaling math
 *   - `createPoolManager()` — factory returning pool lifecycle controls
 *
 * The pool manager owns reactive scaling, a background periodic check loop
 * (5 checks on setInterval), and the two-phase drain lifecycle.
 */

import { randomUUID } from 'node:crypto';

import type { ReviewerRecord } from 'review-broker-core';

import type { AuditRepository } from '../db/audit-repository.js';
import type { ReviewersRepository } from '../db/reviewers-repository.js';
import type { ReviewsRepository } from '../db/reviews-repository.js';
import type { ReviewerManager } from './reviewer-manager.js';
import type { PoolConfig } from './pool-config.js';

const SPAWN_CIRCUIT_BREAKER_WINDOW_SECONDS = 30;
const SPAWN_CIRCUIT_BREAKER_EXIT_THRESHOLD = 5;
const SPAWN_CIRCUIT_BREAKER_PAUSE_SECONDS = 60;

// ---------------------------------------------------------------------------
// Pure scaling algorithm
// ---------------------------------------------------------------------------

export interface ComputeScalingDeltaInput {
  pendingCount: number;
  activeCount: number;
  drainingCount: number;
  maxPoolSize: number;
  scalingRatio: number;
  lastSpawnAt: string | null;
  spawnCooldownSeconds: number;
  now: string;
}

export interface ComputeScalingDeltaResult {
  spawnCount: number;
  reason: string;
}

interface ScalingReviewerSnapshot {
  reviewerId: string;
  status: ReviewerRecord['status'];
  currentReviewId: string | null;
  pid: number | null;
  sessionToken: string | null;
  lastSeenAt: string | null;
}

interface ScalingSnapshot {
  pendingCount: number;
  activeCount: number;
  drainingCount: number;
  rapidExitCount: number;
  reviewersConsidered: ScalingReviewerSnapshot[];
}

export function computeScalingDelta(input: ComputeScalingDeltaInput): ComputeScalingDeltaResult {
  const { pendingCount, activeCount, drainingCount, maxPoolSize, scalingRatio, lastSpawnAt, spawnCooldownSeconds, now } =
    input;

  if (pendingCount <= 0) {
    return { spawnCount: 0, reason: 'no_pending' };
  }

  const desired = Math.ceil(pendingCount / scalingRatio);
  const current = activeCount + drainingCount;
  const delta = Math.min(desired - current, maxPoolSize - current);
  const clamped = Math.max(delta, 0);

  if (clamped === 0) {
    return { spawnCount: 0, reason: 'at_capacity' };
  }

  // Cooldown check: skip spawning if last spawn was too recent
  if (lastSpawnAt !== null) {
    const elapsedSeconds = (Date.parse(now) - Date.parse(lastSpawnAt)) / 1000;
    if (elapsedSeconds < spawnCooldownSeconds) {
      return { spawnCount: 0, reason: 'cooldown' };
    }
  }

  return { spawnCount: clamped, reason: `spawn_${clamped}` };
}

// ---------------------------------------------------------------------------
// Pool manager factory
// ---------------------------------------------------------------------------

export interface CreatePoolManagerOptions {
  reviewerManager: ReviewerManager;
  reviewers: ReviewersRepository;
  reviews: ReviewsRepository;
  audit: AuditRepository;
  poolConfig: PoolConfig;
  notifications: { notify: (topic: string) => number };
  spawnCommand: string;
  spawnArgs: string[];
  spawnEnv?: Record<string, string>;
  logDir?: string;
  now?: () => string;
}

export interface PoolManager {
  reactiveScale: () => Promise<void>;
  startBackgroundLoop: () => void;
  stopBackgroundLoop: () => void;
  shutdownAll: () => Promise<void>;
  getLastSpawnAt: () => string | null;
  getSessionToken: () => string;
}

export function createPoolManager(options: CreatePoolManagerOptions): PoolManager {
  const {
    reviewerManager,
    reviewers,
    reviews,
    audit,
    poolConfig,
    notifications,
    spawnCommand,
    spawnArgs,
    spawnEnv,
    logDir,
  } = options;
  const getNow = options.now ?? (() => new Date().toISOString());

  // Internal state
  let isScaling = false;
  let lastSpawnAt: string | null = null;
  let spawnPausedUntil: string | null = null;
  let intervalHandle: ReturnType<typeof setInterval> | null = null;
  const sessionToken: string = randomUUID();

  // -------------------------------------------------------------------------
  // Reactive scaling
  // -------------------------------------------------------------------------

  function isSpawnPaused(now: string): boolean {
    if (spawnPausedUntil === null) {
      return false;
    }

    return Date.parse(now) < Date.parse(spawnPausedUntil);
  }

  function maybeOpenSpawnCircuit(rapidExitCount: number, now: string): void {
    if (rapidExitCount < SPAWN_CIRCUIT_BREAKER_EXIT_THRESHOLD || isSpawnPaused(now)) {
      return;
    }

    const pausedUntil = new Date(Date.parse(now) + SPAWN_CIRCUIT_BREAKER_PAUSE_SECONDS * 1000).toISOString();
    spawnPausedUntil = pausedUntil;

    audit.append({
      eventType: 'pool.scale_paused',
      createdAt: now,
      metadata: {
        rapidExitCount,
        windowSeconds: SPAWN_CIRCUIT_BREAKER_WINDOW_SECONDS,
        threshold: SPAWN_CIRCUIT_BREAKER_EXIT_THRESHOLD,
        pausedUntil,
        pauseSeconds: SPAWN_CIRCUIT_BREAKER_PAUSE_SECONDS,
        sessionToken,
        summary:
          `Pool scaling paused for ${SPAWN_CIRCUIT_BREAKER_PAUSE_SECONDS}s after ` +
          `${rapidExitCount} reviewer exits in ${SPAWN_CIRCUIT_BREAKER_WINDOW_SECONDS}s.`,
      },
    });
  }

  function collectScalingSnapshot(now: string): ScalingSnapshot {
    const pendingCount = reviews.countByStatus('pending');
    const allReviewers = reviewers.list();

    let activeCount = 0;
    let drainingCount = 0;
    let rapidExitCount = 0;
    const nowMs = Date.parse(now);
    const windowMs = SPAWN_CIRCUIT_BREAKER_WINDOW_SECONDS * 1000;

    for (const r of allReviewers) {
      if (r.status === 'idle' || r.status === 'assigned') {
        activeCount++;
      } else if (r.status === 'draining') {
        drainingCount++;
      }

      if (
        r.sessionToken === sessionToken &&
        r.offlineReason === 'reviewer_exit' &&
        r.offlineAt !== null
      ) {
        const offlineMs = Date.parse(r.offlineAt);
        if (Number.isFinite(offlineMs) && Number.isFinite(nowMs) && nowMs - offlineMs <= windowMs) {
          rapidExitCount++;
        }
      }
    }

    return {
      pendingCount,
      activeCount,
      drainingCount,
      rapidExitCount,
      reviewersConsidered: allReviewers.map((reviewer) => ({
        reviewerId: reviewer.reviewerId,
        status: reviewer.status,
        currentReviewId: reviewer.currentReviewId,
        pid: reviewer.pid,
        sessionToken: reviewer.sessionToken,
        lastSeenAt: reviewer.lastSeenAt,
      })),
    };
  }

  async function reactiveScale(): Promise<void> {
    if (isScaling) {
      return;
    }

    isScaling = true;
    try {
      const now = getNow();
      const initialSnapshot = collectScalingSnapshot(now);

      maybeOpenSpawnCircuit(initialSnapshot.rapidExitCount, now);

      if (isSpawnPaused(now)) {
        return;
      }

      if (spawnPausedUntil !== null) {
        // Pause window elapsed; allow scaling to resume.
        spawnPausedUntil = null;
      }

      const initialResult = computeScalingDelta({
        pendingCount: initialSnapshot.pendingCount,
        activeCount: initialSnapshot.activeCount,
        drainingCount: initialSnapshot.drainingCount,
        maxPoolSize: poolConfig.max_pool_size,
        scalingRatio: poolConfig.scaling_ratio,
        lastSpawnAt,
        spawnCooldownSeconds: poolConfig.spawn_cooldown_seconds,
        now,
      });

      if (initialResult.spawnCount > 0) {
        const recheckNow = getNow();
        const recheckSnapshot = collectScalingSnapshot(recheckNow);
        const result = computeScalingDelta({
          pendingCount: recheckSnapshot.pendingCount,
          activeCount: recheckSnapshot.activeCount,
          drainingCount: recheckSnapshot.drainingCount,
          maxPoolSize: poolConfig.max_pool_size,
          scalingRatio: poolConfig.scaling_ratio,
          lastSpawnAt,
          spawnCooldownSeconds: poolConfig.spawn_cooldown_seconds,
          now: recheckNow,
        });

        if (result.spawnCount <= 0) {
          return;
        }

        await Promise.all(
          Array.from({ length: result.spawnCount }, () =>
            reviewerManager.spawnReviewer({
              command: spawnCommand,
              args: spawnArgs,
              ...(spawnEnv ? { env: spawnEnv } : {}),
              ...(logDir ? { logDir } : {}),
              sessionToken,
            }),
          ),
        );
        lastSpawnAt = getNow();

        audit.append({
          eventType: 'pool.scale_up',
          createdAt: lastSpawnAt,
          metadata: {
            spawnCount: result.spawnCount,
            pendingCount: recheckSnapshot.pendingCount,
            activeCount: recheckSnapshot.activeCount,
            drainingCount: recheckSnapshot.drainingCount,
            rapidExitCount: recheckSnapshot.rapidExitCount,
            desired: Math.ceil(recheckSnapshot.pendingCount / poolConfig.scaling_ratio),
            initialPendingCount: initialSnapshot.pendingCount,
            initialActiveCount: initialSnapshot.activeCount,
            initialDrainingCount: initialSnapshot.drainingCount,
            reviewersConsidered: recheckSnapshot.reviewersConsidered,
            sessionToken,
            summary: `Pool scaled up: spawned ${result.spawnCount} reviewer(s) (${recheckSnapshot.pendingCount} pending, ${recheckSnapshot.activeCount} active, ${recheckSnapshot.drainingCount} draining).`,
          },
        });

        notifications.notify('reviewer-state');
      }
    } finally {
      isScaling = false;
    }
  }

  // -------------------------------------------------------------------------
  // 5 background check functions
  // -------------------------------------------------------------------------

  function checkIdleTimeouts(): void {
    const now = getNow();
    const idleReviewers = reviewers.list({ status: 'idle' });

    for (const reviewer of idleReviewers) {
      if (!reviewer.lastSeenAt) continue;

      const idleSeconds = (Date.parse(now) - Date.parse(reviewer.lastSeenAt)) / 1000;
      if (idleSeconds > poolConfig.idle_timeout_seconds) {
        const result = reviewers.markDraining({
          reviewerId: reviewer.reviewerId,
          drainingAt: now,
          updatedAt: now,
        });

        if (result) {
          audit.append({
            eventType: 'pool.drain_initiated',
            createdAt: now,
            metadata: {
              reviewerId: reviewer.reviewerId,
              reason: 'idle_timeout',
              idleSeconds,
              summary: `Reviewer ${reviewer.reviewerId} marked draining: idle for ${idleSeconds}s (threshold: ${poolConfig.idle_timeout_seconds}s).`,
            },
          });
        }
      }
    }
  }

  function checkTtlExpiry(): void {
    const now = getNow();
    const candidates = reviewers.list().filter(
      (r) => r.status === 'idle' || r.status === 'assigned',
    );

    for (const reviewer of candidates) {
      if (!reviewer.startedAt) continue;

      const ageSeconds = (Date.parse(now) - Date.parse(reviewer.startedAt)) / 1000;
      if (ageSeconds > poolConfig.max_ttl_seconds) {
        const result = reviewers.markDraining({
          reviewerId: reviewer.reviewerId,
          drainingAt: now,
          updatedAt: now,
        });

        if (result) {
          audit.append({
            eventType: 'pool.drain_initiated',
            createdAt: now,
            metadata: {
              reviewerId: reviewer.reviewerId,
              reason: 'ttl_expired',
              ageSeconds,
              summary: `Reviewer ${reviewer.reviewerId} marked draining: TTL expired after ${ageSeconds}s (max: ${poolConfig.max_ttl_seconds}s).`,
            },
          });
        }
      }
    }
  }

  async function checkDrainCompletion(): Promise<void> {
    const drainingReviewers = reviewers.list({ status: 'draining' });
    const completable = drainingReviewers.filter((r) => r.currentReviewId === null);

    if (completable.length === 0) return;

    const now = getNow();
    await Promise.all(
      completable.map(async (reviewer) => {
        await reviewerManager.stopReviewer(reviewer.reviewerId, {
          offlineReason: 'pool_drain',
        });

        audit.append({
          eventType: 'pool.drain_completed',
          createdAt: now,
          metadata: {
            reviewerId: reviewer.reviewerId,
            summary: `Reviewer ${reviewer.reviewerId} drain completed: no open reviews, terminated.`,
          },
        });
      }),
    );
  }

  function checkClaimTimeouts(): void {
    const now = getNow();
    const claimedReviews = reviews.list({ status: 'claimed' });

    for (const review of claimedReviews) {
      if (!review.claimedAt) continue;

      const claimAge = (Date.parse(now) - Date.parse(review.claimedAt)) / 1000;
      if (claimAge > poolConfig.claim_timeout_seconds) {
        if (review.claimedBy && reviewerManager.isProcessAlive(review.claimedBy)) {
          continue;
        }

        const result = reviews.updateState({
          reviewId: review.reviewId,
          status: 'pending',
          claimedBy: null,
          claimedAt: null,
          expectedStatus: 'claimed',
          incrementClaimGeneration: true,
          updatedAt: now,
          lastActivityAt: now,
        });

        if (result) {
          audit.append({
            eventType: 'pool.claim_timeout',
            createdAt: now,
            metadata: {
              reviewId: review.reviewId,
              claimAge,
              previousClaimedBy: review.claimedBy,
              summary: `Review ${review.reviewId} reclaimed: claim timed out after ${claimAge}s (threshold: ${poolConfig.claim_timeout_seconds}s).`,
            },
          });
        }
      }
    }
  }

  async function reapDeadProcesses(): Promise<void> {
    const trackedIds = reviewerManager.getTrackedReviewerIds();
    const deadIds = trackedIds.filter((id) => !reviewerManager.isProcessAlive(id));

    if (deadIds.length === 0) return;

    const now = getNow();
    await Promise.all(
      deadIds.map(async (reviewerId) => {
        await reviewerManager.stopReviewer(reviewerId);

        audit.append({
          eventType: 'pool.dead_process_reaped',
          createdAt: now,
          metadata: {
            reviewerId,
            summary: `Dead process reaped for reviewer ${reviewerId}.`,
          },
        });
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Background loop
  // -------------------------------------------------------------------------

  async function runAllChecks(): Promise<void> {
    // Run scaling and reaping in parallel (independent), then synchronous checks
    await Promise.all([reactiveScale(), reapDeadProcesses()]);
    checkIdleTimeouts();
    checkTtlExpiry();
    await checkDrainCompletion();
    checkClaimTimeouts();
  }

  function startBackgroundLoop(): void {
    if (intervalHandle !== null) {
      return;
    }

    intervalHandle = setInterval(() => {
      runAllChecks().catch((err) => {
        audit.append({
          eventType: 'pool.background_check_error',
          createdAt: getNow(),
          metadata: {
            error: err instanceof Error ? err.message : String(err),
            summary: 'Pool background check failed unexpectedly.',
          },
        });
      });
    }, poolConfig.background_check_interval_seconds * 1000);
  }

  function stopBackgroundLoop(): void {
    if (intervalHandle !== null) {
      clearInterval(intervalHandle);
      intervalHandle = null;
    }
  }

  // -------------------------------------------------------------------------
  // Shutdown
  // -------------------------------------------------------------------------

  async function shutdownAll(): Promise<void> {
    stopBackgroundLoop();
    await reviewerManager.shutdown();
  }

  return {
    reactiveScale,
    startBackgroundLoop,
    stopBackgroundLoop,
    shutdownAll,
    getLastSpawnAt: () => lastSpawnAt,
    getSessionToken: () => sessionToken,
  };
}
