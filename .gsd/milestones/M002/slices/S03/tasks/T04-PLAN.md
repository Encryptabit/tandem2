---
estimated_steps: 4
estimated_files: 5
skills_used:
  - gsd
  - create-gsd-extension
  - debug-like-expert
  - test
  - review
---

# T04: Persist paused review state and restore manual status continuity

**Slice:** S03 — Blocked-review policy and gate continuity
**Milestone:** M002

## Description

Close the restart/resume hole without inventing a second status store. After T02 restores the local source tree and T03 fixes finalize-path policy behavior, this task persists `AutoSession.reviewGateState` through `paused-session.json`, restores it during resume, and lets `/gsd review-status` reuse the same normalized state contract when no live auto session is in memory.

## Steps

1. Add `src/resources/extensions/gsd/review/pause-state.ts` with focused helpers to serialize, deserialize, and validate persisted review gate state for `runtime/paused-session.json`.
2. Update `src/resources/extensions/gsd/auto.ts` so `pauseAuto()` writes persisted review state and `startAuto()` restores it onto `AutoSession.reviewGateState` before resume continues.
3. Update `src/resources/extensions/gsd/commands/handlers/review.ts` so `/gsd review-status` falls back to persisted paused review state when `getAutoReviewGateState()` returns `null`, then continues through the existing `readReviewStatus()` path.
4. Add `src/resources/extensions/gsd/tests/review-pause-state.test.ts` and extend `src/resources/extensions/gsd/tests/review-status-command.test.ts` to prove persisted-state restore and command-path fallback without importing broad runtime trees.

## Must-Haves

- [ ] `paused-session.json` persists active review identity, phase, normalized state, and sanitized errors for the currently paused unit.
- [ ] Resume rehydrates `AutoSession.reviewGateState` from persisted state instead of starting from an empty review context.
- [ ] `/gsd review-status` can inspect persisted paused review state through the same `ReviewGateState` contract rather than inventing a second cache or bespoke formatting path.

## Verification

- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test ./src/resources/extensions/gsd/tests/review-status-command.test.ts ./src/resources/extensions/gsd/tests/review-pause-state.test.ts`
- `rg -n "paused-session\.json|reviewGateState|review_state_missing" src/resources/extensions/gsd/review/pause-state.ts src/resources/extensions/gsd/auto.ts src/resources/extensions/gsd/commands/handlers/review.ts src/resources/extensions/gsd/tests/review-status-command.test.ts`

## Observability Impact

- Signals added/changed: paused-session metadata now carries persisted review gate context, and manual status can distinguish persisted-state recovery from a missing review state.
- How a future agent inspects this: inspect `runtime/paused-session.json`, rerun `src/resources/extensions/gsd/tests/review-pause-state.test.ts`, or call `/gsd review-status` after a paused restart path.
- Failure state exposed: restart continuity regressions and missing persisted review state remain visible as explicit command/test failures instead of degrading into ambiguous `review_state_missing` output.

## Inputs

- `src/resources/extensions/gsd/auto.ts` — existing `pauseAuto()` and `startAuto()` paused-session flow that currently omits review gate state.
- `src/resources/extensions/gsd/commands/handlers/review.ts` — manual status loader that currently only reads live in-memory review state.
- `src/resources/extensions/gsd/review/runtime.ts` — shared `readReviewStatus()` path that should keep handling normalized live/persisted state.
- `src/resources/extensions/gsd/auto/session.ts` — owner of the `ReviewGateState` model to rehydrate.
- `src/resources/extensions/gsd/tests/review-status-command.test.ts` — current status-surface regression tests showing the continuity hole.

## Expected Output

- `src/resources/extensions/gsd/review/pause-state.ts` — focused helper for paused review-state serialization and restore.
- `src/resources/extensions/gsd/auto.ts` — pause/resume flow that persists and reloads review gate state.
- `src/resources/extensions/gsd/commands/handlers/review.ts` — persisted review-state fallback for `/gsd review-status`.
- `src/resources/extensions/gsd/tests/review-status-command.test.ts` — command-path coverage for persisted-state fallback.
- `src/resources/extensions/gsd/tests/review-pause-state.test.ts` — focused persistence/restore regression tests.
