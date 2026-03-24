import type { ReviewStatus } from './domain.js';
export declare const REVIEW_TRANSITIONS: Readonly<Record<ReviewStatus, readonly ReviewStatus[]>>;
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
export declare function listAllowedTransitions(status: ReviewStatus): readonly ReviewStatus[];
export declare function canTransition(from: ReviewStatus, to: ReviewStatus): boolean;
export declare function validateTransition(from: ReviewStatus, to: ReviewStatus): TransitionValidationResult;
export declare function assertTransition(from: ReviewStatus, to: ReviewStatus): void;
//# sourceMappingURL=state-machine.d.ts.map