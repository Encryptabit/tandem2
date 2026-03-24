import { resolveReviewPreferences } from '../preferences.ts';
import type { AutoSession } from '../auto/session.ts';
import {
  createReviewGateState,
  sameReviewUnit,
  type ReviewGateResult,
  type ReviewMode,
  type ReviewStatusRecord,
  type ReviewTransport,
  type ReviewUnitIdentity,
} from './types.ts';
import { sanitizeReviewError, stateFromStatusRecord } from './runtime.ts';

export interface RunReviewGateArgs {
  session: AutoSession;
  unit: ReviewUnitIdentity;
  mode?: ReviewMode;
  preferences?: Parameters<typeof resolveReviewPreferences>[0];
  transport: ReviewTransport;
}

function shouldRefreshExistingReview(session: AutoSession, unit: ReviewUnitIdentity): boolean {
  const state = session.reviewGateState;
  return Boolean(
    state &&
      state.reviewId &&
      sameReviewUnit(state.unit, unit) &&
      (state.status === 'pending' || state.status === 'waiting' || state.status === 'blocked'),
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

  if (record.status === 'blocked') {
    return {
      kind: 'block',
      decision: 'block',
      blockedPolicy,
      summary: record.summary ?? 'Review blocked.',
      feedback: record.feedback,
      reviewId: record.reviewId,
      status: 'blocked',
    };
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
    const record = shouldRefreshExistingReview(args.session, args.unit)
      ? await args.transport.getStatus(args.session.reviewGateState!.reviewId!)
      : await args.transport.submitReview(args.unit);

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
