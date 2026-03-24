import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { deserializePausedReviewState, serializePausedReviewState } from '../review/pause-state.ts';
import { pauseAuto, setAutoSession, startAuto } from '../auto.ts';
import { createAutoSession } from '../auto/session.ts';
import { createReviewGateState } from '../review/types.ts';

const tmpRoot = path.join(process.cwd(), '.tmp-review-pause-state-tests');

async function resetTmpRoot(): Promise<void> {
  await rm(tmpRoot, { recursive: true, force: true });
  await mkdir(path.join(tmpRoot, '.gsd', 'runtime'), { recursive: true });
}

test('paused review serialization keeps only inspectable fields', () => {
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
  assert.equal(serialized.schemaVersion, 1);
  assert.equal(serialized.savedAt, '2026-03-21T00:00:00.000Z');
  assert.equal('rawPatch' in (serialized.reviewGateState as object), false);
  assert.equal(serialized.reviewGateState?.reviewId, 'rev-1');
});

test('paused review deserialization tolerates missing payloads and restores normalized state', () => {
  assert.equal(deserializePausedReviewState(null), null);

  const restored = deserializePausedReviewState({
    reviewGateState: {
      phase: 'completed',
      unit: { unitId: 'M002-S03-T04' },
      reviewId: 'rev-2',
      status: 'blocked',
      decision: 'block',
      blockedPolicy: 'intervene',
      summary: 'Blocked.',
      error: null,
      updatedAt: '2026-03-21T00:00:00.000Z',
      source: 'paused',
    },
  });

  assert.equal(restored?.reviewId, 'rev-2');
  assert.equal(restored?.blockedPolicy, 'intervene');
});

test('pauseAuto persists review metadata and startAuto restores reviewGateState from paused-session.json', async () => {
  await resetTmpRoot();
  setAutoSession(
    createAutoSession({
      reviewGateState: createReviewGateState({
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
      }),
    }),
  );

  await pauseAuto(tmpRoot, 'review-waiting');
  setAutoSession(null);

  const payload = JSON.parse(
    await readFile(path.join(tmpRoot, '.gsd', 'runtime', 'paused-session.json'), 'utf8'),
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

  assert.equal(payload.reason, 'review-waiting');
  assert.equal(payload.pausedReviewState.schemaVersion, 1);
  assert.equal(typeof payload.pausedReviewState.savedAt, 'string');
  assert.equal(payload.pausedReviewState.reviewGateState.reviewId, 'rev-paused');
  assert.equal(payload.pausedReviewState.reviewGateState.phase, 'waiting');
  assert.equal(payload.pausedReviewState.reviewGateState.decision, 'wait');
  assert.deepEqual(payload.pausedReviewState.reviewGateState.error, {
    code: 'broker_unavailable',
    message: 'Broker unavailable.',
    retryable: true,
  });

  const restored = await startAuto(tmpRoot);
  assert.equal(restored.reviewGateState?.reviewId, 'rev-paused');
  assert.equal(restored.reviewGateState?.status, 'pending');
  assert.equal(restored.reviewGateState?.error?.code, 'broker_unavailable');
});
