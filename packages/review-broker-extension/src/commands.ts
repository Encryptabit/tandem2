import type { AutoSession } from './session.js';
import { readReviewStatus, submitReviewForUnit } from './runtime.js';
import { readPausedReviewGateState } from './pause-state.js';
import type { ReviewGateState, ReviewTransport, ReviewUnitIdentity } from './types.js';
import { sameReviewUnit } from './types.js';

type ManualReviewTargetSource = 'current' | 'explicit';

interface ResolvedManualReviewTarget {
  target: ReviewUnitIdentity;
  targetSource: ManualReviewTargetSource;
  blockedPolicy: NonNullable<ReviewGateState['blockedPolicy']>;
}

function formatReviewState(args: {
  state: ReviewGateState;
  source?: 'live' | 'paused';
  refreshed?: boolean;
  target?: ReviewUnitIdentity;
  targetSource?: ManualReviewTargetSource;
}): string {
  const lines: string[] = [];

  if (args.targetSource) {
    lines.push(`targetSource: ${args.targetSource}`);
  }
  if (args.target) {
    lines.push(`target: ${args.target.unitId}`);
  }
  if (args.source) {
    lines.push(`source: ${args.source}`);
  }
  if (typeof args.refreshed === 'boolean') {
    lines.push(`refreshed: ${args.refreshed ? 'yes' : 'no'}`);
  }

  lines.push(
    `reviewId: ${args.state.reviewId ?? 'none'}`,
    `status: ${args.state.status ?? 'none'}`,
    `decision: ${args.state.decision ?? 'none'}`,
    `blockedPolicy: ${args.state.blockedPolicy ?? 'none'}`,
    `summary: ${args.state.summary ?? 'none'}`,
    `feedback: ${args.state.feedback ?? 'none'}`,
  );

  if (args.state.error) {
    lines.push(`error: ${args.state.error.code}:${args.state.error.message}`);
  }

  return lines.join('\n');
}

function resolveManualReviewTarget(args: {
  session: AutoSession | null;
  target?: ReviewUnitIdentity;
  liveState: ReviewGateState | null;
  pausedState: ReviewGateState | null;
}): ResolvedManualReviewTarget | null {
  if (args.target) {
    return {
      target: args.target,
      targetSource: 'explicit',
      blockedPolicy: args.liveState?.blockedPolicy ?? args.pausedState?.blockedPolicy ?? 'intervene',
    };
  }

  const currentTarget = args.session?.currentUnit ?? args.liveState?.unit ?? args.pausedState?.unit ?? null;

  if (!currentTarget) {
    return null;
  }

  return {
    target: currentTarget,
    targetSource: 'current',
    blockedPolicy: args.liveState?.blockedPolicy ?? args.pausedState?.blockedPolicy ?? 'intervene',
  };
}

function shouldPersistLiveReviewState(args: {
  targetSource: ManualReviewTargetSource;
  target: ReviewUnitIdentity;
  liveState: ReviewGateState | null;
}): boolean {
  if (args.targetSource === 'current') {
    return true;
  }

  return sameReviewUnit(args.liveState?.unit, args.target);
}

export async function handleReviewSubmit(args: {
  session: AutoSession | null;
  projectRoot: string;
  transport: ReviewTransport;
  target?: ReviewUnitIdentity;
}): Promise<string> {
  const liveState = args.session?.reviewGateState ?? null;
  const pausedState = liveState ? null : await readPausedReviewGateState(args.projectRoot);
  const resolveArgs: Parameters<typeof resolveManualReviewTarget>[0] = {
    session: args.session,
    liveState,
    pausedState,
  };
  if (args.target !== undefined) resolveArgs.target = args.target;
  const resolved = resolveManualReviewTarget(resolveArgs);

  if (!resolved) {
    return 'review_target_missing';
  }

  const existingState = liveState ?? pausedState;

  const result = await submitReviewForUnit({
    unit: resolved.target,
    blockedPolicy: resolved.blockedPolicy,
    transport: args.transport,
    existingState,
  });

  if (args.session && shouldPersistLiveReviewState({
    targetSource: resolved.targetSource,
    target: resolved.target,
    liveState,
  })) {
    args.session.reviewGateState = result.state;
  }

  return formatReviewState({
    state: result.state,
    target: resolved.target,
    targetSource: resolved.targetSource,
  });
}

export async function handleReviewStatus(args: {
  session: AutoSession | null;
  projectRoot: string;
  transport?: ReviewTransport;
}): Promise<string> {
  const liveState = args.session?.reviewGateState ?? null;
  const pausedState = liveState ? null : await readPausedReviewGateState(args.projectRoot);

  try {
    const statusArgs: Parameters<typeof readReviewStatus>[0] = {
      liveState,
      pausedState,
    };
    if (args.transport !== undefined) statusArgs.transport = args.transport;
    const result = await readReviewStatus(statusArgs);

    return formatReviewState({
      state: result.state,
      source: result.source,
      refreshed: result.refreshed,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'review_state_missing') {
      return 'review_state_missing';
    }
    throw error;
  }
}
