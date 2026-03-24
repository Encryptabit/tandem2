import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createAutoSession, type AutoSession } from './auto/session.ts';
import { deserializePausedReviewState, serializePausedReviewState } from './review/pause-state.ts';
import type { ReviewGateState } from './review/types.ts';

let activeSession: AutoSession | null = null;

function pausedSessionPath(projectRoot: string): string {
  return path.join(projectRoot, '.gsd', 'runtime', 'paused-session.json');
}

export function setAutoSession(session: AutoSession | null): void {
  activeSession = session;
}

export function getAutoSession(): AutoSession | null {
  return activeSession;
}

export function getAutoReviewGateState(): ReviewGateState | null {
  return activeSession?.reviewGateState ?? null;
}

export async function pauseAuto(projectRoot: string, reason = 'paused'): Promise<string | null> {
  if (!activeSession) {
    return null;
  }

  activeSession.paused = true;
  activeSession.pausedReason = reason;

  const filePath = pausedSessionPath(projectRoot);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(
    filePath,
    JSON.stringify(
      {
        reason,
        pausedReviewState: serializePausedReviewState(activeSession.reviewGateState),
      },
      null,
      2,
    ),
    'utf8',
  );

  return filePath;
}

export async function readPausedReviewGateState(projectRoot: string): Promise<ReviewGateState | null> {
  try {
    const raw = await readFile(pausedSessionPath(projectRoot), 'utf8');
    return deserializePausedReviewState(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function startAuto(projectRoot: string, seed: Partial<AutoSession> = {}): Promise<AutoSession> {
  const session = createAutoSession(seed);
  session.reviewGateState = seed.reviewGateState ?? (await readPausedReviewGateState(projectRoot));
  activeSession = session;
  return session;
}
