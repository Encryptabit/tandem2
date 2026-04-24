import type { ReviewDiscussionMessage, ReviewSummary } from 'review-broker-core';

export type ReviewMode = 'auto' | 'human';
export type ReviewPhase = 'idle' | 'submitting' | 'waiting' | 'completed' | 'error';
export type ReviewStatus = 'pending' | 'claimed' | 'approved' | 'changes_requested' | 'failed';
export type ReviewDecision = 'allow' | 'block' | 'wait' | 'error' | 'skipped';
export type BlockedReviewPolicy = 'mode-default' | 'auto-loop' | 'intervene';
export type ResolvedBlockedReviewPolicy = 'auto-loop' | 'intervene';
export type ReviewStateSource = 'live' | 'paused';

export interface ReviewUnitIdentity {
  unitId: string;
  unitType?: string;
  milestoneId?: string;
  sliceId?: string;
  taskId?: string;
}

export interface ReviewErrorInfo {
  code: string;
  message: string;
  retryable?: boolean;
}

export interface ReviewStatusRecord {
  reviewId: string;
  status: ReviewStatus;
  summary?: string;
  feedback?: string;
  error?: ReviewErrorInfo;
  updatedAt?: string;
}

export interface ReviewPreferences {
  enabled?: boolean;
  blockedPolicy?: BlockedReviewPolicy;
}

export interface SubmitCounterPatchInput {
  unit: ReviewUnitIdentity;
  reviewId: string;
  feedback?: string;
}

export interface ReviewTransport {
  submitReview(unit: ReviewUnitIdentity): Promise<ReviewStatusRecord>;
  submitCounterPatch?(input: SubmitCounterPatchInput): Promise<ReviewStatusRecord>;
  getStatus(reviewId: string): Promise<ReviewStatusRecord>;
  getReviewDiscussion?(reviewId: string): Promise<ReviewDiscussionMessage[]>;
  listRecentReviews?(input: { projectRoot: string; limit?: number }): Promise<ReviewSummary[]>;
  /**
   * Optional approval cleanup hook. The default broker transport does not
   * commit here; GSD/proposer execution owns commits before review submission.
   */
  onReviewAllowed?(unit: ReviewUnitIdentity, reviewId: string): Promise<void>;
}

export interface ReviewGateState {
  phase: ReviewPhase;
  unit: ReviewUnitIdentity | null;
  reviewId: string | null;
  status: ReviewStatus | null;
  decision: ReviewDecision | null;
  blockedPolicy: ResolvedBlockedReviewPolicy | null;
  summary: string | null;
  feedback: string | null;
  error: ReviewErrorInfo | null;
  updatedAt: string;
  source?: ReviewStateSource;
}

export type ReviewGateResult =
  | {
      kind: 'skipped';
      decision: 'skipped';
      blockedPolicy: ResolvedBlockedReviewPolicy;
      summary: string;
      reviewId: null;
      status: null;
    }
  | {
      kind: 'allow';
      decision: 'allow';
      blockedPolicy: ResolvedBlockedReviewPolicy;
      summary: string;
      reviewId: string;
      status: 'approved';
    }
  | {
      kind: 'block';
      decision: 'block';
      blockedPolicy: ResolvedBlockedReviewPolicy;
      summary: string;
      feedback?: string;
      reviewId: string;
      status: 'changes_requested';
    }
  | {
      kind: 'wait';
      decision: 'wait';
      blockedPolicy: ResolvedBlockedReviewPolicy;
      summary: string;
      reviewId: string;
      status: 'pending' | 'claimed';
    }
  | {
      kind: 'error';
      decision: 'error';
      blockedPolicy: ResolvedBlockedReviewPolicy;
      summary: string;
      reviewId: string | null;
      status: 'failed' | null;
      error: ReviewErrorInfo;
    };

export function nowIso(now = new Date()): string {
  return now.toISOString();
}

export function sameReviewUnit(
  left: ReviewUnitIdentity | null | undefined,
  right: ReviewUnitIdentity | null | undefined,
): boolean {
  return Boolean(left && right && left.unitId === right.unitId);
}

export function createReviewGateState(input: Partial<ReviewGateState> = {}): ReviewGateState {
  const state: ReviewGateState = {
    phase: input.phase ?? 'idle',
    unit: input.unit ?? null,
    reviewId: input.reviewId ?? null,
    status: input.status ?? null,
    decision: input.decision ?? null,
    blockedPolicy: input.blockedPolicy ?? null,
    summary: input.summary ?? null,
    feedback: input.feedback ?? null,
    error: input.error ?? null,
    updatedAt: input.updatedAt ?? nowIso(),
  };
  if (input.source !== undefined) state.source = input.source;
  return state;
}
