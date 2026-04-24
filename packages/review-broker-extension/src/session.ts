import type {
  ReviewGateState,
  ReviewUnitIdentity,
  ResolvedBlockedReviewPolicy,
} from './types.js';

export type VerificationRetrySource = 'verification' | 'review';

export interface VerificationRetryContext {
  source: VerificationRetrySource;
  summary: string;
  feedback?: string;
  reviewId?: string;
  blockedPolicy?: ResolvedBlockedReviewPolicy;
}

export interface AutoSession {
  currentUnit: ReviewUnitIdentity | null;
  reviewGateState: ReviewGateState | null;
  pendingVerificationRetry: VerificationRetryContext | null;
  paused: boolean;
  pausedReason: string | null;
  history: string[];
}

export function createAutoSession(seed: Partial<AutoSession> = {}): AutoSession {
  return {
    currentUnit: seed.currentUnit ?? null,
    reviewGateState: seed.reviewGateState ?? null,
    pendingVerificationRetry: seed.pendingVerificationRetry ?? null,
    paused: seed.paused ?? false,
    pausedReason: seed.pausedReason ?? null,
    history: seed.history ?? [],
  };
}
