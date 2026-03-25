# S03: Blocked-review policy and gate continuity

**Goal:** Make the integrated `gsd-2` review gate behave correctly when broker review blocks, waits, fails, pauses, or resumes by first restoring the missing local `gsd-2` extension source/test subtree inside this sandboxed worktree, then resolving blocked-review policy at the gate seam, preventing duplicate submissions, and preserving one inspectable review state model across auto-mode and manual status surfaces.
**Demo:** Once the local `src/resources/extensions/gsd/...` tree is present in this worktree, a blocked or waiting broker review for the current unit does not submit again on resume; auto-mode either loops the same unit with reviewer feedback or pauses for intervention based on configured policy; broker failures pause visibly; and after pause/restart `/gsd review-status` still shows the active review ID and normalized state for that unit.

## Decomposition Rationale

This slice is still about operational truth, not new product surface area, but T01 proved the worktree does not actually contain the `gsd-2` extension files the original plan targeted. That makes source availability the first remaining risk to retire, because every policy, pause, and continuity change depends on editing and testing files that are currently absent from the sandbox. The replanned sequence therefore starts by restoring the minimal local execution substrate and converting the slice to in-worktree relative paths only.

Once the local source tree exists, the next task returns to the highest-risk behavior: the live finalize seam in `auto-loop.ts`. That is where blocked-policy drift and silent fallthrough can still occur, so the plan keeps that implementation ahead of paused-state work. The final task then persists the same review-state contract through `paused-session.json` and reuses it from `/gsd review-status`, because restart continuity is only real if resumed auto-mode and manual inspection converge on one review record.

That grouping keeps the blocker explicit instead of pretending the remaining implementation can proceed against missing files, while preserving the original operational closure for S03 once the sandbox has the correct code snapshot.

## Requirement Focus

- Supports **R008** by keeping blocked-policy resolution, `.gsd` review context reuse, paused-state serialization, and the new source-handoff boundary on the `gsd-2` side rather than pushing workflow semantics into broker core.
- Supports **R009** by making the real post-verification gate honor mode-aware blocked-review behavior in the live finalize seam instead of hard-pausing every non-allow outcome.
- Supports **R010** by preserving active review ID, phase, decision, waiting state, and sanitized broker errors across pause/resume/restart and exposing that same state through `/gsd review-status`.

## Must-Haves

- The required `src/resources/extensions/gsd/...` production files, tests, and `resolve-ts.mjs` harness exist inside this assigned worktree before implementation proceeds.
- The review gate refreshes an existing same-unit `reviewId` before submitting a new broker review, preserves waiting/blocked state on `AutoSession.reviewGateState`, and exposes the resolved blocked policy instead of collapsing pending continuity into a generic error.
- `auto-loop.ts` honors the gate's resolved workflow action: blocked reviews auto-loop the same unit with reviewer feedback when policy says `auto-loop`, intervention/wait/error outcomes pause visibly, and post-verification progression never runs after a non-allow decision.
- `runtime/paused-session.json` persists review gate context and `/gsd review-status` can restore that same `ReviewGateState` contract after restart when no live auto session exists, keeping review visibility on one shared state model.

## Proof Level

- This slice proves: operational
- Real runtime required: no
- Human/UAT required: no

## Verification

