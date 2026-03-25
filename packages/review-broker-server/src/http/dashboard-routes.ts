import path from 'node:path';

import type {
  OverviewSnapshot,
  OverviewReviewCounts,
  OverviewReviewerCounts,
  OverviewLatestReview,
  OverviewLatestReviewer,
  OverviewLatestAudit,
  StartupRecoveryOverview,
  SSEChangePayload,
  OperatorEventEntry,
  EventFeedResponse,
  DashboardReviewListItem,
  ReviewListResponse,
  DashboardReviewActivityEntry,
  ReviewDetailResponse,
} from 'review-broker-core';

import type { AppContext } from '../runtime/app-context.js';
import type {
  BrokerRuntimeSnapshot,
  BrokerStartupRecoverySnapshot,
} from '../index.js';
import { inspectBrokerRuntime } from '../index.js';
import type { BrokerService } from '../runtime/broker-service.js';
import type { AuditEventRecord } from '../db/audit-repository.js';

export interface DashboardRouteHandler {
  /** Return the current overview snapshot (broker-owned truth). */
  getOverviewSnapshot: () => OverviewSnapshot;
  /** Return a paginated, redaction-safe event feed. */
  getEventFeed: (options: { limit?: number; beforeId?: number; eventType?: string }) => EventFeedResponse;
  /** Return a paginated list of reviews projected for dashboard display. */
  getReviewList: (options: { status?: string; limit?: number }) => Promise<ReviewListResponse>;
  /** Return composite review detail: status + proposal + discussion + redacted activity. */
  getReviewDetail: (reviewId: string) => Promise<ReviewDetailResponse>;
  /** Register a broadcast callback for SSE push. */
  onBroadcast: (callback: (event: string, data: string) => void) => void;
  /** Stop listening for broker notifications. */
  dispose: () => void;
}

export interface DashboardRouteDependencies {
  context: AppContext;
  service: BrokerService;
  startupRecoverySnapshot: BrokerStartupRecoverySnapshot;
  now?: () => string;
}

/**
 * Create the broker-owned route handler that projects runtime state
 * into the dashboard overview contract and forwards notification bus
 * changes as SSE events.
 *
 * The overview snapshot is the authoritative truth surface.
 * SSE events are lightweight change notifications only — not durable state.
 */
