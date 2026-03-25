---
estimated_steps: 4
estimated_files: 4
skills_used:
  - gsd
  - create-gsd-extension
  - debug-like-expert
  - test
  - review
  - lint
---

# T03: Wire the local finalize loop to honor blocked-review policy

**Slice:** S03 — Blocked-review policy and gate continuity
**Milestone:** M002

## Description

Turn the gate result into real workflow behavior in the sandbox-local `auto-loop.ts`. After T02 restores the missing source tree, this task makes auto-mode obey the documented blocked-review defaults, keeps reviewer feedback attached to the same unit when policy says to retry, and proves that intervene/wait/error outcomes pause visibly instead of drifting into post-verification progression.

## Steps

1. Extend `src/resources/extensions/gsd/auto/session.ts` and `src/resources/extensions/gsd/auto-verification.ts` so retry prompt injection can distinguish blocked-review feedback from verification failures without lying about the source of the retry.
2. Update `src/resources/extensions/gsd/auto-loop.ts` so `block + auto-loop` keeps the same unit in focus, skips `pauseAuto()` and `postUnitPostVerification()`, and feeds reviewer feedback back into the next dispatch of that unit.
3. Update `src/resources/extensions/gsd/auto-loop.ts` so `block + intervene`, `wait`, and broker-error outcomes pause visibly with sanitized notifications and never fall through into progression.
4. Add focused finalize-path assertions in `src/resources/extensions/gsd/tests/auto-loop.test.ts` covering auto-loop retry, intervene pause, wait pause, broker-error pause, and no post-verification fallthrough for non-allow results.

## Must-Haves

- [ ] Blocked review feedback can be injected back into the next attempt without reusing verification-only wording.
- [ ] `auto-loop.ts` never calls `postUnitPostVerification()` after blocked, waiting, or error gate outcomes.
- [ ] `pauseAuto()` is only used for the intervene/wait/error branches, not for blocked auto-loop retries.

## Verification

- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test ./src/resources/extensions/gsd/tests/auto-loop.test.ts`
- `rg -n "review-blocked|review-error|postUnitPostVerification|pendingVerificationRetry|auto-loop" src/resources/extensions/gsd/auto-loop.ts src/resources/extensions/gsd/auto/session.ts src/resources/extensions/gsd/tests/auto-loop.test.ts`

## Observability Impact

- Signals added/changed: finalize-path notifications, retry context source, and break/continue behavior now map directly to blocked-policy and broker wait/error outcomes.
- How a future agent inspects this: rerun `src/resources/extensions/gsd/tests/auto-loop.test.ts` and inspect the branch behavior around `runReviewGate()` in `src/resources/extensions/gsd/auto-loop.ts`.
- Failure state exposed: policy drift, silent fallthrough, and misframed retry prompts show up as explicit call-log/assertion failures instead of hidden workflow bugs.

## Inputs

- `src/resources/extensions/gsd/review/gate.ts` — T01 gate result contract that now carries waiting and blocked-policy-aware outcomes.
- `src/resources/extensions/gsd/auto-loop.ts` — live finalize seam that currently hard-pauses blocked/error outcomes and still reaches progression after only allow/skipped paths.
- `src/resources/extensions/gsd/auto/session.ts` — current retry-context type and session-owned auto state.
- `src/resources/extensions/gsd/auto-verification.ts` — existing verification retry producer whose contract must stay compatible.
- `src/resources/extensions/gsd/tests/auto-loop.test.ts` — focused workflow-control regression coverage.

## Expected Output

- `src/resources/extensions/gsd/auto/session.ts` — retry context type that can distinguish verification vs review feedback.
- `src/resources/extensions/gsd/auto-verification.ts` — verification retry producer updated to the new retry context shape.
- `src/resources/extensions/gsd/auto-loop.ts` — finalize path that honors blocked-policy, wait, and error outcomes without silent progression.
- `src/resources/extensions/gsd/tests/auto-loop.test.ts` — finalize-path regression tests for block/auto-loop, intervene, wait, and broker-error behavior.
