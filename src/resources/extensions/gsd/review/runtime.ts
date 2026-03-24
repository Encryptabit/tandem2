import type {
  ReviewErrorInfo,
  ReviewGateState,
  ReviewStateSource,
  ReviewStatusRecord,
  ReviewTransport,
  ReviewUnitIdentity,
  ResolvedBlockedReviewPolicy,
} from './types.ts';
import { createReviewGateState, nowIso } from './types.ts';

export interface ReadReviewStatusArgs {
  liveState?: ReviewGateState | null;
  pausedState?: ReviewGateState | null;
  transport?: ReviewTransport;
}

export interface ReadReviewStatusResult {
  state: ReviewGateState;
  source: ReviewStateSource;
  refreshed: boolean;
}

export interface SubmitReviewArgs {
  unit: ReviewUnitIdentity;
  blockedPolicy: ResolvedBlockedReviewPolicy;
  transport: ReviewTransport;
}

export interface SubmitReviewResult {
  state: ReviewGateState;
}

export function sanitizeReviewError(error: unknown): ReviewErrorInfo {
  if (error && typeof error === 'object') {
    const candidate = error as {
      code?: unknown;
      message?: unknown;
      retryable?: unknown;
    };

    return {
      code: typeof candidate.code === 'string' ? candidate.code : 'review_runtime_error',
      message: typeof candidate.message === 'string' ? candidate.message : 'Review runtime failed.',
      retryable: candidate.retryable === true,
    };
  }

  return {
    code: 'review_runtime_error',
    message: typeof error === 'string' ? error : 'Review runtime failed.',
  };
}

export function stateFromStatusRecord(args: {
  record: ReviewStatusRecord;
  blockedPolicy: ResolvedBlockedReviewPolicy;
  summary?: string;
  source?: ReviewStateSource;
  unit?: ReviewGateState['unit'];
}): ReviewGateState {
  const { record, blockedPolicy, summary, source, unit } = args;

  const decision =
    record.status === 'approved'
      ? 'allow'
      : record.status === 'blocked'
        ? 'block'
        : record.status === 'failed'
          ? 'error'
          : 'wait';

  const phase =
    decision === 'allow' || decision === 'block'
      ? 'completed'
      : decision === 'error'
        ? 'error'
        : 'waiting';

  return createReviewGateState({
    phase,
    unit: unit ?? null,
    reviewId: record.reviewId,
    status: record.status,
    decision,
    blockedPolicy,
    summary: summary ?? record.summary ?? record.feedback ?? null,
    error: record.error ?? null,
    updatedAt: record.updatedAt ?? nowIso(),
    source,
  });
}

export async function submitReviewForUnit(args: SubmitReviewArgs): Promise<SubmitReviewResult> {
  try {
    const record = await args.transport.submitReview(args.unit);
    return {
      state: stateFromStatusRecord({
        record,
        blockedPolicy: args.blockedPolicy,
        unit: args.unit,
      }),
    };
  } catch (error) {
    const sanitized = sanitizeReviewError(error);
    return {
      state: createReviewGateState({
        phase: 'error',
        unit: args.unit,
        reviewId: null,
        status: null,
        decision: 'error',
        blockedPolicy: args.blockedPolicy,
        summary: sanitized.message,
        error: sanitized,
      }),
    };
  }
}

export async function readReviewStatus(args: ReadReviewStatusArgs): Promise<ReadReviewStatusResult> {
  const source = args.liveState ? 'live' : 'paused';
  const state = args.liveState ?? args.pausedState;

  if (!state) {
    throw new Error('review_state_missing');
  }

  if (!state.reviewId || !args.transport || (state.status !== 'pending' && state.status !== 'waiting')) {
    return {
      state: createReviewGateState({ ...state, source }),
      source,
      refreshed: false,
    };
  }

  const record = await args.transport.getStatus(state.reviewId);
  return {
    state: stateFromStatusRecord({
      record,
      blockedPolicy: state.blockedPolicy ?? 'intervene',
      source,
      unit: state.unit,
    }),
    source,
    refreshed: true,
  };
}
