import { z } from 'zod';

import {
  ActorIdSchema,
  AuditEventTypeSchema,
  ClaimGenerationSchema,
  CounterPatchStatusSchema,
  CurrentRoundSchema,
  IsoDateTimeSchema,
  ReviewDiscussionMessageSchema,
  ReviewIdSchema,
  ReviewPrioritySchema,
  ReviewStatusSchema,
  ReviewVerdictSchema,
  ReviewerOfflineReasonSchema,
  ReviewerStatusSchema,
  VerdictReasonSchema,
  VersionSchema,
} from './contracts.js';

import { NOTIFICATION_TOPICS, type NotificationTopic } from './domain.js';

// ---------------------------------------------------------------------------
// Overview snapshot — the authoritative truth surface for the dashboard.
// The browser fetches this from the broker-owned /api/overview route.
// ---------------------------------------------------------------------------

export const OverviewReviewCountsSchema = z
  .object({
    total: z.number().int().nonnegative(),
    pending: z.number().int().nonnegative(),
    claimed: z.number().int().nonnegative(),
    submitted: z.number().int().nonnegative(),
    changesRequested: z.number().int().nonnegative(),
    approved: z.number().int().nonnegative(),
    closed: z.number().int().nonnegative(),
  })
  .strict();

export const OverviewReviewerCountsSchema = z
  .object({
    total: z.number().int().nonnegative(),
    idle: z.number().int().nonnegative(),
    assigned: z.number().int().nonnegative(),
    offline: z.number().int().nonnegative(),
    tracked: z.number().int().nonnegative(),
  })
  .strict();

export const OverviewLatestReviewSchema = z
  .object({
    reviewId: z.string().min(1),
    status: ReviewStatusSchema,
    currentRound: z.number().int().positive(),
    lastActivityAt: IsoDateTimeSchema.nullable(),
  })
  .strict();

export const OverviewLatestReviewerSchema = z
  .object({
    reviewerId: z.string().min(1),
    status: ReviewerStatusSchema,
    currentReviewId: z.string().min(1).nullable(),
    commandBasename: z.string().min(1),
    offlineReason: ReviewerOfflineReasonSchema.nullable(),
    updatedAt: IsoDateTimeSchema,
  })
  .strict();

export const OverviewLatestAuditSchema = z
  .object({
    eventType: z.string().min(1),
    summary: z.string().nullable(),
    createdAt: IsoDateTimeSchema,
  })
  .strict();

export const StartupRecoveryOverviewSchema = z
  .object({
    completedAt: IsoDateTimeSchema,
    recoveredReviewerCount: z.number().int().nonnegative(),
    reclaimedReviewCount: z.number().int().nonnegative(),
    staleReviewCount: z.number().int().nonnegative(),
    unrecoverableReviewCount: z.number().int().nonnegative(),
  })
  .strict();

export const OverviewSnapshotSchema = z
  .object({
    snapshotVersion: z.number().int().nonnegative(),
    generatedAt: IsoDateTimeSchema,
    reviews: OverviewReviewCountsSchema,
    reviewers: OverviewReviewerCountsSchema,
    latestReview: OverviewLatestReviewSchema.nullable(),
    latestReviewer: OverviewLatestReviewerSchema.nullable(),
    latestAudit: OverviewLatestAuditSchema.nullable(),
    startupRecovery: StartupRecoveryOverviewSchema,
  })
  .strict();

// ---------------------------------------------------------------------------
// SSE event payload — a lightweight change notification, NOT durable truth.
// The browser uses this only to decide "I should re-fetch the snapshot."
// ---------------------------------------------------------------------------

export const SSE_EVENT_TYPES = ['change', 'heartbeat'] as const;
export type SSEEventType = (typeof SSE_EVENT_TYPES)[number];

export const SSEChangePayloadSchema = z
  .object({
    type: z.literal('change'),
    topic: z.string().min(1),
    version: VersionSchema,
  })
  .strict();

export const SSEHeartbeatPayloadSchema = z
  .object({
    type: z.literal('heartbeat'),
    serverTime: IsoDateTimeSchema,
  })
  .strict();

export const SSEEventPayloadSchema = z.discriminatedUnion('type', [
  SSEChangePayloadSchema,
  SSEHeartbeatPayloadSchema,
]);

// ---------------------------------------------------------------------------
// Operator event feed — redaction-safe global event listing for the dashboard.
// The browser fetches this from the broker-owned /api/events/feed route.
// Only explicitly safe fields are projected — no raw metadata blobs.
// ---------------------------------------------------------------------------

export const OperatorEventEntrySchema = z
  .object({
    auditEventId: z.number().int().positive(),
    reviewId: z.string().min(1).nullable(),
    eventType: AuditEventTypeSchema,
    actorId: z.string().min(1).nullable(),
    statusFrom: ReviewStatusSchema.nullable(),
    statusTo: ReviewStatusSchema.nullable(),
    errorCode: z.string().min(1).nullable(),
    summary: z.string().nullable(),
    createdAt: IsoDateTimeSchema,
  })
  .strict();

