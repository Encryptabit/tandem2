import { randomUUID } from 'node:crypto';

import {
  AcceptCounterPatchRequestSchema,
  AcceptCounterPatchResponseSchema,
  AddMessageRequestSchema,
  AddMessageResponseSchema,
  ClaimReviewRequestSchema,
  ClaimReviewResponseSchema,
  CloseReviewRequestSchema,
  CloseReviewResponseSchema,
  CreateReviewRequestSchema,
  CreateReviewResponseSchema,
  GetActivityFeedRequestSchema,
  GetActivityFeedResponseSchema,
  GetDiscussionRequestSchema,
  GetDiscussionResponseSchema,
  GetProposalRequestSchema,
  GetProposalResponseSchema,
  GetReviewStatusRequestSchema,
  GetReviewStatusResponseSchema,
  KillReviewerRequestSchema,
  KillReviewerResponseSchema,
  ListReviewersRequestSchema,
  ListReviewersResponseSchema,
  ListReviewsRequestSchema,
  ListReviewsResponseSchema,
  RejectCounterPatchRequestSchema,
  RejectCounterPatchResponseSchema,
  ReclaimReviewRequestSchema,
  ReclaimReviewResponseSchema,
  SpawnReviewerRequestSchema,
  SpawnReviewerResponseSchema,
  SubmitVerdictRequestSchema,
  SubmitVerdictResponseSchema,
  parseWithSchema,
  validateTransition,
  type AcceptCounterPatchRequest,
  type AcceptCounterPatchResponse,
  type AddMessageRequest,
  type AddMessageResponse,
  type ClaimReviewRequest,
  type ClaimReviewResponse,
  type CloseReviewRequest,
  type CloseReviewResponse,
  type CounterPatchStatus,
  type CreateReviewRequest,
  type CreateReviewResponse,
  type GetActivityFeedRequest,
  type GetActivityFeedResponse,
  type GetDiscussionRequest,
  type GetDiscussionResponse,
  type GetProposalRequest,
  type GetProposalResponse,
  type GetReviewStatusRequest,
  type GetReviewStatusResponse,
  type KillReviewerRequest,
  type KillReviewerResponse,
  type ListReviewersRequest,
  type ListReviewersResponse,
  type ListReviewsRequest,
  type ListReviewsResponse,
  type RejectCounterPatchRequest,
  type RejectCounterPatchResponse,
  type ReviewActivityEntry,
  type ReviewDiscussionMessage,
  type ReviewMessageAuthorRole,
  type ReviewRecord,
  type ReviewReclaimCause,
  type ReviewSummary,
  type ReviewVerdict,
  type ReviewerStatus,
  type ReclaimReviewRequest,
  type ReclaimReviewResponse,
  type SpawnReviewerRequest,
  type SpawnReviewerResponse,
  type SubmitVerdictRequest,
  type SubmitVerdictResponse,
} from 'review-broker-core';

import type { StoredReviewMessage } from '../db/messages-repository.js';
import type { AppContext } from './app-context.js';
import { DiffValidationError, validateReviewDiff } from './diff.js';
import type { PoolManager } from './reviewer-pool.js';

const REVIEWS_TOPIC = 'reviews';
const REVIEW_QUEUE_TOPIC = 'review-queue';
const REVIEWER_STATE_TOPIC = 'reviewer-state';

export type BrokerServiceErrorCode =
  | 'DIFF_VALIDATION_FAILED'
  | 'INVALID_COUNTER_PATCH_STATE'
  | 'INVALID_DIFF'
  | 'INVALID_REVIEW_TRANSITION'
  | 'REVIEW_NOT_FOUND'
  | 'STALE_CLAIM_GENERATION';

export class BrokerServiceError extends Error {
  readonly code: BrokerServiceErrorCode;
  readonly reviewId?: string;

  constructor(options: { code: BrokerServiceErrorCode; message: string; reviewId?: string }) {
    super(options.message);
    this.name = 'BrokerServiceError';
    this.code = options.code;

    if (options.reviewId !== undefined) {
      this.reviewId = options.reviewId;
    }
  }
}

export interface BrokerService {
  createReview: (input: CreateReviewRequest) => Promise<CreateReviewResponse>;
  listReviews: (input: ListReviewsRequest) => Promise<ListReviewsResponse>;
  spawnReviewer: (input: SpawnReviewerRequest) => Promise<SpawnReviewerResponse>;
  listReviewers: (input: ListReviewersRequest) => Promise<ListReviewersResponse>;
  killReviewer: (input: KillReviewerRequest) => Promise<KillReviewerResponse>;
  claimReview: (input: ClaimReviewRequest) => Promise<ClaimReviewResponse>;
  getReviewStatus: (input: GetReviewStatusRequest) => Promise<GetReviewStatusResponse>;
  getProposal: (input: GetProposalRequest) => Promise<GetProposalResponse>;
  reclaimReview: (input: ReclaimReviewRequest) => Promise<ReclaimReviewResponse>;
  submitVerdict: (input: SubmitVerdictRequest) => Promise<SubmitVerdictResponse>;
  closeReview: (input: CloseReviewRequest) => Promise<CloseReviewResponse>;
  addMessage: (input: AddMessageRequest) => Promise<AddMessageResponse>;
  getDiscussion: (input: GetDiscussionRequest) => Promise<GetDiscussionResponse>;
  getActivityFeed: (input: GetActivityFeedRequest) => Promise<GetActivityFeedResponse>;
  acceptCounterPatch: (input: AcceptCounterPatchRequest) => Promise<AcceptCounterPatchResponse>;
  rejectCounterPatch: (input: RejectCounterPatchRequest) => Promise<RejectCounterPatchResponse>;
  /** @internal Wire in pool manager for reactive scaling triggers. */
  _setPoolManager: (poolManager: PoolManager) => void;
}

