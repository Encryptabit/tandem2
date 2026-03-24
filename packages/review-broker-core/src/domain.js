export const REVIEW_STATUSES = [
    'pending',
    'claimed',
    'submitted',
    'changes_requested',
    'approved',
    'closed',
];
export const LEGACY_IN_REVIEW_STATUS = 'submitted';
export const REVIEW_TRANSITION_EVENTS = [
    'claim',
    'reclaim',
    'submit',
    'request_changes',
    'approve',
    'close',
];
export const REVIEW_VERDICTS = ['changes_requested', 'approved'];
export const COUNTER_PATCH_STATUSES = ['none', 'pending', 'accepted', 'rejected'];
export const REVIEW_MESSAGE_AUTHOR_ROLES = ['proposer', 'reviewer', 'system'];
export const REVIEW_PRIORITIES = ['low', 'normal', 'high', 'urgent'];
export const REVIEWER_STATUSES = ['idle', 'assigned', 'offline'];
export const REVIEWER_OFFLINE_REASONS = ['spawn_failed', 'reviewer_exit', 'operator_kill', 'startup_recovery'];
export const REVIEW_RECLAIM_CAUSES = ['reviewer_exit', 'operator_kill', 'startup_recovery'];
export const REVIEWER_AUDIT_EVENT_TYPES = [
    'reviewer.spawned',
    'reviewer.spawn_failed',
    'reviewer.killed',
    'reviewer.offline',
];
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
];
export const NOTIFICATION_TOPICS = ['reviews', 'review-status', 'review-queue', 'reviewer-state'];
