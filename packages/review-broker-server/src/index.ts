import type {
  AuditEventType,
  CounterPatchStatus,
  ReviewMessageAuthorRole,
  ReviewStatus,
  ReviewVerdict,
  ReviewerOfflineReason,
  ReviewerStatus,
} from 'review-broker-core';

import { resolveSelectedReviewerProvider, validateReviewerWorkerCommand } from './cli/config.js';
import type { AppContext, CreateAppContextOptions } from './runtime/app-context.js';
import { createAppContext } from './runtime/app-context.js';
import type {
  BrokerService,
  CreateBrokerServiceOptions,
  ReviewerRecoverySummary,
} from './runtime/broker-service.js';
import { createBrokerService } from './runtime/broker-service.js';
import type { ReviewerShutdownSummary } from './runtime/reviewer-manager.js';
import type { PoolManager } from './runtime/reviewer-pool.js';
import { createPoolManager } from './runtime/reviewer-pool.js';

export * from './db/audit-repository.js';
export * from './db/messages-repository.js';
export * from './db/open-database.js';
export * from './db/reviewers-repository.js';
export * from './db/reviews-repository.js';
export * from './mcp/server.js';
export * from './mcp/tool-dispatch.js';
export * from './runtime/app-context.js';
export * from './runtime/broker-service.js';
export * from './runtime/diff.js';
export * from './runtime/path-resolution.js';
export * from './runtime/reviewer-manager.js';
export * from './runtime/reviewer-pool.js';
export * from './runtime/pool-config.js';
export * from './runtime/jsonl-log-writer.js';
export * from './agent/reviewer-agent.js';
export * from './agent/reviewer-prompt.js';
export * from './agent/reviewer-tools.js';

export interface StartBrokerOptions extends CreateAppContextOptions, CreateBrokerServiceOptions {
  handleSignals?: boolean;
  /**
   * Enable reviewer pool management when reviewer_pool config is present.
   * Defaults to true.
   */
  enablePool?: boolean;
  /**
   * Recover reviewers left online by an earlier broker process.
   * Defaults to true for long-lived broker/dashboard processes.
   */
  enableStartupRecovery?: boolean;
  /** Command used to spawn pool reviewer processes. Required when poolConfig is set. */
  poolSpawnCommand?: string;
  /** Arguments for the pool reviewer spawn command. */
  poolSpawnArgs?: string[];
  /** Directory for pool reviewer log files. */
  poolLogDir?: string;
}

export interface BrokerRuntimeLatestReviewSnapshot {
  reviewId: string;
  status: ReviewStatus;
  currentRound: number;
  latestVerdict: ReviewVerdict | null;
  verdictReason: string | null;
  counterPatchStatus: CounterPatchStatus;
  lastMessageAt: string | null;
  lastActivityAt: string | null;
}

export interface BrokerRuntimeLatestReviewerSnapshot {
  reviewerId: string;
  status: ReviewerStatus;
  currentReviewId: string | null;
  command: string;
  args: string[];
  cwd: string | null;
  pid: number | null;
  startedAt: string | null;
  lastSeenAt: string | null;
  offlineAt: string | null;
  offlineReason: ReviewerOfflineReason | null;
  exitCode: number | null;
  exitSignal: string | null;
  updatedAt: string;
}

export interface BrokerRuntimeLatestMessageSnapshot {
  reviewId: string;
  actorId: string;
  authorRole: ReviewMessageAuthorRole;
  createdAt: string;
}