export interface CreateBrokerServiceOptions {
  now?: () => string;
  reviewIdFactory?: () => string;
  yieldForClaimRace?: () => Promise<void>;
  yieldForRecoveryRace?: (input: { reviewId: string; reviewerId: string; cause: ReviewReclaimCause }) => Promise<void>;
}

export interface ReviewerRecoveryAttempt {
  reviewId: string;
  outcome: 'reclaimed' | 'stale' | 'not_recoverable';
  previousStatus: ReviewRecord['status'];
  expectedClaimGeneration: number;
  actualStatus: ReviewRecord['status'] | null;
  actualClaimGeneration: number | null;
}

export interface ReviewerRecoverySummary {
  reviewerId: string;
  cause: ReviewReclaimCause;
  attempts: ReviewerRecoveryAttempt[];
  reclaimedReviewIds: string[];
  staleReviewIds: string[];
  unrecoverableReviewIds: string[];
}

export function createBrokerService(context: AppContext, options: CreateBrokerServiceOptions = {}): BrokerService {
  const now = options.now ?? (() => new Date().toISOString());
  const reviewIdFactory = options.reviewIdFactory ?? (() => `rvw_${randomUUID().replace(/-/g, '')}`);
  const yieldForClaimRace = options.yieldForClaimRace ?? (() => Promise.resolve());
  const yieldForRecoveryRace = options.yieldForRecoveryRace ?? (() => Promise.resolve());

  // Pool manager reference for reactive scaling triggers (set after construction)
  let poolManagerRef: PoolManager | null = null;

  function triggerReactiveScaling(): void {
    if (poolManagerRef) {
      setImmediate(() => {
        poolManagerRef!.reactiveScale().catch(() => {});
      });
    }
  }

  context.reviewerManager.setOfflineHandler(async (event) => {
    const recovery = await recoverReviewerAssignments(context, {
      reviewerId: event.reviewerId,
      cause: event.offlineReason,
      now,
      yieldForRecoveryRace,
    });

    return {
      reclaimedReviewIds: recovery.reclaimedReviewIds,
      staleReviewIds: recovery.staleReviewIds,
      unrecoverableReviewIds: recovery.unrecoverableReviewIds,
    };
  });

  return {
    async createReview(input) {
      const request = parseWithSchema(CreateReviewRequestSchema, input);
      let validatedDiff;

      try {
        validatedDiff = validateReviewDiff({
          diff: request.diff,
          workspaceRoot: context.workspaceRoot,
        });
      } catch (error) {
        if (error instanceof DiffValidationError) {
          const createdAt = now();
          context.db.transaction(() => {
            context.audit.append({
              eventType: 'review.diff_rejected',
              actorId: request.authorId,
              errorCode: error.code,
              createdAt,
              metadata: {
                authorId: request.authorId,
                title: request.title,
                workspaceRoot: context.workspaceRoot,
                affectedFiles: error.affectedFiles,
              },
            });
          })();

          throw new BrokerServiceError({
            code: error.code === 'DIFF_VALIDATION_FAILED' ? 'DIFF_VALIDATION_FAILED' : 'INVALID_DIFF',
            message: error.message,
          });
        }

        throw error;
      }

      const createdAt = now();
      const reviewId = reviewIdFactory();
      const persistedReview = context.db.transaction(() => {
        const review = context.reviews.insert({
          reviewId,
          title: request.title,
          description: request.description,
          diff: request.diff,
          affectedFiles: validatedDiff.affectedFiles,
          priority: request.priority,
          authorId: request.authorId,
          createdAt,
          updatedAt: createdAt,
        });

        context.audit.append({
          reviewId,
          eventType: 'review.created',
          actorId: request.authorId,
          statusFrom: null,
          statusTo: 'pending',
          createdAt,
          metadata: {
            reviewId,
            affectedFiles: validatedDiff.affectedFiles,
            priority: request.priority,
            fileCount: validatedDiff.fileCount,
            summary: 'Review created and queued for assignment.',
          },
        });

        return review;
      })();

      const versions = notifyReviewMutation(context, reviewId);

      // Fire-and-forget reactive scaling — new review demand may require more reviewers
      triggerReactiveScaling();

      return parseWithSchema(CreateReviewResponseSchema, {
        review: toReviewSummary(persistedReview),
        proposal: toReviewProposal(persistedReview),
        version: versions.queueVersion,
      });
    },

    async listReviews(input) {
      const request = parseWithSchema(ListReviewsRequestSchema, input);

      if (request.wait && request.sinceVersion !== undefined) {
        await context.notifications.waitForChange(
          REVIEW_QUEUE_TOPIC,
          request.sinceVersion,
          buildWaitForChangeOptions(request.timeoutMs),
        );
      }

      return parseWithSchema(ListReviewsResponseSchema, {
        reviews: context.reviews.list(buildListReviewsOptions(request)),
        version: currentQueueVersion(context),
      });
    },

    async spawnReviewer(input) {
      const request = parseWithSchema(SpawnReviewerRequestSchema, input);
      const reviewer = await context.reviewerManager.spawnReviewer({
        command: request.command,
        args: request.args,
        ...(request.reviewerId !== undefined ? { reviewerId: request.reviewerId } : {}),
        ...(request.cwd !== undefined ? { cwd: request.cwd } : {}),
      });

      return parseWithSchema(SpawnReviewerResponseSchema, {
        reviewer,
        version: currentReviewerVersion(context),
      });
    },

    async listReviewers(input) {
      const request = parseWithSchema(ListReviewersRequestSchema, input);

      if (request.wait && request.sinceVersion !== undefined) {
        await context.notifications.waitForChange(
          REVIEWER_STATE_TOPIC,
          request.sinceVersion,
          buildWaitForChangeOptions(request.timeoutMs),
        );
      }

      return parseWithSchema(ListReviewersResponseSchema, {
        reviewers: context.reviewers.list(buildListReviewersOptions(request)),
        version: currentReviewerVersion(context),
      });
    },

    async killReviewer(input) {
      const request = parseWithSchema(KillReviewerRequestSchema, input);
      const result = await context.reviewerManager.stopReviewer(request.reviewerId);

      return parseWithSchema(KillReviewerResponseSchema, {
        outcome: result.outcome,
        reviewer: result.reviewer,
        version: currentReviewerVersion(context),
        ...(buildKillReviewerMessage(request.reviewerId, result.outcome)
          ? { message: buildKillReviewerMessage(request.reviewerId, result.outcome)! }
          : {}),
      });
    },

    async claimReview(input) {
      const request = parseWithSchema(ClaimReviewRequestSchema, input);
      const current = context.reviews.getById(request.reviewId);

      if (!current) {
        return parseClaimResponse({
          outcome: 'not_claimable',
          review: null,
          version: currentQueueVersion(context),
          message: `Review ${request.reviewId} was not found.`,
        });
      }

      const transition = validateTransition(current.status, 'claimed');
      if (!transition.ok) {
        persistClaimRejection({
          context,
          reviewId: current.reviewId,
          actorId: request.claimantId,
          statusFrom: current.status,
          errorCode: 'REVIEW_NOT_CLAIMABLE',
          metadata: {
            reviewId: current.reviewId,
            outcome: 'not_claimable',
            attemptedEvent: 'claim',
          },
          createdAt: now(),
        });

        return parseClaimResponse({
          outcome: 'not_claimable',
          review: toReviewSummary(current),
          version: currentQueueVersion(context),
          message: `Review ${current.reviewId} is not claimable from status ${current.status}.`,
        });
      }

      await yieldForClaimRace();
      const claimedAt = now();
      const updated = context.db.transaction(() => {
        const review = context.reviews.updateState({
          reviewId: request.reviewId,
          status: 'claimed',
          claimedBy: request.claimantId,
          claimedAt,
          expectedClaimGeneration: current.claimGeneration,
          incrementClaimGeneration: true,
          updatedAt: claimedAt,
        });

        if (!review) {
          return null;
        }

        context.audit.append({
          reviewId: review.reviewId,
          eventType: 'review.claimed',
          actorId: request.claimantId,
          statusFrom: current.status,
          statusTo: 'claimed',
          createdAt: claimedAt,
          metadata: {
            reviewId: review.reviewId,
            outcome: 'claimed',
            claimGeneration: review.claimGeneration,
            summary: `Review claimed by ${request.claimantId}.`,
          },
        });

        return review;
      })();

      if (!updated) {
        const latest = context.reviews.getById(request.reviewId);
        const outcome = latest && latest.claimGeneration !== current.claimGeneration ? 'stale' : 'not_claimable';
        const rejectionCode = outcome === 'stale' ? 'STALE_CLAIM_GENERATION' : 'REVIEW_NOT_CLAIMABLE';

        persistClaimRejection({
          context,
          reviewId: request.reviewId,
          actorId: request.claimantId,
          statusFrom: current.status,
          errorCode: rejectionCode,
          metadata: {
            reviewId: request.reviewId,
            outcome,
            attemptedEvent: 'claim',
            expectedClaimGeneration: current.claimGeneration,
            actualClaimGeneration: latest?.claimGeneration ?? null,
          },
          createdAt: now(),
        });

        return parseClaimResponse({
          outcome,
          review: latest ? toReviewSummary(latest) : null,
          version: currentQueueVersion(context),
          message:
            outcome === 'stale'
              ? `Review ${request.reviewId} changed before the claim could be recorded.`
              : `Review ${request.reviewId} is not claimable anymore.`,
        });
      }

      const versions = notifyReviewMutation(context, updated.reviewId);
      return parseClaimResponse({
        outcome: 'claimed',
        review: toReviewSummary(updated),
        version: versions.queueVersion,
        message: `Review ${updated.reviewId} claimed by ${request.claimantId}.`,
      });
    },

    async getReviewStatus(input) {
      const request = parseWithSchema(GetReviewStatusRequestSchema, input);
      ensureReviewExists(context, request.reviewId);

      if (request.wait && request.sinceVersion !== undefined) {
        await context.notifications.waitForChange(
          reviewStatusTopic(request.reviewId),
          request.sinceVersion,
          buildWaitForChangeOptions(request.timeoutMs),
        );
      }

      const review = ensureReviewExists(context, request.reviewId);
      return parseWithSchema(GetReviewStatusResponseSchema, {
        review: toReviewSummary(review),
        version: currentStatusVersion(context, request.reviewId),
      });
    },

    async getProposal(input) {
      const request = parseWithSchema(GetProposalRequestSchema, input);
      const review = ensureReviewExists(context, request.reviewId);

      return parseWithSchema(GetProposalResponseSchema, {
        proposal: toReviewProposal(review),
        version: currentStatusVersion(context, request.reviewId),
      });
    },

    async reclaimReview(input) {
      const request = parseWithSchema(ReclaimReviewRequestSchema, input);
      const current = ensureReviewExists(context, request.reviewId);
      const transition = validateTransition(current.status, 'pending');

      if (!transition.ok) {
        persistTransitionRejection({
          context,
          review: current,
          actorId: request.actorId,
          statusTo: 'pending',
          errorCode: 'INVALID_REVIEW_TRANSITION',
          createdAt: now(),
          metadata: {
            reviewId: current.reviewId,
            attemptedEvent: 'reclaim',
            outcome: 'invalid_transition',
          },
        });

        throw new BrokerServiceError({
          code: 'INVALID_REVIEW_TRANSITION',
          reviewId: current.reviewId,
          message: `Review ${current.reviewId} cannot be reclaimed from status ${current.status}.`,
        });
      }

      const reclaimedAt = now();
      const updated = context.db.transaction(() => {
        const review = context.reviews.updateState({
          reviewId: request.reviewId,
          status: 'pending',
          claimedBy: null,
          claimedAt: null,
          expectedClaimGeneration: current.claimGeneration,
          expectedStatus: current.status,
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
          actorId: request.actorId,
          statusFrom: current.status,
          statusTo: 'pending',
          createdAt: reclaimedAt,
          metadata: {
            reviewId: review.reviewId,
            claimGeneration: review.claimGeneration,
            summary: 'Review returned to the queue.',
          },
        });

        return review;
      })();

      if (!updated) {
        const latest = ensureReviewExists(context, request.reviewId);
        persistTransitionRejection({
          context,
          review: latest,
          actorId: request.actorId,
          statusTo: 'pending',
          errorCode: 'STALE_CLAIM_GENERATION',
          createdAt: now(),
          metadata: {
            reviewId: latest.reviewId,
            attemptedEvent: 'reclaim',
            outcome: 'stale',
            expectedClaimGeneration: current.claimGeneration,
            actualClaimGeneration: latest.claimGeneration,
          },
        });

        throw new BrokerServiceError({
          code: 'STALE_CLAIM_GENERATION',
          reviewId: latest.reviewId,
          message: `Review ${latest.reviewId} changed before it could be reclaimed.`,
        });
      }

      const versions = notifyReviewMutation(context, updated.reviewId);
      return parseWithSchema(ReclaimReviewResponseSchema, {
        review: toReviewSummary(updated),
        version: versions.queueVersion,
      });
    },

    async submitVerdict(input) {
      const request = parseWithSchema(SubmitVerdictRequestSchema, input);
      const current = ensureReviewExists(context, request.reviewId);

      if (current.status !== 'claimed' && current.status !== 'submitted') {
        persistTransitionRejection({
          context,
          review: current,
          actorId: request.actorId,
          statusTo: request.verdict,
          errorCode: 'INVALID_REVIEW_TRANSITION',
          createdAt: now(),
          metadata: {
            reviewId: current.reviewId,
            attemptedEvent: 'submit_verdict',
            outcome: 'invalid_transition',
            verdict: request.verdict,
            roundNumber: current.currentRound,
          },
        });

        throw new BrokerServiceError({
          code: 'INVALID_REVIEW_TRANSITION',
          reviewId: current.reviewId,
          message: `Review ${current.reviewId} cannot accept verdict ${request.verdict} from status ${current.status}.`,
        });
      }

      const verdictAt = now();
      const updated = context.db.transaction(() => {
        let workingReview = current;

        if (current.status === 'claimed') {
          const submittedTransition = validateTransition(current.status, 'submitted');

          if (!submittedTransition.ok) {
            throw new BrokerServiceError({
              code: 'INVALID_REVIEW_TRANSITION',
              reviewId: current.reviewId,
              message: `Review ${current.reviewId} cannot enter active discussion from status ${current.status}.`,
            });
          }

          const submittedReview = context.reviews.updateState({
            reviewId: current.reviewId,
            status: 'submitted',
            updatedAt: verdictAt,
            lastActivityAt: verdictAt,
          });

          if (!submittedReview) {
            throw new Error(`Review ${current.reviewId} disappeared during verdict submission.`);
          }

          context.audit.append({
            reviewId: current.reviewId,
            eventType: 'review.submitted',
            actorId: request.actorId,
            statusFrom: current.status,
            statusTo: 'submitted',
            createdAt: verdictAt,
            metadata: {
              reviewId: current.reviewId,
              roundNumber: current.currentRound,
              summary: 'Review entered active discussion.',
            },
          });

          workingReview = submittedReview;
        }

        const verdictTransition = validateTransition(workingReview.status, request.verdict);
        if (!verdictTransition.ok) {
          throw new BrokerServiceError({
            code: 'INVALID_REVIEW_TRANSITION',
            reviewId: workingReview.reviewId,
            message: `Review ${workingReview.reviewId} cannot transition from ${workingReview.status} to ${request.verdict}.`,
          });
        }

        const review = context.reviews.recordVerdict({
          reviewId: workingReview.reviewId,
          status: request.verdict,
          verdict: request.verdict,
          reason: request.reason,
          currentRound: workingReview.currentRound,
          updatedAt: verdictAt,
          lastActivityAt: verdictAt,
        });

        if (!review) {
          throw new Error(`Review ${workingReview.reviewId} could not record verdict ${request.verdict}.`);
        }

        context.audit.append({
          reviewId: workingReview.reviewId,
          eventType: request.verdict === 'approved' ? 'review.approved' : 'review.changes_requested',
          actorId: request.actorId,
          statusFrom: workingReview.status,
          statusTo: request.verdict,
          createdAt: verdictAt,
          metadata: {
            reviewId: workingReview.reviewId,
            verdict: request.verdict,
            roundNumber: workingReview.currentRound,
            summary:
              request.verdict === 'approved'
                ? 'Reviewer approved the review.'
                : 'Reviewer requested changes.',
          },
        });

        return review;
      })();

      const versions = notifyReviewMutation(context, updated.reviewId);
      return parseWithSchema(SubmitVerdictResponseSchema, {
        review: toReviewSummary(updated),
        proposal: toReviewProposal(updated),
        version: versions.queueVersion,
      });
    },

    async closeReview(input) {
      const request = parseWithSchema(CloseReviewRequestSchema, input);
      const current = ensureReviewExists(context, request.reviewId);
      const transition = validateTransition(current.status, 'closed');

      if (!transition.ok) {
        persistTransitionRejection({
          context,
          review: current,
          actorId: request.actorId,
          statusTo: 'closed',
          errorCode: 'INVALID_REVIEW_TRANSITION',
          createdAt: now(),
          metadata: {
            reviewId: current.reviewId,
            attemptedEvent: 'close_review',
            outcome: 'invalid_transition',
          },
        });

        throw new BrokerServiceError({
          code: 'INVALID_REVIEW_TRANSITION',
          reviewId: current.reviewId,
          message: `Review ${current.reviewId} cannot be closed from status ${current.status}.`,
        });
      }

      const closedAt = now();
      const updated = context.db.transaction(() => {
        const review = context.reviews.updateState({
          reviewId: current.reviewId,
          status: 'closed',
          updatedAt: closedAt,
          lastActivityAt: closedAt,
        });

        if (!review) {
          throw new Error(`Review ${current.reviewId} could not be closed.`);
        }

        context.audit.append({
          reviewId: current.reviewId,
          eventType: 'review.closed',
          actorId: request.actorId,
          statusFrom: current.status,
          statusTo: 'closed',
          createdAt: closedAt,
          metadata: {
            reviewId: current.reviewId,
            summary: 'Review closed after approval.',
          },
        });

        return review;
      })();

      const versions = notifyReviewMutation(context, updated.reviewId);
      return parseWithSchema(CloseReviewResponseSchema, {
        review: toReviewSummary(updated),
        version: versions.queueVersion,
      });
    },

    async addMessage(input) {
      const request = parseWithSchema(AddMessageRequestSchema, input);
      const current = ensureReviewExists(context, request.reviewId);

      if (current.status === 'closed') {
        persistTransitionRejection({
          context,
          review: current,
          actorId: request.actorId,
          statusTo: current.status,
          errorCode: 'INVALID_REVIEW_TRANSITION',
          createdAt: now(),
          metadata: {
            reviewId: current.reviewId,
            attemptedEvent: 'add_message',
            outcome: 'invalid_transition',
          },
        });

        throw new BrokerServiceError({
          code: 'INVALID_REVIEW_TRANSITION',
          reviewId: current.reviewId,
          message: `Review ${current.reviewId} does not accept new discussion after it is closed.`,
        });
      }

      const actorRole = getAuthorRole(current, request.actorId);
      const createdAt = now();
      const updated = context.db.transaction(() => {
        let workingReview = current;
        let roundNumber = current.currentRound;
        let startedNewRound = false;

        if (current.status === 'claimed') {
          const transition = validateTransition(current.status, 'submitted');
          if (!transition.ok) {
            throw new BrokerServiceError({
              code: 'INVALID_REVIEW_TRANSITION',
              reviewId: current.reviewId,
              message: `Review ${current.reviewId} cannot enter active discussion from status ${current.status}.`,
            });
          }

          const submittedReview = context.reviews.updateState({
            reviewId: current.reviewId,
            status: 'submitted',
            updatedAt: createdAt,
            lastActivityAt: createdAt,
          });

          if (!submittedReview) {
            throw new Error(`Review ${current.reviewId} could not enter active discussion.`);
          }

          context.audit.append({
            reviewId: current.reviewId,
            eventType: 'review.submitted',
            actorId: request.actorId,
            statusFrom: current.status,
            statusTo: 'submitted',
            createdAt,
            metadata: {
              reviewId: current.reviewId,
              roundNumber,
              summary: 'Review entered active discussion.',
            },
          });

          workingReview = submittedReview;
        } else if (current.status === 'changes_requested' && actorRole === 'proposer') {
          const transition = validateTransition(current.status, 'pending');
          if (!transition.ok) {
            throw new BrokerServiceError({
              code: 'INVALID_REVIEW_TRANSITION',
              reviewId: current.reviewId,
              message: `Review ${current.reviewId} cannot be requeued from status ${current.status}.`,
            });
          }

          roundNumber = current.currentRound + 1;
          startedNewRound = true;
          const requeuedReview = context.reviews.updateState({
            reviewId: current.reviewId,
            status: 'pending',
            claimedBy: null,
            claimedAt: null,
            currentRound: roundNumber,
            counterPatchStatus: 'pending',
            counterPatchDecisionActorId: null,
            counterPatchDecisionNote: null,
            counterPatchDecidedAt: null,
            updatedAt: createdAt,
            lastActivityAt: createdAt,
          });

          if (!requeuedReview) {
            throw new Error(`Review ${current.reviewId} could not be requeued.`);
          }

          context.audit.append({
            reviewId: current.reviewId,
            eventType: 'review.requeued',
            actorId: request.actorId,
            statusFrom: current.status,
            statusTo: 'pending',
            createdAt,
            metadata: {
              reviewId: current.reviewId,
              roundNumber,
              counterPatchStatus: 'pending',
              summary: 'Proposer requeued the review with follow-up changes.',
            },
          });

          workingReview = requeuedReview;
        }

        const message = context.messages.insert({
          reviewId: current.reviewId,
          actorId: request.actorId,
          authorRole: actorRole,
          roundNumber,
          body: request.body,
          createdAt,
        });

        const review = context.reviews.recordMessageActivity({
          reviewId: current.reviewId,
          lastMessageAt: createdAt,
          currentRound: roundNumber,
          updatedAt: createdAt,
          lastActivityAt: createdAt,
        });

        if (!review) {
          throw new Error(`Review ${current.reviewId} could not record message activity.`);
        }

        context.audit.append({
          reviewId: current.reviewId,
          eventType: 'review.message_added',
          actorId: request.actorId,
          statusFrom: review.status,
          statusTo: review.status,
          createdAt,
          metadata: {
            reviewId: current.reviewId,
            messageId: message.messageId,
            roundNumber,
            authorRole: actorRole,
            summary: buildMessageSummary(actorRole, roundNumber, startedNewRound),
          },
        });

        return {
          review,
          message: toDiscussionMessage(message),
        };
      })();

      const versions = notifyReviewMutation(context, current.reviewId);

      // Fire-and-forget reactive scaling — new messages may signal demand for reviewers
      triggerReactiveScaling();

      return parseWithSchema(AddMessageResponseSchema, {
        review: toReviewSummary(updated.review),
        message: updated.message,
        version: versions.queueVersion,
      });
    },

    async getDiscussion(input) {
      const request = parseWithSchema(GetDiscussionRequestSchema, input);
      const review = ensureReviewExists(context, request.reviewId);

      return parseWithSchema(GetDiscussionResponseSchema, {
        review: toReviewSummary(review),
        messages: context.messages.listForReview(request.reviewId).map((message) => toDiscussionMessage(message)),
        version: currentStatusVersion(context, request.reviewId),
      });
    },

    async getActivityFeed(input) {
      const request = parseWithSchema(GetActivityFeedRequestSchema, input);
      const review = ensureReviewExists(context, request.reviewId);
      const activity = context.audit.listActivityForReview(request.reviewId, buildActivityFeedOptions(request));

      return parseWithSchema(GetActivityFeedResponseSchema, {
        review: toReviewSummary(review),
        activity,
        version: currentStatusVersion(context, request.reviewId),
      });
    },

    async acceptCounterPatch(input) {
      return handleCounterPatchDecision({
        context,
        request: parseWithSchema(AcceptCounterPatchRequestSchema, input),
        now,
        decision: 'accepted',
      });
    },

    async rejectCounterPatch(input) {
      return handleCounterPatchDecision({
        context,
        request: parseWithSchema(RejectCounterPatchRequestSchema, input),
        now,
        decision: 'rejected',
      });
    },

    _setPoolManager(pm: PoolManager) {
      poolManagerRef = pm;
    },
  };
}