export const EventFeedResponseSchema = z
  .object({
    events: z.array(OperatorEventEntrySchema),
    hasMore: z.boolean(),
  })
  .strict();

// ---------------------------------------------------------------------------
// Review list — dashboard transport contract for the review browser list view.
// ---------------------------------------------------------------------------

export const DashboardReviewListItemSchema = z
  .object({
    reviewId: ReviewIdSchema,
    title: z.string().min(1),
    status: ReviewStatusSchema,
    priority: ReviewPrioritySchema,
    authorId: ActorIdSchema,
    createdAt: IsoDateTimeSchema,
    updatedAt: IsoDateTimeSchema,
    claimedBy: ActorIdSchema.nullable(),
    claimedAt: IsoDateTimeSchema.nullable(),
    claimGeneration: ClaimGenerationSchema,
    currentRound: CurrentRoundSchema,
    latestVerdict: ReviewVerdictSchema.nullable(),
    verdictReason: VerdictReasonSchema.nullable(),
    counterPatchStatus: CounterPatchStatusSchema,
    lastMessageAt: IsoDateTimeSchema.nullable(),
    lastActivityAt: IsoDateTimeSchema.nullable(),
  })
  .strict();

export const ReviewListResponseSchema = z
  .object({
    reviews: z.array(DashboardReviewListItemSchema),
    hasMore: z.boolean(),
  })
  .strict();

// ---------------------------------------------------------------------------
// Review activity — redaction-safe activity entry for the review detail view.
// No `metadata` field — that's the redaction. Only the human-authored
// `summary` string is carried forward.
// ---------------------------------------------------------------------------

export const DashboardReviewActivityEntrySchema = z
  .object({
    auditEventId: z.number().int().positive(),
    reviewId: z.string().min(1),
    eventType: AuditEventTypeSchema,
    actorId: z.string().min(1).nullable(),
    statusFrom: ReviewStatusSchema.nullable(),
    statusTo: ReviewStatusSchema.nullable(),
    errorCode: z.string().min(1).nullable(),
    summary: z.string().nullable(),
    createdAt: IsoDateTimeSchema,
  })
  .strict();

// ---------------------------------------------------------------------------
// Review detail — composite response for the review detail view.
// Bundles status, proposal, discussion, and redacted activity.
// ---------------------------------------------------------------------------

export const DashboardReviewProposalSchema = z
  .object({
    title: z.string().min(1),
    description: z.string().min(1),
    diff: z.string().min(1),
    affectedFiles: z.array(z.string().min(1)),
    priority: ReviewPrioritySchema,
  })
  .strict();

export const ReviewDetailResponseSchema = z
  .object({
    review: DashboardReviewListItemSchema,
    proposal: DashboardReviewProposalSchema,
    discussion: z.array(ReviewDiscussionMessageSchema),
    activity: z.array(DashboardReviewActivityEntrySchema),
  })
  .strict();

// ---------------------------------------------------------------------------
// Inferred types for use in server and dashboard code.
// ---------------------------------------------------------------------------

export type OverviewReviewCounts = z.infer<typeof OverviewReviewCountsSchema>;
export type OverviewReviewerCounts = z.infer<typeof OverviewReviewerCountsSchema>;
export type OverviewLatestReview = z.infer<typeof OverviewLatestReviewSchema>;
export type OverviewLatestReviewer = z.infer<typeof OverviewLatestReviewerSchema>;
export type OverviewLatestAudit = z.infer<typeof OverviewLatestAuditSchema>;
export type StartupRecoveryOverview = z.infer<typeof StartupRecoveryOverviewSchema>;
export type OverviewSnapshot = z.infer<typeof OverviewSnapshotSchema>;
export type SSEChangePayload = z.infer<typeof SSEChangePayloadSchema>;
export type SSEHeartbeatPayload = z.infer<typeof SSEHeartbeatPayloadSchema>;
export type SSEEventPayload = z.infer<typeof SSEEventPayloadSchema>;
export type OperatorEventEntry = z.infer<typeof OperatorEventEntrySchema>;
export type EventFeedResponse = z.infer<typeof EventFeedResponseSchema>;
export type DashboardReviewListItem = z.infer<typeof DashboardReviewListItemSchema>;
export type ReviewListResponse = z.infer<typeof ReviewListResponseSchema>;
export type DashboardReviewActivityEntry = z.infer<typeof DashboardReviewActivityEntrySchema>;
export type ReviewDetailResponse = z.infer<typeof ReviewDetailResponseSchema>;

// ---------------------------------------------------------------------------
// Dashboard notification topics — the subset of broker notification topics
// the SSE route may forward. The dashboard only uses these as re-sync
// triggers; they are not a second source of truth.
// ---------------------------------------------------------------------------

export const DASHBOARD_NOTIFICATION_TOPICS: readonly NotificationTopic[] = NOTIFICATION_TOPICS;