- `test -f src/resources/extensions/gsd/auto-loop.ts && test -f src/resources/extensions/gsd/review/gate.ts && test -f src/resources/extensions/gsd/commands/handlers/review.ts && test -f src/resources/extensions/gsd/tests/resolve-ts.mjs && test -f src/resources/extensions/gsd/tests/auto-loop.test.ts`
- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test ./src/resources/extensions/gsd/tests/review-preferences.test.ts ./src/resources/extensions/gsd/tests/auto-review-gate.test.ts`
- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test ./src/resources/extensions/gsd/tests/auto-loop.test.ts`
- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test ./src/resources/extensions/gsd/tests/review-status-command.test.ts ./src/resources/extensions/gsd/tests/review-pause-state.test.ts`

## Observability / Diagnostics

- Runtime signals: `AutoSession.reviewGateState` records phase, unit identity, review ID, normalized status/decision, resolved blocked policy, summary, sanitized error, and `updatedAt`; retry injection in auto-mode distinguishes verification failures from blocked-review feedback.
- Inspection surfaces: `/gsd review-status`, `runtime/paused-session.json`, focused gate/loop/status tests, the narrow paused-review helper introduced for serialization and restore, and the local source-handoff manifest proving which snapshot was materialized into the sandbox.
- Failure visibility: blocked-policy choice, pending/waiting review state, broker-unavailable errors, persisted review identity, and missing-local-source preconditions remain inspectable instead of degrading to `review_state_missing` or silent progression.
- Redaction constraints: persisted and visible review state must stay limited to IDs, normalized status/decision, summaries, timestamps, sanitized error metadata, and source-provenance metadata — never raw patch/diff bodies or secrets.

## Integration Closure

- Upstream surfaces consumed after the local source handoff: `src/resources/extensions/gsd/review/gate.ts`, `src/resources/extensions/gsd/review/runtime.ts`, `src/resources/extensions/gsd/review/types.ts`, `src/resources/extensions/gsd/auto-loop.ts`, `src/resources/extensions/gsd/auto.ts`, `src/resources/extensions/gsd/auto/session.ts`, `src/resources/extensions/gsd/auto-verification.ts`, and `src/resources/extensions/gsd/commands/handlers/review.ts`.
- New wiring introduced in this slice: a sandbox-local source handoff boundary, continuity-aware gate results, policy-aware finalize behavior in `auto-loop.ts`, and persisted paused review state reused by both resume bootstrap and manual status inspection.
- What remains before the milestone is truly usable end-to-end: S04 still has to prove the assembled `gsd-2` + standalone broker flow against a real broker process and real local runtime conditions.

## Tasks

- [x] **T01: Make the review gate continuity-aware and policy-aware** `est:1h15m`
  - Why: Duplicate submissions and dead blocked-policy config originate at the gate seam, so the slice cannot be trustworthy until that seam can reuse an active review and report an honest workflow outcome.
  - Files: `src/resources/extensions/gsd/review/types.ts`, `src/resources/extensions/gsd/review/gate.ts`, `src/resources/extensions/gsd/tests/review-preferences.test.ts`, `src/resources/extensions/gsd/tests/auto-review-gate.test.ts`
  - Do: Extend the normalized review gate contract so waiting reviews and resolved blocked-policy behavior are explicit, update `review/gate.ts` to refresh an existing same-unit `reviewId` before submitting again, keep waiting/block/error review state inspectable on `AutoSession.reviewGateState`, and add focused tests for same-unit reuse, waiting continuity, and mode-aware blocked-policy resolution.
  - Verify: `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test ./src/resources/extensions/gsd/tests/review-preferences.test.ts ./src/resources/extensions/gsd/tests/auto-review-gate.test.ts`
  - Done when: a pending or blocked review for the same unit refreshes instead of resubmitting, waiting state keeps the active review ID visible, and the gate result exposes which blocked policy auto-mode should follow.
- [x] **T02: Restore the missing sandbox source/test substrate for S03** `est:0h45m`
  - Why: T01 proved the remaining implementation cannot run in this tandem worktree because the targeted `src/resources/extensions/gsd/...` source and test files are absent; the slice must first make those files exist locally without editing outside the sandbox.
  - Files: `.gsd/milestones/M002/slices/S03/S03-SOURCE-HANDOFF.md`, `src/resources/extensions/gsd/auto-loop.ts`, `src/resources/extensions/gsd/auto.ts`, `src/resources/extensions/gsd/auto/session.ts`, `src/resources/extensions/gsd/auto-verification.ts`, `src/resources/extensions/gsd/review/gate.ts`, `src/resources/extensions/gsd/review/runtime.ts`, `src/resources/extensions/gsd/review/types.ts`, `src/resources/extensions/gsd/commands/handlers/review.ts`, `src/resources/extensions/gsd/tests/resolve-ts.mjs`, `src/resources/extensions/gsd/tests/auto-loop.test.ts`, `src/resources/extensions/gsd/tests/review-status-command.test.ts`
  - Do: Materialize the required `gsd-2` extension subtree and focused test harness inside this worktree, confirm the slice’s target files now exist under local relative paths, record the source provenance/file manifest in `S03-SOURCE-HANDOFF.md`, and remove any remaining dependency on out-of-sandbox absolute paths from the slice execution notes.
  - Verify: `test -f src/resources/extensions/gsd/auto-loop.ts && test -f src/resources/extensions/gsd/review/gate.ts && test -f src/resources/extensions/gsd/commands/handlers/review.ts && test -f src/resources/extensions/gsd/tests/resolve-ts.mjs && test -f src/resources/extensions/gsd/tests/auto-loop.test.ts`
  - Done when: the required production files and tests exist locally in this worktree, their provenance is recorded, and the rest of S03 can execute using only relative in-worktree paths.
- [x] **T03: Wire the local finalize loop to honor blocked-review policy** `est:1h15m`
  - Why: The milestone risk is the live finalize path in `auto-loop.ts`; once the source tree exists locally, the actual workflow still has to obey the documented `auto-loop` default instead of hard-pausing every non-allow outcome.
  - Files: `src/resources/extensions/gsd/auto/session.ts`, `src/resources/extensions/gsd/auto-verification.ts`, `src/resources/extensions/gsd/auto-loop.ts`, `src/resources/extensions/gsd/tests/auto-loop.test.ts`
  - Do: Extend the retry-injection contract so blocked-review feedback can be distinguished from verification failures, update `auto-loop.ts` so `block + auto-loop` keeps the same unit in focus without calling `pauseAuto()` or `postUnitPostVerification()`, make `intervene`, `wait`, and broker-error results pause visibly, and add finalize-path tests that prove there is no silent fallthrough into post-verification progression.
  - Verify: `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test ./src/resources/extensions/gsd/tests/auto-loop.test.ts`
  - Done when: blocked auto runs either retry the same unit with truthful reviewer-feedback prompt framing or pause for intervention according to policy, and only allow/skipped results reach `postUnitPostVerification()`.
- [x] **T04: Persist paused review state and restore manual status continuity** `est:1h15m`
  - Why: The gate is still operationally incomplete if pause/restart drops the only active review context and manual status immediately regresses to `review_state_missing`, even after the finalize seam is fixed.
  - Files: `src/resources/extensions/gsd/review/pause-state.ts`, `src/resources/extensions/gsd/auto.ts`, `src/resources/extensions/gsd/commands/handlers/review.ts`, `src/resources/extensions/gsd/tests/review-status-command.test.ts`, `src/resources/extensions/gsd/tests/review-pause-state.test.ts`
  - Do: Add a focused helper that serializes/deserializes paused review gate metadata for `paused-session.json`, use it from `pauseAuto()` and `startAuto()` to persist and restore `AutoSession.reviewGateState`, teach `/gsd review-status` to fall back to that persisted state when no live auto session is available, and keep the verification surface narrow rather than importing broad runtime trees into focused continuity tests.
  - Verify: `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test ./src/resources/extensions/gsd/tests/review-status-command.test.ts ./src/resources/extensions/gsd/tests/review-pause-state.test.ts`
  - Done when: `paused-session.json` carries review identity and normalized gate state, resume rehydrates that state onto `AutoSession`, and `/gsd review-status` after restart can still inspect or refresh the active review without inventing a second status cache.

## Files Likely Touched

- `.gsd/milestones/M002/slices/S03/S03-PLAN.md`
- `.gsd/milestones/M002/slices/S03/S03-REPLAN.md`
- `.gsd/milestones/M002/slices/S03/S03-SOURCE-HANDOFF.md`
- `src/resources/extensions/gsd/review/types.ts`
- `src/resources/extensions/gsd/review/gate.ts`
- `src/resources/extensions/gsd/review/runtime.ts`
- `src/resources/extensions/gsd/review/pause-state.ts`
- `src/resources/extensions/gsd/auto/session.ts`
- `src/resources/extensions/gsd/auto-verification.ts`
- `src/resources/extensions/gsd/auto-loop.ts`
- `src/resources/extensions/gsd/auto.ts`
- `src/resources/extensions/gsd/commands/handlers/review.ts`
- `src/resources/extensions/gsd/tests/resolve-ts.mjs`
- `src/resources/extensions/gsd/tests/review-preferences.test.ts`
- `src/resources/extensions/gsd/tests/auto-review-gate.test.ts`
- `src/resources/extensions/gsd/tests/auto-loop.test.ts`
- `src/resources/extensions/gsd/tests/review-status-command.test.ts`
- `src/resources/extensions/gsd/tests/review-pause-state.test.ts`
