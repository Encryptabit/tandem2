---
estimated_steps: 4
estimated_files: 4
skills_used:
  - gsd
  - create-gsd-extension
  - debug-like-expert
  - test
  - review
---

# T01: Make the review gate continuity-aware and policy-aware

**Slice:** S03 — Blocked-review policy and gate continuity
**Milestone:** M002

## Description

Retire the two biggest gate-level risks before touching loop orchestration: dead blocked-policy runtime config and duplicate review submission on resume. This task keeps policy interpretation in `review/gate.ts`, makes same-unit review continuity first-class, and preserves waiting/block/error review state as an inspectable runtime contract instead of collapsing it into a generic error.

## Steps

1. Extend `src/resources/extensions/gsd/review/types.ts` so the gate can return explicit waiting and blocked-policy-aware results without overloading generic error semantics.
2. Update `src/resources/extensions/gsd/review/gate.ts` to resolve blocked policy from `resolveReviewPreferences()`, reuse an existing same-unit `reviewId` from `AutoSession.reviewGateState` before submitting again, and keep waiting/block/error state visible with unit identity and sanitized summaries intact.
3. Add or extend focused assertions in `src/resources/extensions/gsd/tests/auto-review-gate.test.ts` covering same-unit review reuse, waiting-state continuity, and blocked-policy outcomes for auto vs human mode.
4. Keep `src/resources/extensions/gsd/tests/review-preferences.test.ts` aligned with the runtime contract so `mode-default` continues to resolve to `auto-loop` for auto and `intervene` for human flows.

## Must-Haves

- [ ] The gate refreshes an existing same-unit broker review instead of calling `createReview()` again when `AutoSession.reviewGateState` already carries a matching `reviewId`.
- [ ] Waiting reviews remain explicit gate outcomes with active review identity and summary preserved on `AutoSession.reviewGateState`.
- [ ] Blocked outcomes expose the resolved blocked policy from the gate seam rather than forcing `auto-loop.ts` to re-resolve or hardcode policy.

## Verification

- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test ./src/resources/extensions/gsd/tests/review-preferences.test.ts ./src/resources/extensions/gsd/tests/auto-review-gate.test.ts`
- `rg -n "auto-loop|intervene|waiting|reviewId" src/resources/extensions/gsd/review/types.ts src/resources/extensions/gsd/review/gate.ts src/resources/extensions/gsd/tests/auto-review-gate.test.ts`

## Observability Impact

- Signals added/changed: gate results and `AutoSession.reviewGateState` now make waiting status, resolved blocked policy, and same-unit review reuse explicit.
- How a future agent inspects this: rerun `src/resources/extensions/gsd/tests/auto-review-gate.test.ts` and inspect the recorded `reviewGateState` fields in `src/resources/extensions/gsd/review/gate.ts`.
- Failure state exposed: duplicate-submission regressions, missing `reviewId` continuity, and blocked-policy drift become visible as direct test failures or mismatched gate state.

## Inputs

- `src/resources/extensions/gsd/review/gate.ts` — current submit-first gate seam that still collapses waiting continuity and does not honor blocked policy.
- `src/resources/extensions/gsd/review/types.ts` — normalized review and gate result contracts that need to represent waiting and policy-aware outcomes.
- `src/resources/extensions/gsd/auto/session.ts` — owner of `AutoSession.reviewGateState`, the continuity surface this task must reuse.
- `src/resources/extensions/gsd/tests/auto-review-gate.test.ts` — focused gate-level regression coverage to extend.
- `src/resources/extensions/gsd/tests/review-preferences.test.ts` — current proof for `mode-default` review-policy resolution.

## Expected Output

- `src/resources/extensions/gsd/review/types.ts` — explicit gate result/state contract for waiting and blocked-policy-aware outcomes.
- `src/resources/extensions/gsd/review/gate.ts` — continuity-aware gate that reuses active reviews and records honest waiting/block/error state.
- `src/resources/extensions/gsd/tests/review-preferences.test.ts` — policy-resolution coverage aligned with the gate contract.
- `src/resources/extensions/gsd/tests/auto-review-gate.test.ts` — gate continuity and blocked-policy regression tests.
