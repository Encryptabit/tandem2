import { resolveReviewPreferences } from './preferences.js';
import type { AutoSession } from './session.js';
import {
  createReviewGateState,
  sameReviewUnit,
  type ReviewGateResult,
  type ReviewMode,
  type ReviewStatusRecord,
  type ReviewTransport,
  type ReviewUnitIdentity,
} from './types.js';
import { sanitizeReviewError, stateFromStatusRecord } from './runtime.js';

export interface RunReviewGateArgs {
  session: AutoSession;
  unit: ReviewUnitIdentity;
  mode?: ReviewMode;
  preferences?: Parameters<typeof resolveReviewPreferences>[0];
  transport: ReviewTransport;
}

function shouldSubmitCounterPatch(session: AutoSession, unit: ReviewUnitIdentity): boolean {
  const state = session.reviewGateState;
  return Boolean(
    state &&
      state.reviewId &&
      sameReviewUnit(state.unit, unit) &&
      state.status === 'changes_requested',
  );
}

function shouldRefreshExistingReview(session: AutoSession, unit: ReviewUnitIdentity): boolean {
  const state = session.reviewGateState;
  return Boolean(
    state &&
      state.reviewId &&
      sameReviewUnit(state.unit, unit) &&
      (state.status === 'pending' || state.status === 'claimed' || state.status === 'changes_requested'),
  );
}

function resultFromRecord(record: ReviewStatusRecord, blockedPolicy: 'auto-loop' | 'intervene'): ReviewGateResult {
  if (record.status === 'approved') {
    return {
      kind: 'allow',
      decision: 'allow',
      blockedPolicy,
      summary: record.summary ?? 'Review approved.',
      reviewId: record.reviewId,
      status: 'approved',
    };
  }

  if (record.status === 'changes_requested') {
    const block: ReviewGateResult = {
      kind: 'block',
      decision: 'block',
      blockedPolicy,
      summary: record.summary ?? 'Review blocked.',
      reviewId: record.reviewId,
      status: 'changes_requested',
    };
    if (record.feedback !== undefined) block.feedback = record.feedback;
    return block;
  }

  if (record.status === 'failed') {
    return {
      kind: 'error',
      decision: 'error',
      blockedPolicy,
      summary: record.summary ?? record.error?.message ?? 'Review failed.',
      reviewId: record.reviewId,
      status: 'failed',
      error: record.error ?? {
        code: 'review_failed',
        message: record.summary ?? 'Review failed.',
      },
    };
  }

  return {
    kind: 'wait',
    decision: 'wait',
    blockedPolicy,
    summary: record.summary ?? 'Review still pending.',
    reviewId: record.reviewId,
    status: record.status,
  };
}

export async function runReviewGate(args: RunReviewGateArgs): Promise<ReviewGateResult> {
  const mode = args.mode ?? 'auto';
  const resolved = resolveReviewPreferences(args.preferences, mode);

  if (!resolved.enabled) {
    const skipped: ReviewGateResult = {
      kind: 'skipped',
      decision: 'skipped',
      blockedPolicy: resolved.blockedPolicy,
      summary: 'Review gate disabled.',
      reviewId: null,
      status: null,
    };

    args.session.reviewGateState = createReviewGateState({
      phase: 'completed',
      unit: args.unit,
      reviewId: null,
      status: null,
      decision: 'skipped',
      blockedPolicy: resolved.blockedPolicy,
      summary: skipped.summary,
    });
    return skipped;
  }

  try {
    const priorState = args.session.reviewGateState;

    let record: ReviewStatusRecord;
    if (shouldSubmitCounterPatch(args.session, args.unit) && priorState?.reviewId) {
      if (args.transport.submitCounterPatch) {
        const feedback = priorState.feedback ?? priorState.summary ?? undefined;
        const input = {
          unit: args.unit,
          reviewId: priorState.reviewId,
          ...(feedback !== undefined ? { feedback } : {}),
        };

        record = await args.transport.submitCounterPatch(input);
      } else {
        record = await args.transport.getStatus(priorState.reviewId);
      }
    } else if (shouldRefreshExistingReview(args.session, args.unit)) {
      record = await args.transport.getStatus(args.session.reviewGateState!.reviewId!);
    } else {
      record = await args.transport.submitReview(args.unit);
    }

    const result = resultFromRecord(record, resolved.blockedPolicy);
    args.session.reviewGateState = stateFromStatusRecord({
      record,
      blockedPolicy: resolved.blockedPolicy,
      unit: args.unit,
    });
    return result;
  } catch (error) {
    const sanitized = sanitizeReviewError(error);
    const failed: ReviewGateResult = {
      kind: 'error',
      decision: 'error',
      blockedPolicy: resolved.blockedPolicy,
      summary: sanitized.message,
      reviewId: args.session.reviewGateState?.reviewId ?? null,
      status: null,
      error: sanitized,
    };

    args.session.reviewGateState = createReviewGateState({
      phase: 'error',
      unit: args.unit,
      reviewId: failed.reviewId,
      status: null,
      decision: 'error',
      blockedPolicy: resolved.blockedPolicy,
      summary: failed.summary,
      error: sanitized,
    });
    return failed;
  }
}
