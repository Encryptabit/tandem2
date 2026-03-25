# S01 UAT — Broker-backed auto review gate

> Current status: this UAT script is ready for execution, but the slice is not yet verified complete. Use it after the `gsd-2` test/runtime harness blocker is cleared.

## UAT Type
- UAT mode: mixed (artifact-driven + runtime-executable)

## Preconditions
1. The `gsd-2` worktree under `/home/cari/repos/gsd-2` has the S01 review-gate changes present.
2. The `gsd-2` test/runtime environment is runnable from the tandem worktree context.
3. A test broker client or broker-backed stub is available to produce deterministic allow/block/error outcomes.
4. A disposable `.gsd` milestone/slice/task fixture exists so `execute-task` review payloads can resolve roadmap/plan/summary artifacts.

## Test Case 1 — Review preferences resolve canonical defaults
**Goal:** confirm the dedicated `review` preference block is recognized and mode-aware defaults are resolved.

Steps:
1. Run the focused review-preferences test file.
2. Inspect the resolved review preferences for an empty/undefined config.
3. Inspect the resolved blocked-policy value for both auto and human workflow modes.

Expected outcomes:
- `review` is treated as a known top-level preference block.
- default transport resolves to `stdio`.
- default server resolves to `tandem`.
- gate defaults enable `execute_task` and `before_progression`.
- `mode-default` resolves to `auto-loop` for auto mode and `intervene` for human mode.

## Test Case 2 — Adapter builds one payload from `.gsd` artifacts
**Goal:** confirm workflow-specific context stays in the `gsd-2` adapter.

Steps:
1. Create or reuse a fixture with:
   - milestone roadmap
   - slice plan
   - slice continue file
   - current task plan
   - current task summary
   - at least one prior task summary in the same slice
2. Invoke adapter tests for an `execute-task` unit such as `M001/S01/T01`.
3. Inspect the built review submission payload.

Expected outcomes:
- payload unit metadata includes milestone/slice/task IDs.
- payload resolves task title from the slice/task artifacts.
- payload artifact list includes the current task summary plus prior task summaries.
- the adapter output uses normalized review shapes instead of raw broker-only vocabulary.
- no `.gsd`-specific mapping logic is required in broker-core code.

## Test Case 3 — Allow decision lets the real finalize path continue
**Goal:** prove the gate is inserted in the real finalize seam and allow reaches existing post-verification flow.

Steps:
1. Run the auto-loop and auto-review-gate tests with a review client stub that returns an allow outcome.
2. Drive an `execute-task` iteration through:
   - `postUnitPreVerification()`
   - `runPostUnitVerification()`
   - review gate
   - `postUnitPostVerification()`
3. Inspect call order assertions and session state.

Expected outcomes:
- review gating occurs after verification and before post-verification progression.
- `postUnitPostVerification()` executes only after an allow outcome.
- session diagnostics show `phase=allow`, the review ID, and normalized `decision=allow`.

## Test Case 4 — Block decision stops progression visibly
**Goal:** prove a blocked broker decision does not silently fall through.

Steps:
1. Run the gate tests with a broker/client stub that returns a completed blocked review.
2. Exercise the finalize path for an `execute-task` unit.
3. Inspect the returned control-flow branch and `AutoSession.reviewGateState`.

Expected outcomes:
- the finalize path does **not** call `postUnitPostVerification()` after a block.
- auto-mode pauses instead of silently continuing.
- session diagnostics preserve:
  - `phase=block`
  - review ID
  - `decision=block`
  - broker summary/reason when present

## Test Case 5 — Broker error is visible and redaction-safe
**Goal:** prove broker failures stop progression with inspectable but sanitized diagnostics.

Steps:
1. Run the gate tests with a client stub that throws an error containing unsafe/raw patch-like content.
2. Exercise the finalize path.
3. Inspect the normalized error outcome and session state.

Expected outcomes:
- auto-mode pauses on broker error.
- `AutoSession.reviewGateState` records `phase=error` and `decision=error`.
- the stored/logged error summary is sanitized.
- raw diff content, patch bodies, or secrets are not preserved in session-visible diagnostics.

## Test Case 6 — Hook sidecars skip review gating
**Goal:** confirm the review gate applies to the intended workflow unit, not hook sidecars.

Steps:
1. Queue a hook sidecar in the auto loop.
2. Execute the finalize path for the sidecar.
3. Inspect the gate call log / assertions.

Expected outcomes:
- hook sidecars skip review gating.
- sidecar completion behavior remains unchanged except for the surrounding finalize refactor.

## Edge Cases

### Edge Case A — Pending create response requires status follow-up
Steps:
1. Stub `createReview()` to return a pending/submitted response with a review ID.
2. Stub `getReviewStatus()` to later return allow.

Expected outcomes:
- gate records an intermediate waiting/submitted phase.
- gate polls/fetches status using the returned review ID.
- final result is normalized to allow and progression continues.

### Edge Case B — Pending response without review ID
Steps:
1. Stub `createReview()` to return a pending/submitted state without a review ID.

Expected outcomes:
- gate converts this into an error outcome.
- session diagnostics surface the failure as broker/gate error state.
- progression does not continue.

### Edge Case C — Review disabled by preference
Steps:
1. Set `review.enabled: false` or disable the review gate for the current unit type.
2. Run the finalize path.

Expected outcomes:
- gate reports a skipped state.
- normal post-verification flow continues.
- session state clearly indicates review was skipped, not allowed.

## Execution note
Before declaring S01 complete, re-run the exact slice-plan verification commands and ensure all pass, including the block/error/diagnostic focused gate test pattern.
