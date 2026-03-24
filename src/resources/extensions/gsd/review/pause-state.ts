import { createReviewGateState, type ReviewGateState } from './types.ts';

export interface PersistedPausedReviewState {
  schemaVersion: 1;
  savedAt: string;
  reviewGateState: ReviewGateState | null;
}

function sanitizeState(state: ReviewGateState | null): ReviewGateState | null {
  if (!state) {
    return null;
  }

  return createReviewGateState({
    phase: state.phase,
    unit: state.unit,
    reviewId: state.reviewId,
    status: state.status,
    decision: state.decision,
    blockedPolicy: state.blockedPolicy,
    summary: state.summary,
    error: state.error,
    updatedAt: state.updatedAt,
    source: state.source,
  });
}

export function serializePausedReviewState(state: ReviewGateState | null, savedAt = new Date()): PersistedPausedReviewState {
  return {
    schemaVersion: 1,
    savedAt: savedAt.toISOString(),
    reviewGateState: sanitizeState(state),
  };
}

function deserializePersistedPausedReviewState(payload: unknown): ReviewGateState | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const candidate = payload as {
    schemaVersion?: unknown;
    reviewGateState?: ReviewGateState | null;
  };

  if (candidate.schemaVersion !== 1) {
    return null;
  }

  return sanitizeState(candidate.reviewGateState ?? null);
}

export function deserializePausedReviewState(payload: unknown): ReviewGateState | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const candidate = payload as {
    pausedReviewState?: unknown;
    reviewGateState?: ReviewGateState | null;
  };

  if ('pausedReviewState' in candidate) {
    return deserializePersistedPausedReviewState(candidate.pausedReviewState);
  }

  return sanitizeState(candidate.reviewGateState ?? null);
}
