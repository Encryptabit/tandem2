import { describe, expect, it, beforeEach } from 'vitest';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  deserializePausedReviewState,
  serializePausedReviewState,
  readPausedReviewGateState,
  writePausedReviewGateState,
} from '../src/pause-state.js';
import { createAutoSession } from '../src/session.js';
import { createReviewGateState } from '../src/types.js';

const tmpRoot = path.join(process.cwd(), '.tmp-ext-pause-state-tests');

async function resetTmpRoot(): Promise<void> {
  await rm(tmpRoot, { recursive: true, force: true });
  await mkdir(path.join(tmpRoot, '.gsd', 'runtime'), { recursive: true });
}

describe('pause-state serialization', () => {
  it('paused review serialization keeps only inspectable fields', () => {
    const rawState = Object.assign(
      createReviewGateState({
        phase: 'waiting',
        unit: { unitId: 'M002-S03-T04' },
        reviewId: 'rev-1',
        status: 'pending',
        decision: 'wait',
        blockedPolicy: 'auto-loop',
        summary: 'Waiting.',
      }),
      { rawPatch: 'secret diff body' },
    );

    const serialized = serializePausedReviewState(rawState as typeof rawState & { rawPatch: string }, new Date('2026-03-21T00:00:00.000Z'));
    expect(serialized.schemaVersion).toBe(1);
    expect(serialized.savedAt).toBe('2026-03-21T00:00:00.000Z');
    expect('rawPatch' in (serialized.reviewGateState as object)).toBe(false);
    expect(serialized.reviewGateState?.reviewId).toBe('rev-1');
  });

  it('paused review deserialization tolerates missing payloads and restores normalized state', () => {
    expect(deserializePausedReviewState(null)).toBeNull();

    const restored = deserializePausedReviewState({
      reviewGateState: {
        phase: 'completed',
        unit: { unitId: 'M002-S03-T04' },
        reviewId: 'rev-2',
        status: 'changes_requested',
        decision: 'block',
        blockedPolicy: 'intervene',
        summary: 'Blocked.',
        error: null,
        updatedAt: '2026-03-21T00:00:00.000Z',
        source: 'paused',
      },
    });

    expect(restored?.reviewId).toBe('rev-2');
    expect(restored?.blockedPolicy).toBe('intervene');
  });
});

describe('pause-state filesystem round-trip', () => {
  beforeEach(resetTmpRoot);

  it('writePausedReviewGateState persists and readPausedReviewGateState restores', async () => {
    const state = createReviewGateState({
      phase: 'waiting',
      unit: { unitId: 'M002-S03-T04' },
      reviewId: 'rev-paused',
      status: 'pending',
      decision: 'wait',
      blockedPolicy: 'auto-loop',
      summary: 'Pending pause.',
      error: {
        code: 'broker_unavailable',
        message: 'Broker unavailable.',
        retryable: true,
      },
    });

    await writePausedReviewGateState(tmpRoot, state, 'review-waiting');

    const payload = JSON.parse(
      await readFile(path.join(tmpRoot, '.gsd', 'runtime', 'tandem-review-state.json'), 'utf8'),
    ) as {
      reason: string;
      pausedReviewState: {
        schemaVersion: number;
        savedAt: string;
        reviewGateState: {
          reviewId: string;
          phase: string;
          decision: string;
          error: { code: string; message: string; retryable?: boolean };
        };
      };
    };

    expect(payload.reason).toBe('review-waiting');
    expect(payload.pausedReviewState.schemaVersion).toBe(1);
    expect(typeof payload.pausedReviewState.savedAt).toBe('string');
    expect(payload.pausedReviewState.reviewGateState.reviewId).toBe('rev-paused');
    expect(payload.pausedReviewState.reviewGateState.phase).toBe('waiting');
    expect(payload.pausedReviewState.reviewGateState.decision).toBe('wait');
    expect(payload.pausedReviewState.reviewGateState.error).toEqual({
      code: 'broker_unavailable',
      message: 'Broker unavailable.',
      retryable: true,
    });

    const restored = await readPausedReviewGateState(tmpRoot);
    expect(restored?.reviewId).toBe('rev-paused');
    expect(restored?.status).toBe('pending');
    expect(restored?.error?.code).toBe('broker_unavailable');
  });

  it('readPausedReviewGateState returns null when no file exists', async () => {
    const result = await readPausedReviewGateState(tmpRoot);
    expect(result).toBeNull();
  });

  it('readPausedReviewGateState falls back to legacy paused-session payloads', async () => {
    const state = createReviewGateState({
      phase: 'waiting',
      unit: { unitId: 'M002-S03-T04' },
      reviewId: 'rev-legacy',
      status: 'pending',
      decision: 'wait',
      blockedPolicy: 'auto-loop',
      summary: 'Legacy pending pause.',
    });

    await writeFile(
      path.join(tmpRoot, '.gsd', 'runtime', 'paused-session.json'),
      JSON.stringify({ reason: 'review-waiting', pausedReviewState: serializePausedReviewState(state) }),
      'utf8',
    );

    const restored = await readPausedReviewGateState(tmpRoot);
    expect(restored?.reviewId).toBe('rev-legacy');
    expect(restored?.status).toBe('pending');
  });

  it('session can be seeded from restored paused state', async () => {
    const state = createReviewGateState({
      phase: 'waiting',
      unit: { unitId: 'M002-S03-T04' },
      reviewId: 'rev-restored',
      status: 'pending',
      decision: 'wait',
      blockedPolicy: 'auto-loop',
      summary: 'Waiting.',
    });

    await writePausedReviewGateState(tmpRoot, state, 'review-waiting');
    const restored = await readPausedReviewGateState(tmpRoot);
    const session = createAutoSession({ reviewGateState: restored });

    expect(session.reviewGateState?.reviewId).toBe('rev-restored');
    expect(session.reviewGateState?.status).toBe('pending');
    expect(session.paused).toBe(false);
  });
});