export async function recoverReviewerAssignments(
  context: AppContext,
  options: {
    reviewerId: string;
    cause: ReviewReclaimCause;
    now?: () => string;
    yieldForRecoveryRace?: (input: { reviewId: string; reviewerId: string; cause: ReviewReclaimCause }) => Promise<void>;
  },
): Promise<ReviewerRecoverySummary> {
  const now = options.now ?? (() => new Date().toISOString());
  const yieldForRecoveryRace = options.yieldForRecoveryRace ?? (() => Promise.resolve());
  const candidates = context.reviews
    .list()
    .filter(
      (review) =>
        review.claimedBy === options.reviewerId && (review.status === 'claimed' || review.status === 'submitted'),
    )
    .sort((left, right) => left.reviewId.localeCompare(right.reviewId));

  const attempts: ReviewerRecoveryAttempt[] = [];

  for (const candidate of candidates) {
    await yieldForRecoveryRace({
      reviewId: candidate.reviewId,
      reviewerId: options.reviewerId,
      cause: options.cause,
    });

    const reclaimedAt = now();
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
      notifyReviewMutation(context, updated.reviewId);
      continue;
    }

    const latest = context.reviews.getById(candidate.reviewId);
    const outcome = latest && latest.claimGeneration !== candidate.claimGeneration ? 'stale' : 'not_recoverable';
    const errorCode = outcome === 'stale' ? 'STALE_CLAIM_GENERATION' : 'INVALID_REVIEW_TRANSITION';

    context.db.transaction(() => {
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
    })();

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

function parseClaimResponse(input: {
  outcome: 'claimed' | 'stale' | 'not_claimable';
  review: ReviewSummary | null;
  version: number;
  message?: string;
}): ClaimReviewResponse {
  const response = {
    outcome: input.outcome,
    review: input.review,
    version: input.version,
    ...(input.message ? { message: input.message } : {}),
  };

  return parseWithSchema(ClaimReviewResponseSchema, response);
}

function ensureReviewExists(context: AppContext, reviewId: string): ReviewRecord {
  const review = context.reviews.getById(reviewId);

  if (!review) {
    throw new BrokerServiceError({
      code: 'REVIEW_NOT_FOUND',
      reviewId,
      message: `Review ${reviewId} was not found.`,
    });
  }

  return review;
}

function persistClaimRejection(options: {
  context: AppContext;
  reviewId: string;
  actorId: string;
  statusFrom: ReviewRecord['status'];
  errorCode: 'REVIEW_NOT_CLAIMABLE' | 'STALE_CLAIM_GENERATION';
  metadata: Record<string, unknown>;
  createdAt: string;
}): void {
  options.context.db.transaction(() => {
    options.context.audit.append({
      reviewId: options.reviewId,
      eventType: 'review.transition_rejected',
      actorId: options.actorId,
      statusFrom: options.statusFrom,
      statusTo: 'claimed',
      errorCode: options.errorCode,
      createdAt: options.createdAt,
      metadata: options.metadata,
    });
  })();
}

function persistTransitionRejection(options: {
  context: AppContext;
  review: ReviewRecord;
  actorId: string;
  statusTo: ReviewRecord['status'];
  errorCode: BrokerServiceErrorCode;
  metadata: Record<string, unknown>;
  createdAt: string;
}): void {
  options.context.db.transaction(() => {
    options.context.audit.append({
      reviewId: options.review.reviewId,
      eventType: 'review.transition_rejected',
      actorId: options.actorId,
      statusFrom: options.review.status,
      statusTo: options.statusTo,
      errorCode: options.errorCode,
      createdAt: options.createdAt,
      metadata: options.metadata,
    });
  })();
}

function notifyReviewMutation(context: AppContext, reviewId: string): {
  reviewsVersion: number;
  queueVersion: number;
  statusVersion: number;
} {
  const reviewsVersion = context.notifications.notify(REVIEWS_TOPIC);
  const queueVersion = context.notifications.notify(REVIEW_QUEUE_TOPIC);
  context.notifications.notify('review-status');
  const statusVersion = context.notifications.notify(reviewStatusTopic(reviewId));

  return { reviewsVersion, queueVersion, statusVersion };
}

function currentQueueVersion(context: AppContext): number {
  return context.notifications.currentVersion(REVIEW_QUEUE_TOPIC);
}

function currentReviewerVersion(context: AppContext): number {
  return context.notifications.currentVersion(REVIEWER_STATE_TOPIC);
}

function currentStatusVersion(context: AppContext, reviewId: string): number {
  return context.notifications.currentVersion(reviewStatusTopic(reviewId));
}

function buildWaitForChangeOptions(timeoutMs: number | undefined): { timeoutMs?: number } {
  return timeoutMs !== undefined ? { timeoutMs } : {};
}

function buildListReviewsOptions(request: ListReviewsRequest): { status?: ReviewRecord['status']; limit?: number } {
  return {
    ...(request.status !== undefined ? { status: request.status } : {}),
    ...(request.limit !== undefined ? { limit: request.limit } : {}),
  };
}

function buildListReviewersOptions(request: ListReviewersRequest): { status?: ReviewerStatus; limit?: number } {
  return {
    ...(request.status !== undefined ? { status: request.status } : {}),
    ...(request.limit !== undefined ? { limit: request.limit } : {}),
  };
}

function buildActivityFeedOptions(request: GetActivityFeedRequest): { limit?: number } {
  return request.limit !== undefined ? { limit: request.limit } : {};
}

function reviewStatusTopic(reviewId: string): string {
  return `review-status:${reviewId}`;
}

function getAuthorRole(review: ReviewRecord, actorId: string): ReviewMessageAuthorRole {
  return actorId === review.authorId ? 'proposer' : 'reviewer';
}

function toDiscussionMessage(message: StoredReviewMessage): ReviewDiscussionMessage {
  return {
    messageId: message.messageId,
    reviewId: message.reviewId,
    actorId: message.actorId,
    authorRole: message.authorRole,
    body: message.body,
    createdAt: message.createdAt,
  };
}

function buildMessageSummary(
  authorRole: ReviewMessageAuthorRole,
  roundNumber: number,
  startedNewRound: boolean,
): string {
  const actorLabel = authorRole === 'proposer' ? 'Proposer' : 'Reviewer';
  const roundLabel = `round ${roundNumber}`;

  if (startedNewRound) {
    return `${actorLabel} added a follow-up message for ${roundLabel}.`;
  }

  return `${actorLabel} added a discussion message for ${roundLabel}.`;
}

function buildKillReviewerMessage(
  reviewerId: string,
  outcome: KillReviewerResponse['outcome'],
): string | undefined {
  switch (outcome) {
    case 'killed':
      return `Reviewer ${reviewerId} received a shutdown signal.`;
    case 'already_offline':
      return `Reviewer ${reviewerId} is already offline.`;
    case 'not_found':
      return `Reviewer ${reviewerId} was not found.`;
    default:
      return undefined;
  }
}

function handleCounterPatchDecision(options: {
  context: AppContext;
  request: AcceptCounterPatchRequest | RejectCounterPatchRequest;
  now: () => string;
  decision: Exclude<CounterPatchStatus, 'none' | 'pending'>;
}): AcceptCounterPatchResponse | RejectCounterPatchResponse {
  const current = ensureReviewExists(options.context, options.request.reviewId);

  if (current.status === 'closed' || current.counterPatchStatus !== 'pending') {
    persistTransitionRejection({
      context: options.context,
      review: current,
      actorId: options.request.actorId,
      statusTo: current.status,
      errorCode: 'INVALID_COUNTER_PATCH_STATE',
      createdAt: options.now(),
      metadata: {
        reviewId: current.reviewId,
        attemptedEvent: options.decision === 'accepted' ? 'accept_counter_patch' : 'reject_counter_patch',
        outcome: 'invalid_counter_patch_state',
        counterPatchStatus: current.counterPatchStatus,
      },
    });

    throw new BrokerServiceError({
      code: 'INVALID_COUNTER_PATCH_STATE',
      reviewId: current.reviewId,
      message: `Review ${current.reviewId} has no pending counter-patch to ${options.decision}.`,
    });
  }

  const decidedAt = options.now();
  const updated = options.context.db.transaction(() => {
    const review = options.context.reviews.recordCounterPatchDecision({
      reviewId: current.reviewId,
      counterPatchStatus: options.decision,
      actorId: options.request.actorId,
      note: options.request.note ?? null,
      decidedAt,
      updatedAt: decidedAt,
      lastActivityAt: decidedAt,
    });

    if (!review) {
      throw new Error(`Review ${current.reviewId} could not record counter-patch decision ${options.decision}.`);
    }

    options.context.audit.append({
      reviewId: current.reviewId,
      eventType: options.decision === 'accepted' ? 'review.counter_patch_accepted' : 'review.counter_patch_rejected',
      actorId: options.request.actorId,
      statusFrom: current.status,
      statusTo: current.status,
      createdAt: decidedAt,
      metadata: {
        reviewId: current.reviewId,
        counterPatchStatus: options.decision,
        notePresent: options.request.note !== undefined,
        summary:
          options.decision === 'accepted'
            ? 'Reviewer accepted the counter-patch.'
            : 'Reviewer rejected the counter-patch.',
      },
    });

    return review;
  })();

  const versions = notifyReviewMutation(options.context, updated.reviewId);
  const response = {
    review: toReviewSummary(updated),
    proposal: toReviewProposal(updated),
    version: versions.queueVersion,
  };

  return options.decision === 'accepted'
    ? parseWithSchema(AcceptCounterPatchResponseSchema, response)
    : parseWithSchema(RejectCounterPatchResponseSchema, response);
}

function toReviewSummary(review: ReviewRecord): ReviewSummary {
  return {
    reviewId: review.reviewId,
    title: review.title,
    status: review.status,
    priority: review.priority,
    authorId: review.authorId,
    createdAt: review.createdAt,
    updatedAt: review.updatedAt,
    claimedBy: review.claimedBy,
    claimedAt: review.claimedAt,
    claimGeneration: review.claimGeneration,
    currentRound: review.currentRound,
    latestVerdict: review.latestVerdict,
    verdictReason: review.verdictReason,
    counterPatchStatus: review.counterPatchStatus,
    lastMessageAt: review.lastMessageAt,
    lastActivityAt: review.lastActivityAt,
  };
}

function toReviewProposal(review: ReviewRecord): {
  reviewId: string;
  title: string;
  description: string;
  diff: string;
  affectedFiles: string[];
  priority: ReviewRecord['priority'];
  currentRound: number;
  latestVerdict: ReviewRecord['latestVerdict'];
  verdictReason: string | null;
  counterPatchStatus: ReviewRecord['counterPatchStatus'];
  lastMessageAt: string | null;
  lastActivityAt: string | null;
} {
  return {
    reviewId: review.reviewId,
    title: review.title,
    description: review.description,
    diff: review.diff,
    affectedFiles: review.affectedFiles,
    priority: review.priority,
    currentRound: review.currentRound,
    latestVerdict: review.latestVerdict,
    verdictReason: review.verdictReason,
    counterPatchStatus: review.counterPatchStatus,
    lastMessageAt: review.lastMessageAt,
    lastActivityAt: review.lastActivityAt,
  };
}
