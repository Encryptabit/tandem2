export const REVIEW_STATUSES = [
  'pending',
  'claimed',
  'submitted',
  'changes_requested',
  'approved',
  'closed',
] as const;

export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const LEGACY_IN_REVIEW_STATUS = 'submitted' as const;

export const REVIEW_TRANSITION_EVENTS = [
  'claim',
  'reclaim',
  'submit',
  'request_changes',
  'approve',
  'close',
] as const;

export type ReviewTransitionEvent = (typeof REVIEW_TRANSITION_EVENTS)[number];

export const REVIEW_VERDICTS = ['changes_requested', 'approved'] as const;

export type ReviewVerdict = (typeof REVIEW_VERDICTS)[number];

export const COUNTER_PATCH_STATUSES = ['none', 'pending', 'accepted', 'rejected'] as const;

export type CounterPatchStatus = (typeof COUNTER_PATCH_STATUSES)[number];

export const REVIEW_MESSAGE_AUTHOR_ROLES = ['proposer', 'reviewer', 'system'] as const;

export type ReviewMessageAuthorRole = (typeof REVIEW_MESSAGE_AUTHOR_ROLES)[number];

export const REVIEW_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;

export type ReviewPriority = (typeof REVIEW_PRIORITIES)[number];

export const REVIEWER_STATUSES = ['idle', 'assigned', 'draining', 'offline'] as const;

export type ReviewerStatus = (typeof REVIEWER_STATUSES)[number];

export const REVIEWER_OFFLINE_REASONS = ['spawn_failed', 'reviewer_exit', 'operator_kill', 'startup_recovery', 'idle_timeout', 'ttl_expired', 'pool_drain'] as const;

export type ReviewerOfflineReason = (typeof REVIEWER_OFFLINE_REASONS)[number];

export const REVIEW_RECLAIM_CAUSES = ['reviewer_exit', 'operator_kill', 'startup_recovery', 'idle_timeout', 'ttl_expired', 'pool_drain'] as const;

export type ReviewReclaimCause = (typeof REVIEW_RECLAIM_CAUSES)[number];

export const REVIEWER_AUDIT_EVENT_TYPES = [
  'reviewer.spawned',
  'reviewer.spawn_failed',
  'reviewer.killed',
  'reviewer.offline',
] as const;

export type ReviewerAuditEventType = (typeof REVIEWER_AUDIT_EVENT_TYPES)[number];

export const POOL_AUDIT_EVENT_TYPES = [
  'pool.scale_up',
  'pool.scale_paused',
  'pool.drain_initiated',
  'pool.drain_completed',
  'pool.dead_process_reaped',
  'pool.claim_timeout',
  'pool.stale_session_terminated',
] as const;

export type PoolAuditEventType = (typeof POOL_AUDIT_EVENT_TYPES)[number];

export const AUDIT_EVENT_TYPES = [
  'review.created',
  'review.claimed',
  'review.reclaimed',
  'review.submitted',
  'review.changes_requested',
  'review.approved',
  'review.requeued',
  'review.closed',
  'review.message_added',
  'review.counter_patch_accepted',
  'review.counter_patch_rejected',
  'review.transition_rejected',
  'review.diff_rejected',
  ...REVIEWER_AUDIT_EVENT_TYPES,
  ...POOL_AUDIT_EVENT_TYPES,
] as const;

export type AuditEventType = (typeof AUDIT_EVENT_TYPES)[number];

export const NOTIFICATION_TOPICS = ['reviews', 'review-status', 'review-queue', 'reviewer-state'] as const;

export type NotificationTopic = (typeof NOTIFICATION_TOPICS)[number];

export interface ReviewLifecycleSnapshot {
  currentRound: number;
  latestVerdict: ReviewVerdict | null;
  verdictReason: string | null;
  counterPatchStatus: CounterPatchStatus;
  lastMessageAt: string | null;
  lastActivityAt: string | null;
}

export interface ReviewSummary extends ReviewLifecycleSnapshot {
  reviewId: string;
  title: string;
  status: ReviewStatus;
  priority: ReviewPriority;
  authorId: string;
  createdAt: string;
  updatedAt: string;
  claimedBy: string | null;
  claimedAt: string | null;
  claimGeneration: number;
}

export interface ReviewProposal extends ReviewLifecycleSnapshot {
  reviewId: string;
  title: string;
  description: string;
  diff: string;
  affectedFiles: string[];
  priority: ReviewPriority;
}

export interface ReviewRecord extends ReviewSummary {
  description: string;
  diff: string;
  affectedFiles: string[];
}

export interface ReviewDiscussionMessage {
  messageId: number;
  reviewId: string;
  actorId: string;
  authorRole: ReviewMessageAuthorRole;
  body: string;
  createdAt: string;
}

export interface ReviewActivityEntry {
  auditEventId: number;
  reviewId: string;
  eventType: AuditEventType;
  actorId: string | null;
  statusFrom: ReviewStatus | null;
  statusTo: ReviewStatus | null;
  errorCode: string | null;
  summary: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface ReviewerRecord {
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
  sessionToken: string | null;
  drainingAt: string | null;
  createdAt: string;
  updatedAt: string;
}
