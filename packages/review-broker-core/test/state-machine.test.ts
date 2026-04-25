import { describe, expect, it } from 'vitest';

import { LEGACY_IN_REVIEW_STATUS } from '../src/domain.js';
import {
  REVIEW_TRANSITIONS,
  assertTransition,
  canTransition,
  listAllowedTransitions,
  validateTransition,
} from '../src/state-machine.js';

describe('review-broker-core state machine', () => {
  it('freezes the review transition table used by the server package', () => {
    expect(REVIEW_TRANSITIONS).toEqual({
      pending: ['claimed'],
      claimed: ['pending', 'submitted'],
      submitted: ['changes_requested', 'approved'],
      changes_requested: ['pending', 'approved'],
      approved: ['closed'],
      closed: [],
    });
  });

  it('makes submitted the explicit TypeScript equivalent of the legacy in_review state', () => {
    expect(LEGACY_IN_REVIEW_STATUS).toBe('submitted');
    expect(listAllowedTransitions(LEGACY_IN_REVIEW_STATUS)).toEqual(['changes_requested', 'approved']);
  });

  it('accepts the preserved review-discussion and requeue transitions', () => {
    expect(canTransition('claimed', 'submitted')).toBe(true);
    expect(canTransition('changes_requested', 'pending')).toBe(true);
    expect(canTransition('changes_requested', 'approved')).toBe(true);
    expect(validateTransition('approved', 'closed')).toEqual({
      ok: true,
      from: 'approved',
      to: 'closed',
    });
  });

  it('rejects closing until the approved path is reached', () => {
    expect(validateTransition('pending', 'closed')).toEqual({
      ok: false,
      code: 'INVALID_REVIEW_TRANSITION',
      from: 'pending',
      to: 'closed',
      allowed: ['claimed'],
    });

    expect(validateTransition('submitted', 'closed')).toEqual({
      ok: false,
      code: 'INVALID_REVIEW_TRANSITION',
      from: 'submitted',
      to: 'closed',
      allowed: ['changes_requested', 'approved'],
    });
  });

  it('rejects reopening the frozen requeue and counter-patch-adjacent transitions without updating the contract', () => {
    expect(validateTransition('changes_requested', 'claimed')).toEqual({
      ok: false,
      code: 'INVALID_REVIEW_TRANSITION',
      from: 'changes_requested',
      to: 'claimed',
      allowed: ['pending', 'approved'],
    });

    expect(validateTransition('approved', 'pending')).toEqual({
      ok: false,
      code: 'INVALID_REVIEW_TRANSITION',
      from: 'approved',
      to: 'pending',
      allowed: ['closed'],
    });
  });

  it('throws a readable error when a caller attempts an invalid transition', () => {
    expect(() => assertTransition('closed', 'pending')).toThrow(
      'Cannot transition review from closed to pending. Allowed next statuses: (none).',
    );
  });
});
