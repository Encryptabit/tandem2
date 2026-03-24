import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { handleReviewStatus, handleReviewSubmit } from '../commands/handlers/review.ts';
import { createAutoSession } from '../auto/session.ts';
import { setAutoSession } from '../auto.ts';

const tmpRoot = path.join(process.cwd(), '.tmp-review-command-tests');

async function resetTmpRoot(): Promise<void> {
  await rm(tmpRoot, { recursive: true, force: true });
  await mkdir(path.join(tmpRoot, '.gsd', 'runtime'), { recursive: true });
  setAutoSession(null);
}

test('submits manual review for the current unit and makes the shared review id visible to status', async () => {
  await resetTmpRoot();
  const unit = { unitId: 'M002-S04-T01' };
  setAutoSession(
    createAutoSession({
      currentUnit: unit,
    }),
  );

  const submitOutput = await handleReviewSubmit({
    projectRoot: tmpRoot,
    transport: {
      async submitReview(target) {
        assert.deepEqual(target, unit);
        return {
          reviewId: 'rev-current',
          status: 'pending',
          summary: 'Broker review queued.',
        };
      },
      async getStatus() {
        throw new Error('not used');
      },
    },
  });

  assert.match(submitOutput, /targetSource: current/);
  assert.match(submitOutput, /target: M002-S04-T01/);
  assert.match(submitOutput, /reviewId: rev-current/);
  assert.match(submitOutput, /status: pending/);
  assert.match(submitOutput, /decision: wait/);
  assert.match(submitOutput, /blockedPolicy: intervene/);

  const statusOutput = await handleReviewStatus({ projectRoot: tmpRoot });
  assert.match(statusOutput, /source: live/);
  assert.match(statusOutput, /refreshed: no/);
  assert.match(statusOutput, /reviewId: rev-current/);
  assert.match(statusOutput, /status: pending/);
  assert.match(statusOutput, /decision: wait/);
});

test('submits manual review for an explicit target without requiring an active session target', async () => {
  await resetTmpRoot();
  const target = {
    unitId: 'M002-S04-T02',
    milestoneId: 'M002',
    sliceId: 'S04',
    taskId: 'T02',
  };

  const output = await handleReviewSubmit({
    projectRoot: tmpRoot,
    target,
    transport: {
      async submitReview(unit) {
        assert.deepEqual(unit, target);
        return {
          reviewId: 'rev-explicit',
          status: 'approved',
          summary: 'Ready to land.',
        };
      },
      async getStatus() {
        throw new Error('not used');
      },
    },
  });

  assert.match(output, /targetSource: explicit/);
  assert.match(output, /target: M002-S04-T02/);
  assert.match(output, /reviewId: rev-explicit/);
  assert.match(output, /status: approved/);
  assert.match(output, /decision: allow/);
  assert.match(output, /blockedPolicy: intervene/);
  assert.match(output, /summary: Ready to land\./);
});

test('returns deterministic output when no current or explicit review target can be resolved', async () => {
  await resetTmpRoot();
  assert.equal(
    await handleReviewSubmit({
      projectRoot: tmpRoot,
      transport: {
        async submitReview() {
          throw new Error('not used');
        },
        async getStatus() {
          throw new Error('not used');
        },
      },
    }),
    'review_target_missing',
  );
});

test('formats broker submission failures through the shared sanitized runtime path', async () => {
  await resetTmpRoot();
  setAutoSession(
    createAutoSession({
      currentUnit: { unitId: 'M002-S04-T03' },
    }),
  );

  const output = await handleReviewSubmit({
    projectRoot: tmpRoot,
    transport: {
      async submitReview() {
        throw {
          code: 'broker_unavailable',
          message: 'Broker unavailable.',
          retryable: true,
          stack: 'sensitive stack should not leak',
        };
      },
      async getStatus() {
        throw new Error('not used');
      },
    },
  });

  assert.match(output, /reviewId: none/);
  assert.match(output, /status: none/);
  assert.match(output, /decision: error/);
  assert.match(output, /summary: Broker unavailable\./);
  assert.match(output, /error: broker_unavailable:Broker unavailable\./);
  assert.doesNotMatch(output, /sensitive stack should not leak/);
});
