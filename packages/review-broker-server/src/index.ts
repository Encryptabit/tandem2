import type {
  AuditEventType,
  CounterPatchStatus,
  ReviewMessageAuthorRole,
  ReviewStatus,
  ReviewVerdict,
  ReviewerOfflineReason,
  ReviewerStatus,
} from 'review-broker-core';

import type { AppContext, CreateAppContextOptions } from './runtime/app-context.js';
import { createAppContext } from './runtime/app-context.js';
import type {
  BrokerService,
  CreateBrokerServiceOptions,
  ReviewerRecoverySummary,
} from './runtime/broker-service.js';
import { createBrokerService } from './runtime/broker-service.js';
import type { ReviewerShutdownSummary } from './runtime/reviewer-manager.js';

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

export interface StartBrokerOptions extends CreateAppContextOptions, CreateBrokerServiceOptions {
  handleSignals?: boolean;
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

export interface StartedBrokerRuntime {
  context: AppContext;
  service: BrokerService;
  startedAt: string;
  close: () => void;
  waitUntilStopped: () => Promise<void>;
  getShutdownSnapshot: () => BrokerShutdownSnapshot | null;
  getStartupRecoverySnapshot: () => BrokerStartupRecoverySnapshot;
}

export function startBroker(options: StartBrokerOptions = {}): StartedBrokerRuntime {
  const context = createAppContext(options);
  const service = createBrokerService(context, options);
  const startupRecovery = reconcileStartupRecovery(context, options.now);
  const startedAt = options.now ? options.now() : new Date().toISOString();

  let closed = false;
  let shutdownSnapshot: BrokerShutdownSnapshot | null = null;
  let resolveStopped: (() => void) | undefined;
  let rejectStopped: ((error: unknown) => void) | undefined;
  const stopped = new Promise<void>((resolve, reject) => {
    resolveStopped = resolve;
    rejectStopped = reject;
  });

  const removeSignalHandlers = bindSignalHandlers(options.handleSignals ?? true, () => {
    close();
  });

  function close(): void {
    if (closed) {
      return;
    }

    closed = true;
    removeSignalHandlers();

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
    close,
    waitUntilStopped: () => stopped,
    getShutdownSnapshot: () => shutdownSnapshot,
    getStartupRecoverySnapshot: () => startupRecovery,
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

export function inspectBrokerRuntime(context: AppContext): BrokerRuntimeSnapshot {
  const readCount = (tableName: 'reviews' | 'messages' | 'audit_events' | 'schema_migrations'): number => {
    const row = context.db.prepare<unknown[], { count: number }>(`SELECT COUNT(*) as count FROM ${tableName}`).get();
    return row?.count ?? 0;
  };

  const statusCounts = Object.fromEntries(
    context.db
      .prepare<unknown[], { status: ReviewStatus; count: number }>(
        'SELECT status, COUNT(*) as count FROM reviews GROUP BY status ORDER BY status ASC',
      )
      .all()
      .map((row) => [row.status, row.count]),
  ) as Partial<Record<ReviewStatus, number>>;

  const counterPatchStatusCounts = Object.fromEntries(
    context.db
      .prepare<unknown[], { counter_patch_status: CounterPatchStatus; count: number }>(
        'SELECT counter_patch_status, COUNT(*) as count FROM reviews GROUP BY counter_patch_status ORDER BY counter_patch_status ASC',
      )
      .all()
      .map((row) => [row.counter_patch_status, row.count]),
  ) as Partial<Record<CounterPatchStatus, number>>;

  const reviewers = context.reviewers.list();
  const reviewerStatusCounts = reviewers.reduce<Partial<Record<ReviewerStatus, number>>>(
    (counts, reviewer) => ({
      ...counts,
      [reviewer.status]: (counts[reviewer.status] ?? 0) + 1,
    }),
    {},
  );
  const trackedReviewerCount = context.reviewerManager.inspect().trackedReviewerIds.length;
  const latestReviewer = reviewers[0] ?? null;

  const latestReview =
    context.db
      .prepare<
        unknown[],
        {
          review_id: string;
          status: ReviewStatus;
          current_round: number;
          latest_verdict: ReviewVerdict | null;
          verdict_reason: string | null;
          counter_patch_status: CounterPatchStatus;
          last_message_at: string | null;
          last_activity_at: string | null;
        }
      >(`
        SELECT
          review_id,
          status,
          current_round,
          latest_verdict,
          verdict_reason,
          counter_patch_status,
          last_message_at,
          last_activity_at
        FROM reviews
        ORDER BY updated_at DESC, review_id DESC
        LIMIT 1
      `)
      .get() ?? null;

  const latestMessage =
    context.db
      .prepare<
        unknown[],
        {
          review_id: string;
          author_id: string;
          author_role: ReviewMessageAuthorRole;
          created_at: string;
        }
      >(`
        SELECT
          review_id,
          author_id,
          author_role,
          created_at
        FROM messages
        ORDER BY created_at DESC, message_id DESC
        LIMIT 1
      `)
      .get() ?? null;

  const latestAuditEventRow =
    context.db
      .prepare<
        unknown[],
        {
          review_id: string | null;
          event_type: AuditEventType;
          error_code: string | null;
          metadata_json: string;
          created_at: string;
        }
      >(`
        SELECT
          review_id,
          event_type,
          error_code,
          metadata_json,
          created_at
        FROM audit_events
        ORDER BY created_at DESC, audit_event_id DESC
        LIMIT 1
      `)
      .get() ?? null;

  const latestAuditMetadata = latestAuditEventRow ? parseMetadata(latestAuditEventRow.metadata_json) : null;

  return {
    reviewCount: readCount('reviews'),
    reviewerCount: reviewers.length,
    trackedReviewerCount,
    reviewerStatusCounts,
    messageCount: readCount('messages'),
    auditEventCount: readCount('audit_events'),
    migrationCount: readCount('schema_migrations'),
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
