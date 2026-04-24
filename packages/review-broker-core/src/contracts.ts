import { z } from 'zod';

import {
  AUDIT_EVENT_TYPES,
  COUNTER_PATCH_STATUSES,
  NOTIFICATION_TOPICS,
  REVIEW_MESSAGE_AUTHOR_ROLES,
  REVIEW_PRIORITIES,
  REVIEW_RECLAIM_CAUSES,
  REVIEW_STATUSES,
  REVIEW_VERDICTS,
  REVIEWER_OFFLINE_REASONS,
  REVIEWER_STATUSES,
} from './domain.js';

export const ReviewStatusSchema = z.enum(REVIEW_STATUSES);
export const ReviewPrioritySchema = z.enum(REVIEW_PRIORITIES);
export const ReviewerStatusSchema = z.enum(REVIEWER_STATUSES);
export const ReviewerOfflineReasonSchema = z.enum(REVIEWER_OFFLINE_REASONS);
export const ReviewReclaimCauseSchema = z.enum(REVIEW_RECLAIM_CAUSES);
export const ReviewVerdictSchema = z.enum(REVIEW_VERDICTS);
export const CounterPatchStatusSchema = z.enum(COUNTER_PATCH_STATUSES);
export const ReviewMessageAuthorRoleSchema = z.enum(REVIEW_MESSAGE_AUTHOR_ROLES);
export const AuditEventTypeSchema = z.enum(AUDIT_EVENT_TYPES);
export const NotificationTopicSchema = z.enum(NOTIFICATION_TOPICS);

export const ReviewIdSchema = z.string().min(1, 'reviewId is required');
export const ReviewerIdSchema = z.string().min(1, 'reviewerId is required');
export const ActorIdSchema = z.string().min(1, 'actorId is required');
export const IsoDateTimeSchema = z.string().datetime({ offset: true });
export const VersionSchema = z.number().int().nonnegative();
export const ClaimGenerationSchema = z.number().int().nonnegative();
export const CurrentRoundSchema = z.number().int().positive();
export const MessageIdSchema = z.number().int().positive();
export const AuditEventIdSchema = z.number().int().positive();
export const VerdictReasonSchema = z.string().trim().min(1, 'reason is required');
export const MessageBodySchema = z.string().trim().min(1, 'message body is required');
export const ReviewerCommandSchema = z.string().trim().min(1, 'command is required');
export const ReviewerArgsSchema = z.array(z.string().min(1));
export const OptionalDecisionNoteSchema = z.string().trim().min(1).optional();

export const WaitOptionsSchema = z
  .object({
    wait: z.boolean().optional(),
    sinceVersion: VersionSchema.optional(),
    timeoutMs: z.number().int().positive().max(60_000).optional(),
  })
  .strict();

export const AffectedFilesSchema = z.array(z.string().min(1)).default([]);

export const ReviewLifecycleSnapshotSchema = z
  .object({
    currentRound: CurrentRoundSchema,
    latestVerdict: ReviewVerdictSchema.nullable(),
    verdictReason: VerdictReasonSchema.nullable(),
    counterPatchStatus: CounterPatchStatusSchema,
    lastMessageAt: IsoDateTimeSchema.nullable(),
    lastActivityAt: IsoDateTimeSchema.nullable(),
  })
  .strict();

export const ReviewProjectIdentitySchema = z
  .object({
    workspaceRoot: z.string().trim().min(1).nullable(),
    projectName: z.string().trim().min(1).nullable(),
  })
  .strict();

export const ReviewSummarySchema = z
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
  })
  .merge(ReviewProjectIdentitySchema)
  .merge(ReviewLifecycleSnapshotSchema)
  .strict();

export const ReviewProposalSchema = z
  .object({
    reviewId: ReviewIdSchema,
    title: z.string().min(1),
    description: z.string().min(1),
    diff: z.string().min(1),
    affectedFiles: AffectedFilesSchema,
    priority: ReviewPrioritySchema,
  })
  .merge(ReviewProjectIdentitySchema)
  .merge(ReviewLifecycleSnapshotSchema)
  .strict();

export const ReviewRecordSchema = ReviewSummarySchema.extend({
  description: z.string().min(1),
  diff: z.string().min(1),
  affectedFiles: AffectedFilesSchema,
}).strict();

