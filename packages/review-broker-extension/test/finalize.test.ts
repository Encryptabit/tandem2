import { describe, expect, it } from 'vitest';
import { finalizeReviewForUnit } from '../src/finalize.js';
import { createAutoSession } from '../src/session.js';
import {
  createReviewRetry,
  createVerificationRetry,
  formatPendingRetryPrompt,
} from '../src/verification.js';

const unit = { unitId: 'M002-S03-T03' };

describe('finalizeReviewForUnit', () => {
  it('retry prompt framing stays truthful for verification failures vs broker review feedback', () => {
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

    expect(verificationPrompt).toMatch(/Verification failed on the previous attempt/);
    expect(reviewPrompt).toMatch(/Broker review feedback \(rev-block\) blocked the previous attempt/);
    expect(reviewPrompt).not.toMatch(/Verification failed/);
    expect(reviewPrompt).toMatch(/Please add reviewer context\./);
  });

  it('allow outcome progresses and clears stale retry context', async () => {
    const session = createAutoSession({
      pendingVerificationRetry: createVerificationRetry('Old verification failure.'),
    });

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
    });

    expect(outcome.action).toBe('progress');
    expect(session.pendingVerificationRetry).toBeNull();
    expect(session.paused).toBe(false);
    expect(session.currentUnit).toEqual(unit);
    expect(session.history.at(-1)).toMatch(/^review-allowed:rev-allow:/);
  });

  it('blocked auto-loop retries the same unit without pausing', async () => {
    const session = createAutoSession();

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
    });

    expect(outcome.action).toBe('retry-unit');
    expect(session.paused).toBe(false);
    expect(session.pausedReason).toBeNull();
    expect(session.currentUnit).toEqual(unit);
    expect(session.pendingVerificationRetry?.source).toBe('review');
    expect(session.pendingVerificationRetry?.reviewId).toBe('rev-block');
    expect(session.pendingVerificationRetry?.feedback).toBe('Please add reviewer context.');
    expect(formatPendingRetryPrompt(session.pendingVerificationRetry!)).toMatch(/reviewer guidance/);
    expect(session.history.at(-1)).toMatch(/^review-blocked:auto-loop:rev-block:/);
  });

  it('blocked intervene retries the same unit with explicit user-guidance framing', async () => {
    const session = createAutoSession();

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
    });

    expect(outcome.action).toBe('retry-unit');
    expect(outcome.reason).toBe('review-blocked');
    expect(outcome.gate.kind).toBe('block');
    expect(session.paused).toBe(false);
    expect(session.pausedReason).toBeNull();
    expect(session.pendingVerificationRetry).toMatchObject({
      source: 'review',
      reviewId: 'rev-block-human',
      blockedPolicy: 'intervene',
    });
    expect(formatPendingRetryPrompt(session.pendingVerificationRetry!)).toMatch(/get explicit direction before editing code/);
    expect(session.history.at(-1)).toMatch(/^review-blocked:intervene:retry:rev-block-human:/);
  });

  it('waiting pauses visibly without retry injection', async () => {
    const session = createAutoSession();

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
    });

    expect(outcome.action).toBe('pause');
    expect(outcome.reason).toBe('review-waiting');
    expect(outcome.gate.kind).toBe('wait');
    expect(session.pausedReason).toBe('review-waiting');
    expect(session.pendingVerificationRetry).toBeNull();
    expect(session.history.at(-1)).toMatch(/^review-waiting:rev-wait:/);
  });

  it('broker errors pause visibly without retry injection', async () => {
    const session = createAutoSession();

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
    });

    expect(outcome.action).toBe('pause');
    expect(outcome.reason).toBe('review-error');
    expect(outcome.gate.kind).toBe('error');
    expect(session.pausedReason).toBe('review-error');
    expect(session.pendingVerificationRetry).toBeNull();
    expect(session.history.at(-1)).toMatch(/^review-error:broker_unavailable:/);
  });
});
