import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createReviewGateState, type ReviewGateState } from './types.js';

export interface PersistedPausedReviewState {
  schemaVersion: 1;
  savedAt: string;
  reviewGateState: ReviewGateState | null;
}

function sanitizeState(state: ReviewGateState | null): ReviewGateState | null {
  if (!state) {
    return null;
  }

  const partial: Partial<ReviewGateState> = {
    phase: state.phase,
    unit: state.unit,
    reviewId: state.reviewId,
    status: state.status,
    decision: state.decision,
    blockedPolicy: state.blockedPolicy,
    summary: state.summary,
    feedback: state.feedback,
    error: state.error,
    updatedAt: state.updatedAt,
  };
  if (state.source !== undefined) partial.source = state.source;
  return createReviewGateState(partial);
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

const REVIEW_GATE_STATE_FILENAME = 'tandem-review-state.json';
const LEGACY_PAUSED_SESSION_FILENAME = 'paused-session.json';

function reviewGateStatePath(projectRoot: string): string {
  return path.join(projectRoot, '.gsd', 'runtime', REVIEW_GATE_STATE_FILENAME);
}

function legacyPausedSessionPath(projectRoot: string): string {
  return path.join(projectRoot, '.gsd', 'runtime', LEGACY_PAUSED_SESSION_FILENAME);
}

async function readReviewGateStateFile(filePath: string): Promise<ReviewGateState | null> {
  try {
    const raw = await readFile(filePath, 'utf8');
    return deserializePausedReviewState(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function readPausedReviewGateState(projectRoot: string): Promise<ReviewGateState | null> {
  return (
    (await readReviewGateStateFile(reviewGateStatePath(projectRoot))) ??
    (await readReviewGateStateFile(legacyPausedSessionPath(projectRoot)))
  );
}

export async function writePausedReviewGateState(
  projectRoot: string,
  state: ReviewGateState | null,
  reason = 'paused',
): Promise<string> {
  const filePath = reviewGateStatePath(projectRoot);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(
    filePath,
    JSON.stringify(
      { reason, pausedReviewState: serializePausedReviewState(state) },
      null,
      2,
    ),
    'utf8',
  );
  return filePath;
}