export const ReviewDiscussionMessageSchema = z
  .object({
    messageId: MessageIdSchema,
    reviewId: ReviewIdSchema,
    actorId: ActorIdSchema,
    authorRole: ReviewMessageAuthorRoleSchema,
    body: MessageBodySchema,
    createdAt: IsoDateTimeSchema,
  })
  .strict();

export const ReviewActivityEntrySchema = z
  .object({
    auditEventId: AuditEventIdSchema,
    reviewId: ReviewIdSchema,
    eventType: AuditEventTypeSchema,
    actorId: ActorIdSchema.nullable(),
    statusFrom: ReviewStatusSchema.nullable(),
    statusTo: ReviewStatusSchema.nullable(),
    errorCode: z.string().min(1).nullable(),
    summary: z.string().min(1).nullable(),
    metadata: z.record(z.unknown()),
    createdAt: IsoDateTimeSchema,
  })
  .strict();

export const ReviewerRecordSchema = z
  .object({
    reviewerId: ReviewerIdSchema,
    status: ReviewerStatusSchema,
    currentReviewId: ReviewIdSchema.nullable(),
    command: ReviewerCommandSchema,
    args: ReviewerArgsSchema,
    cwd: z.string().trim().min(1).nullable(),
    pid: z.number().int().positive().nullable(),
    startedAt: IsoDateTimeSchema.nullable(),
    lastSeenAt: IsoDateTimeSchema.nullable(),
    offlineAt: IsoDateTimeSchema.nullable(),
    offlineReason: ReviewerOfflineReasonSchema.nullable(),
    exitCode: z.number().int().nullable(),
    exitSignal: z.string().min(1).nullable(),
    sessionToken: z.string().min(1).nullable(),
    drainingAt: IsoDateTimeSchema.nullable(),
    createdAt: IsoDateTimeSchema,
    updatedAt: IsoDateTimeSchema,
  })
  .strict();

export const CreateReviewRequestSchema = z
  .object({
    title: z.string().min(1),
    description: z.string().min(1),
    diff: z.string().min(1),
    authorId: ActorIdSchema,
    priority: ReviewPrioritySchema.default('normal'),
  })
  .strict();

export const CreateReviewResponseSchema = z
  .object({
    review: ReviewSummarySchema,
    proposal: ReviewProposalSchema,
    version: VersionSchema,
  })
  .strict();

export const ListReviewsRequestSchema = WaitOptionsSchema.extend({
  status: ReviewStatusSchema.optional(),
  limit: z.number().int().positive().max(100).optional(),
}).strict();

export const ListReviewsResponseSchema = z
  .object({
    reviews: z.array(ReviewSummarySchema),
    version: VersionSchema,
  })
  .strict();

export const SpawnReviewerRequestSchema = z
  .object({
    reviewerId: ReviewerIdSchema.optional(),
    command: ReviewerCommandSchema,
    args: ReviewerArgsSchema.default([]),
    cwd: z.string().trim().min(1).optional(),
  })
  .strict();

export const SpawnReviewerResponseSchema = z
  .object({
    reviewer: ReviewerRecordSchema,
    version: VersionSchema,
  })
  .strict();

export const ListReviewersRequestSchema = WaitOptionsSchema.extend({
  status: ReviewerStatusSchema.optional(),
  limit: z.number().int().positive().max(100).optional(),
}).strict();

export const ListReviewersResponseSchema = z
  .object({
    reviewers: z.array(ReviewerRecordSchema),
    version: VersionSchema,
  })
  .strict();

export const KillReviewerRequestSchema = z
  .object({
    reviewerId: ReviewerIdSchema,
  })
  .strict();

export const KillReviewerOutcomeSchema = z.enum(['killed', 'already_offline', 'not_found']);

export const KillReviewerResponseSchema = z
  .object({
    outcome: KillReviewerOutcomeSchema,
    reviewer: ReviewerRecordSchema.nullable(),
    version: VersionSchema,
    message: z.string().optional(),
  })
  .strict();

export const ClaimReviewRequestSchema = z
  .object({
    reviewId: ReviewIdSchema,
    claimantId: ActorIdSchema,
  })
  .strict();

export const ClaimReviewOutcomeSchema = z.enum(['claimed', 'stale', 'not_claimable']);

