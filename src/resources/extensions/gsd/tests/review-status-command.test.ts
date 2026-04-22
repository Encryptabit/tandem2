import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { handleReviewStatus } from '../commands/handlers/review.ts';
import { createAutoSession } from '../auto/session.ts';
import { pauseAuto, setAutoSession } from '../auto.ts';
import { createReviewGateState } from '../review/types.ts';

const tmpRoot = path.join(process.cwd(), '.tmp-review-status-tests');

async function resetTmpRoot(): Promise<void> {
  await rm(tmpRoot, { recursive: true, force: true });
  await mkdir(path.join(tmpRoot, '.gsd', 'runtime'), { recursive: true });
}

test('formats live review state without falling back to paused state', async () => {
  await resetTmpRoot();
  setAutoSession(
    createAutoSession({
      reviewGateState: createReviewGateState({
        phase: 'waiting',
        unit: { unitId: 'M002-S03-T04' },
        reviewId: 'rev-live',
        status: 'pending',
        decision: 'wait',
        blockedPolicy: 'auto-loop',
        summary: 'Still waiting.',
      }),
    }),
  );

  const output = await handleReviewStatus({ projectRoot: tmpRoot });
  assert.match(output, /source: live/);
  assert.match(output, /reviewId: rev-live/);
  assert.match(output, /status: pending/);
  assert.match(output, /decision: wait/);
  assert.match(output, /blockedPolicy: auto-loop/);
});

test('falls back to paused review state when no live state exists', async () => {
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
      }),
    }),
  );
  await pauseAuto(tmpRoot, 'review-waiting');
  setAutoSession(null);

  const output = await handleReviewStatus({ projectRoot: tmpRoot });
  assert.match(output, /source: paused/);
  assert.match(output, /refreshed: no/);
  assert.match(output, /reviewId: rev-paused/);
});

test('falls back to paused review state when no live state exists and refreshes through the shared runtime path', async () => {
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
      }),
    }),
  );
  await pauseAuto(tmpRoot, 'review-waiting');
  setAutoSession(null);

  const output = await handleReviewStatus({
    projectRoot: tmpRoot,
    transport: {
      async submitReview() {
        throw new Error('not used');
      },
      async getStatus(reviewId) {
        assert.equal(reviewId, 'rev-paused');
        return {
          reviewId,
          status: 'claimed',
          summary: 'Still pending from broker.',
        };
      },
    },
  });

  assert.match(output, /source: paused/);
  assert.match(output, /refreshed: yes/);
  assert.match(output, /reviewId: rev-paused/);
  assert.match(output, /status: claimed/);
  assert.match(output, /decision: wait/);
  assert.match(output, /summary: Still pending from broker\./);
});

test('returns review_state_missing when no live or paused state exists', async () => {
  await resetTmpRoot();
  setAutoSession(null);
  assert.equal(await handleReviewStatus({ projectRoot: tmpRoot }), 'review_state_missing');
});
