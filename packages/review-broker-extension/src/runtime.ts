import {
  createReviewGateState,
  nowIso,
  sameReviewUnit,
  type ReviewErrorInfo,
  type ReviewGateState,
  type ReviewStateSource,
  type ReviewStatusRecord,
  type ReviewTransport,
  type ReviewUnitIdentity,
  type ResolvedBlockedReviewPolicy,
} from './types.js';

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
  existingState?: ReviewGateState | null;
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
      : record.status === 'changes_requested'
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

  const resolvedSummary = summary ?? record.summary ?? record.feedback ?? null;
  const resolvedFeedback = record.feedback ?? (record.status === 'changes_requested' ? record.summary ?? null : null);

  const partial: Partial<ReviewGateState> = {
    phase,
    unit: unit ?? null,
    reviewId: record.reviewId,
    status: record.status,
    decision,
    blockedPolicy,
    summary: resolvedSummary,
    feedback: resolvedFeedback,
    error: record.error ?? null,
    updatedAt: record.updatedAt ?? nowIso(),
  };
  if (source !== undefined) partial.source = source;
  return createReviewGateState(partial);
}

export async function submitReviewForUnit(args: SubmitReviewArgs): Promise<SubmitReviewResult> {
  try {
    const shouldSubmitCounterPatch = Boolean(
      args.existingState &&
        args.existingState.reviewId &&
        sameReviewUnit(args.existingState.unit, args.unit) &&
        args.existingState.status === 'changes_requested',
    );

    const record = shouldSubmitCounterPatch && args.transport.submitCounterPatch
      ? await args.transport.submitCounterPatch({
          unit: args.unit,
          reviewId: args.existingState!.reviewId!,
          ...((args.existingState!.feedback ?? args.existingState!.summary) !== undefined
            ? { feedback: args.existingState!.feedback ?? args.existingState!.summary! }
            : {}),
        })
      : await args.transport.submitReview(args.unit);

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

  if (!state.reviewId || !args.transport || (state.status !== 'pending' && state.status !== 'claimed' && state.status !== 'changes_requested')) {
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
