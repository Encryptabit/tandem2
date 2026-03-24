import { getAutoReviewGateState, getAutoSession, readPausedReviewGateState } from '../../auto.ts';
import { readReviewStatus, submitReviewForUnit } from '../../review/runtime.ts';
import type { ReviewGateState, ReviewTransport, ReviewUnitIdentity } from '../../review/types.ts';
import { sameReviewUnit } from '../../review/types.ts';

export interface HandleReviewStatusArgs {
  projectRoot: string;
  transport?: ReviewTransport;
}

export interface HandleReviewSubmitArgs {
  projectRoot: string;
  transport: ReviewTransport;
  target?: ReviewUnitIdentity;
}

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
  );

  if (args.state.error) {
    lines.push(`error: ${args.state.error.code}:${args.state.error.message}`);
  }

  return lines.join('\n');
}

function resolveManualReviewTarget(args: {
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

  const session = getAutoSession();
  const currentTarget = session?.currentUnit ?? args.liveState?.unit ?? args.pausedState?.unit ?? null;

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

export function formatReviewStatus(args: {
  source: 'live' | 'paused';
  refreshed: boolean;
  state: Awaited<ReturnType<typeof readReviewStatus>>['state'];
}): string {
  return formatReviewState(args);
}

export async function handleReviewSubmit(args: HandleReviewSubmitArgs): Promise<string> {
  const liveState = getAutoReviewGateState();
  const pausedState = liveState ? null : await readPausedReviewGateState(args.projectRoot);
  const resolved = resolveManualReviewTarget({
    target: args.target,
    liveState,
    pausedState,
  });

  if (!resolved) {
    return 'review_target_missing';
  }

  const result = await submitReviewForUnit({
    unit: resolved.target,
    blockedPolicy: resolved.blockedPolicy,
    transport: args.transport,
  });

  const session = getAutoSession();
  if (session && shouldPersistLiveReviewState({
    targetSource: resolved.targetSource,
    target: resolved.target,
    liveState,
  })) {
    session.reviewGateState = result.state;
  }

  return formatReviewState({
    state: result.state,
    target: resolved.target,
    targetSource: resolved.targetSource,
  });
}

export async function handleReviewStatus(args: HandleReviewStatusArgs): Promise<string> {
  const liveState = getAutoReviewGateState();
  const pausedState = liveState ? null : await readPausedReviewGateState(args.projectRoot);

  try {
    const result = await readReviewStatus({
      liveState,
      pausedState,
      transport: args.transport,
    });

    return formatReviewStatus(result);
  } catch (error) {
    if (error instanceof Error && error.message === 'review_state_missing') {
      return 'review_state_missing';
    }
    throw error;
  }
}
