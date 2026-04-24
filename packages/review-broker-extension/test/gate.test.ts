import { describe, expect, it } from 'vitest';
import { createAutoSession } from '../src/session.js';
import { runReviewGate } from '../src/gate.js';
import { createReviewGateState } from '../src/types.js';

const unit = { unitId: 'M002-S03-T03' };

describe('runReviewGate', () => {
  it('reuses same-unit pending review id before submitting again', async () => {
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
          expect(reviewId).toBe('rev-123');
          return {
            reviewId,
            status: 'changes_requested',
            summary: 'Needs changes.',
            feedback: 'Please add reviewer context.',
          };
        },
      },
    });

    expect(submitCalls).toBe(0);
    expect(refreshCalls).toBe(1);
    expect(result.kind).toBe('block');
    expect(result.reviewId).toBe('rev-123');
    expect(result.blockedPolicy).toBe('auto-loop');
    expect(session.reviewGateState?.reviewId).toBe('rev-123');
  });

  it('submits a counter-patch to the same review id after changes_requested', async () => {
    const session = createAutoSession({
      reviewGateState: createReviewGateState({
        phase: 'completed',
        unit,
        reviewId: 'rev-123',
        status: 'changes_requested',
        decision: 'block',
        blockedPolicy: 'auto-loop',
        summary: 'Needs changes.',
        feedback: 'Rename the exported helper.',
      }),
    });

    let refreshCalls = 0;
    let counterPatchCalls = 0;

    const result = await runReviewGate({
      session,
      unit,
      transport: {
        async submitReview() {
          throw new Error('not used');
        },
        async submitCounterPatch(input) {
          counterPatchCalls += 1;
          expect(input.reviewId).toBe('rev-123');
          expect(input.unit).toEqual(unit);
          expect(input.feedback).toContain('Rename the exported helper.');
          return {
            reviewId: 'rev-123',
            status: 'pending',
            summary: 'Counter-patch submitted.',
          };
        },
        async getStatus() {
          refreshCalls += 1;
          return {
            reviewId: 'rev-123',
            status: 'claimed',
            summary: 'not used',
          };
        },
      },
    });

    expect(counterPatchCalls).toBe(1);
    expect(refreshCalls).toBe(0);
    expect(result.kind).toBe('wait');
    expect(result.reviewId).toBe('rev-123');
    expect(session.reviewGateState?.status).toBe('pending');
  });

  it('waiting reviews keep review identity visible on session state', async () => {
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

    expect(result.kind).toBe('wait');
    expect(session.reviewGateState?.reviewId).toBe('rev-wait');
    expect(session.reviewGateState?.status).toBe('pending');
  });

  it('blocked-policy resolution stays mode-aware', async () => {
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

    expect(autoResult.kind).toBe('block');
    expect(humanResult.kind).toBe('block');
    expect(autoResult.blockedPolicy).toBe('auto-loop');
    expect(humanResult.blockedPolicy).toBe('intervene');
  });
});
