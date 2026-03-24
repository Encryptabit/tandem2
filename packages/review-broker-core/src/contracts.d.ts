import { z } from 'zod';
export declare const ReviewStatusSchema: z.ZodEnum<["pending", "claimed", "submitted", "changes_requested", "approved", "closed"]>;
export declare const ReviewPrioritySchema: z.ZodEnum<["low", "normal", "high", "urgent"]>;
export declare const ReviewerStatusSchema: z.ZodEnum<["idle", "assigned", "offline"]>;
export declare const ReviewerOfflineReasonSchema: z.ZodEnum<["spawn_failed", "reviewer_exit", "operator_kill", "startup_recovery"]>;
export declare const ReviewReclaimCauseSchema: z.ZodEnum<["reviewer_exit", "operator_kill", "startup_recovery"]>;
export declare const ReviewVerdictSchema: z.ZodEnum<["changes_requested", "approved"]>;
export declare const CounterPatchStatusSchema: z.ZodEnum<["none", "pending", "accepted", "rejected"]>;
export declare const ReviewMessageAuthorRoleSchema: z.ZodEnum<["proposer", "reviewer", "system"]>;
export declare const AuditEventTypeSchema: z.ZodEnum<["review.created", "review.claimed", "review.reclaimed", "review.submitted", "review.changes_requested", "review.approved", "review.requeued", "review.closed", "review.message_added", "review.counter_patch_accepted", "review.counter_patch_rejected", "review.transition_rejected", "review.diff_rejected", "reviewer.spawned", "reviewer.spawn_failed", "reviewer.killed", "reviewer.offline"]>;
export declare const NotificationTopicSchema: z.ZodEnum<["reviews", "review-status", "review-queue", "reviewer-state"]>;
export declare const ReviewIdSchema: z.ZodString;
export declare const ReviewerIdSchema: z.ZodString;
export declare const ActorIdSchema: z.ZodString;
export declare const IsoDateTimeSchema: z.ZodString;
export declare const VersionSchema: z.ZodNumber;
export declare const ClaimGenerationSchema: z.ZodNumber;
export declare const CurrentRoundSchema: z.ZodNumber;
export declare const MessageIdSchema: z.ZodNumber;
export declare const AuditEventIdSchema: z.ZodNumber;
export declare const VerdictReasonSchema: z.ZodString;
export declare const MessageBodySchema: z.ZodString;
export declare const ReviewerCommandSchema: z.ZodString;
export declare const ReviewerArgsSchema: z.ZodArray<z.ZodString, "many">;
export declare const OptionalDecisionNoteSchema: z.ZodOptional<z.ZodString>;
export declare const WaitOptionsSchema: z.ZodObject<{
    wait: z.ZodOptional<z.ZodBoolean>;
    sinceVersion: z.ZodOptional<z.ZodNumber>;
    timeoutMs: z.ZodOptional<z.ZodNumber>;
}, "strict", z.ZodTypeAny, {
    wait?: boolean | undefined;
    sinceVersion?: number | undefined;
    timeoutMs?: number | undefined;
}, {
    wait?: boolean | undefined;
    sinceVersion?: number | undefined;
    timeoutMs?: number | undefined;
}>;
export declare const AffectedFilesSchema: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
export declare const ReviewLifecycleSnapshotSchema: z.ZodObject<{
    currentRound: z.ZodNumber;
    latestVerdict: z.ZodNullable<z.ZodEnum<["changes_requested", "approved"]>>;
    verdictReason: z.ZodNullable<z.ZodString>;
    counterPatchStatus: z.ZodEnum<["none", "pending", "accepted", "rejected"]>;
    lastMessageAt: z.ZodNullable<z.ZodString>;
    lastActivityAt: z.ZodNullable<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    currentRound: number;
    latestVerdict: "changes_requested" | "approved" | null;
    verdictReason: string | null;
    counterPatchStatus: "pending" | "none" | "accepted" | "rejected";
    lastMessageAt: string | null;
    lastActivityAt: string | null;
}, {
    currentRound: number;
    latestVerdict: "changes_requested" | "approved" | null;
    verdictReason: string | null;
    counterPatchStatus: "pending" | "none" | "accepted" | "rejected";
    lastMessageAt: string | null;
    lastActivityAt: string | null;
}>;
export declare const ReviewSummarySchema: z.ZodObject<{
    reviewId: z.ZodString;
    title: z.ZodString;
    status: z.ZodEnum<["pending", "claimed", "submitted", "changes_requested", "approved", "closed"]>;
    priority: z.ZodEnum<["low", "normal", "high", "urgent"]>;
    authorId: z.ZodString;
    createdAt: z.ZodString;
    updatedAt: z.ZodString;
    claimedBy: z.ZodNullable<z.ZodString>;
    claimedAt: z.ZodNullable<z.ZodString>;
    claimGeneration: z.ZodNumber;
} & {
    currentRound: z.ZodNumber;
    latestVerdict: z.ZodNullable<z.ZodEnum<["changes_requested", "approved"]>>;
    verdictReason: z.ZodNullable<z.ZodString>;
    counterPatchStatus: z.ZodEnum<["none", "pending", "accepted", "rejected"]>;
    lastMessageAt: z.ZodNullable<z.ZodString>;
    lastActivityAt: z.ZodNullable<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    status: "pending" | "claimed" | "submitted" | "changes_requested" | "approved" | "closed";
    currentRound: number;
    latestVerdict: "changes_requested" | "approved" | null;
    verdictReason: string | null;
    counterPatchStatus: "pending" | "none" | "accepted" | "rejected";
    lastMessageAt: string | null;
    lastActivityAt: string | null;
    reviewId: string;
    title: string;
    priority: "low" | "normal" | "high" | "urgent";
    authorId: string;
    createdAt: string;
    updatedAt: string;
    claimedBy: string | null;
    claimedAt: string | null;
    claimGeneration: number;
}, {
    status: "pending" | "claimed" | "submitted" | "changes_requested" | "approved" | "closed";
    currentRound: number;
    latestVerdict: "changes_requested" | "approved" | null;
    verdictReason: string | null;
    counterPatchStatus: "pending" | "none" | "accepted" | "rejected";
    lastMessageAt: string | null;
    lastActivityAt: string | null;
    reviewId: string;
    title: string;
    priority: "low" | "normal" | "high" | "urgent";
    authorId: string;
    createdAt: string;
    updatedAt: string;
    claimedBy: string | null;
    claimedAt: string | null;
    claimGeneration: number;
}>;
export declare const ReviewProposalSchema: z.ZodObject<{
    reviewId: z.ZodString;
    title: z.ZodString;
    description: z.ZodString;
    diff: z.ZodString;
    affectedFiles: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    priority: z.ZodEnum<["low", "normal", "high", "urgent"]>;
} & {
    currentRound: z.ZodNumber;
    latestVerdict: z.ZodNullable<z.ZodEnum<["changes_requested", "approved"]>>;
    verdictReason: z.ZodNullable<z.ZodString>;
    counterPatchStatus: z.ZodEnum<["none", "pending", "accepted", "rejected"]>;
    lastMessageAt: z.ZodNullable<z.ZodString>;
    lastActivityAt: z.ZodNullable<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    currentRound: number;
    latestVerdict: "changes_requested" | "approved" | null;
    verdictReason: string | null;
    counterPatchStatus: "pending" | "none" | "accepted" | "rejected";
    lastMessageAt: string | null;
    lastActivityAt: string | null;
    reviewId: string;
    title: string;
    priority: "low" | "normal" | "high" | "urgent";
    description: string;
    diff: string;
    affectedFiles: string[];
}, {
    currentRound: number;
    latestVerdict: "changes_requested" | "approved" | null;
    verdictReason: string | null;
    counterPatchStatus: "pending" | "none" | "accepted" | "rejected";
    lastMessageAt: string | null;
    lastActivityAt: string | null;
    reviewId: string;
    title: string;
    priority: "low" | "normal" | "high" | "urgent";
    description: string;
    diff: string;
    affectedFiles?: string[] | undefined;
}>;
export declare const ReviewRecordSchema: z.ZodObject<{
    reviewId: z.ZodString;
    title: z.ZodString;
    status: z.ZodEnum<["pending", "claimed", "submitted", "changes_requested", "approved", "closed"]>;
    priority: z.ZodEnum<["low", "normal", "high", "urgent"]>;
    authorId: z.ZodString;
    createdAt: z.ZodString;
    updatedAt: z.ZodString;
    claimedBy: z.ZodNullable<z.ZodString>;
    claimedAt: z.ZodNullable<z.ZodString>;
    claimGeneration: z.ZodNumber;
} & {
    currentRound: z.ZodNumber;
    latestVerdict: z.ZodNullable<z.ZodEnum<["changes_requested", "approved"]>>;
    verdictReason: z.ZodNullable<z.ZodString>;
    counterPatchStatus: z.ZodEnum<["none", "pending", "accepted", "rejected"]>;
    lastMessageAt: z.ZodNullable<z.ZodString>;
    lastActivityAt: z.ZodNullable<z.ZodString>;
} & {
    description: z.ZodString;
    diff: z.ZodString;
    affectedFiles: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
}, "strict", z.ZodTypeAny, {
    status: "pending" | "claimed" | "submitted" | "changes_requested" | "approved" | "closed";
    currentRound: number;
    latestVerdict: "changes_requested" | "approved" | null;
    verdictReason: string | null;
    counterPatchStatus: "pending" | "none" | "accepted" | "rejected";
    lastMessageAt: string | null;
    lastActivityAt: string | null;
    reviewId: string;
    title: string;
    priority: "low" | "normal" | "high" | "urgent";
    authorId: string;
    createdAt: string;
    updatedAt: string;
    claimedBy: string | null;
    claimedAt: string | null;
    claimGeneration: number;
    description: string;
    diff: string;
    affectedFiles: string[];
}, {
    status: "pending" | "claimed" | "submitted" | "changes_requested" | "approved" | "closed";
    currentRound: number;
    latestVerdict: "changes_requested" | "approved" | null;
    verdictReason: string | null;
    counterPatchStatus: "pending" | "none" | "accepted" | "rejected";
    lastMessageAt: string | null;
    lastActivityAt: string | null;
    reviewId: string;
    title: string;
    priority: "low" | "normal" | "high" | "urgent";
    authorId: string;
    createdAt: string;
    updatedAt: string;
    claimedBy: string | null;
    claimedAt: string | null;
    claimGeneration: number;
    description: string;
    diff: string;
    affectedFiles?: string[] | undefined;
}>;
export declare const ReviewDiscussionMessageSchema: z.ZodObject<{
    messageId: z.ZodNumber;
    reviewId: z.ZodString;
    actorId: z.ZodString;
    authorRole: z.ZodEnum<["proposer", "reviewer", "system"]>;
    body: z.ZodString;
    createdAt: z.ZodString;
}, "strict", z.ZodTypeAny, {
    reviewId: string;
    createdAt: string;
    messageId: number;
    actorId: string;
    authorRole: "proposer" | "reviewer" | "system";
    body: string;
}, {
    reviewId: string;
    createdAt: string;
    messageId: number;
    actorId: string;
    authorRole: "proposer" | "reviewer" | "system";
    body: string;
}>;
export declare const ReviewActivityEntrySchema: z.ZodObject<{
    auditEventId: z.ZodNumber;
    reviewId: z.ZodString;
    eventType: z.ZodEnum<["review.created", "review.claimed", "review.reclaimed", "review.submitted", "review.changes_requested", "review.approved", "review.requeued", "review.closed", "review.message_added", "review.counter_patch_accepted", "review.counter_patch_rejected", "review.transition_rejected", "review.diff_rejected", "reviewer.spawned", "reviewer.spawn_failed", "reviewer.killed", "reviewer.offline"]>;
    actorId: z.ZodNullable<z.ZodString>;
    statusFrom: z.ZodNullable<z.ZodEnum<["pending", "claimed", "submitted", "changes_requested", "approved", "closed"]>>;
    statusTo: z.ZodNullable<z.ZodEnum<["pending", "claimed", "submitted", "changes_requested", "approved", "closed"]>>;
    errorCode: z.ZodNullable<z.ZodString>;
    summary: z.ZodNullable<z.ZodString>;
    metadata: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    createdAt: z.ZodString;
}, "strict", z.ZodTypeAny, {
    reviewId: string;
    createdAt: string;
    actorId: string | null;
    auditEventId: number;
    eventType: "reviewer.spawned" | "reviewer.spawn_failed" | "reviewer.killed" | "reviewer.offline" | "review.created" | "review.claimed" | "review.reclaimed" | "review.submitted" | "review.changes_requested" | "review.approved" | "review.requeued" | "review.closed" | "review.message_added" | "review.counter_patch_accepted" | "review.counter_patch_rejected" | "review.transition_rejected" | "review.diff_rejected";
    statusFrom: "pending" | "claimed" | "submitted" | "changes_requested" | "approved" | "closed" | null;
    statusTo: "pending" | "claimed" | "submitted" | "changes_requested" | "approved" | "closed" | null;
    errorCode: string | null;
    summary: string | null;
    metadata: Record<string, unknown>;
}, {
    reviewId: string;
    createdAt: string;
    actorId: string | null;
    auditEventId: number;
    eventType: "reviewer.spawned" | "reviewer.spawn_failed" | "reviewer.killed" | "reviewer.offline" | "review.created" | "review.claimed" | "review.reclaimed" | "review.submitted" | "review.changes_requested" | "review.approved" | "review.requeued" | "review.closed" | "review.message_added" | "review.counter_patch_accepted" | "review.counter_patch_rejected" | "review.transition_rejected" | "review.diff_rejected";
    statusFrom: "pending" | "claimed" | "submitted" | "changes_requested" | "approved" | "closed" | null;
    statusTo: "pending" | "claimed" | "submitted" | "changes_requested" | "approved" | "closed" | null;
    errorCode: string | null;
    summary: string | null;
    metadata: Record<string, unknown>;
}>;
export declare const ReviewerRecordSchema: z.ZodObject<{
    reviewerId: z.ZodString;
    status: z.ZodEnum<["idle", "assigned", "offline"]>;
    currentReviewId: z.ZodNullable<z.ZodString>;
    command: z.ZodString;
    args: z.ZodArray<z.ZodString, "many">;
    cwd: z.ZodNullable<z.ZodString>;
    pid: z.ZodNullable<z.ZodNumber>;
    startedAt: z.ZodNullable<z.ZodString>;
    lastSeenAt: z.ZodNullable<z.ZodString>;
    offlineAt: z.ZodNullable<z.ZodString>;
    offlineReason: z.ZodNullable<z.ZodEnum<["spawn_failed", "reviewer_exit", "operator_kill", "startup_recovery"]>>;
    exitCode: z.ZodNullable<z.ZodNumber>;
    exitSignal: z.ZodNullable<z.ZodString>;
    createdAt: z.ZodString;
    updatedAt: z.ZodString;
}, "strict", z.ZodTypeAny, {
    status: "idle" | "assigned" | "offline";
    createdAt: string;
    updatedAt: string;
    reviewerId: string;
    currentReviewId: string | null;
    command: string;
    args: string[];
    cwd: string | null;
    pid: number | null;
    startedAt: string | null;
    lastSeenAt: string | null;
    offlineAt: string | null;
    offlineReason: "spawn_failed" | "reviewer_exit" | "operator_kill" | "startup_recovery" | null;
    exitCode: number | null;
    exitSignal: string | null;
}, {
    status: "idle" | "assigned" | "offline";
    createdAt: string;
    updatedAt: string;
    reviewerId: string;
    currentReviewId: string | null;
    command: string;
    args: string[];
    cwd: string | null;
    pid: number | null;
    startedAt: string | null;
    lastSeenAt: string | null;
    offlineAt: string | null;
    offlineReason: "spawn_failed" | "reviewer_exit" | "operator_kill" | "startup_recovery" | null;
    exitCode: number | null;
    exitSignal: string | null;
}>;
export declare const CreateReviewRequestSchema: z.ZodObject<{
    title: z.ZodString;
    description: z.ZodString;
    diff: z.ZodString;
    authorId: z.ZodString;
    priority: z.ZodDefault<z.ZodEnum<["low", "normal", "high", "urgent"]>>;
}, "strict", z.ZodTypeAny, {
    title: string;
    priority: "low" | "normal" | "high" | "urgent";
    authorId: string;
    description: string;
    diff: string;
}, {
    title: string;
    authorId: string;
    description: string;
    diff: string;
    priority?: "low" | "normal" | "high" | "urgent" | undefined;
}>;
export declare const CreateReviewResponseSchema: z.ZodObject<{
    review: z.ZodObject<{
        reviewId: z.ZodString;
        title: z.ZodString;
        status: z.ZodEnum<["pending", "claimed", "submitted", "changes_requested", "approved", "closed"]>;
        priority: z.ZodEnum<["low", "normal", "high", "urgent"]>;
        authorId: z.ZodString;
        createdAt: z.ZodString;
        updatedAt: z.ZodString;
        claimedBy: z.ZodNullable<z.ZodString>;
        claimedAt: z.ZodNullable<z.ZodString>;
        claimGeneration: z.ZodNumber;
    } & {
        currentRound: z.ZodNumber;
        latestVerdict: z.ZodNullable<z.ZodEnum<["changes_requested", "approved"]>>;
        verdictReason: z.ZodNullable<z.ZodString>;
        counterPatchStatus: z.ZodEnum<["none", "pending", "accepted", "rejected"]>;
        lastMessageAt: z.ZodNullable<z.ZodString>;
        lastActivityAt: z.ZodNullable<z.ZodString>;
    }, "strict", z.ZodTypeAny, {
        status: "pending" | "claimed" | "submitted" | "changes_requested" | "approved" | "closed";
        currentRound: number;
        latestVerdict: "changes_requested" | "approved" | null;
        verdictReason: string | null;
        counterPatchStatus: "pending" | "none" | "accepted" | "rejected";
        lastMessageAt: string | null;
        lastActivityAt: string | null;
        reviewId: string;
        title: string;
        priority: "low" | "normal" | "high" | "urgent";
        authorId: string;
        createdAt: string;
        updatedAt: string;
        claimedBy: string | null;
        claimedAt: string | null;
        claimGeneration: number;
    }, {
        status: "pending" | "claimed" | "submitted" | "changes_requested" | "approved" | "closed";
        currentRound: number;
        latestVerdict: "changes_requested" | "approved" | null;
        verdictReason: string | null;
        counterPatchStatus: "pending" | "none" | "accepted" | "rejected";
        lastMessageAt: string | null;
        lastActivityAt: string | null;
        reviewId: string;
        title: string;
        priority: "low" | "normal" | "high" | "urgent";
        authorId: string;
        createdAt: string;
        updatedAt: string;
        claimedBy: string | null;
        claimedAt: string | null;
        claimGeneration: number;
    }>;
    proposal: z.ZodObject<{
        reviewId: z.ZodString;
        title: z.ZodString;
        description: z.ZodString;
        diff: z.ZodString;
        affectedFiles: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        priority: z.ZodEnum<["low", "normal", "high", "urgent"]>;
    } & {
        currentRound: z.ZodNumber;
        latestVerdict: z.ZodNullable<z.ZodEnum<["changes_requested", "approved"]>>;
        verdictReason: z.ZodNullable<z.ZodString>;
        counterPatchStatus: z.ZodEnum<["none", "pending", "accepted", "rejected"]>;
        lastMessageAt: z.ZodNullable<z.ZodString>;
        lastActivityAt: z.ZodNullable<z.ZodString>;
    }, "strict", z.ZodTypeAny, {
        currentRound: number;
        latestVerdict: "changes_requested" | "approved" | null;
        verdictReason: string | null;
        counterPatchStatus: "pending" | "none" | "accepted" | "rejected";
        lastMessageAt: string | null;
        lastActivityAt: string | null;
        reviewId: string;
        title: string;
        priority: "low" | "normal" | "high" | "urgent";
        description: string;
        diff: string;
        affectedFiles: string[];
    }, {
        currentRound: number;
        latestVerdict: "changes_requested" | "approved" | null;
        verdictReason: string | null;
        counterPatchStatus: "pending" | "none" | "accepted" | "rejected";
        lastMessageAt: string | null;
        lastActivityAt: string | null;
        reviewId: string;
        title: string;
        priority: "low" | "normal" | "high" | "urgent";
        description: string;
        diff: string;
        affectedFiles?: string[] | undefined;
    }>;
    version: z.ZodNumber;
}, "strict", z.ZodTypeAny, {
    review: {
        status: "pending" | "claimed" | "submitted" | "changes_requested" | "approved" | "closed";
        currentRound: number;
        latestVerdict: "changes_requested" | "approved" | null;
        verdictReason: string | null;
        counterPatchStatus: "pending" | "none" | "accepted" | "rejected";
        lastMessageAt: string | null;
        lastActivityAt: string | null;
        reviewId: string;
        title: string;
        priority: "low" | "normal" | "high" | "urgent";
        authorId: string;
        createdAt: string;
        updatedAt: string;
        claimedBy: string | null;
        claimedAt: string | null;
        claimGeneration: number;
    };
    proposal: {
        currentRound: number;
        latestVerdict: "changes_requested" | "approved" | null;
        verdictReason: string | null;
        counterPatchStatus: "pending" | "none" | "accepted" | "rejected";
        lastMessageAt: string | null;
        lastActivityAt: string | null;
        reviewId: string;
        title: string;
        priority: "low" | "normal" | "high" | "urgent";
        description: string;
        diff: string;
        affectedFiles: string[];
    };
    version: number;
}, {
    review: {
        status: "pending" | "claimed" | "submitted" | "changes_requested" | "approved" | "closed";
        currentRound: number;
        latestVerdict: "changes_requested" | "approved" | null;
        verdictReason: string | null;
        counterPatchStatus: "pending" | "none" | "accepted" | "rejected";
        lastMessageAt: string | null;
        lastActivityAt: string | null;
        reviewId: string;
        title: string;
        priority: "low" | "normal" | "high" | "urgent";
        authorId: string;
        createdAt: string;
        updatedAt: string;
        claimedBy: string | null;
        claimedAt: string | null;
        claimGeneration: number;
    };
    proposal: {
        currentRound: number;
        latestVerdict: "changes_requested" | "approved" | null;
        verdictReason: string | null;
        counterPatchStatus: "pending" | "none" | "accepted" | "rejected";
        lastMessageAt: string | null;
        lastActivityAt: string | null;
        reviewId: string;
        title: string;
        priority: "low" | "normal" | "high" | "urgent";
        description: string;
        diff: string;
        affectedFiles?: string[] | undefined;
    };
    version: number;
}>;
export declare const ListReviewsRequestSchema: z.ZodObject<{
    wait: z.ZodOptional<z.ZodBoolean>;
    sinceVersion: z.ZodOptional<z.ZodNumber>;
    timeoutMs: z.ZodOptional<z.ZodNumber>;
} & {
    status: z.ZodOptional<z.ZodEnum<["pending", "claimed", "submitted", "changes_requested", "approved", "closed"]>>;
    limit: z.ZodOptional<z.ZodNumber>;
}, "strict", z.ZodTypeAny, {
    status?: "pending" | "claimed" | "submitted" | "changes_requested" | "approved" | "closed" | undefined;
    wait?: boolean | undefined;
    sinceVersion?: number | undefined;
    timeoutMs?: number | undefined;
    limit?: number | undefined;
}, {
    status?: "pending" | "claimed" | "submitted" | "changes_requested" | "approved" | "closed" | undefined;
    wait?: boolean | undefined;
    sinceVersion?: number | undefined;
    timeoutMs?: number | undefined;
    limit?: number | undefined;
}>;
export declare const ListReviewsResponseSchema: z.ZodObject<{
    reviews: z.ZodArray<z.ZodObject<{
        reviewId: z.ZodString;
        title: z.ZodString;
        status: z.ZodEnum<["pending", "claimed", "submitted", "changes_requested", "approved", "closed"]>;
        priority: z.ZodEnum<["low", "normal", "high", "urgent"]>;
        authorId: z.ZodString;
        createdAt: z.ZodString;
        updatedAt: z.ZodString;
        claimedBy: z.ZodNullable<z.ZodString>;
        claimedAt: z.ZodNullable<z.ZodString>;
        claimGeneration: z.ZodNumber;
    } & {
        currentRound: z.ZodNumber;
        latestVerdict: z.ZodNullable<z.ZodEnum<["changes_requested", "approved"]>>;
        verdictReason: z.ZodNullable<z.ZodString>;
        counterPatchStatus: z.ZodEnum<["none", "pending", "accepted", "rejected"]>;
        lastMessageAt: z.ZodNullable<z.ZodString>;
        lastActivityAt: z.ZodNullable<z.ZodString>;
    }, "strict", z.ZodTypeAny, {
        status: "pending" | "claimed" | "submitted" | "changes_requested" | "approved" | "closed";
        currentRound: number;
        latestVerdict: "changes_requested" | "approved" | null;
        verdictReason: string | null;
        counterPatchStatus: "pending" | "none" | "accepted" | "rejected";
        lastMessageAt: string | null;
        lastActivityAt: string | null;
        reviewId: string;
        title: string;
        priority: "low" | "normal" | "high" | "urgent";
        authorId: string;
        createdAt: string;
        updatedAt: string;
        claimedBy: string | null;
        claimedAt: string | null;
        claimGeneration: number;
    }, {
        status: "pending" | "claimed" | "submitted" | "changes_requested" | "approved" | "closed";
        currentRound: number;
        latestVerdict: "changes_requested" | "approved" | null;
        verdictReason: string | null;
        counterPatchStatus: "pending" | "none" | "accepted" | "rejected";
        lastMessageAt: string | null;
        lastActivityAt: string | null;
        reviewId: string;
        title: string;
        priority: "low" | "normal" | "high" | "urgent";
        authorId: string;
        createdAt: string;
        updatedAt: string;
        claimedBy: string | null;
        claimedAt: string | null;
        claimGeneration: number;
    }>, "many">;
    version: z.ZodNumber;
}, "strict", z.ZodTypeAny, {
    reviews: {
        status: "pending" | "claimed" | "submitted" | "changes_requested" | "approved" | "closed";
        currentRound: number;
        latestVerdict: "changes_requested" | "approved" | null;
        verdictReason: string | null;
        counterPatchStatus: "pending" | "none" | "accepted" | "rejected";
        lastMessageAt: string | null;
        lastActivityAt: string | null;
        reviewId: string;
        title: string;
        priority: "low" | "normal" | "high" | "urgent";
        authorId: string;
        createdAt: string;
        updatedAt: string;
        claimedBy: string | null;
        claimedAt: string | null;
        claimGeneration: number;
    }[];
    version: number;
}, {
    reviews: {
        status: "pending" | "claimed" | "submitted" | "changes_requested" | "approved" | "closed";
        currentRound: number;
        latestVerdict: "changes_requested" | "approved" | null;
        verdictReason: string | null;
        counterPatchStatus: "pending" | "none" | "accepted" | "rejected";
        lastMessageAt: string | null;
        lastActivityAt: string | null;
        reviewId: string;
        title: string;
        priority: "low" | "normal" | "high" | "urgent";
        authorId: string;
        createdAt: string;
        updatedAt: string;
        claimedBy: string | null;
        claimedAt: string | null;
        claimGeneration: number;
    }[];
    version: number;
}>;
export declare const SpawnReviewerRequestSchema: z.ZodObject<{
    reviewerId: z.ZodOptional<z.ZodString>;
    command: z.ZodString;
    args: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    cwd: z.ZodOptional<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    command: string;
    args: string[];
    reviewerId?: string | undefined;
    cwd?: string | undefined;
}, {
    command: string;
    reviewerId?: string | undefined;
    args?: string[] | undefined;
    cwd?: string | undefined;
}>;
export declare const SpawnReviewerResponseSchema: z.ZodObject<{
    reviewer: z.ZodObject<{
        reviewerId: z.ZodString;
        status: z.ZodEnum<["idle", "assigned", "offline"]>;
        currentReviewId: z.ZodNullable<z.ZodString>;
        command: z.ZodString;
        args: z.ZodArray<z.ZodString, "many">;
        cwd: z.ZodNullable<z.ZodString>;
        pid: z.ZodNullable<z.ZodNumber>;
        startedAt: z.ZodNullable<z.ZodString>;
        lastSeenAt: z.ZodNullable<z.ZodString>;
        offlineAt: z.ZodNullable<z.ZodString>;
        offlineReason: z.ZodNullable<z.ZodEnum<["spawn_failed", "reviewer_exit", "operator_kill", "startup_recovery"]>>;
        exitCode: z.ZodNullable<z.ZodNumber>;
        exitSignal: z.ZodNullable<z.ZodString>;
        createdAt: z.ZodString;
        updatedAt: z.ZodString;
    }, "strict", z.ZodTypeAny, {
        status: "idle" | "assigned" | "offline";
        createdAt: string;
        updatedAt: string;
        reviewerId: string;
        currentReviewId: string | null;
        command: string;
        args: string[];
        cwd: string | null;
        pid: number | null;
        startedAt: string | null;
        lastSeenAt: string | null;
        offlineAt: string | null;
        offlineReason: "spawn_failed" | "reviewer_exit" | "operator_kill" | "startup_recovery" | null;
        exitCode: number | null;
        exitSignal: string | null;
    }, {
        status: "idle" | "assigned" | "offline";
        createdAt: string;
        updatedAt: string;
        reviewerId: string;
        currentReviewId: string | null;
        command: string;
        args: string[];
        cwd: string | null;
        pid: number | null;
        startedAt: string | null;
        lastSeenAt: string | null;
        offlineAt: string | null;
        offlineReason: "spawn_failed" | "reviewer_exit" | "operator_kill" | "startup_recovery" | null;
        exitCode: number | null;
        exitSignal: string | null;
    }>;
    version: z.ZodNumber;
}, "strict", z.ZodTypeAny, {
    reviewer: {
        status: "idle" | "assigned" | "offline";
        createdAt: string;
        updatedAt: string;
        reviewerId: string;
        currentReviewId: string | null;
        command: string;
        args: string[];
        cwd: string | null;
        pid: number | null;
        startedAt: string | null;
        lastSeenAt: string | null;
        offlineAt: string | null;
        offlineReason: "spawn_failed" | "reviewer_exit" | "operator_kill" | "startup_recovery" | null;
        exitCode: number | null;
        exitSignal: string | null;
    };
    version: number;
}, {
    reviewer: {
        status: "idle" | "assigned" | "offline";
        createdAt: string;
        updatedAt: string;
        reviewerId: string;
        currentReviewId: string | null;
        command: string;
        args: string[];
        cwd: string | null;
        pid: number | null;
        startedAt: string | null;
        lastSeenAt: string | null;
        offlineAt: string | null;
        offlineReason: "spawn_failed" | "reviewer_exit" | "operator_kill" | "startup_recovery" | null;
        exitCode: number | null;
        exitSignal: string | null;
    };
    version: number;
}>;
export declare const ListReviewersRequestSchema: z.ZodObject<{
    wait: z.ZodOptional<z.ZodBoolean>;
    sinceVersion: z.ZodOptional<z.ZodNumber>;
    timeoutMs: z.ZodOptional<z.ZodNumber>;
} & {
    status: z.ZodOptional<z.ZodEnum<["idle", "assigned", "offline"]>>;
    limit: z.ZodOptional<z.ZodNumber>;
}, "strict", z.ZodTypeAny, {
    status?: "idle" | "assigned" | "offline" | undefined;
    wait?: boolean | undefined;
    sinceVersion?: number | undefined;
    timeoutMs?: number | undefined;
    limit?: number | undefined;
}, {
    status?: "idle" | "assigned" | "offline" | undefined;
    wait?: boolean | undefined;
    sinceVersion?: number | undefined;
    timeoutMs?: number | undefined;
    limit?: number | undefined;
}>;
export declare const ListReviewersResponseSchema: z.ZodObject<{
    reviewers: z.ZodArray<z.ZodObject<{
        reviewerId: z.ZodString;
        status: z.ZodEnum<["idle", "assigned", "offline"]>;
        currentReviewId: z.ZodNullable<z.ZodString>;
        command: z.ZodString;
        args: z.ZodArray<z.ZodString, "many">;
        cwd: z.ZodNullable<z.ZodString>;
        pid: z.ZodNullable<z.ZodNumber>;
        startedAt: z.ZodNullable<z.ZodString>;
        lastSeenAt: z.ZodNullable<z.ZodString>;
        offlineAt: z.ZodNullable<z.ZodString>;
        offlineReason: z.ZodNullable<z.ZodEnum<["spawn_failed", "reviewer_exit", "operator_kill", "startup_recovery"]>>;
        exitCode: z.ZodNullable<z.ZodNumber>;
        exitSignal: z.ZodNullable<z.ZodString>;
        createdAt: z.ZodString;
        updatedAt: z.ZodString;
    }, "strict", z.ZodTypeAny, {
        status: "idle" | "assigned" | "offline";
        createdAt: string;
        updatedAt: string;
        reviewerId: string;
        currentReviewId: string | null;
        command: string;
        args: string[];
        cwd: string | null;
        pid: number | null;
        startedAt: string | null;
        lastSeenAt: string | null;
        offlineAt: string | null;
        offlineReason: "spawn_failed" | "reviewer_exit" | "operator_kill" | "startup_recovery" | null;
        exitCode: number | null;
        exitSignal: string | null;
    }, {
        status: "idle" | "assigned" | "offline";
        createdAt: string;
        updatedAt: string;
        reviewerId: string;
        currentReviewId: string | null;
        command: string;
        args: string[];
        cwd: string | null;
        pid: number | null;
        startedAt: string | null;
        lastSeenAt: string | null;
        offlineAt: string | null;
        offlineReason: "spawn_failed" | "reviewer_exit" | "operator_kill" | "startup_recovery" | null;
        exitCode: number | null;
        exitSignal: string | null;
    }>, "many">;
    version: z.ZodNumber;
}, "strict", z.ZodTypeAny, {
    version: number;
    reviewers: {
        status: "idle" | "assigned" | "offline";
        createdAt: string;
        updatedAt: string;
        reviewerId: string;
        currentReviewId: string | null;
        command: string;
        args: string[];
        cwd: string | null;
        pid: number | null;
        startedAt: string | null;
        lastSeenAt: string | null;
        offlineAt: string | null;
        offlineReason: "spawn_failed" | "reviewer_exit" | "operator_kill" | "startup_recovery" | null;
        exitCode: number | null;
        exitSignal: string | null;
    }[];
}, {
    version: number;
    reviewers: {
        status: "idle" | "assigned" | "offline";
        createdAt: string;
        updatedAt: string;
        reviewerId: string;
        currentReviewId: string | null;
        command: string;
        args: string[];
        cwd: string | null;
        pid: number | null;
        startedAt: string | null;
        lastSeenAt: string | null;
        offlineAt: string | null;
        offlineReason: "spawn_failed" | "reviewer_exit" | "operator_kill" | "startup_recovery" | null;
        exitCode: number | null;
        exitSignal: string | null;
    }[];
}>;
export declare const KillReviewerRequestSchema: z.ZodObject<{
    reviewerId: z.ZodString;
}, "strict", z.ZodTypeAny, {
    reviewerId: string;
}, {
    reviewerId: string;
}>;
export declare const KillReviewerOutcomeSchema: z.ZodEnum<["killed", "already_offline", "not_found"]>;
export declare const KillReviewerResponseSchema: z.ZodObject<{
    outcome: z.ZodEnum<["killed", "already_offline", "not_found"]>;
    reviewer: z.ZodNullable<z.ZodObject<{
        reviewerId: z.ZodString;
        status: z.ZodEnum<["idle", "assigned", "offline"]>;
        currentReviewId: z.ZodNullable<z.ZodString>;
        command: z.ZodString;
        args: z.ZodArray<z.ZodString, "many">;
        cwd: z.ZodNullable<z.ZodString>;
        pid: z.ZodNullable<z.ZodNumber>;
        startedAt: z.ZodNullable<z.ZodString>;
        lastSeenAt: z.ZodNullable<z.ZodString>;
        offlineAt: z.ZodNullable<z.ZodString>;
        offlineReason: z.ZodNullable<z.ZodEnum<["spawn_failed", "reviewer_exit", "operator_kill", "startup_recovery"]>>;
        exitCode: z.ZodNullable<z.ZodNumber>;
        exitSignal: z.ZodNullable<z.ZodString>;
        createdAt: z.ZodString;
        updatedAt: z.ZodString;
    }, "strict", z.ZodTypeAny, {
        status: "idle" | "assigned" | "offline";
        createdAt: string;
        updatedAt: string;
        reviewerId: string;
        currentReviewId: string | null;
        command: string;
        args: string[];
        cwd: string | null;
        pid: number | null;
        startedAt: string | null;
        lastSeenAt: string | null;
        offlineAt: string | null;
        offlineReason: "spawn_failed" | "reviewer_exit" | "operator_kill" | "startup_recovery" | null;
        exitCode: number | null;
        exitSignal: string | null;
    }, {
        status: "idle" | "assigned" | "offline";
        createdAt: string;
        updatedAt: string;
        reviewerId: string;
        currentReviewId: string | null;
        command: string;
        args: string[];
        cwd: string | null;
        pid: number | null;
        startedAt: string | null;
        lastSeenAt: string | null;
        offlineAt: string | null;
        offlineReason: "spawn_failed" | "reviewer_exit" | "operator_kill" | "startup_recovery" | null;
        exitCode: number | null;
        exitSignal: string | null;
    }>>;
    version: z.ZodNumber;
    message: z.ZodOptional<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    reviewer: {
        status: "idle" | "assigned" | "offline";
        createdAt: string;
        updatedAt: string;
        reviewerId: string;
        currentReviewId: string | null;
        command: string;
        args: string[];
        cwd: string | null;
        pid: number | null;
        startedAt: string | null;
        lastSeenAt: string | null;
        offlineAt: string | null;
        offlineReason: "spawn_failed" | "reviewer_exit" | "operator_kill" | "startup_recovery" | null;
        exitCode: number | null;
        exitSignal: string | null;
    } | null;
    version: number;
    outcome: "killed" | "already_offline" | "not_found";
    message?: string | undefined;
}, {
    reviewer: {
        status: "idle" | "assigned" | "offline";
        createdAt: string;
        updatedAt: string;
        reviewerId: string;
        currentReviewId: string | null;
        command: string;
        args: string[];
        cwd: string | null;
        pid: number | null;
        startedAt: string | null;
        lastSeenAt: string | null;
        offlineAt: string | null;
        offlineReason: "spawn_failed" | "reviewer_exit" | "operator_kill" | "startup_recovery" | null;
        exitCode: number | null;
        exitSignal: string | null;
    } | null;
    version: number;
    outcome: "killed" | "already_offline" | "not_found";
    message?: string | undefined;
}>;
export declare const ClaimReviewRequestSchema: z.ZodObject<{
    reviewId: z.ZodString;
    claimantId: z.ZodString;
}, "strict", z.ZodTypeAny, {
    reviewId: string;
    claimantId: string;
}, {
    reviewId: string;
    claimantId: string;
}>;
export declare const ClaimReviewOutcomeSchema: z.ZodEnum<["claimed", "stale", "not_claimable"]>;
export declare const ClaimReviewResponseSchema: z.ZodObject<{
    outcome: z.ZodEnum<["claimed", "stale", "not_claimable"]>;
    review: z.ZodNullable<z.ZodObject<{
        reviewId: z.ZodString;
        title: z.ZodString;
        status: z.ZodEnum<["pending", "claimed", "submitted", "changes_requested", "approved", "closed"]>;
        priority: z.ZodEnum<["low", "normal", "high", "urgent"]>;
        authorId: z.ZodString;
        createdAt: z.ZodString;
        updatedAt: z.ZodString;
        claimedBy: z.ZodNullable<z.ZodString>;
        claimedAt: z.ZodNullable<z.ZodString>;
        claimGeneration: z.ZodNumber;
    } & {
        currentRound: z.ZodNumber;
        latestVerdict: z.ZodNullable<z.ZodEnum<["changes_requested", "approved"]>>;
        verdictReason: z.ZodNullable<z.ZodString>;
        counterPatchStatus: z.ZodEnum<["none", "pending", "accepted", "rejected"]>;
        lastMessageAt: z.ZodNullable<z.ZodString>;
        lastActivityAt: z.ZodNullable<z.ZodString>;
    }, "strict", z.ZodTypeAny, {
        status: "pending" | "claimed" | "submitted" | "changes_requested" | "approved" | "closed";
        currentRound: number;
        latestVerdict: "changes_requested" | "approved" | null;
        verdictReason: string | null;
        counterPatchStatus: "pending" | "none" | "accepted" | "rejected";
        lastMessageAt: string | null;
        lastActivityAt: string | null;
        reviewId: string;
        title: string;
        priority: "low" | "normal" | "high" | "urgent";
        authorId: string;
        createdAt: string;
        updatedAt: string;
        claimedBy: string | null;
        claimedAt: string | null;
        claimGeneration: number;
    }, {
        status: "pending" | "claimed" | "submitted" | "changes_requested" | "approved" | "closed";
        currentRound: number;
        latestVerdict: "changes_requested" | "approved" | null;
        verdictReason: string | null;
        counterPatchStatus: "pending" | "none" | "accepted" | "rejected";
        lastMessageAt: string | null;
        lastActivityAt: string | null;
        reviewId: string;
        title: string;
        priority: "low" | "normal" | "high" | "urgent";
        authorId: string;
        createdAt: string;
        updatedAt: string;
        claimedBy: string | null;
        claimedAt: string | null;
        claimGeneration: number;
    }>>;
    version: z.ZodNumber;
    message: z.ZodOptional<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    review: {
        status: "pending" | "claimed" | "submitted" | "changes_requested" | "approved" | "closed";
        currentRound: number;
        latestVerdict: "changes_requested" | "approved" | null;
        verdictReason: string | null;
        counterPatchStatus: "pending" | "none" | "accepted" | "rejected";
        lastMessageAt: string | null;
        lastActivityAt: string | null;
        reviewId: string;
        title: string;
        priority: "low" | "normal" | "high" | "urgent";
        authorId: string;
        createdAt: string;
        updatedAt: string;
        claimedBy: string | null;
        claimedAt: string | null;
        claimGeneration: number;
    } | null;
    version: number;
    outcome: "claimed" | "stale" | "not_claimable";
    message?: string | undefined;
}, {
    review: {
        status: "pending" | "claimed" | "submitted" | "changes_requested" | "approved" | "closed";
        currentRound: number;
        latestVerdict: "changes_requested" | "approved" | null;
        verdictReason: string | null;
        counterPatchStatus: "pending" | "none" | "accepted" | "rejected";
        lastMessageAt: string | null;
        lastActivityAt: string | null;
        reviewId: string;
        title: string;
        priority: "low" | "normal" | "high" | "urgent";
        authorId: string;
        createdAt: string;
        updatedAt: string;
        claimedBy: string | null;
        claimedAt: string | null;
        claimGeneration: number;
    } | null;
    version: number;
    outcome: "claimed" | "stale" | "not_claimable";
    message?: string | undefined;
}>;
export declare const GetReviewStatusRequestSchema: z.ZodObject<{
    wait: z.ZodOptional<z.ZodBoolean>;
    sinceVersion: z.ZodOptional<z.ZodNumber>;
    timeoutMs: z.ZodOptional<z.ZodNumber>;
} & {
    reviewId: z.ZodString;
}, "strict", z.ZodTypeAny, {
    reviewId: string;
    wait?: boolean | undefined;
    sinceVersion?: number | undefined;
    timeoutMs?: number | undefined;
}, {
    reviewId: string;
    wait?: boolean | undefined;
    sinceVersion?: number | undefined;
    timeoutMs?: number | undefined;
}>;
export declare const GetReviewStatusResponseSchema: z.ZodObject<{
    review: z.ZodObject<{
        reviewId: z.ZodString;
        title: z.ZodString;
        status: z.ZodEnum<["pending", "claimed", "submitted", "changes_requested", "approved", "closed"]>;
        priority: z.ZodEnum<["low", "normal", "high", "urgent"]>;
        authorId: z.ZodString;
        createdAt: z.ZodString;
        updatedAt: z.ZodString;
        claimedBy: z.ZodNullable<z.ZodString>;
        claimedAt: z.ZodNullable<z.ZodString>;
        claimGeneration: z.ZodNumber;
    } & {
        currentRound: z.ZodNumber;
        latestVerdict: z.ZodNullable<z.ZodEnum<["changes_requested", "approved"]>>;
        verdictReason: z.ZodNullable<z.ZodString>;
        counterPatchStatus: z.ZodEnum<["none", "pending", "accepted", "rejected"]>;
        lastMessageAt: z.ZodNullable<z.ZodString>;
        lastActivityAt: z.ZodNullable<z.ZodString>;
    }, "strict", z.ZodTypeAny, {
        status: "pending" | "claimed" | "submitted" | "changes_requested" | "approved" | "closed";
        currentRound: number;
        latestVerdict: "changes_requested" | "approved" | null;
        verdictReason: string | null;
        counterPatchStatus: "pending" | "none" | "accepted" | "rejected";
        lastMessageAt: string | null;
        lastActivityAt: string | null;
        reviewId: string;
        title: string;
        priority: "low" | "normal" | "high" | "urgent";
        authorId: string;
        createdAt: string;
        updatedAt: string;
        claimedBy: string | null;
        claimedAt: string | null;
        claimGeneration: number;
    }, {
        status: "pending" | "claimed" | "submitted" | "changes_requested" | "approved" | "closed";
        currentRound: number;
        latestVerdict: "changes_requested" | "approved" | null;
        verdictReason: string | null;
        counterPatchStatus: "pending" | "none" | "accepted" | "rejected";
        lastMessageAt: string | null;
        lastActivityAt: string | null;
        reviewId: string;
        title: string;
        priority: "low" | "normal" | "high" | "urgent";
        authorId: string;
        createdAt: string;
        updatedAt: string;
        claimedBy: string | null;
        claimedAt: string | null;
        claimGeneration: number;
    }>;
    version: z.ZodNumber;
}, "strict", z.ZodTypeAny, {
    review: {
        status: "pending" | "claimed" | "submitted" | "changes_requested" | "approved" | "closed";
        currentRound: number;
        latestVerdict: "changes_requested" | "approved" | null;
        verdictReason: string | null;
        counterPatchStatus: "pending" | "none" | "accepted" | "rejected";
        lastMessageAt: string | null;
        lastActivityAt: string | null;
        reviewId: string;
        title: string;
        priority: "low" | "normal" | "high" | "urgent";
        authorId: string;
        createdAt: string;
        updatedAt: string;
        claimedBy: string | null;
        claimedAt: string | null;
        claimGeneration: number;
    };
    version: number;
}, {
    review: {
        status: "pending" | "claimed" | "submitted" | "changes_requested" | "approved" | "closed";
        currentRound: number;
        latestVerdict: "changes_requested" | "approved" | null;
        verdictReason: string | null;
        counterPatchStatus: "pending" | "none" | "accepted" | "rejected";
        lastMessageAt: string | null;
        lastActivityAt: string | null;
        reviewId: string;
        title: string;
        priority: "low" | "normal" | "high" | "urgent";
        authorId: string;
        createdAt: string;
        updatedAt: string;
        claimedBy: string | null;
        claimedAt: string | null;
        claimGeneration: number;
    };
    version: number;
}>;
export declare const GetProposalRequestSchema: z.ZodObject<{
    reviewId: z.ZodString;
}, "strict", z.ZodTypeAny, {
    reviewId: string;
}, {
    reviewId: string;
}>;
export declare const GetProposalResponseSchema: z.ZodObject<{
    proposal: z.ZodObject<{
        reviewId: z.ZodString;
        title: z.ZodString;
        description: z.ZodString;
        diff: z.ZodString;
        affectedFiles: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        priority: z.ZodEnum<["low", "normal", "high", "urgent"]>;
    } & {
        currentRound: z.ZodNumber;
        latestVerdict: z.ZodNullable<z.ZodEnum<["changes_requested", "approved"]>>;
        verdictReason: z.ZodNullable<z.ZodString>;
        counterPatchStatus: z.ZodEnum<["none", "pending", "accepted", "rejected"]>;
        lastMessageAt: z.ZodNullable<z.ZodString>;
        lastActivityAt: z.ZodNullable<z.ZodString>;
    }, "strict", z.ZodTypeAny, {
        currentRound: number;
        latestVerdict: "changes_requested" | "approved" | null;
        verdictReason: string | null;
        counterPatchStatus: "pending" | "none" | "accepted" | "rejected";
        lastMessageAt: string | null;
        lastActivityAt: string | null;
        reviewId: string;
        title: string;
        priority: "low" | "normal" | "high" | "urgent";
        description: string;
        diff: string;
        affectedFiles: string[];
    }, {
        currentRound: number;
        latestVerdict: "changes_requested" | "approved" | null;
        verdictReason: string | null;
        counterPatchStatus: "pending" | "none" | "accepted" | "rejected";
        lastMessageAt: string | null;
        lastActivityAt: string | null;
        reviewId: string;
        title: string;
        priority: "low" | "normal" | "high" | "urgent";
        description: string;
        diff: string;
        affectedFiles?: string[] | undefined;
    }>;
    version: z.ZodNumber;
}, "strict", z.ZodTypeAny, {
    proposal: {
        currentRound: number;
        latestVerdict: "changes_requested" | "approved" | null;
        verdictReason: string | null;
        counterPatchStatus: "pending" | "none" | "accepted" | "rejected";
        lastMessageAt: string | null;
        lastActivityAt: string | null;
        reviewId: string;
        title: string;
        priority: "low" | "normal" | "high" | "urgent";
        description: string;
        diff: string;
        affectedFiles: string[];
    };
    version: number;
}, {
    proposal: {
        currentRound: number;
        latestVerdict: "changes_requested" | "approved" | null;
        verdictReason: string | null;
        counterPatchStatus: "pending" | "none" | "accepted" | "rejected";
        lastMessageAt: string | null;
        lastActivityAt: string | null;
        reviewId: string;
        title: string;
        priority: "low" | "normal" | "high" | "urgent";
        description: string;
        diff: string;
        affectedFiles?: string[] | undefined;
    };
    version: number;
}>;
export declare const ReclaimReviewRequestSchema: z.ZodObject<{
    reviewId: z.ZodString;
    actorId: z.ZodString;
}, "strict", z.ZodTypeAny, {
    reviewId: string;
    actorId: string;
}, {
    reviewId: string;
    actorId: string;
}>;
export declare const ReclaimReviewResponseSchema: z.ZodObject<{
    review: z.ZodObject<{
        reviewId: z.ZodString;
        title: z.ZodString;
        status: z.ZodEnum<["pending", "claimed", "submitted", "changes_requested", "approved", "closed"]>;
        priority: z.ZodEnum<["low", "normal", "high", "urgent"]>;
        authorId: z.ZodString;
        createdAt: z.ZodString;
        updatedAt: z.ZodString;
        claimedBy: z.ZodNullable<z.ZodString>;
        claimedAt: z.ZodNullable<z.ZodString>;
        claimGeneration: z.ZodNumber;
    } & {
        currentRound: z.ZodNumber;
        latestVerdict: z.ZodNullable<z.ZodEnum<["changes_requested", "approved"]>>;
        verdictReason: z.ZodNullable<z.ZodString>;
        counterPatchStatus: z.ZodEnum<["none", "pending", "accepted", "rejected"]>;
        lastMessageAt: z.ZodNullable<z.ZodString>;
        lastActivityAt: z.ZodNullable<z.ZodString>;
    }, "strict", z.ZodTypeAny, {
        status: "pending" | "claimed" | "submitted" | "changes_requested" | "approved" | "closed";
        currentRound: number;
        latestVerdict: "changes_requested" | "approved" | null;
        verdictReason: string | null;
        counterPatchStatus: "pending" | "none" | "accepted" | "rejected";
        lastMessageAt: string | null;
        lastActivityAt: string | null;
        reviewId: string;
        title: string;
        priority: "low" | "normal" | "high" | "urgent";
        authorId: string;
        createdAt: string;
        updatedAt: string;
        claimedBy: string | null;
        claimedAt: string | null;
        claimGeneration: number;
    }, {
        status: "pending" | "claimed" | "submitted" | "changes_requested" | "approved" | "closed";
        currentRound: number;
        latestVerdict: "changes_requested" | "approved" | null;
        verdictReason: string | null;
        counterPatchStatus: "pending" | "none" | "accepted" | "rejected";
        lastMessageAt: string | null;
        lastActivityAt: string | null;
        reviewId: string;
        title: string;
        priority: "low" | "normal" | "high" | "urgent";
        authorId: string;
        createdAt: string;
        updatedAt: string;
        claimedBy: string | null;
        claimedAt: string | null;
        claimGeneration: number;
    }>;
    version: z.ZodNumber;
}, "strict", z.ZodTypeAny, {
    review: {
        status: "pending" | "claimed" | "submitted" | "changes_requested" | "approved" | "closed";
        currentRound: number;
        latestVerdict: "changes_requested" | "approved" | null;
        verdictReason: string | null;
        counterPatchStatus: "pending" | "none" | "accepted" | "rejected";
        lastMessageAt: string | null;
        lastActivityAt: string | null;
        reviewId: string;
        title: string;
        priority: "low" | "normal" | "high" | "urgent";
        authorId: string;
        createdAt: string;
        updatedAt: string;
        claimedBy: string | null;
        claimedAt: string | null;
        claimGeneration: number;
    };
    version: number;
}, {
    review: {
        status: "pending" | "claimed" | "submitted" | "changes_requested" | "approved" | "closed";
        currentRound: number;
        latestVerdict: "changes_requested" | "approved" | null;
        verdictReason: string | null;
        counterPatchStatus: "pending" | "none" | "accepted" | "rejected";
        lastMessageAt: string | null;
        lastActivityAt: string | null;
        reviewId: string;
        title: string;
        priority: "low" | "normal" | "high" | "urgent";
        authorId: string;
        createdAt: string;
        updatedAt: string;
        claimedBy: string | null;
        claimedAt: string | null;
        claimGeneration: number;
    };
    version: number;
}>;
export declare const SubmitVerdictRequestSchema: z.ZodObject<{
    reviewId: z.ZodString;
    actorId: z.ZodString;
    verdict: z.ZodEnum<["changes_requested", "approved"]>;
    reason: z.ZodString;
}, "strict", z.ZodTypeAny, {
    reviewId: string;
    actorId: string;
    verdict: "changes_requested" | "approved";
    reason: string;
}, {
    reviewId: string;
    actorId: string;
    verdict: "changes_requested" | "approved";
    reason: string;
}>;
export declare const SubmitVerdictResponseSchema: z.ZodObject<{
    review: z.ZodObject<{
        reviewId: z.ZodString;
        title: z.ZodString;
        status: z.ZodEnum<["pending", "claimed", "submitted", "changes_requested", "approved", "closed"]>;
        priority: z.ZodEnum<["low", "normal", "high", "urgent"]>;
        authorId: z.ZodString;
        createdAt: z.ZodString;
        updatedAt: z.ZodString;
        claimedBy: z.ZodNullable<z.ZodString>;
        claimedAt: z.ZodNullable<z.ZodString>;
        claimGeneration: z.ZodNumber;
    } & {
        currentRound: z.ZodNumber;
        latestVerdict: z.ZodNullable<z.ZodEnum<["changes_requested", "approved"]>>;
        verdictReason: z.ZodNullable<z.ZodString>;
        counterPatchStatus: z.ZodEnum<["none", "pending", "accepted", "rejected"]>;
        lastMessageAt: z.ZodNullable<z.ZodString>;
        lastActivityAt: z.ZodNullable<z.ZodString>;
    }, "strict", z.ZodTypeAny, {
        status: "pending" | "claimed" | "submitted" | "changes_requested" | "approved" | "closed";
        currentRound: number;
        latestVerdict: "changes_requested" | "approved" | null;
        verdictReason: string | null;
        counterPatchStatus: "pending" | "none" | "accepted" | "rejected";
        lastMessageAt: string | null;
        lastActivityAt: string | null;
        reviewId: string;
        title: string;
        priority: "low" | "normal" | "high" | "urgent";
        authorId: string;
        createdAt: string;
        updatedAt: string;
        claimedBy: string | null;
        claimedAt: string | null;
        claimGeneration: number;
    }, {
        status: "pending" | "claimed" | "submitted" | "changes_requested" | "approved" | "closed";
        currentRound: number;
        latestVerdict: "changes_requested" | "approved" | null;
        verdictReason: string | null;
        counterPatchStatus: "pending" | "none" | "accepted" | "rejected";
        lastMessageAt: string | null;
        lastActivityAt: string | null;
        reviewId: string;
        title: string;
        priority: "low" | "normal" | "high" | "urgent";
        authorId: string;
        createdAt: string;
        updatedAt: string;
        claimedBy: string | null;
        claimedAt: string | null;
        claimGeneration: number;
    }>;
    proposal: z.ZodObject<{
        reviewId: z.ZodString;
        title: z.ZodString;
        description: z.ZodString;
        diff: z.ZodString;
        affectedFiles: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        priority: z.ZodEnum<["low", "normal", "high", "urgent"]>;
    } & {
        currentRound: z.ZodNumber;
        latestVerdict: z.ZodNullable<z.ZodEnum<["changes_requested", "approved"]>>;
        verdictReason: z.ZodNullable<z.ZodString>;
        counterPatchStatus: z.ZodEnum<["none", "pending", "accepted", "rejected"]>;
        lastMessageAt: z.ZodNullable<z.ZodString>;
        lastActivityAt: z.ZodNullable<z.ZodString>;
    }, "strict", z.ZodTypeAny, {
        currentRound: number;
        latestVerdict: "changes_requested" | "approved" | null;
        verdictReason: string | null;
        counterPatchStatus: "pending" | "none" | "accepted" | "rejected";
        lastMessageAt: string | null;
        lastActivityAt: string | null;
        reviewId: string;
        title: string;
        priority: "low" | "normal" | "high" | "urgent";
        description: string;
        diff: string;
        affectedFiles: string[];
    }, {
        currentRound: number;
        latestVerdict: "changes_requested" | "approved" | null;
        verdictReason: string | null;
        counterPatchStatus: "pending" | "none" | "accepted" | "rejected";
        lastMessageAt: string | null;
        lastActivityAt: string | null;
        reviewId: string;
        title: string;
        priority: "low" | "normal" | "high" | "urgent";
        description: string;
        diff: string;
        affectedFiles?: string[] | undefined;
    }>;
    version: z.ZodNumber;
}, "strict", z.ZodTypeAny, {
    review: {
        status: "pending" | "claimed" | "submitted" | "changes_requested" | "approved" | "closed";
        currentRound: number;
        latestVerdict: "changes_requested" | "approved" | null;
        verdictReason: string | null;
        counterPatchStatus: "pending" | "none" | "accepted" | "rejected";
        lastMessageAt: string | null;
        lastActivityAt: string | null;
        reviewId: string;
        title: string;
        priority: "low" | "normal" | "high" | "urgent";
        authorId: string;
        createdAt: string;
        updatedAt: string;
        claimedBy: string | null;
        claimedAt: string | null;
        claimGeneration: number;
    };
    proposal: {
        currentRound: number;
        latestVerdict: "changes_requested" | "approved" | null;
        verdictReason: string | null;
        counterPatchStatus: "pending" | "none" | "accepted" | "rejected";
        lastMessageAt: string | null;
        lastActivityAt: string | null;
        reviewId: string;
        title: string;
        priority: "low" | "normal" | "high" | "urgent";
        description: string;
        diff: string;
        affectedFiles: string[];
    };
    version: number;
}, {
    review: {
        status: "pending" | "claimed" | "submitted" | "changes_requested" | "approved" | "closed";
        currentRound: number;
        latestVerdict: "changes_requested" | "approved" | null;
        verdictReason: string | null;
        counterPatchStatus: "pending" | "none" | "accepted" | "rejected";
        lastMessageAt: string | null;
        lastActivityAt: string | null;
        reviewId: string;
        title: string;
        priority: "low" | "normal" | "high" | "urgent";
        authorId: string;
        createdAt: string;
        updatedAt: string;
        claimedBy: string | null;
        claimedAt: string | null;
        claimGeneration: number;
    };
    proposal: {
        currentRound: number;
        latestVerdict: "changes_requested" | "approved" | null;
        verdictReason: string | null;
        counterPatchStatus: "pending" | "none" | "accepted" | "rejected";
        lastMessageAt: string | null;
        lastActivityAt: string | null;
        reviewId: string;
        title: string;
        priority: "low" | "normal" | "high" | "urgent";
        description: string;
        diff: string;
        affectedFiles?: string[] | undefined;
    };
    version: number;
}>;
export declare const CloseReviewRequestSchema: z.ZodObject<{
    reviewId: z.ZodString;
    actorId: z.ZodString;
}, "strict", z.ZodTypeAny, {
    reviewId: string;
    actorId: string;
}, {
    reviewId: string;
    actorId: string;
}>;
export declare const CloseReviewResponseSchema: z.ZodObject<{
    review: z.ZodObject<{
        reviewId: z.ZodString;
        title: z.ZodString;
        status: z.ZodEnum<["pending", "claimed", "submitted", "changes_requested", "approved", "closed"]>;
        priority: z.ZodEnum<["low", "normal", "high", "urgent"]>;
        authorId: z.ZodString;
        createdAt: z.ZodString;
        updatedAt: z.ZodString;
        claimedBy: z.ZodNullable<z.ZodString>;
        claimedAt: z.ZodNullable<z.ZodString>;
        claimGeneration: z.ZodNumber;
    } & {
        currentRound: z.ZodNumber;
        latestVerdict: z.ZodNullable<z.ZodEnum<["changes_requested", "approved"]>>;
        verdictReason: z.ZodNullable<z.ZodString>;
        counterPatchStatus: z.ZodEnum<["none", "pending", "accepted", "rejected"]>;
        lastMessageAt: z.ZodNullable<z.ZodString>;
        lastActivityAt: z.ZodNullable<z.ZodString>;
    }, "strict", z.ZodTypeAny, {
        status: "pending" | "claimed" | "submitted" | "changes_requested" | "approved" | "closed";
        currentRound: number;
        latestVerdict: "changes_requested" | "approved" | null;
        verdictReason: string | null;
        counterPatchStatus: "pending" | "none" | "accepted" | "rejected";
        lastMessageAt: string | null;
        lastActivityAt: string | null;
        reviewId: string;
        title: string;
        priority: "low" | "normal" | "high" | "urgent";
        authorId: string;
        createdAt: string;
        updatedAt: string;
        claimedBy: string | null;
        claimedAt: string | null;
        claimGeneration: number;
    }, {
        status: "pending" | "claimed" | "submitted" | "changes_requested" | "approved" | "closed";
        currentRound: number;
        latestVerdict: "changes_requested" | "approved" | null;
        verdictReason: string | null;
        counterPatchStatus: "pending" | "none" | "accepted" | "rejected";
        lastMessageAt: string | null;
        lastActivityAt: string | null;
        reviewId: string;
        title: string;
        priority: "low" | "normal" | "high" | "urgent";
        authorId: string;
        createdAt: string;
        updatedAt: string;
        claimedBy: string | null;
        claimedAt: string | null;
        claimGeneration: number;
    }>;
    version: z.ZodNumber;
}, "strict", z.ZodTypeAny, {
    review: {
        status: "pending" | "claimed" | "submitted" | "changes_requested" | "approved" | "closed";
        currentRound: number;
        latestVerdict: "changes_requested" | "approved" | null;
        verdictReason: string | null;
        counterPatchStatus: "pending" | "none" | "accepted" | "rejected";
        lastMessageAt: string | null;
        lastActivityAt: string | null;
        reviewId: string;
        title: string;
        priority: "low" | "normal" | "high" | "urgent";
        authorId: string;
        createdAt: string;
        updatedAt: string;
        claimedBy: string | null;
        claimedAt: string | null;
        claimGeneration: number;
    };
    version: number;
}, {
    review: {
        status: "pending" | "claimed" | "submitted" | "changes_requested" | "approved" | "closed";
        currentRound: number;
        latestVerdict: "changes_requested" | "approved" | null;
        verdictReason: string | null;
        counterPatchStatus: "pending" | "none" | "accepted" | "rejected";
        lastMessageAt: string | null;
        lastActivityAt: string | null;
        reviewId: string;
        title: string;
        priority: "low" | "normal" | "high" | "urgent";
        authorId: string;
        createdAt: string;
        updatedAt: string;
        claimedBy: string | null;
        claimedAt: string | null;
        claimGeneration: number;
    };
    version: number;
}>;
export declare const AddMessageRequestSchema: z.ZodObject<{
    reviewId: z.ZodString;
    actorId: z.ZodString;
    body: z.ZodString;
}, "strict", z.ZodTypeAny, {
    reviewId: string;
    actorId: string;
    body: string;
}, {
    reviewId: string;
    actorId: string;
    body: string;
}>;
export declare const AddMessageResponseSchema: z.ZodObject<{
    review: z.ZodObject<{
        reviewId: z.ZodString;
        title: z.ZodString;
        status: z.ZodEnum<["pending", "claimed", "submitted", "changes_requested", "approved", "closed"]>;
        priority: z.ZodEnum<["low", "normal", "high", "urgent"]>;
        authorId: z.ZodString;
        createdAt: z.ZodString;
        updatedAt: z.ZodString;
        claimedBy: z.ZodNullable<z.ZodString>;
        claimedAt: z.ZodNullable<z.ZodString>;
        claimGeneration: z.ZodNumber;
    } & {
        currentRound: z.ZodNumber;
        latestVerdict: z.ZodNullable<z.ZodEnum<["changes_requested", "approved"]>>;
        verdictReason: z.ZodNullable<z.ZodString>;
        counterPatchStatus: z.ZodEnum<["none", "pending", "accepted", "rejected"]>;
        lastMessageAt: z.ZodNullable<z.ZodString>;
        lastActivityAt: z.ZodNullable<z.ZodString>;
    }, "strict", z.ZodTypeAny, {
        status: "pending" | "claimed" | "submitted" | "changes_requested" | "approved" | "closed";
        currentRound: number;
        latestVerdict: "changes_requested" | "approved" | null;
        verdictReason: string | null;
        counterPatchStatus: "pending" | "none" | "accepted" | "rejected";
        lastMessageAt: string | null;
        lastActivityAt: string | null;
        reviewId: string;
        title: string;
        priority: "low" | "normal" | "high" | "urgent";
        authorId: string;
        createdAt: string;
        updatedAt: string;
        claimedBy: string | null;
        claimedAt: string | null;
        claimGeneration: number;
    }, {
        status: "pending" | "claimed" | "submitted" | "changes_requested" | "approved" | "closed";
        currentRound: number;
        latestVerdict: "changes_requested" | "approved" | null;
        verdictReason: string | null;
        counterPatchStatus: "pending" | "none" | "accepted" | "rejected";
        lastMessageAt: string | null;
        lastActivityAt: string | null;
        reviewId: string;
        title: string;
        priority: "low" | "normal" | "high" | "urgent";
        authorId: string;
        createdAt: string;
        updatedAt: string;
        claimedBy: string | null;
        claimedAt: string | null;
        claimGeneration: number;
    }>;
    message: z.ZodObject<{
        messageId: z.ZodNumber;
        reviewId: z.ZodString;
        actorId: z.ZodString;
        authorRole: z.ZodEnum<["proposer", "reviewer", "system"]>;
        body: z.ZodString;
        createdAt: z.ZodString;
    }, "strict", z.ZodTypeAny, {
        reviewId: string;
        createdAt: string;
        messageId: number;
        actorId: string;
        authorRole: "proposer" | "reviewer" | "system";
        body: string;
    }, {
        reviewId: string;
        createdAt: string;
        messageId: number;
        actorId: string;
        authorRole: "proposer" | "reviewer" | "system";
        body: string;
    }>;
    version: z.ZodNumber;
}, "strict", z.ZodTypeAny, {
    message: {
        reviewId: string;
        createdAt: string;
        messageId: number;
        actorId: string;
        authorRole: "proposer" | "reviewer" | "system";
        body: string;
    };
    review: {
        status: "pending" | "claimed" | "submitted" | "changes_requested" | "approved" | "closed";
        currentRound: number;
        latestVerdict: "changes_requested" | "approved" | null;
        verdictReason: string | null;
        counterPatchStatus: "pending" | "none" | "accepted" | "rejected";
        lastMessageAt: string | null;
        lastActivityAt: string | null;
        reviewId: string;
        title: string;
        priority: "low" | "normal" | "high" | "urgent";
        authorId: string;
        createdAt: string;
        updatedAt: string;
        claimedBy: string | null;
        claimedAt: string | null;
        claimGeneration: number;
    };
    version: number;
}, {
    message: {
        reviewId: string;
        createdAt: string;
        messageId: number;
        actorId: string;
        authorRole: "proposer" | "reviewer" | "system";
        body: string;
    };
    review: {
        status: "pending" | "claimed" | "submitted" | "changes_requested" | "approved" | "closed";
        currentRound: number;
        latestVerdict: "changes_requested" | "approved" | null;
        verdictReason: string | null;
        counterPatchStatus: "pending" | "none" | "accepted" | "rejected";
        lastMessageAt: string | null;
        lastActivityAt: string | null;
        reviewId: string;
        title: string;
        priority: "low" | "normal" | "high" | "urgent";
        authorId: string;
        createdAt: string;
        updatedAt: string;
        claimedBy: string | null;
        claimedAt: string | null;
        claimGeneration: number;
    };
    version: number;
}>;
export declare const GetDiscussionRequestSchema: z.ZodObject<{
    reviewId: z.ZodString;
}, "strict", z.ZodTypeAny, {
    reviewId: string;
}, {
    reviewId: string;
}>;
export declare const GetDiscussionResponseSchema: z.ZodObject<{
    review: z.ZodObject<{
        reviewId: z.ZodString;
        title: z.ZodString;
        status: z.ZodEnum<["pending", "claimed", "submitted", "changes_requested", "approved", "closed"]>;
        priority: z.ZodEnum<["low", "normal", "high", "urgent"]>;
        authorId: z.ZodString;
        createdAt: z.ZodString;
        updatedAt: z.ZodString;
        claimedBy: z.ZodNullable<z.ZodString>;
        claimedAt: z.ZodNullable<z.ZodString>;
        claimGeneration: z.ZodNumber;
    } & {
        currentRound: z.ZodNumber;
        latestVerdict: z.ZodNullable<z.ZodEnum<["changes_requested", "approved"]>>;
        verdictReason: z.ZodNullable<z.ZodString>;
        counterPatchStatus: z.ZodEnum<["none", "pending", "accepted", "rejected"]>;
        lastMessageAt: z.ZodNullable<z.ZodString>;
        lastActivityAt: z.ZodNullable<z.ZodString>;
    }, "strict", z.ZodTypeAny, {
        status: "pending" | "claimed" | "submitted" | "changes_requested" | "approved" | "closed";
        currentRound: number;
        latestVerdict: "changes_requested" | "approved" | null;
        verdictReason: string | null;
        counterPatchStatus: "pending" | "none" | "accepted" | "rejected";
        lastMessageAt: string | null;
        lastActivityAt: string | null;
        reviewId: string;
        title: string;
        priority: "low" | "normal" | "high" | "urgent";
        authorId: string;
        createdAt: string;
        updatedAt: string;
        claimedBy: string | null;
        claimedAt: string | null;
        claimGeneration: number;
    }, {
        status: "pending" | "claimed" | "submitted" | "changes_requested" | "approved" | "closed";
        currentRound: number;
        latestVerdict: "changes_requested" | "approved" | null;
        verdictReason: string | null;
        counterPatchStatus: "pending" | "none" | "accepted" | "rejected";
        lastMessageAt: string | null;
        lastActivityAt: string | null;
        reviewId: string;
        title: string;
        priority: "low" | "normal" | "high" | "urgent";
        authorId: string;
        createdAt: string;
        updatedAt: string;
        claimedBy: string | null;
        claimedAt: string | null;
        claimGeneration: number;
    }>;
    messages: z.ZodArray<z.ZodObject<{
        messageId: z.ZodNumber;
        reviewId: z.ZodString;
        actorId: z.ZodString;
        authorRole: z.ZodEnum<["proposer", "reviewer", "system"]>;
        body: z.ZodString;
        createdAt: z.ZodString;
    }, "strict", z.ZodTypeAny, {
        reviewId: string;
        createdAt: string;
        messageId: number;
        actorId: string;
        authorRole: "proposer" | "reviewer" | "system";
        body: string;
    }, {
        reviewId: string;
        createdAt: string;
        messageId: number;
        actorId: string;
        authorRole: "proposer" | "reviewer" | "system";
        body: string;
    }>, "many">;
    version: z.ZodNumber;
}, "strict", z.ZodTypeAny, {
    review: {
        status: "pending" | "claimed" | "submitted" | "changes_requested" | "approved" | "closed";
        currentRound: number;
        latestVerdict: "changes_requested" | "approved" | null;
        verdictReason: string | null;
        counterPatchStatus: "pending" | "none" | "accepted" | "rejected";
        lastMessageAt: string | null;
        lastActivityAt: string | null;
        reviewId: string;
        title: string;
        priority: "low" | "normal" | "high" | "urgent";
        authorId: string;
        createdAt: string;
        updatedAt: string;
        claimedBy: string | null;
        claimedAt: string | null;
        claimGeneration: number;
    };
    version: number;
    messages: {
        reviewId: string;
        createdAt: string;
        messageId: number;
        actorId: string;
        authorRole: "proposer" | "reviewer" | "system";
        body: string;
    }[];
}, {
    review: {
        status: "pending" | "claimed" | "submitted" | "changes_requested" | "approved" | "closed";
        currentRound: number;
        latestVerdict: "changes_requested" | "approved" | null;
        verdictReason: string | null;
        counterPatchStatus: "pending" | "none" | "accepted" | "rejected";
        lastMessageAt: string | null;
        lastActivityAt: string | null;
        reviewId: string;
        title: string;
        priority: "low" | "normal" | "high" | "urgent";
        authorId: string;
        createdAt: string;
        updatedAt: string;
        claimedBy: string | null;
        claimedAt: string | null;
        claimGeneration: number;
    };
    version: number;
    messages: {
        reviewId: string;
        createdAt: string;
        messageId: number;
        actorId: string;
        authorRole: "proposer" | "reviewer" | "system";
        body: string;
    }[];
}>;
export declare const GetActivityFeedRequestSchema: z.ZodObject<{
    reviewId: z.ZodString;
    limit: z.ZodOptional<z.ZodNumber>;
}, "strict", z.ZodTypeAny, {
    reviewId: string;
    limit?: number | undefined;
}, {
    reviewId: string;
    limit?: number | undefined;
}>;
export declare const GetActivityFeedResponseSchema: z.ZodObject<{
    review: z.ZodObject<{
        reviewId: z.ZodString;
        title: z.ZodString;
        status: z.ZodEnum<["pending", "claimed", "submitted", "changes_requested", "approved", "closed"]>;
        priority: z.ZodEnum<["low", "normal", "high", "urgent"]>;
        authorId: z.ZodString;
        createdAt: z.ZodString;
        updatedAt: z.ZodString;
        claimedBy: z.ZodNullable<z.ZodString>;
        claimedAt: z.ZodNullable<z.ZodString>;
        claimGeneration: z.ZodNumber;
    } & {
        currentRound: z.ZodNumber;
        latestVerdict: z.ZodNullable<z.ZodEnum<["changes_requested", "approved"]>>;
        verdictReason: z.ZodNullable<z.ZodString>;
        counterPatchStatus: z.ZodEnum<["none", "pending", "accepted", "rejected"]>;
        lastMessageAt: z.ZodNullable<z.ZodString>;
        lastActivityAt: z.ZodNullable<z.ZodString>;
    }, "strict", z.ZodTypeAny, {
        status: "pending" | "claimed" | "submitted" | "changes_requested" | "approved" | "closed";
        currentRound: number;
        latestVerdict: "changes_requested" | "approved" | null;
        verdictReason: string | null;
        counterPatchStatus: "pending" | "none" | "accepted" | "rejected";
        lastMessageAt: string | null;
        lastActivityAt: string | null;
        reviewId: string;
        title: string;
        priority: "low" | "normal" | "high" | "urgent";
        authorId: string;
        createdAt: string;
        updatedAt: string;
        claimedBy: string | null;
        claimedAt: string | null;
        claimGeneration: number;
    }, {
        status: "pending" | "claimed" | "submitted" | "changes_requested" | "approved" | "closed";
        currentRound: number;
        latestVerdict: "changes_requested" | "approved" | null;
        verdictReason: string | null;
        counterPatchStatus: "pending" | "none" | "accepted" | "rejected";
        lastMessageAt: string | null;
        lastActivityAt: string | null;
        reviewId: string;
        title: string;
        priority: "low" | "normal" | "high" | "urgent";
        authorId: string;
        createdAt: string;
        updatedAt: string;
        claimedBy: string | null;
        claimedAt: string | null;
        claimGeneration: number;
    }>;
    activity: z.ZodArray<z.ZodObject<{
        auditEventId: z.ZodNumber;
        reviewId: z.ZodString;
        eventType: z.ZodEnum<["review.created", "review.claimed", "review.reclaimed", "review.submitted", "review.changes_requested", "review.approved", "review.requeued", "review.closed", "review.message_added", "review.counter_patch_accepted", "review.counter_patch_rejected", "review.transition_rejected", "review.diff_rejected", "reviewer.spawned", "reviewer.spawn_failed", "reviewer.killed", "reviewer.offline"]>;
        actorId: z.ZodNullable<z.ZodString>;
        statusFrom: z.ZodNullable<z.ZodEnum<["pending", "claimed", "submitted", "changes_requested", "approved", "closed"]>>;
        statusTo: z.ZodNullable<z.ZodEnum<["pending", "claimed", "submitted", "changes_requested", "approved", "closed"]>>;
        errorCode: z.ZodNullable<z.ZodString>;
        summary: z.ZodNullable<z.ZodString>;
        metadata: z.ZodRecord<z.ZodString, z.ZodUnknown>;
        createdAt: z.ZodString;
    }, "strict", z.ZodTypeAny, {
        reviewId: string;
        createdAt: string;
        actorId: string | null;
        auditEventId: number;
        eventType: "reviewer.spawned" | "reviewer.spawn_failed" | "reviewer.killed" | "reviewer.offline" | "review.created" | "review.claimed" | "review.reclaimed" | "review.submitted" | "review.changes_requested" | "review.approved" | "review.requeued" | "review.closed" | "review.message_added" | "review.counter_patch_accepted" | "review.counter_patch_rejected" | "review.transition_rejected" | "review.diff_rejected";
        statusFrom: "pending" | "claimed" | "submitted" | "changes_requested" | "approved" | "closed" | null;
        statusTo: "pending" | "claimed" | "submitted" | "changes_requested" | "approved" | "closed" | null;
        errorCode: string | null;
        summary: string | null;
        metadata: Record<string, unknown>;
    }, {
        reviewId: string;
        createdAt: string;
        actorId: string | null;
        auditEventId: number;
        eventType: "reviewer.spawned" | "reviewer.spawn_failed" | "reviewer.killed" | "reviewer.offline" | "review.created" | "review.claimed" | "review.reclaimed" | "review.submitted" | "review.changes_requested" | "review.approved" | "review.requeued" | "review.closed" | "review.message_added" | "review.counter_patch_accepted" | "review.counter_patch_rejected" | "review.transition_rejected" | "review.diff_rejected";
        statusFrom: "pending" | "claimed" | "submitted" | "changes_requested" | "approved" | "closed" | null;
        statusTo: "pending" | "claimed" | "submitted" | "changes_requested" | "approved" | "closed" | null;
        errorCode: string | null;
        summary: string | null;
        metadata: Record<string, unknown>;
    }>, "many">;
    version: z.ZodNumber;
}, "strict", z.ZodTypeAny, {
    review: {
        status: "pending" | "claimed" | "submitted" | "changes_requested" | "approved" | "closed";
        currentRound: number;
        latestVerdict: "changes_requested" | "approved" | null;
        verdictReason: string | null;
        counterPatchStatus: "pending" | "none" | "accepted" | "rejected";
        lastMessageAt: string | null;
        lastActivityAt: string | null;
        reviewId: string;
        title: string;
        priority: "low" | "normal" | "high" | "urgent";
        authorId: string;
        createdAt: string;
        updatedAt: string;
        claimedBy: string | null;
        claimedAt: string | null;
        claimGeneration: number;
    };
    version: number;
    activity: {
        reviewId: string;
        createdAt: string;
        actorId: string | null;
        auditEventId: number;
        eventType: "reviewer.spawned" | "reviewer.spawn_failed" | "reviewer.killed" | "reviewer.offline" | "review.created" | "review.claimed" | "review.reclaimed" | "review.submitted" | "review.changes_requested" | "review.approved" | "review.requeued" | "review.closed" | "review.message_added" | "review.counter_patch_accepted" | "review.counter_patch_rejected" | "review.transition_rejected" | "review.diff_rejected";
        statusFrom: "pending" | "claimed" | "submitted" | "changes_requested" | "approved" | "closed" | null;
        statusTo: "pending" | "claimed" | "submitted" | "changes_requested" | "approved" | "closed" | null;
        errorCode: string | null;
        summary: string | null;
        metadata: Record<string, unknown>;
    }[];
}, {
    review: {
        status: "pending" | "claimed" | "submitted" | "changes_requested" | "approved" | "closed";
        currentRound: number;
        latestVerdict: "changes_requested" | "approved" | null;
        verdictReason: string | null;
        counterPatchStatus: "pending" | "none" | "accepted" | "rejected";
        lastMessageAt: string | null;
        lastActivityAt: string | null;
        reviewId: string;
        title: string;
        priority: "low" | "normal" | "high" | "urgent";
        authorId: string;
        createdAt: string;
        updatedAt: string;
        claimedBy: string | null;
        claimedAt: string | null;
        claimGeneration: number;
    };
    version: number;
    activity: {
        reviewId: string;
        createdAt: string;
        actorId: string | null;
        auditEventId: number;
        eventType: "reviewer.spawned" | "reviewer.spawn_failed" | "reviewer.killed" | "reviewer.offline" | "review.created" | "review.claimed" | "review.reclaimed" | "review.submitted" | "review.changes_requested" | "review.approved" | "review.requeued" | "review.closed" | "review.message_added" | "review.counter_patch_accepted" | "review.counter_patch_rejected" | "review.transition_rejected" | "review.diff_rejected";
        statusFrom: "pending" | "claimed" | "submitted" | "changes_requested" | "approved" | "closed" | null;
        statusTo: "pending" | "claimed" | "submitted" | "changes_requested" | "approved" | "closed" | null;
        errorCode: string | null;
        summary: string | null;
        metadata: Record<string, unknown>;
    }[];
}>;
export declare const AcceptCounterPatchRequestSchema: z.ZodObject<{
    reviewId: z.ZodString;
    actorId: z.ZodString;
    note: z.ZodOptional<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    reviewId: string;
    actorId: string;
    note?: string | undefined;
}, {
    reviewId: string;
    actorId: string;
    note?: string | undefined;
}>;
export declare const AcceptCounterPatchResponseSchema: z.ZodObject<{
    review: z.ZodObject<{
        reviewId: z.ZodString;
        title: z.ZodString;
        status: z.ZodEnum<["pending", "claimed", "submitted", "changes_requested", "approved", "closed"]>;
        priority: z.ZodEnum<["low", "normal", "high", "urgent"]>;
        authorId: z.ZodString;
        createdAt: z.ZodString;
        updatedAt: z.ZodString;
        claimedBy: z.ZodNullable<z.ZodString>;
        claimedAt: z.ZodNullable<z.ZodString>;
        claimGeneration: z.ZodNumber;
    } & {
        currentRound: z.ZodNumber;
        latestVerdict: z.ZodNullable<z.ZodEnum<["changes_requested", "approved"]>>;
        verdictReason: z.ZodNullable<z.ZodString>;
        counterPatchStatus: z.ZodEnum<["none", "pending", "accepted", "rejected"]>;
        lastMessageAt: z.ZodNullable<z.ZodString>;
        lastActivityAt: z.ZodNullable<z.ZodString>;
    }, "strict", z.ZodTypeAny, {
        status: "pending" | "claimed" | "submitted" | "changes_requested" | "approved" | "closed";
        currentRound: number;
        latestVerdict: "changes_requested" | "approved" | null;
        verdictReason: string | null;
        counterPatchStatus: "pending" | "none" | "accepted" | "rejected";
        lastMessageAt: string | null;
        lastActivityAt: string | null;
        reviewId: string;
        title: string;
        priority: "low" | "normal" | "high" | "urgent";
        authorId: string;
        createdAt: string;
        updatedAt: string;
        claimedBy: string | null;
        claimedAt: string | null;
        claimGeneration: number;
    }, {
        status: "pending" | "claimed" | "submitted" | "changes_requested" | "approved" | "closed";
        currentRound: number;
        latestVerdict: "changes_requested" | "approved" | null;
        verdictReason: string | null;
        counterPatchStatus: "pending" | "none" | "accepted" | "rejected";
        lastMessageAt: string | null;
        lastActivityAt: string | null;
        reviewId: string;
        title: string;
        priority: "low" | "normal" | "high" | "urgent";
        authorId: string;
        createdAt: string;
        updatedAt: string;
        claimedBy: string | null;
        claimedAt: string | null;
        claimGeneration: number;
    }>;
    proposal: z.ZodObject<{
        reviewId: z.ZodString;
        title: z.ZodString;
        description: z.ZodString;
        diff: z.ZodString;
        affectedFiles: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        priority: z.ZodEnum<["low", "normal", "high", "urgent"]>;
    } & {
        currentRound: z.ZodNumber;
        latestVerdict: z.ZodNullable<z.ZodEnum<["changes_requested", "approved"]>>;
        verdictReason: z.ZodNullable<z.ZodString>;
        counterPatchStatus: z.ZodEnum<["none", "pending", "accepted", "rejected"]>;
        lastMessageAt: z.ZodNullable<z.ZodString>;
        lastActivityAt: z.ZodNullable<z.ZodString>;
    }, "strict", z.ZodTypeAny, {
        currentRound: number;
        latestVerdict: "changes_requested" | "approved" | null;
        verdictReason: string | null;
        counterPatchStatus: "pending" | "none" | "accepted" | "rejected";
        lastMessageAt: string | null;
        lastActivityAt: string | null;
        reviewId: string;
        title: string;
        priority: "low" | "normal" | "high" | "urgent";
        description: string;
        diff: string;
        affectedFiles: string[];
    }, {
        currentRound: number;
        latestVerdict: "changes_requested" | "approved" | null;
        verdictReason: string | null;
        counterPatchStatus: "pending" | "none" | "accepted" | "rejected";
        lastMessageAt: string | null;
        lastActivityAt: string | null;
        reviewId: string;
        title: string;
        priority: "low" | "normal" | "high" | "urgent";
        description: string;
        diff: string;
        affectedFiles?: string[] | undefined;
    }>;
    version: z.ZodNumber;
}, "strict", z.ZodTypeAny, {
    review: {
        status: "pending" | "claimed" | "submitted" | "changes_requested" | "approved" | "closed";
        currentRound: number;
        latestVerdict: "changes_requested" | "approved" | null;
        verdictReason: string | null;
        counterPatchStatus: "pending" | "none" | "accepted" | "rejected";
        lastMessageAt: string | null;
        lastActivityAt: string | null;
        reviewId: string;
        title: string;
        priority: "low" | "normal" | "high" | "urgent";
        authorId: string;
        createdAt: string;
        updatedAt: string;
        claimedBy: string | null;
        claimedAt: string | null;
        claimGeneration: number;
    };
    proposal: {
        currentRound: number;
        latestVerdict: "changes_requested" | "approved" | null;
        verdictReason: string | null;
        counterPatchStatus: "pending" | "none" | "accepted" | "rejected";
        lastMessageAt: string | null;
        lastActivityAt: string | null;
        reviewId: string;
        title: string;
        priority: "low" | "normal" | "high" | "urgent";
        description: string;
        diff: string;
        affectedFiles: string[];
    };
    version: number;
}, {
    review: {
        status: "pending" | "claimed" | "submitted" | "changes_requested" | "approved" | "closed";
        currentRound: number;
        latestVerdict: "changes_requested" | "approved" | null;
        verdictReason: string | null;
        counterPatchStatus: "pending" | "none" | "accepted" | "rejected";
        lastMessageAt: string | null;
        lastActivityAt: string | null;
        reviewId: string;
        title: string;
        priority: "low" | "normal" | "high" | "urgent";
        authorId: string;
        createdAt: string;
        updatedAt: string;
        claimedBy: string | null;
        claimedAt: string | null;
        claimGeneration: number;
    };
    proposal: {
        currentRound: number;
        latestVerdict: "changes_requested" | "approved" | null;
        verdictReason: string | null;
        counterPatchStatus: "pending" | "none" | "accepted" | "rejected";
        lastMessageAt: string | null;
        lastActivityAt: string | null;
        reviewId: string;
        title: string;
        priority: "low" | "normal" | "high" | "urgent";
        description: string;
        diff: string;
        affectedFiles?: string[] | undefined;
    };
    version: number;
}>;
export declare const RejectCounterPatchRequestSchema: z.ZodObject<{
    reviewId: z.ZodString;
    actorId: z.ZodString;
    note: z.ZodOptional<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    reviewId: string;
    actorId: string;
    note?: string | undefined;
}, {
    reviewId: string;
    actorId: string;
    note?: string | undefined;
}>;
export declare const RejectCounterPatchResponseSchema: z.ZodObject<{
    review: z.ZodObject<{
        reviewId: z.ZodString;
        title: z.ZodString;
        status: z.ZodEnum<["pending", "claimed", "submitted", "changes_requested", "approved", "closed"]>;
        priority: z.ZodEnum<["low", "normal", "high", "urgent"]>;
        authorId: z.ZodString;
        createdAt: z.ZodString;
        updatedAt: z.ZodString;
        claimedBy: z.ZodNullable<z.ZodString>;
        claimedAt: z.ZodNullable<z.ZodString>;
        claimGeneration: z.ZodNumber;
    } & {
        currentRound: z.ZodNumber;
        latestVerdict: z.ZodNullable<z.ZodEnum<["changes_requested", "approved"]>>;
        verdictReason: z.ZodNullable<z.ZodString>;
        counterPatchStatus: z.ZodEnum<["none", "pending", "accepted", "rejected"]>;
        lastMessageAt: z.ZodNullable<z.ZodString>;
        lastActivityAt: z.ZodNullable<z.ZodString>;
    }, "strict", z.ZodTypeAny, {
        status: "pending" | "claimed" | "submitted" | "changes_requested" | "approved" | "closed";
        currentRound: number;
        latestVerdict: "changes_requested" | "approved" | null;
        verdictReason: string | null;
        counterPatchStatus: "pending" | "none" | "accepted" | "rejected";
        lastMessageAt: string | null;
        lastActivityAt: string | null;
        reviewId: string;
        title: string;
        priority: "low" | "normal" | "high" | "urgent";
        authorId: string;
        createdAt: string;
        updatedAt: string;
        claimedBy: string | null;
        claimedAt: string | null;
        claimGeneration: number;
    }, {
        status: "pending" | "claimed" | "submitted" | "changes_requested" | "approved" | "closed";
        currentRound: number;
        latestVerdict: "changes_requested" | "approved" | null;
        verdictReason: string | null;
        counterPatchStatus: "pending" | "none" | "accepted" | "rejected";
        lastMessageAt: string | null;
        lastActivityAt: string | null;
        reviewId: string;
        title: string;
        priority: "low" | "normal" | "high" | "urgent";
        authorId: string;
        createdAt: string;
        updatedAt: string;
        claimedBy: string | null;
        claimedAt: string | null;
        claimGeneration: number;
    }>;
    proposal: z.ZodObject<{
        reviewId: z.ZodString;
        title: z.ZodString;
        description: z.ZodString;
        diff: z.ZodString;
        affectedFiles: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        priority: z.ZodEnum<["low", "normal", "high", "urgent"]>;
    } & {
        currentRound: z.ZodNumber;
        latestVerdict: z.ZodNullable<z.ZodEnum<["changes_requested", "approved"]>>;
        verdictReason: z.ZodNullable<z.ZodString>;
        counterPatchStatus: z.ZodEnum<["none", "pending", "accepted", "rejected"]>;
        lastMessageAt: z.ZodNullable<z.ZodString>;
        lastActivityAt: z.ZodNullable<z.ZodString>;
    }, "strict", z.ZodTypeAny, {
        currentRound: number;
        latestVerdict: "changes_requested" | "approved" | null;
        verdictReason: string | null;
        counterPatchStatus: "pending" | "none" | "accepted" | "rejected";
        lastMessageAt: string | null;
        lastActivityAt: string | null;
        reviewId: string;
        title: string;
        priority: "low" | "normal" | "high" | "urgent";
        description: string;
        diff: string;
        affectedFiles: string[];
    }, {
        currentRound: number;
        latestVerdict: "changes_requested" | "approved" | null;
        verdictReason: string | null;
        counterPatchStatus: "pending" | "none" | "accepted" | "rejected";
        lastMessageAt: string | null;
        lastActivityAt: string | null;
        reviewId: string;
        title: string;
        priority: "low" | "normal" | "high" | "urgent";
        description: string;
        diff: string;
        affectedFiles?: string[] | undefined;
    }>;
    version: z.ZodNumber;
}, "strict", z.ZodTypeAny, {
    review: {
        status: "pending" | "claimed" | "submitted" | "changes_requested" | "approved" | "closed";
        currentRound: number;
        latestVerdict: "changes_requested" | "approved" | null;
        verdictReason: string | null;
        counterPatchStatus: "pending" | "none" | "accepted" | "rejected";
        lastMessageAt: string | null;
        lastActivityAt: string | null;
        reviewId: string;
        title: string;
        priority: "low" | "normal" | "high" | "urgent";
        authorId: string;
        createdAt: string;
        updatedAt: string;
        claimedBy: string | null;
        claimedAt: string | null;
        claimGeneration: number;
    };
    proposal: {
        currentRound: number;
        latestVerdict: "changes_requested" | "approved" | null;
        verdictReason: string | null;
        counterPatchStatus: "pending" | "none" | "accepted" | "rejected";
        lastMessageAt: string | null;
        lastActivityAt: string | null;
        reviewId: string;
        title: string;
        priority: "low" | "normal" | "high" | "urgent";
        description: string;
        diff: string;
        affectedFiles: string[];
    };
    version: number;
}, {
    review: {
        status: "pending" | "claimed" | "submitted" | "changes_requested" | "approved" | "closed";
        currentRound: number;
        latestVerdict: "changes_requested" | "approved" | null;
        verdictReason: string | null;
        counterPatchStatus: "pending" | "none" | "accepted" | "rejected";
        lastMessageAt: string | null;
        lastActivityAt: string | null;
        reviewId: string;
        title: string;
        priority: "low" | "normal" | "high" | "urgent";
        authorId: string;
        createdAt: string;
        updatedAt: string;
        claimedBy: string | null;
        claimedAt: string | null;
        claimGeneration: number;
    };
    proposal: {
        currentRound: number;
        latestVerdict: "changes_requested" | "approved" | null;
        verdictReason: string | null;
        counterPatchStatus: "pending" | "none" | "accepted" | "rejected";
        lastMessageAt: string | null;
        lastActivityAt: string | null;
        reviewId: string;
        title: string;
        priority: "low" | "normal" | "high" | "urgent";
        description: string;
        diff: string;
        affectedFiles?: string[] | undefined;
    };
    version: number;
}>;
export type CreateReviewRequest = z.infer<typeof CreateReviewRequestSchema>;
export type CreateReviewResponse = z.infer<typeof CreateReviewResponseSchema>;
export type ListReviewsRequest = z.infer<typeof ListReviewsRequestSchema>;
export type ListReviewsResponse = z.infer<typeof ListReviewsResponseSchema>;
export type SpawnReviewerRequest = z.infer<typeof SpawnReviewerRequestSchema>;
export type SpawnReviewerResponse = z.infer<typeof SpawnReviewerResponseSchema>;
export type ListReviewersRequest = z.infer<typeof ListReviewersRequestSchema>;
export type ListReviewersResponse = z.infer<typeof ListReviewersResponseSchema>;
export type KillReviewerRequest = z.infer<typeof KillReviewerRequestSchema>;
export type KillReviewerResponse = z.infer<typeof KillReviewerResponseSchema>;
export type ClaimReviewRequest = z.infer<typeof ClaimReviewRequestSchema>;
export type ClaimReviewResponse = z.infer<typeof ClaimReviewResponseSchema>;
export type GetReviewStatusRequest = z.infer<typeof GetReviewStatusRequestSchema>;
export type GetReviewStatusResponse = z.infer<typeof GetReviewStatusResponseSchema>;
export type GetProposalRequest = z.infer<typeof GetProposalRequestSchema>;
export type GetProposalResponse = z.infer<typeof GetProposalResponseSchema>;
export type ReclaimReviewRequest = z.infer<typeof ReclaimReviewRequestSchema>;
export type ReclaimReviewResponse = z.infer<typeof ReclaimReviewResponseSchema>;
export type SubmitVerdictRequest = z.infer<typeof SubmitVerdictRequestSchema>;
export type SubmitVerdictResponse = z.infer<typeof SubmitVerdictResponseSchema>;
export type CloseReviewRequest = z.infer<typeof CloseReviewRequestSchema>;
export type CloseReviewResponse = z.infer<typeof CloseReviewResponseSchema>;
export type AddMessageRequest = z.infer<typeof AddMessageRequestSchema>;
export type AddMessageResponse = z.infer<typeof AddMessageResponseSchema>;
export type GetDiscussionRequest = z.infer<typeof GetDiscussionRequestSchema>;
export type GetDiscussionResponse = z.infer<typeof GetDiscussionResponseSchema>;
export type GetActivityFeedRequest = z.infer<typeof GetActivityFeedRequestSchema>;
export type GetActivityFeedResponse = z.infer<typeof GetActivityFeedResponseSchema>;
export type AcceptCounterPatchRequest = z.infer<typeof AcceptCounterPatchRequestSchema>;
export type AcceptCounterPatchResponse = z.infer<typeof AcceptCounterPatchResponseSchema>;
export type RejectCounterPatchRequest = z.infer<typeof RejectCounterPatchRequestSchema>;
export type RejectCounterPatchResponse = z.infer<typeof RejectCounterPatchResponseSchema>;
export declare function parseWithSchema<TSchema extends z.ZodTypeAny>(schema: TSchema, input: unknown): z.infer<TSchema>;
//# sourceMappingURL=contracts.d.ts.map