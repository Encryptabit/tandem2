import test from 'node:test';
import assert from 'node:assert/strict';
import { finalizeReviewForUnit } from '../auto-loop.ts';
import { createAutoSession } from '../auto/session.ts';
import {
  createReviewRetry,
  createVerificationRetry,
  formatPendingRetryPrompt,
} from '../auto-verification.ts';

const unit = { unitId: 'M002-S03-T03' };

test('retry prompt framing stays truthful for verification failures vs broker review feedback', () => {
  const verificationPrompt = formatPendingRetryPrompt(createVerificationRetry('Typecheck failed.'));
  const reviewPrompt = formatPendingRetryPrompt(
    createReviewRetry({
      kind: 'block',
      decision: 'block',
      blockedPolicy: 'auto-loop',
      summary: 'Needs changes.',
      feedback: 'Please add reviewer context.',
      reviewId: 'rev-block',
      status: 'changes_requested',
    }),
  );

  assert.match(verificationPrompt, /Verification failed on the previous attempt/);
  assert.match(reviewPrompt, /Broker review feedback \(rev-block\) blocked the previous attempt/);
  assert.doesNotMatch(reviewPrompt, /Verification failed/);
  assert.match(reviewPrompt, /Please add reviewer context\./);
});

test('allow outcome progresses through post-verification seam and clears stale retry context', async () => {
  const session = createAutoSession({
    pendingVerificationRetry: createVerificationRetry('Old verification failure.'),
  });

  const calls = {
    pauseAuto: 0,
    postUnitPostVerification: 0,
  };

  const outcome = await finalizeReviewForUnit({
    session,
    unit,
    transport: {
      async submitReview() {
        return { reviewId: 'rev-allow', status: 'approved', summary: 'Approved.' };
      },
      async getStatus() {
        throw new Error('not used');
      },
    },
    pauseAuto() {
      calls.pauseAuto += 1;
    },
    postUnitPostVerification() {
      calls.postUnitPostVerification += 1;
    },
  });

  assert.equal(outcome.action, 'progress');
  assert.equal(calls.pauseAuto, 0);
  assert.equal(calls.postUnitPostVerification, 1);
  assert.equal(session.pendingVerificationRetry, null);
  assert.equal(session.paused, false);
  assert.deepEqual(session.currentUnit, unit);
  assert.match(session.history.at(-1) ?? '', /^review-allowed:rev-allow:/);
});

test('blocked auto-loop retries the same unit without pausing or post-verification fallthrough', async () => {
  const session = createAutoSession();
  const calls = {
    pauseAuto: 0,
    postUnitPostVerification: 0,
  };

  const outcome = await finalizeReviewForUnit({
    session,
    unit,
    mode: 'auto',
    transport: {
      async submitReview() {
        return {
          reviewId: 'rev-block',
          status: 'changes_requested',
          summary: 'Needs changes.',
          feedback: 'Please add reviewer context.',
        };
      },
      async getStatus() {
        throw new Error('not used');
      },
    },
    pauseAuto() {
      calls.pauseAuto += 1;
    },
    postUnitPostVerification() {
      calls.postUnitPostVerification += 1;
    },
  });

  assert.equal(outcome.action, 'retry-unit');
  assert.equal(calls.pauseAuto, 0);
  assert.equal(calls.postUnitPostVerification, 0);
  assert.equal(session.paused, false);
  assert.equal(session.pausedReason, null);
  assert.deepEqual(session.currentUnit, unit);
  assert.equal(session.pendingVerificationRetry?.source, 'review');
  assert.equal(session.pendingVerificationRetry?.reviewId, 'rev-block');
  assert.equal(session.pendingVerificationRetry?.feedback, 'Please add reviewer context.');
  assert.match(formatPendingRetryPrompt(session.pendingVerificationRetry!), /reviewer guidance/);
  assert.match(session.history.at(-1) ?? '', /^review-blocked:auto-loop:rev-block:/);
});

test('blocked intervene pauses visibly without retry injection or post-verification fallthrough', async () => {
  const session = createAutoSession();
  const calls = {
    pauseAuto: 0,
    postUnitPostVerification: 0,
  };

  const outcome = await finalizeReviewForUnit({
    session,
    unit,
    mode: 'human',
    transport: {
      async submitReview() {
        return { reviewId: 'rev-block-human', status: 'changes_requested', summary: 'Human intervention needed.' };
      },
      async getStatus() {
        throw new Error('not used');
      },
    },
    pauseAuto(reason, gate) {
      calls.pauseAuto += 1;
      assert.equal(reason, 'review-blocked');
      assert.equal(gate.kind, 'block');
    },
    postUnitPostVerification() {
      calls.postUnitPostVerification += 1;
    },
  });

  assert.equal(outcome.action, 'pause');
  assert.equal(calls.pauseAuto, 1);
  assert.equal(calls.postUnitPostVerification, 0);
  assert.equal(session.paused, true);
  assert.equal(session.pausedReason, 'review-blocked');
  assert.equal(session.pendingVerificationRetry, null);
  assert.match(session.history.at(-1) ?? '', /^review-blocked:intervene:rev-block-human:/);
});

test('waiting pauses visibly without retry injection or post-verification fallthrough', async () => {
  const session = createAutoSession();
  const calls = {
    pauseAuto: 0,
    postUnitPostVerification: 0,
  };

  const outcome = await finalizeReviewForUnit({
    session,
    unit,
    transport: {
      async submitReview() {
        return { reviewId: 'rev-wait', status: 'claimed', summary: 'Still waiting.' };
      },
      async getStatus() {
        throw new Error('not used');
      },
    },
    pauseAuto(reason, gate) {
      calls.pauseAuto += 1;
      assert.equal(reason, 'review-waiting');
      assert.equal(gate.kind, 'wait');
    },
    postUnitPostVerification() {
      calls.postUnitPostVerification += 1;
    },
  });

  assert.equal(outcome.action, 'pause');
  assert.equal(calls.pauseAuto, 1);
  assert.equal(calls.postUnitPostVerification, 0);
  assert.equal(session.pausedReason, 'review-waiting');
  assert.equal(session.pendingVerificationRetry, null);
  assert.match(session.history.at(-1) ?? '', /^review-waiting:rev-wait:/);
});

test('broker errors pause visibly without retry injection or post-verification fallthrough', async () => {
  const session = createAutoSession();
  const calls = {
    pauseAuto: 0,
    postUnitPostVerification: 0,
  };

  const outcome = await finalizeReviewForUnit({
    session,
    unit,
    transport: {
      async submitReview() {
        throw Object.assign(new Error('Broker unavailable.'), {
          code: 'broker_unavailable',
          retryable: true,
        });
      },
      async getStatus() {
        throw new Error('not used');
      },
    },
    pauseAuto(reason, gate) {
      calls.pauseAuto += 1;
      assert.equal(reason, 'review-error');
      assert.equal(gate.kind, 'error');
    },
    postUnitPostVerification() {
      calls.postUnitPostVerification += 1;
    },
  });

  assert.equal(outcome.action, 'pause');
  assert.equal(calls.pauseAuto, 1);
  assert.equal(calls.postUnitPostVerification, 0);
  assert.equal(session.pausedReason, 'review-error');
  assert.equal(session.pendingVerificationRetry, null);
  assert.equal(outcome.gate.kind, 'error');
  assert.match(session.history.at(-1) ?? '', /^review-error:broker_unavailable:/);
});