export interface BrokerRuntimeLatestAuditSnapshot {
  reviewId: string | null;
  eventType: AuditEventType;
  errorCode: string | null;
  summary: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface BrokerStartupRecoveryReviewerSnapshot {
  reviewerId: string;
  reclaimedReviewIds: string[];
  staleReviewIds: string[];
  unrecoverableReviewIds: string[];
}

export interface BrokerStartupRecoverySnapshot {
  completedAt: string;
  recoveredReviewerIds: string[];
  reclaimedReviewIds: string[];
  staleReviewIds: string[];
  unrecoverableReviewIds: string[];
  reviewers: BrokerStartupRecoveryReviewerSnapshot[];
}

export interface BrokerRuntimeSnapshot {
  reviewCount: number;
  reviewerCount: number;
  trackedReviewerCount: number;
  reviewerStatusCounts: Partial<Record<ReviewerStatus, number>>;
  messageCount: number;
  auditEventCount: number;
  migrationCount: number;
  statusCounts: Partial<Record<ReviewStatus, number>>;
  counterPatchStatusCounts: Partial<Record<CounterPatchStatus, number>>;
  latestReview: BrokerRuntimeLatestReviewSnapshot | null;
  latestReviewer: BrokerRuntimeLatestReviewerSnapshot | null;
  latestMessage: BrokerRuntimeLatestMessageSnapshot | null;
  latestAuditEvent: BrokerRuntimeLatestAuditSnapshot | null;
}

export interface BrokerShutdownSnapshot {
  completedAt: string;
  reviewerShutdown: ReviewerShutdownSummary;
}

export interface PoolStartupRecoverySnapshot {
  terminatedReviewerIds: string[];
  reclaimedReviewIds: string[];
  scalingTriggered: boolean;
}

export interface BrokerPoolControlSnapshot {
  configured: boolean;
  enabled: boolean;
  mode: 'unavailable' | 'view_only' | 'standalone';
  reason: string | null;
  sessionToken: string | null;
  lastSpawnAt: string | null;
}

export interface StartedBrokerRuntime {
  context: AppContext;
  service: BrokerService;
  startedAt: string;
  poolManager: PoolManager | null;
  close: () => void;
  waitUntilStopped: () => Promise<void>;
  getShutdownSnapshot: () => BrokerShutdownSnapshot | null;
  getStartupRecoverySnapshot: () => BrokerStartupRecoverySnapshot;
  getPoolStartupRecoverySnapshot: () => PoolStartupRecoverySnapshot | null;
  getPoolControlSnapshot: () => BrokerPoolControlSnapshot;
  setStandalonePoolEnabled: (enabled: boolean) => Promise<BrokerPoolControlSnapshot>;
}

export function startBroker(options: StartBrokerOptions = {}): StartedBrokerRuntime {
  const context = createAppContext(options);
  const service = createBrokerService(context, options);
  const startupRecovery =
    options.enableStartupRecovery === false
      ? emptyStartupRecoverySnapshot(options.now)
      : reconcileStartupRecovery(context, options.now);
  const startedAt = options.now ? options.now() : new Date().toISOString();

  // Create pool manager if pool configuration is present and we can resolve a reviewer worker command.
  let poolManager: PoolManager | null = null;
  let poolRecovery: PoolStartupRecoverySnapshot | null = null;
  if (options.enablePool !== false && context.poolConfig !== null) {
    startStandalonePool();
  }

  function createConfiguredPoolManager(): PoolManager {
    if (context.poolConfig === null) {
      throw new Error(`Reviewer pool is unavailable because reviewer_pool config is not present in ${context.configPath}.`);
    }

    const configuredProvider =
      options.poolSpawnCommand === undefined && options.poolSpawnArgs === undefined
        ? resolveSelectedReviewerProvider(context.configPath)
        : null;

    const spawnCommand = options.poolSpawnCommand ?? configuredProvider?.command;
    const spawnArgs = options.poolSpawnArgs ?? configuredProvider?.args ?? [];
    const spawnEnv =
      configuredProvider?.providerName !== undefined
        ? { REVIEWER_PROVIDER_NAME: configuredProvider.providerName }
        : undefined;

    if (spawnCommand) {
      validateReviewerWorkerCommand(spawnCommand, spawnArgs, 'Pool worker');
    }

    if (!spawnCommand) {
      throw new Error(
        `Reviewer pool is enabled but no worker command is configured. Set reviewer.provider/reviewer.providers.* in ${context.configPath} or pass poolSpawnCommand/poolSpawnArgs programmatically.`,
      );
    }

    return createPoolManager({
      reviewerManager: context.reviewerManager,
      reviewers: context.reviewers,
      reviews: context.reviews,
      audit: context.audit,
      poolConfig: context.poolConfig,
      notifications: context.notifications,
      spawnCommand,
      spawnArgs,
      ...(spawnEnv ? { spawnEnv } : {}),
      ...(options.poolLogDir !== undefined ? { logDir: options.poolLogDir } : {}),
      ...(options.now !== undefined ? { now: options.now } : {}),
    });
  }

  function startStandalonePool(): PoolStartupRecoverySnapshot {
    if (poolManager !== null) {
      return poolRecovery ?? { terminatedReviewerIds: [], reclaimedReviewIds: [], scalingTriggered: false };
    }

    poolManager = createConfiguredPoolManager();
    // Wire pool manager into broker service for reactive scaling triggers
    service._setPoolManager(poolManager);

    // Recover stale-session reviewers from previous broker sessions before starting background loop
    poolRecovery = poolStartupRecovery(context, poolManager, options.now);

    // Fire-and-forget reactive scaling to replace terminated stale-session reviewers.
    // This is async but startBroker() is synchronous — use setImmediate to avoid blocking.
    const pm = poolManager;
    setImmediate(() => {
      pm.reactiveScale().catch(() => {});
    });

    poolManager.startBackgroundLoop();

    return poolRecovery;
  }

  async function stopStandalonePool(): Promise<void> {
    if (poolManager === null) {
      service._setPoolManager(null);
      return;
    }

    const manager = poolManager;
    poolManager = null;
    service._setPoolManager(null);
    manager.stopBackgroundLoop();
    await manager.shutdownAll();
    context.notifications.notify('reviewer-state');
  }

  function getPoolControlSnapshot(): BrokerPoolControlSnapshot {
    if (context.poolConfig === null) {
      return {
        configured: false,
        enabled: false,
        mode: 'unavailable',
        reason: 'reviewer_pool config is not present.',
        sessionToken: null,
        lastSpawnAt: null,
      };
    }

    if (poolManager === null) {
      return {
        configured: true,
        enabled: false,
        mode: 'view_only',
        reason: 'Dashboard is observing broker state; standalone pool scaling is disabled.',
        sessionToken: null,
        lastSpawnAt: null,
      };
    }

    return {
      configured: true,
      enabled: true,
      mode: 'standalone',
      reason: 'Standalone reviewer pool scaling is enabled in this broker runtime.',
      sessionToken: poolManager.getSessionToken(),
      lastSpawnAt: poolManager.getLastSpawnAt(),
    };
  }

  let closed = false;
  let shutdownSnapshot: BrokerShutdownSnapshot | null = null;
  let resolveStopped: (() => void) | undefined;
  let rejectStopped: ((error: unknown) => void) | undefined;
  const stopped = new Promise<void>((resolve, reject) => {
    resolveStopped = resolve;
    rejectStopped = reject;
  });

  // Keep the event loop alive so the process doesn't exit while waiting
  // for a signal. process.on('SIGINT'/'SIGTERM') alone doesn't ref the loop.
  const keepAlive = setInterval(() => {}, 2_147_483_647);

  const removeSignalHandlers = bindSignalHandlers(options.handleSignals ?? true, () => {
    close();
  });

  function close(): void {
    if (closed) {
      return;
    }

    closed = true;
    clearInterval(keepAlive);
    removeSignalHandlers();

    // Stop pool background loop before shutting down context
    if (poolManager) {
      poolManager.stopBackgroundLoop();
    }

    void context
      .shutdown()
      .then((reviewerShutdown) => {
        shutdownSnapshot = {
          completedAt: options.now ? options.now() : new Date().toISOString(),
          reviewerShutdown,
        };
        resolveStopped?.();
      })
      .catch((error) => {
        rejectStopped?.(error);
      });
  }

  return {
    context,
    service,
    startedAt,
    get poolManager() {
      return poolManager;
    },
    close,
    waitUntilStopped: () => stopped,
    getShutdownSnapshot: () => shutdownSnapshot,
    getStartupRecoverySnapshot: () => startupRecovery,
    getPoolStartupRecoverySnapshot: () => poolRecovery,
    getPoolControlSnapshot,
    setStandalonePoolEnabled: async (enabled) => {
      if (enabled) {
        startStandalonePool();
      } else {
        await stopStandalonePool();
      }

      return getPoolControlSnapshot();
    },
  };
}

function emptyStartupRecoverySnapshot(nowFactory: (() => string) | undefined): BrokerStartupRecoverySnapshot {
  const now = nowFactory ?? (() => new Date().toISOString());
  return {
    completedAt: now(),
    recoveredReviewerIds: [],
    reclaimedReviewIds: [],
    staleReviewIds: [],
    unrecoverableReviewIds: [],
    reviewers: [],
  };
}

function reconcileStartupRecovery(
  context: AppContext,
  nowFactory: (() => string) | undefined,
): BrokerStartupRecoverySnapshot {
  const now = nowFactory ?? (() => new Date().toISOString());
  const staleReviewers = context.reviewers
    .list()
    .filter((reviewer) => reviewer.pid !== null && reviewer.offlineAt === null)
    .sort((left, right) => left.reviewerId.localeCompare(right.reviewerId));

  const reviewerSummaries: BrokerStartupRecoveryReviewerSnapshot[] = [];

  for (const staleReviewer of staleReviewers) {
    const offlineAt = now();
    const reviewer = context.reviewers.markOffline({
      reviewerId: staleReviewer.reviewerId,
      offlineAt,
      offlineReason: 'startup_recovery',
      exitCode: staleReviewer.exitCode,
      exitSignal: staleReviewer.exitSignal,
      lastSeenAt: staleReviewer.lastSeenAt ?? offlineAt,
      updatedAt: offlineAt,
    });

    if (!reviewer) {
      continue;
    }

    const recovery = recoverReviewerAssignmentsSynchronously(context, {
      reviewerId: staleReviewer.reviewerId,
      cause: 'startup_recovery',
      now,
    });

    context.audit.append({
      eventType: 'reviewer.offline',
      createdAt: offlineAt,
      metadata: {
        reviewerId: staleReviewer.reviewerId,
        offlineReason: 'startup_recovery',
        exitCode: staleReviewer.exitCode,
        exitSignal: staleReviewer.exitSignal,
        reclaimedReviewIds: recovery.reclaimedReviewIds,
        staleReviewIds: recovery.staleReviewIds,
        unrecoverableReviewIds: recovery.unrecoverableReviewIds,
        summary: `Reviewer ${staleReviewer.reviewerId} was reconciled during startup recovery.`,
      },
    });
    context.notifications.notify('reviewer-state');

    reviewerSummaries.push({
      reviewerId: staleReviewer.reviewerId,
      reclaimedReviewIds: recovery.reclaimedReviewIds,
      staleReviewIds: recovery.staleReviewIds,
      unrecoverableReviewIds: recovery.unrecoverableReviewIds,
    });
  }

  return {
    completedAt: now(),
    recoveredReviewerIds: reviewerSummaries.map((reviewer) => reviewer.reviewerId),
    reclaimedReviewIds: reviewerSummaries.flatMap((reviewer) => reviewer.reclaimedReviewIds),
    staleReviewIds: reviewerSummaries.flatMap((reviewer) => reviewer.staleReviewIds),
    unrecoverableReviewIds: reviewerSummaries.flatMap((reviewer) => reviewer.unrecoverableReviewIds),
    reviewers: reviewerSummaries,
  };
}

function poolStartupRecovery(
  context: AppContext,
  poolManager: PoolManager,
  nowFactory?: (() => string) | undefined,
): PoolStartupRecoverySnapshot {
  const now = nowFactory ?? (() => new Date().toISOString());
  const currentSessionToken = poolManager.getSessionToken();
  const allReviewers = context.reviewers.list();

  // Find reviewers from a previous pool session: have a session token, not offline, different session
  const staleReviewers = allReviewers
    .filter(
      (reviewer) =>
        reviewer.offlineAt === null &&
        reviewer.sessionToken !== null &&
        reviewer.sessionToken !== currentSessionToken,
    )
    .sort((left, right) => left.reviewerId.localeCompare(right.reviewerId));

  const terminatedReviewerIds: string[] = [];
  const reclaimedReviewIds: string[] = [];

  for (const staleReviewer of staleReviewers) {
    const offlineAt = now();
    const marked = context.reviewers.markOffline({
      reviewerId: staleReviewer.reviewerId,
      offlineAt,
      offlineReason: 'startup_recovery',
      exitCode: staleReviewer.exitCode,
      exitSignal: staleReviewer.exitSignal,
      lastSeenAt: staleReviewer.lastSeenAt ?? offlineAt,
      updatedAt: offlineAt,
    });

    if (!marked) {
      continue;
    }

    terminatedReviewerIds.push(staleReviewer.reviewerId);

    const recovery = recoverReviewerAssignmentsSynchronously(context, {
      reviewerId: staleReviewer.reviewerId,
      cause: 'startup_recovery',
      now,
    });

    reclaimedReviewIds.push(...recovery.reclaimedReviewIds);

    context.audit.append({
      eventType: 'pool.stale_session_terminated',
      createdAt: offlineAt,
      metadata: {
        reviewerId: staleReviewer.reviewerId,
        staleSessionToken: staleReviewer.sessionToken,
        currentSessionToken,
        reclaimedReviewIds: recovery.reclaimedReviewIds,
        staleReviewIds: recovery.staleReviewIds,
        unrecoverableReviewIds: recovery.unrecoverableReviewIds,
        summary: `Stale-session reviewer ${staleReviewer.reviewerId} terminated during pool startup recovery (session ${staleReviewer.sessionToken} → ${currentSessionToken}).`,
      },
    });

    context.notifications.notify('reviewer-state');
  }

  return {
    terminatedReviewerIds,
    reclaimedReviewIds,
    scalingTriggered: staleReviewers.length > 0,
  };
}

function recoverReviewerAssignmentsSynchronously(
  context: AppContext,
  options: {
    reviewerId: string;
    cause: 'startup_recovery';
    now: () => string;
  },
): ReviewerRecoverySummary {
  const candidates = context.reviews
    .list()
    .filter(
      (review) => review.claimedBy === options.reviewerId && (review.status === 'claimed' || review.status === 'submitted'),
    )
    .sort((left, right) => left.reviewId.localeCompare(right.reviewId));

  const attempts: ReviewerRecoverySummary['attempts'] = [];

  for (const candidate of candidates) {
    const reclaimedAt = options.now();
    const updated = context.db.transaction(() => {
      const review = context.reviews.updateState({
        reviewId: candidate.reviewId,
        status: 'pending',
        claimedBy: null,
        claimedAt: null,
        expectedClaimGeneration: candidate.claimGeneration,
        expectedStatus: candidate.status,
        expectedClaimedBy: options.reviewerId,
        incrementClaimGeneration: true,
        updatedAt: reclaimedAt,
        lastActivityAt: reclaimedAt,
      });

      if (!review) {
        return null;
      }

      context.audit.append({
        reviewId: review.reviewId,
        eventType: 'review.reclaimed',
        statusFrom: candidate.status,
        statusTo: 'pending',
        createdAt: reclaimedAt,
        metadata: {
          reviewId: review.reviewId,
          reviewerId: options.reviewerId,
          reclaimCause: options.cause,
          claimGeneration: review.claimGeneration,
          expectedClaimGeneration: candidate.claimGeneration,
          summary: `Review reclaimed after ${options.cause} for reviewer ${options.reviewerId}.`,
        },
      });

      return review;
    })();

    if (updated) {
      attempts.push({
        reviewId: candidate.reviewId,
        outcome: 'reclaimed',
        previousStatus: candidate.status,
        expectedClaimGeneration: candidate.claimGeneration,
        actualStatus: updated.status,
        actualClaimGeneration: updated.claimGeneration,
      });
      context.notifications.notify('reviews');
      context.notifications.notify('review-queue');
      context.notifications.notify('review-status');
      context.notifications.notify(`review-status:${updated.reviewId}`);
      continue;
    }

    const latest = context.reviews.getById(candidate.reviewId);
    const outcome = latest && latest.claimGeneration !== candidate.claimGeneration ? 'stale' : 'not_recoverable';
    const errorCode = outcome === 'stale' ? 'STALE_CLAIM_GENERATION' : 'INVALID_REVIEW_TRANSITION';

    context.audit.append({
      reviewId: candidate.reviewId,
      eventType: 'review.transition_rejected',
      statusFrom: latest?.status ?? candidate.status,
      statusTo: 'pending',
      errorCode,
      createdAt: reclaimedAt,
      metadata: {
        reviewId: candidate.reviewId,
        reviewerId: options.reviewerId,
        reclaimCause: options.cause,
        attemptedEvent: 'reclaim',
        outcome,
        expectedClaimGeneration: candidate.claimGeneration,
        actualClaimGeneration: latest?.claimGeneration ?? null,
        expectedStatus: candidate.status,
        actualStatus: latest?.status ?? null,
        expectedClaimedBy: options.reviewerId,
        actualClaimedBy: latest?.claimedBy ?? null,
      },
    });

    attempts.push({
      reviewId: candidate.reviewId,
      outcome,
      previousStatus: candidate.status,
      expectedClaimGeneration: candidate.claimGeneration,
      actualStatus: latest?.status ?? null,
      actualClaimGeneration: latest?.claimGeneration ?? null,
    });
  }

  return {
    reviewerId: options.reviewerId,
    cause: options.cause,
    attempts,
    reclaimedReviewIds: attempts.filter((attempt) => attempt.outcome === 'reclaimed').map((attempt) => attempt.reviewId),
    staleReviewIds: attempts.filter((attempt) => attempt.outcome === 'stale').map((attempt) => attempt.reviewId),
    unrecoverableReviewIds: attempts
      .filter((attempt) => attempt.outcome === 'not_recoverable')
      .map((attempt) => attempt.reviewId),
  };
}

// Cached prepared statements for inspectBrokerRuntime — keyed by db instance
const inspectorStmtCache = new WeakMap<object, ReturnType<typeof buildInspectorStatements>>();

function buildInspectorStatements(db: AppContext['db']) {
  return {
    countReviews: db.prepare<unknown[], { count: number }>('SELECT COUNT(*) as count FROM reviews'),
    countMessages: db.prepare<unknown[], { count: number }>('SELECT COUNT(*) as count FROM messages'),
    countAuditEvents: db.prepare<unknown[], { count: number }>('SELECT COUNT(*) as count FROM audit_events'),
    countMigrations: db.prepare<unknown[], { count: number }>('SELECT COUNT(*) as count FROM schema_migrations'),
    statusCounts: db.prepare<unknown[], { status: ReviewStatus; count: number }>(
      'SELECT status, COUNT(*) as count FROM reviews GROUP BY status ORDER BY status ASC',
    ),
    counterPatchStatusCounts: db.prepare<unknown[], { counter_patch_status: CounterPatchStatus; count: number }>(
      'SELECT counter_patch_status, COUNT(*) as count FROM reviews GROUP BY counter_patch_status ORDER BY counter_patch_status ASC',
    ),
    latestReview: db.prepare<unknown[], {
      review_id: string; status: ReviewStatus; current_round: number;
      latest_verdict: ReviewVerdict | null; verdict_reason: string | null;
      counter_patch_status: CounterPatchStatus; last_message_at: string | null; last_activity_at: string | null;
    }>(`
      SELECT review_id, status, current_round, latest_verdict, verdict_reason,
        counter_patch_status, last_message_at, last_activity_at
      FROM reviews ORDER BY updated_at DESC, review_id DESC LIMIT 1
    `),
    latestMessage: db.prepare<unknown[], {
      review_id: string; author_id: string; author_role: ReviewMessageAuthorRole; created_at: string;
    }>(`
      SELECT review_id, author_id, author_role, created_at
      FROM messages ORDER BY created_at DESC, message_id DESC LIMIT 1
    `),
    latestAuditEvent: db.prepare<unknown[], {
      review_id: string | null; event_type: AuditEventType; error_code: string | null;
      metadata_json: string; created_at: string;
    }>(`
      SELECT review_id, event_type, error_code, metadata_json, created_at
      FROM audit_events ORDER BY created_at DESC, audit_event_id DESC LIMIT 1
    `),
  };
}

function getInspectorStmts(db: AppContext['db']) {
  let stmts = inspectorStmtCache.get(db);
  if (!stmts) {
    stmts = buildInspectorStatements(db);
    inspectorStmtCache.set(db, stmts);
  }
  return stmts;
}

export function inspectBrokerRuntime(context: AppContext): BrokerRuntimeSnapshot {
  const stmts = getInspectorStmts(context.db);

  const statusCounts = Object.fromEntries(
    stmts.statusCounts.all().map((row) => [row.status, row.count]),
  ) as Partial<Record<ReviewStatus, number>>;

  const counterPatchStatusCounts = Object.fromEntries(
    stmts.counterPatchStatusCounts.all().map((row) => [row.counter_patch_status, row.count]),
  ) as Partial<Record<CounterPatchStatus, number>>;

  const reviewers = context.reviewers.list();
  const reviewerStatusCounts: Partial<Record<ReviewerStatus, number>> = {};
  for (const reviewer of reviewers) {
    reviewerStatusCounts[reviewer.status] = (reviewerStatusCounts[reviewer.status] ?? 0) + 1;
  }
  const trackedReviewerCount = context.reviewerManager.inspect().trackedReviewerIds.length;
  const latestReviewer = reviewers[0] ?? null;

  const latestReview = stmts.latestReview.get() ?? null;
  const latestMessage = stmts.latestMessage.get() ?? null;
  const latestAuditEventRow = stmts.latestAuditEvent.get() ?? null;

  const latestAuditMetadata = latestAuditEventRow ? parseMetadata(latestAuditEventRow.metadata_json) : null;

  return {
    reviewCount: stmts.countReviews.get()?.count ?? 0,
    reviewerCount: reviewers.length,
    trackedReviewerCount,
    reviewerStatusCounts,
    messageCount: stmts.countMessages.get()?.count ?? 0,
    auditEventCount: stmts.countAuditEvents.get()?.count ?? 0,
    migrationCount: stmts.countMigrations.get()?.count ?? 0,
    statusCounts,
    counterPatchStatusCounts,
    latestReview: latestReview
      ? {
          reviewId: latestReview.review_id,
          status: latestReview.status,
          currentRound: latestReview.current_round,
          latestVerdict: latestReview.latest_verdict,
          verdictReason: latestReview.verdict_reason,
          counterPatchStatus: latestReview.counter_patch_status,
          lastMessageAt: latestReview.last_message_at,
          lastActivityAt: latestReview.last_activity_at,
        }
      : null,
    latestReviewer: latestReviewer
      ? {
          reviewerId: latestReviewer.reviewerId,
          status: latestReviewer.status,
          currentReviewId: latestReviewer.currentReviewId,
          command: latestReviewer.command,
          args: latestReviewer.args,
          cwd: latestReviewer.cwd,
          pid: latestReviewer.pid,
          startedAt: latestReviewer.startedAt,
          lastSeenAt: latestReviewer.lastSeenAt,
          offlineAt: latestReviewer.offlineAt,
          offlineReason: latestReviewer.offlineReason,
          exitCode: latestReviewer.exitCode,
          exitSignal: latestReviewer.exitSignal,
          updatedAt: latestReviewer.updatedAt,
        }
      : null,
    latestMessage: latestMessage
      ? {
          reviewId: latestMessage.review_id,
          actorId: latestMessage.author_id,
          authorRole: latestMessage.author_role,
          createdAt: latestMessage.created_at,
        }
      : null,
    latestAuditEvent: latestAuditEventRow
      ? {
          reviewId: latestAuditEventRow.review_id,
          eventType: latestAuditEventRow.event_type,
          errorCode: latestAuditEventRow.error_code,
          summary: typeof latestAuditMetadata?.summary === 'string' ? latestAuditMetadata.summary : null,
          metadata: latestAuditMetadata ?? {},
          createdAt: latestAuditEventRow.created_at,
        }
      : null,
  };
}

function parseMetadata(rawValue: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(rawValue) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function bindSignalHandlers(enabled: boolean, onSignal: () => void): () => void {
  if (!enabled) {
    return () => {};
  }

  const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
  const handler = () => {
    onSignal();
  };

  for (const signal of signals) {
    process.on(signal, handler);
  }

  return () => {
    for (const signal of signals) {
      process.off(signal, handler);
    }
  };
}
