# S04: Real-runtime integrated proof

**Goal:** Prove that the restored in-worktree `gsd` extension substrate can drive broker-backed review through a real cross-process runtime boundary, with auto finalize behavior and manual review surfaces converging on one persisted review-state model.
**Demo:** A spawned standalone broker fixture process with SQLite-backed state can be exercised from the real `finalizeReviewForUnit()` seam and the manual review/status handlers so the same run visibly reuses or refreshes the same broker review lineage, preserves paused continuity, and emits durable proof artifacts inside this worktree.

## Decomposition Rationale

This slice supports the roadmap's still-active integrated requirements: **R006, R008, R009, and R010**. The ordering follows the concrete risks discovered in S04 research. First, the local subtree must regain the missing manual review submit seam; otherwise the slice cannot honestly prove manual/automatic convergence. Second, the worktree needs a real spawned broker fixture plus typed transport helper so the proof crosses an actual process and persisted-state boundary instead of staying in object-literal transports. Third, the slice closes with one assembled proof path that drives the real finalize seam, manual commands, and pause/restart continuity together while capturing durable evidence a future agent can inspect.

## Must-Haves

- Manual review submit and manual review status must reuse one normalized review runtime seam and expose the same broker-backed review identity/state model that auto finalize uses.
- The S04 proof must cross a real spawned broker process boundary with SQLite-backed durable state, not only in-process transport doubles.
- Integrated verification must prove allow, block/wait, and pause/resume visibility through the real local seams with inspectable evidence for review IDs, status, decision, and persisted paused state.

## Requirement Coverage

- `R006` — T02 proves the typed review transport across a spawned broker process and durable SQLite state; T03 reuses that transport in the assembled proof.
- `R008` — T01 keeps review-specific submission/status semantics in the local `gsd` runtime seam, and T02/T03 prove that ownership still holds when the broker is external.
- `R009` — T03 exercises the real `finalizeReviewForUnit()` gate path against the spawned broker so progression vs pause/retry behavior is proven under real runtime conditions.
- `R010` — T01 and T03 keep review state, errors, blocked policy, and paused continuity visible through command output, session state, and durable proof artifacts.

## Proof Level

- This slice proves: final-assembly
- Real runtime required: yes
- Human/UAT required: no

## Verification

- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test ./src/resources/extensions/gsd/tests/review-preferences.test.ts ./src/resources/extensions/gsd/tests/auto-review-gate.test.ts ./src/resources/extensions/gsd/tests/auto-loop.test.ts ./src/resources/extensions/gsd/tests/review-command.test.ts ./src/resources/extensions/gsd/tests/review-status-command.test.ts ./src/resources/extensions/gsd/tests/review-pause-state.test.ts`
- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test ./src/resources/extensions/gsd/tests/review-broker-runtime.test.ts`
- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test ./src/resources/extensions/gsd/tests/review-real-runtime.test.ts`
- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types ./src/resources/extensions/gsd/tests/scripts/review-real-runtime-proof.ts`

## Observability / Diagnostics

- Runtime signals: `AutoSession.reviewGateState`, `AutoSession.history`, proof-script summary output, broker fixture review rows, and paused-session review envelopes.
- Inspection surfaces: `src/resources/extensions/gsd/tests/review-real-runtime.test.ts`, `src/resources/extensions/gsd/tests/review-broker-runtime.test.ts`, `src/resources/extensions/gsd/tests/scripts/review-real-runtime-proof.ts`, `.tmp-review-runtime-proof/`, and `src/resources/extensions/gsd/commands/handlers/review.ts` command output.
- Failure visibility: review ID reuse vs duplicate submission, normalized status/decision, blocked policy, paused reason, sanitized broker error, and persisted paused-review metadata.
- Redaction constraints: keep broker errors sanitized and proof artifacts limited to IDs/status/summary metadata rather than raw diff, patch, or secret-bearing payload bodies.

## Integration Closure

- Upstream surfaces consumed: `src/resources/extensions/gsd/auto-loop.ts`, `src/resources/extensions/gsd/auto.ts`, `src/resources/extensions/gsd/review/gate.ts`, `src/resources/extensions/gsd/review/runtime.ts`, `src/resources/extensions/gsd/review/pause-state.ts`, and `src/resources/extensions/gsd/tests/resolve-ts.mjs`.
- New wiring introduced in this slice: manual review submit handler/runtime path, spawned broker fixture transport, and assembled proof/test entrypoints that exercise auto finalize plus manual status/submit against shared persisted broker state.
- What remains before the milestone is truly usable end-to-end: nothing, if the full S04 verification matrix passes in this worktree.