export function createDashboardRoutes(deps: DashboardRouteDependencies): DashboardRouteHandler {
  const { context, service, startupRecoverySnapshot } = deps;
  const nowFactory = deps.now ?? (() => new Date().toISOString());

  let snapshotVersion = 0;
  let broadcastFn: ((event: string, data: string) => void) | null = null;

  // Subscribe to broker notification bus and forward as SSE change signals
  const unsubscribers: Array<() => void> = [];

  function startListening(): void {
    const topics = ['reviews', 'review-status', 'review-queue', 'reviewer-state'] as const;

    for (const topic of topics) {
      let lastVersion = context.notifications.currentVersion(topic);

      // Poll the notification bus for changes — the bus is synchronous and
      // runtime-local, so we use a lightweight interval instead of async waiters.
      const interval = setInterval(() => {
        const currentVersion = context.notifications.currentVersion(topic);
        if (currentVersion > lastVersion) {
          lastVersion = currentVersion;
          snapshotVersion += 1;

          if (broadcastFn) {
            const payload: SSEChangePayload = {
              type: 'change',
              topic,
              version: currentVersion,
            };
            broadcastFn('change', JSON.stringify(payload));
          }
        }
      }, 250);

      unsubscribers.push(() => clearInterval(interval));
    }
  }

  startListening();

  function getOverviewSnapshot(): OverviewSnapshot {
    const runtime = inspectBrokerRuntime(context);
    const reviews = projectReviewCounts(runtime);
    const reviewers = projectReviewerCounts(runtime);
    const latestReview = projectLatestReview(runtime);
    const latestReviewer = projectLatestReviewer(runtime);
    const latestAudit = projectLatestAudit(runtime);
    const startupRecovery = projectStartupRecovery(startupRecoverySnapshot);

    return {
      snapshotVersion,
      generatedAt: nowFactory(),
      reviews,
      reviewers,
      latestReview,
      latestReviewer,
      latestAudit,
      startupRecovery,
    };
  }

  function getEventFeed(options: { limit?: number; beforeId?: number; eventType?: string }): EventFeedResponse {
    const requestLimit = Math.min(Math.max(options.limit ?? 50, 1), 200);
    // Request one extra row to determine hasMore
    const records = context.audit.listGlobal({
      limit: requestLimit + 1,
      beforeId: options.beforeId,
      eventType: options.eventType,
    });

    const hasMore = records.length > requestLimit;
    const pageRecords = hasMore ? records.slice(0, requestLimit) : records;
    const events = pageRecords.map(projectOperatorEvent);

    return { events, hasMore };
  }

  async function getReviewList(options: { status?: string; limit?: number }): Promise<ReviewListResponse> {
    const requestLimit = Math.min(Math.max(options.limit ?? 50, 1), 100);
    const response = await service.listReviews({
      status: options.status as Parameters<typeof service.listReviews>[0]['status'],
      limit: requestLimit + 1,
    });

    const hasMore = response.reviews.length > requestLimit;
    const pageReviews = hasMore ? response.reviews.slice(0, requestLimit) : response.reviews;
    const reviews = pageReviews.map(projectDashboardReviewListItem);

    return { reviews, hasMore };
  }

  async function getReviewDetail(reviewId: string): Promise<ReviewDetailResponse> {
    const [statusRes, proposalRes, discussionRes, activityRes] = await Promise.all([
      service.getReviewStatus({ reviewId }),
      service.getProposal({ reviewId }),
      service.getDiscussion({ reviewId }),
      service.getActivityFeed({ reviewId }),
    ]);

    const review = projectDashboardReviewListItem(statusRes.review);

    const proposal = {
      title: proposalRes.proposal.title,
      description: proposalRes.proposal.description,
      diff: proposalRes.proposal.diff,
      affectedFiles: proposalRes.proposal.affectedFiles,
      priority: proposalRes.proposal.priority,
    };

    const discussion = discussionRes.messages;
    const activity = activityRes.activity.map(projectDashboardActivityEntry);

    return { review, proposal, discussion, activity };
  }

  return {
    getOverviewSnapshot,
    getEventFeed,
    getReviewList,
    getReviewDetail,
    onBroadcast: (callback) => {
      broadcastFn = callback;
    },
    dispose: () => {
      for (const unsub of unsubscribers) {
        unsub();
      }
      unsubscribers.length = 0;
      broadcastFn = null;
    },
  };
}

// ---------------------------------------------------------------------------
// Projection helpers — map internal runtime snapshots to the dashboard
// transport contract, applying redaction where needed.
// ---------------------------------------------------------------------------

function projectReviewCounts(runtime: BrokerRuntimeSnapshot): OverviewReviewCounts {
  const s = runtime.statusCounts;
  return {
    total: runtime.reviewCount,
    pending: s.pending ?? 0,
    claimed: s.claimed ?? 0,
    submitted: s.submitted ?? 0,
    changesRequested: s.changes_requested ?? 0,
    approved: s.approved ?? 0,
    closed: s.closed ?? 0,
  };
}

function projectReviewerCounts(runtime: BrokerRuntimeSnapshot): OverviewReviewerCounts {
  const s = runtime.reviewerStatusCounts;
  return {
    total: runtime.reviewerCount,
    idle: s.idle ?? 0,
    assigned: s.assigned ?? 0,
    offline: s.offline ?? 0,
    tracked: runtime.trackedReviewerCount,
  };
}

function projectLatestReview(runtime: BrokerRuntimeSnapshot): OverviewLatestReview | null {
  if (!runtime.latestReview) return null;
  return {
    reviewId: runtime.latestReview.reviewId,
    status: runtime.latestReview.status,
    currentRound: runtime.latestReview.currentRound,
    lastActivityAt: runtime.latestReview.lastActivityAt,
  };
}

function projectLatestReviewer(runtime: BrokerRuntimeSnapshot): OverviewLatestReviewer | null {
  if (!runtime.latestReviewer) return null;
  return {
    reviewerId: runtime.latestReviewer.reviewerId,
    status: runtime.latestReviewer.status,
    currentReviewId: runtime.latestReviewer.currentReviewId,
    // Redact: only expose the basename of the command, not full path or args
    commandBasename: path.basename(runtime.latestReviewer.command),
    offlineReason: runtime.latestReviewer.offlineReason,
    updatedAt: runtime.latestReviewer.updatedAt,
  };
}

