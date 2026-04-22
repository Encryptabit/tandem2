import test from 'node:test';
import assert from 'node:assert/strict';
import { createAutoSession } from '../auto/session.ts';
import { runReviewGate } from '../review/gate.ts';
import { createReviewGateState } from '../review/types.ts';

const unit = { unitId: 'M002-S03-T03' };

test('reuses same-unit review id before submitting again', async () => {
  const session = createAutoSession({
    reviewGateState: createReviewGateState({
      phase: 'waiting',
      unit,
      reviewId: 'rev-123',
      status: 'pending',
      decision: 'wait',
      blockedPolicy: 'auto-loop',
      summary: 'Still waiting.',
    }),
  });

  let submitCalls = 0;
  let refreshCalls = 0;

  const result = await runReviewGate({
    session,
    unit,
    transport: {
      async submitReview() {
        submitCalls += 1;
        return { reviewId: 'rev-new', status: 'approved' };
      },
      async getStatus(reviewId) {
        refreshCalls += 1;
        assert.equal(reviewId, 'rev-123');
        return {
          reviewId,
          status: 'changes_requested',
          summary: 'Needs changes.',
          feedback: 'Please add reviewer context.',
        };
      },
    },
  });

  assert.equal(submitCalls, 0);
  assert.equal(refreshCalls, 1);
  assert.equal(result.kind, 'block');
  assert.equal(result.reviewId, 'rev-123');
  assert.equal(result.blockedPolicy, 'auto-loop');
  assert.equal(session.reviewGateState?.reviewId, 'rev-123');
});

test('waiting reviews keep review identity visible on session state', async () => {
  const session = createAutoSession();

  const result = await runReviewGate({
    session,
    unit,
    transport: {
      async submitReview() {
        return {
          reviewId: 'rev-wait',
          status: 'pending',
          summary: 'Broker review still pending.',
        };
      },
      async getStatus() {
        throw new Error('not used');
      },
    },
  });

  assert.equal(result.kind, 'wait');
  assert.equal(session.reviewGateState?.reviewId, 'rev-wait');
  assert.equal(session.reviewGateState?.status, 'pending');
});

test('blocked-policy resolution stays mode-aware', async () => {
  const transport = {
    async submitReview() {
      return {
        reviewId: 'rev-blocked',
        status: 'changes_requested' as const,
        summary: 'Blocked.',
      };
    },
    async getStatus() {
      return {
        reviewId: 'unused',
        status: 'approved' as const,
      };
    },
  };

  const autoResult = await runReviewGate({
    session: createAutoSession(),
    unit,
    mode: 'auto',
    transport,
  });
  const humanResult = await runReviewGate({
    session: createAutoSession(),
    unit,
    mode: 'human',
    transport,
  });

  assert.equal(autoResult.kind, 'block');
  assert.equal(humanResult.kind, 'block');
  assert.equal(autoResult.blockedPolicy, 'auto-loop');
  assert.equal(humanResult.blockedPolicy, 'intervene');
});
