import type { ReviewStatus } from './domain.js';

export const REVIEW_TRANSITIONS: Readonly<Record<ReviewStatus, readonly ReviewStatus[]>> = {
  pending: ['claimed'],
  claimed: ['pending', 'submitted'],
  submitted: ['changes_requested', 'approved'],
  changes_requested: ['pending'],
  approved: ['closed'],
  closed: [],
};

export interface TransitionValidationSuccess {
  ok: true;
  from: ReviewStatus;
  to: ReviewStatus;
}

export interface TransitionValidationFailure {
  ok: false;
  code: 'INVALID_REVIEW_TRANSITION';
  from: ReviewStatus;
  to: ReviewStatus;
  allowed: readonly ReviewStatus[];
}

export type TransitionValidationResult = TransitionValidationSuccess | TransitionValidationFailure;

export function listAllowedTransitions(status: ReviewStatus): readonly ReviewStatus[] {
  return REVIEW_TRANSITIONS[status];
}

export function canTransition(from: ReviewStatus, to: ReviewStatus): boolean {
  return REVIEW_TRANSITIONS[from].includes(to);
}

export function validateTransition(from: ReviewStatus, to: ReviewStatus): TransitionValidationResult {
  const allowed = listAllowedTransitions(from);

  if (allowed.includes(to)) {
    return { ok: true, from, to };
  }

  return {
    ok: false,
    code: 'INVALID_REVIEW_TRANSITION',
    from,
    to,
    allowed,
  };
}

export function assertTransition(from: ReviewStatus, to: ReviewStatus): void {
  const result = validateTransition(from, to);

  if (!result.ok) {
    throw new Error(
      `Cannot transition review from ${from} to ${to}. Allowed next statuses: ${result.allowed.join(', ') || '(none)'}.`,
    );
  }
}
