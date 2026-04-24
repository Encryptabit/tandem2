import { describe, expect, it, beforeEach } from 'vitest';
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { handleReviewSubmit, handleReviewStatus } from '../src/commands.js';
import { createAutoSession } from '../src/session.js';
import { createReviewGateState } from '../src/types.js';
import { writePausedReviewGateState } from '../src/pause-state.js';

const tmpRoot = path.join(process.cwd(), '.tmp-ext-command-tests');

async function resetTmpRoot(): Promise<void> {
  await rm(tmpRoot, { recursive: true, force: true });
  await mkdir(path.join(tmpRoot, '.gsd', 'runtime'), { recursive: true });
}

describe('handleReviewSubmit', () => {
  beforeEach(resetTmpRoot);

  it('submits manual review for the current unit and makes the shared review id visible to status', async () => {
    const unit = { unitId: 'M002-S04-T01' };
    const session = createAutoSession({ currentUnit: unit });

    const submitOutput = await handleReviewSubmit({
      session,
      projectRoot: tmpRoot,
      transport: {
        async submitReview(target) {
          expect(target).toEqual(unit);
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

    expect(submitOutput).toMatch(/targetSource: current/);
    expect(submitOutput).toMatch(/target: M002-S04-T01/);
    expect(submitOutput).toMatch(/reviewId: rev-current/);
    expect(submitOutput).toMatch(/status: pending/);
    expect(submitOutput).toMatch(/decision: wait/);
    expect(submitOutput).toMatch(/blockedPolicy: intervene/);

    const statusOutput = await handleReviewStatus({ session, projectRoot: tmpRoot });
    expect(statusOutput).toMatch(/source: live/);
    expect(statusOutput).toMatch(/refreshed: no/);
    expect(statusOutput).toMatch(/reviewId: rev-current/);
    expect(statusOutput).toMatch(/status: pending/);
    expect(statusOutput).toMatch(/decision: wait/);
  });

  it('submits manual review for an explicit target without requiring an active session target', async () => {
    const target = {
      unitId: 'M002-S04-T02',
      milestoneId: 'M002',
      sliceId: 'S04',
      taskId: 'T02',
    };

    const output = await handleReviewSubmit({
      session: null,
      projectRoot: tmpRoot,
      target,
      transport: {
        async submitReview(unit) {
          expect(unit).toEqual(target);
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

    expect(output).toMatch(/targetSource: explicit/);
    expect(output).toMatch(/target: M002-S04-T02/);
    expect(output).toMatch(/reviewId: rev-explicit/);
    expect(output).toMatch(/status: approved/);
    expect(output).toMatch(/decision: allow/);
    expect(output).toMatch(/blockedPolicy: intervene/);
    expect(output).toMatch(/summary: Ready to land\./);
  });

  it('resubmits to the same review id when current state is changes_requested for the same unit', async () => {
    const unit = { unitId: 'M002-S04-T09' };
    const session = createAutoSession({
      currentUnit: unit,
      reviewGateState: createReviewGateState({
        phase: 'completed',
        unit,
        reviewId: 'rev-existing',
        status: 'changes_requested',
        decision: 'block',
        blockedPolicy: 'intervene',
        summary: 'Needs another pass.',
        feedback: 'Rename helper and add guard.',
      }),
    });

    const output = await handleReviewSubmit({
      session,
      projectRoot: tmpRoot,
      transport: {
        async submitReview() {
          throw new Error('submitReview should not be used for counter-patch requeue');
        },
        async submitCounterPatch(input) {
          expect(input.reviewId).toBe('rev-existing');
          expect(input.unit).toEqual(unit);
          expect(input.feedback).toContain('Rename helper');
          return {
            reviewId: 'rev-existing',
            status: 'pending',
            summary: 'Counter-patch submitted.',
          };
        },
        async getStatus() {
          throw new Error('not used');
        },
      },
    });

    expect(output).toMatch(/reviewId: rev-existing/);
    expect(output).toMatch(/status: pending/);
    expect(output).toMatch(/summary: Counter-patch submitted\./);
  });

  it('returns deterministic output when no current or explicit review target can be resolved', async () => {
    expect(
      await handleReviewSubmit({
        session: null,
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
    ).toBe('review_target_missing');
  });

  it('formats broker submission failures through the shared sanitized runtime path', async () => {
    const session = createAutoSession({
      currentUnit: { unitId: 'M002-S04-T03' },
    });

    const output = await handleReviewSubmit({
      session,
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

    expect(output).toMatch(/reviewId: none/);
    expect(output).toMatch(/status: none/);
    expect(output).toMatch(/decision: error/);
    expect(output).toMatch(/summary: Broker unavailable\./);
    expect(output).toMatch(/error: broker_unavailable:Broker unavailable\./);
    expect(output).not.toMatch(/sensitive stack should not leak/);
  });
});

describe('handleReviewStatus', () => {
  beforeEach(resetTmpRoot);

  it('formats live review state without falling back to paused state', async () => {
    const session = createAutoSession({
      reviewGateState: createReviewGateState({
        phase: 'waiting',
        unit: { unitId: 'M002-S03-T04' },
        reviewId: 'rev-live',
        status: 'pending',
        decision: 'wait',
        blockedPolicy: 'auto-loop',
        summary: 'Still waiting.',
      }),
    });

    const output = await handleReviewStatus({ session, projectRoot: tmpRoot });
    expect(output).toMatch(/source: live/);
    expect(output).toMatch(/reviewId: rev-live/);
    expect(output).toMatch(/status: pending/);
    expect(output).toMatch(/decision: wait/);
    expect(output).toMatch(/blockedPolicy: auto-loop/);
  });

  it('falls back to paused review state when no live state exists', async () => {
    const liveSession = createAutoSession({
      reviewGateState: createReviewGateState({
        phase: 'waiting',
        unit: { unitId: 'M002-S03-T04' },
        reviewId: 'rev-paused',
        status: 'pending',
        decision: 'wait',
        blockedPolicy: 'auto-loop',
        summary: 'Pending pause.',
      }),
    });

    await writePausedReviewGateState(tmpRoot, liveSession.reviewGateState, 'review-waiting');

    const freshSession = createAutoSession();
    const output = await handleReviewStatus({ session: freshSession, projectRoot: tmpRoot });
    expect(output).toMatch(/source: paused/);
    expect(output).toMatch(/refreshed: no/);
    expect(output).toMatch(/reviewId: rev-paused/);
  });

  it('falls back to paused state and refreshes through transport when available', async () => {
    const liveSession = createAutoSession({
      reviewGateState: createReviewGateState({
        phase: 'waiting',
        unit: { unitId: 'M002-S03-T04' },
        reviewId: 'rev-paused',
        status: 'pending',
        decision: 'wait',
        blockedPolicy: 'auto-loop',
        summary: 'Pending pause.',
      }),
    });

    await writePausedReviewGateState(tmpRoot, liveSession.reviewGateState, 'review-waiting');

    const freshSession = createAutoSession();
    const output = await handleReviewStatus({
      session: freshSession,
      projectRoot: tmpRoot,
      transport: {
        async submitReview() {
          throw new Error('not used');
        },
        async getStatus(reviewId) {
          expect(reviewId).toBe('rev-paused');
          return {
            reviewId,
            status: 'claimed',
            summary: 'Still pending from broker.',
          };
        },
      },
    });

    expect(output).toMatch(/source: paused/);
    expect(output).toMatch(/refreshed: yes/);
    expect(output).toMatch(/reviewId: rev-paused/);
    expect(output).toMatch(/status: claimed/);
    expect(output).toMatch(/decision: wait/);
    expect(output).toMatch(/summary: Still pending from broker\./);
  });

  it('returns review_state_missing when no live or paused state exists', async () => {
    expect(await handleReviewStatus({ session: null, projectRoot: tmpRoot })).toBe('review_state_missing');
  });
});