export const ClaimReviewResponseSchema = z
  .object({
    outcome: ClaimReviewOutcomeSchema,
    review: ReviewSummarySchema.nullable(),
    version: VersionSchema,
    message: z.string().optional(),
  })
  .strict();

export const GetReviewStatusRequestSchema = WaitOptionsSchema.extend({
  reviewId: ReviewIdSchema,
}).strict();

export const GetReviewStatusResponseSchema = z
  .object({
    review: ReviewSummarySchema,
    version: VersionSchema,
  })
  .strict();

export const GetProposalRequestSchema = z
  .object({
    reviewId: ReviewIdSchema,
  })
  .strict();

export const GetProposalResponseSchema = z
  .object({
    proposal: ReviewProposalSchema,
    version: VersionSchema,
  })
  .strict();

export const ReclaimReviewRequestSchema = z
  .object({
    reviewId: ReviewIdSchema,
    actorId: ActorIdSchema,
  })
  .strict();

export const ReclaimReviewResponseSchema = z
  .object({
    review: ReviewSummarySchema,
    version: VersionSchema,
  })
  .strict();

export const SubmitVerdictRequestSchema = z
  .object({
    reviewId: ReviewIdSchema,
    actorId: ActorIdSchema,
    verdict: ReviewVerdictSchema,
    reason: VerdictReasonSchema,
  })
  .strict();

export const SubmitVerdictResponseSchema = z
  .object({
    review: ReviewSummarySchema,
    proposal: ReviewProposalSchema,
    version: VersionSchema,
  })
  .strict();

export const CloseReviewRequestSchema = z
  .object({
    reviewId: ReviewIdSchema,
    actorId: ActorIdSchema,
  })
  .strict();

export const CloseReviewResponseSchema = z
  .object({
    review: ReviewSummarySchema,
    version: VersionSchema,
  })
  .strict();

export const AddMessageRequestSchema = z
  .object({
    reviewId: ReviewIdSchema,
    actorId: ActorIdSchema,
    body: MessageBodySchema,
    /**
     * Optional replacement proposal diff for proposer counter-patches.
     *
     * When provided by the proposer while requeueing a changes_requested review,
     * broker-service validates and persists this as the canonical review proposal
     * so reviewers do not keep evaluating stale diffs from the original round.
     */
    diff: z.string().min(1).optional(),
  })
  .strict();

export const AddMessageResponseSchema = z
  .object({
    review: ReviewSummarySchema,
    message: ReviewDiscussionMessageSchema,
    version: VersionSchema,
  })
  .strict();

export const GetDiscussionRequestSchema = z
  .object({
    reviewId: ReviewIdSchema,
  })
  .strict();

export const GetDiscussionResponseSchema = z
  .object({
    review: ReviewSummarySchema,
    messages: z.array(ReviewDiscussionMessageSchema),
    version: VersionSchema,
  })
  .strict();

export const GetActivityFeedRequestSchema = z
  .object({
    reviewId: ReviewIdSchema,
    limit: z.number().int().positive().max(200).optional(),
  })
  .strict();

export const GetActivityFeedResponseSchema = z
  .object({
    review: ReviewSummarySchema,
    activity: z.array(ReviewActivityEntrySchema),
    version: VersionSchema,
  })
  .strict();

export const AcceptCounterPatchRequestSchema = z
  .object({
    reviewId: ReviewIdSchema,
    actorId: ActorIdSchema,
    note: OptionalDecisionNoteSchema,
  })
  .strict();

export const AcceptCounterPatchResponseSchema = z
  .object({
    review: ReviewSummarySchema,
    proposal: ReviewProposalSchema,
    version: VersionSchema,
  })
  .strict();

export const RejectCounterPatchRequestSchema = z
  .object({
    reviewId: ReviewIdSchema,
    actorId: ActorIdSchema,
    note: OptionalDecisionNoteSchema,
  })
  .strict();

export const RejectCounterPatchResponseSchema = z
  .object({
    review: ReviewSummarySchema,
    proposal: ReviewProposalSchema,
    version: VersionSchema,
  })
  .strict();

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

export function parseWithSchema<TSchema extends z.ZodTypeAny>(schema: TSchema, input: unknown): z.infer<TSchema> {
  return schema.parse(input);
}