function projectLatestAudit(runtime: BrokerRuntimeSnapshot): OverviewLatestAudit | null {
  if (!runtime.latestAuditEvent) return null;
  return {
    eventType: runtime.latestAuditEvent.eventType,
    summary: runtime.latestAuditEvent.summary,
    createdAt: runtime.latestAuditEvent.createdAt,
  };
}

function projectStartupRecovery(snapshot: BrokerStartupRecoverySnapshot): StartupRecoveryOverview {
  return {
    completedAt: snapshot.completedAt,
    recoveredReviewerCount: snapshot.recoveredReviewerIds.length,
    reclaimedReviewCount: snapshot.reclaimedReviewIds.length,
    staleReviewCount: snapshot.staleReviewIds.length,
    unrecoverableReviewCount: snapshot.unrecoverableReviewIds.length,
  };
}

/**
 * Redaction-safe projection: strips raw metadata and surfaces only
 * explicitly safe fields. The `summary` string from metadata (human-authored
 * in every `audit.append` call) is the only metadata value carried forward.
 * Fields like `command`, `args`, `cwd`, `workspaceRoot` never appear.
 */
function projectOperatorEvent(record: AuditEventRecord): OperatorEventEntry {
  const summary =
    typeof record.metadata?.summary === 'string' && record.metadata.summary.trim().length > 0
      ? record.metadata.summary
      : null;

  return {
    auditEventId: record.auditEventId,
    reviewId: record.reviewId,
    eventType: record.eventType,
    actorId: record.actorId,
    statusFrom: record.statusFrom,
    statusTo: record.statusTo,
    errorCode: record.errorCode,
    summary,
    createdAt: record.createdAt,
  };
}

// ---------------------------------------------------------------------------
// Review browser projection helpers
// ---------------------------------------------------------------------------

/**
 * 1:1 mapping from ReviewSummary to DashboardReviewListItem — all fields
 * are already safe for dashboard display. No redaction needed.
 */
function projectDashboardReviewListItem(review: {
  reviewId: string;
  title: string;
  status: string;
  priority: string;
  authorId: string;
  createdAt: string;
  updatedAt: string;
  claimedBy: string | null;
  claimedAt: string | null;
  claimGeneration: number;
  currentRound: number;
  latestVerdict: string | null;
  verdictReason: string | null;
  counterPatchStatus: string;
  lastMessageAt: string | null;
  lastActivityAt: string | null;
}): DashboardReviewListItem {
  return {
    reviewId: review.reviewId,
    title: review.title,
    status: review.status as DashboardReviewListItem['status'],
    priority: review.priority as DashboardReviewListItem['priority'],
    authorId: review.authorId,
    createdAt: review.createdAt,
    updatedAt: review.updatedAt,
    claimedBy: review.claimedBy,
    claimedAt: review.claimedAt,
    claimGeneration: review.claimGeneration,
    currentRound: review.currentRound,
    latestVerdict: review.latestVerdict as DashboardReviewListItem['latestVerdict'],
    verdictReason: review.verdictReason,
    counterPatchStatus: review.counterPatchStatus as DashboardReviewListItem['counterPatchStatus'],
    lastMessageAt: review.lastMessageAt,
    lastActivityAt: review.lastActivityAt,
  };
}

/**
 * Redaction-safe projection for review activity entries:
 * strips the raw `metadata` blob and extracts only the `summary` string.
 * Same redaction pattern as `projectOperatorEvent`.
 */
function projectDashboardActivityEntry(entry: {
  auditEventId: number;
  reviewId: string;
  eventType: string;
  actorId: string | null;
  statusFrom: string | null;
  statusTo: string | null;
  errorCode: string | null;
  summary: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}): DashboardReviewActivityEntry {
  return {
    auditEventId: entry.auditEventId,
    reviewId: entry.reviewId,
    eventType: entry.eventType as DashboardReviewActivityEntry['eventType'],
    actorId: entry.actorId,
    statusFrom: entry.statusFrom as DashboardReviewActivityEntry['statusFrom'],
    statusTo: entry.statusTo as DashboardReviewActivityEntry['statusTo'],
    errorCode: entry.errorCode,
    summary: entry.summary,
    createdAt: entry.createdAt,
  };
}