## Tasks

- [x] **T01: Restore the shared manual review submit seam** `est:1.5h`
  - Why: The local S03 substrate only exposes manual review status today, so S04 cannot prove auto/manual convergence until manual submit exists again on the same runtime-owned contract.
  - Files: `src/resources/extensions/gsd/review/runtime.ts`, `src/resources/extensions/gsd/commands/handlers/review.ts`, `src/resources/extensions/gsd/tests/review-command.test.ts`, `src/resources/extensions/gsd/tests/review-status-command.test.ts`
  - Do: Add a submit-side helper to `review/runtime.ts`, extend `commands/handlers/review.ts` with manual review submission formatting/handler behavior, keep broker semantics in the shared runtime module instead of command-local logic, and add focused command tests covering current-unit submission, explicit targeting, shared review ID visibility, and sanitized failures.
  - Verify: `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test ./src/resources/extensions/gsd/tests/review-command.test.ts ./src/resources/extensions/gsd/tests/review-status-command.test.ts`
  - Done when: Manual review submission exists in the local subtree, returns the same normalized review state vocabulary as status/gate code, and focused command tests prove convergence and failure visibility.
- [x] **T02: Add a spawned broker fixture with typed cross-process transport** `est:2h`
  - Why: The milestone still lacks proof across a real runtime boundary, and S04 research identified the fixture process plus SQLite state as the most honest in-worktree substitute for a missing external broker checkout.
  - Files: `src/resources/extensions/gsd/tests/fixtures/review-broker-fixture.mjs`, `src/resources/extensions/gsd/tests/review-broker-transport.ts`, `src/resources/extensions/gsd/tests/review-broker-runtime.test.ts`, `.gitignore`
  - Do: Create a small spawned broker fixture process that persists review records into a temp SQLite database, add a typed test transport/helper that talks to that process, keep the local review transport contract unchanged for runtime code, and ignore deterministic proof temp roots so cross-process artifacts stay local but out of git.
  - Verify: `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test ./src/resources/extensions/gsd/tests/review-broker-runtime.test.ts`
  - Done when: Tests can launch a separate broker process, submit and refresh review state through the typed transport, and assert that durable broker rows exist in SQLite after the process boundary is crossed.
- [x] **T03: Prove auto/manual convergence and persist runtime evidence** `est:2h`
  - Why: S04 closes the milestone only if the assembled local seams behave correctly together under real runtime conditions and leave behind inspectable proof rather than only passing isolated mocks.
  - Files: `src/resources/extensions/gsd/tests/review-real-runtime.test.ts`, `src/resources/extensions/gsd/tests/scripts/review-real-runtime-proof.ts`, `src/resources/extensions/gsd/tests/review-pause-state.test.ts`, `src/resources/extensions/gsd/tests/auto-loop.test.ts`
  - Do: Use the spawned broker transport to drive `finalizeReviewForUnit()`, manual review submit/status handlers, and `pauseAuto()` / `startAuto()` continuity in one integrated proof; assert same-review reuse vs duplicate submission, blocked/wait/error visibility, and durable proof artifacts under a deterministic temp root.
  - Verify: `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test ./src/resources/extensions/gsd/tests/review-real-runtime.test.ts && node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types ./src/resources/extensions/gsd/tests/scripts/review-real-runtime-proof.ts`
  - Done when: The real finalize seam and manual commands demonstrably converge on one broker-backed review state model, pause/restart continuity remains visible, and the proof script leaves durable evidence for later inspection.

## Files Likely Touched

- `src/resources/extensions/gsd/review/runtime.ts`
- `src/resources/extensions/gsd/commands/handlers/review.ts`
- `src/resources/extensions/gsd/tests/review-command.test.ts`
- `src/resources/extensions/gsd/tests/review-status-command.test.ts`
- `src/resources/extensions/gsd/tests/fixtures/review-broker-fixture.mjs`
- `src/resources/extensions/gsd/tests/review-broker-transport.ts`
- `src/resources/extensions/gsd/tests/review-broker-runtime.test.ts`
- `src/resources/extensions/gsd/tests/review-real-runtime.test.ts`
- `src/resources/extensions/gsd/tests/scripts/review-real-runtime-proof.ts`
- `.gitignore`
