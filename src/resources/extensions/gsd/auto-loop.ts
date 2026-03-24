import { createReviewRetry } from './auto-verification.ts';
import type { AutoSession } from './auto/session.ts';
import { runReviewGate } from './review/gate.ts';
import type {
  ReviewGateResult,
  ReviewMode,
  ReviewTransport,
  ReviewUnitIdentity,
} from './review/types.ts';

export interface FinalizeReviewArgs {
  session: AutoSession;
  unit: ReviewUnitIdentity;
  mode?: ReviewMode;
  preferences?: Parameters<typeof runReviewGate>[0]['preferences'];
  transport: ReviewTransport;
  pauseAuto?: (reason: 'review-blocked' | 'review-waiting' | 'review-error', gate: ReviewGateResult) => Promise<void> | void;
  postUnitPostVerification?: (gate: ReviewGateResult) => Promise<void> | void;
}

export interface FinalizeReviewOutcome {
  action: 'progress' | 'retry-unit' | 'pause';
  reason: 'review-allowed' | 'review-skipped' | 'review-blocked' | 'review-waiting' | 'review-error';
  gate: ReviewGateResult;
}

function pushHistory(session: AutoSession, entry: string): void {
  session.history.push(entry);
}

async function pauseFinalize(
  args: FinalizeReviewArgs,
  reason: 'review-blocked' | 'review-waiting' | 'review-error',
  gate: ReviewGateResult,
): Promise<void> {
  args.session.paused = true;
  args.session.pausedReason = reason;
  await args.pauseAuto?.(reason, gate);
}

export async function finalizeReviewForUnit(args: FinalizeReviewArgs): Promise<FinalizeReviewOutcome> {
  args.session.currentUnit = args.unit;
  args.session.paused = false;
  args.session.pausedReason = null;
  args.session.pendingVerificationRetry = null;

  const gate = await runReviewGate({
    session: args.session,
    unit: args.unit,
    mode: args.mode,
    preferences: args.preferences,
    transport: args.transport,
  });

  if (gate.kind === 'allow') {
    pushHistory(args.session, `review-allowed:${gate.reviewId}:${gate.summary}`);
    await args.postUnitPostVerification?.(gate);
    return { action: 'progress', reason: 'review-allowed', gate };
  }

  if (gate.kind === 'skipped') {
    pushHistory(args.session, `review-skipped:${gate.summary}`);
    await args.postUnitPostVerification?.(gate);
    return { action: 'progress', reason: 'review-skipped', gate };
  }

  if (gate.kind === 'block') {
    if (gate.blockedPolicy === 'auto-loop') {
      args.session.pendingVerificationRetry = createReviewRetry(gate);
      pushHistory(args.session, `review-blocked:auto-loop:${gate.reviewId}:${gate.summary}`);
      return { action: 'retry-unit', reason: 'review-blocked', gate };
    }

    pushHistory(args.session, `review-blocked:intervene:${gate.reviewId}:${gate.summary}`);
    await pauseFinalize(args, 'review-blocked', gate);
    return { action: 'pause', reason: 'review-blocked', gate };
  }

  if (gate.kind === 'wait') {
    pushHistory(args.session, `review-waiting:${gate.reviewId}:${gate.summary}`);
    await pauseFinalize(args, 'review-waiting', gate);
    return { action: 'pause', reason: 'review-waiting', gate };
  }

  pushHistory(args.session, `review-error:${gate.error.code}:${gate.summary}`);
  await pauseFinalize(args, 'review-error', gate);
  return { action: 'pause', reason: 'review-error', gate };
}
