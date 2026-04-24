import { createReviewRetry } from './verification.js';
import type { AutoSession } from './session.js';
import { runReviewGate } from './gate.js';
import type {
  ReviewGateResult,
  ReviewMode,
  ReviewTransport,
  ReviewUnitIdentity,
} from './types.js';

export interface FinalizeReviewArgs {
  session: AutoSession;
  unit: ReviewUnitIdentity;
  mode?: ReviewMode;
  preferences?: Parameters<typeof runReviewGate>[0]['preferences'];
  transport: ReviewTransport;
}

export interface FinalizeReviewOutcome {
  action: 'progress' | 'retry-unit' | 'pause';
  reason: 'review-allowed' | 'review-skipped' | 'review-blocked' | 'review-waiting' | 'review-error';
  gate: ReviewGateResult;
}

export async function finalizeReviewForUnit(args: FinalizeReviewArgs): Promise<FinalizeReviewOutcome> {
  args.session.currentUnit = args.unit;
  args.session.paused = false;
  args.session.pausedReason = null;
  args.session.pendingVerificationRetry = null;

  const gateArgs: Parameters<typeof runReviewGate>[0] = {
    session: args.session,
    unit: args.unit,
    transport: args.transport,
  };
  if (args.mode !== undefined) gateArgs.mode = args.mode;
  if (args.preferences !== undefined) gateArgs.preferences = args.preferences;
  const gate = await runReviewGate(gateArgs);

  if (gate.kind === 'allow') {
    args.session.history.push(`review-allowed:${gate.reviewId}:${gate.summary}`);
    return { action: 'progress', reason: 'review-allowed', gate };
  }

  if (gate.kind === 'skipped') {
    args.session.history.push(`review-skipped:${gate.summary}`);
    return { action: 'progress', reason: 'review-skipped', gate };
  }

  if (gate.kind === 'block') {
    args.session.pendingVerificationRetry = createReviewRetry(gate);

    if (gate.blockedPolicy === 'intervene') {
      args.session.history.push(`review-blocked:intervene:retry:${gate.reviewId}:${gate.summary}`);
    } else {
      args.session.history.push(`review-blocked:auto-loop:${gate.reviewId}:${gate.summary}`);
    }

    return { action: 'retry-unit', reason: 'review-blocked', gate };
  }

  if (gate.kind === 'wait') {
    args.session.paused = true;
    args.session.pausedReason = 'review-waiting';
    args.session.history.push(`review-waiting:${gate.reviewId}:${gate.summary}`);
    return { action: 'pause', reason: 'review-waiting', gate };
  }

  args.session.paused = true;
  args.session.pausedReason = 'review-error';
  args.session.history.push(`review-error:${gate.error.code}:${gate.summary}`);
  return { action: 'pause', reason: 'review-error', gate };
}
