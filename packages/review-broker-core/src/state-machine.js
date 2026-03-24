export const REVIEW_TRANSITIONS = {
    pending: ['claimed'],
    claimed: ['pending', 'submitted'],
    submitted: ['changes_requested', 'approved'],
    changes_requested: ['pending'],
    approved: ['closed'],
    closed: [],
};
export function listAllowedTransitions(status) {
    return REVIEW_TRANSITIONS[status];
}
export function canTransition(from, to) {
    return REVIEW_TRANSITIONS[from].includes(to);
}
export function validateTransition(from, to) {
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
export function assertTransition(from, to) {
    const result = validateTransition(from, to);
    if (!result.ok) {
        throw new Error(`Cannot transition review from ${from} to ${to}. Allowed next statuses: ${result.allowed.join(', ') || '(none)'}.`);
    }
}
//# sourceMappingURL=state-machine.js.map
