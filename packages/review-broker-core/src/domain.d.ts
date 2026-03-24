export declare const REVIEW_STATUSES: readonly ["pending", "claimed", "submitted", "changes_requested", "approved", "closed"];
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];
export declare const LEGACY_IN_REVIEW_STATUS: "submitted";
export declare const REVIEW_TRANSITION_EVENTS: readonly ["claim", "reclaim", "submit", "request_changes", "approve", "close"];
export type ReviewTransitionEvent = (typeof REVIEW_TRANSITION_EVENTS)[number];
export declare const REVIEW_VERDICTS: readonly ["changes_requested", "approved"];
export type ReviewVerdict = (typeof REVIEW_VERDICTS)[number];
export declare const COUNTER_PATCH_STATUSES: readonly ["none", "pending", "accepted", "rejected"];
export type CounterPatchStatus = (typeof COUNTER_PATCH_STATUSES)[number];
export declare const REVIEW_MESSAGE_AUTHOR_ROLES: readonly ["proposer", "reviewer", "system"];
export type ReviewMessageAuthorRole = (typeof REVIEW_MESSAGE_AUTHOR_ROLES)[number];
export declare const REVIEW_PRIORITIES: readonly ["low", "normal", "high", "urgent"];
export type ReviewPriority = (typeof REVIEW_PRIORITIES)[number];
export declare const REVIEWER_STATUSES: readonly ["idle", "assigned", "offline"];
export type ReviewerStatus = (typeof REVIEWER_STATUSES)[number];
export declare const REVIEWER_OFFLINE_REASONS: readonly ["spawn_failed", "reviewer_exit", "operator_kill", "startup_recovery"];
export type ReviewerOfflineReason = (typeof REVIEWER_OFFLINE_REASONS)[number];
export declare const REVIEW_RECLAIM_CAUSES: readonly ["reviewer_exit", "operator_kill", "startup_recovery"];
export type ReviewReclaimCause = (typeof REVIEW_RECLAIM_CAUSES)[number];
export declare const REVIEWER_AUDIT_EVENT_TYPES: readonly ["reviewer.spawned", "reviewer.spawn_failed", "reviewer.killed", "reviewer.offline"];
export type ReviewerAuditEventType = (typeof REVIEWER_AUDIT_EVENT_TYPES)[number];
export declare const AUDIT_EVENT_TYPES: readonly ["review.created", "review.claimed", "review.reclaimed", "review.submitted", "review.changes_requested", "review.approved", "review.requeued", "review.closed", "review.message_added", "review.counter_patch_accepted", "review.counter_patch_rejected", "review.transition_rejected", "review.diff_rejected", "reviewer.spawned", "reviewer.spawn_failed", "reviewer.killed", "reviewer.offline"];
export type AuditEventType = (typeof AUDIT_EVENT_TYPES)[number];
export declare const NOTIFICATION_TOPICS: readonly ["reviews", "review-status", "review-queue", "reviewer-state"];
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
    createdAt: string;
    updatedAt: string;
}
//# sourceMappingURL=domain.d.ts.map