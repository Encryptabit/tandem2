# S02 UAT — Manual review trigger and status surfaces

## UAT Type
- UAT mode: mixed (focused command/runtime verification with optional interactive command confirmation)

## Preconditions
1. The `gsd-2` tree at `/home/cari/repos/gsd-2` contains the S02 review runtime, command-handler, and discoverability changes.
2. The tandem strip-types test harness files are present, including:
   - `src/resources/extensions/gsd/tests/resolve-ts.mjs`
   - `src/resources/extensions/gsd/tests/dist-redirect.mjs`
   - `src/resources/extensions/gsd/tests/mcp-sdk-shim.mjs`
   - `src/resources/extensions/gsd/tests/pi-package-shim.mjs`
3. A disposable `.gsd` fixture is available for command/runtime tests that need an active milestone/slice/task context.
4. Review preferences are enabled for the test scenario, or a test stub provides equivalent resolved preferences.
5. If running the optional interactive confirmation cases, use a disposable broker stub or test client so review IDs and decisions are deterministic.

## Test Case 1 — `/gsd review` submits an explicit task through the shared runtime seam
**Goal:** prove manual review submission uses the same runtime-owned target resolution and normalized output contract as the auto gate.

Steps:
1. Run:
   `node --import /home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test /home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/review-runtime.test.ts /home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/review-command.test.ts`
2. Inspect the `/gsd review reports normalized submit results for an explicit target` case.
3. Confirm the handler is invoked with `M001/S01/T01` and the shared resolved review preferences.

Expected outcomes:
- the explicit task target resolves as `execute-task M001/S01/T01`
- the command emits a review ID and normalized `submitted` status
- the command path does not create a second manual-only broker vocabulary
- the shared runtime seam, not the command handler, owns submission normalization

## Test Case 2 — `/gsd review` defaults to the current active unit
**Goal:** prove manual review for the current unit reuses the same target helper and does not require explicit unit IDs.

Steps:
1. Use a fixture with an active milestone, slice, and task.
2. Run the same command/test file as Test Case 1.
3. Inspect the `/gsd review defaults to the current unit through the shared target helper` case.

Expected outcomes:
- the command resolves the active unit as `execute-task M001/S01/T01`
- command output explicitly states `Target source: current active unit`
- no duplicate target-resolution logic exists only inside the command handler

## Test Case 3 — `/gsd review-status` reuses live auto-session gate state and refreshes broker status
**Goal:** prove humans can inspect the same active review state model the auto gate uses.

Steps:
1. Run:
   `node --import /home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test /home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/review-status-command.test.ts /home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/auto-review-gate.test.ts`
2. Inspect the `/gsd review-status reuses live gate state and refreshes broker status through the shared runtime` case.
3. Confirm the live state includes:
   - `phase: wait`
   - `reviewId: rev-live`
   - `unitType: execute-task`
   - `unitId: M001/S01/T01`
4. Confirm the status lookup refreshes broker state using that review ID.

Expected outcomes:
- `/gsd review-status` reports `Target source: live auto session`
- it reports `State source: broker lookup` once a live review ID exists
- the output includes the live gate `Phase: wait`
- the final displayed state is normalized to `Status: completed` and `Decision: allow`
- the manual status path reads the same review state shape stored on `AutoSession.reviewGateState`

## Test Case 4 — `/gsd review-status` makes missing or unavailable state explicit
**Goal:** prove the command does not silently succeed when there is no live review state or when broker status lookup fails.

Steps:
1. Run the command/test file from Test Case 3.
2. Inspect:
   - `/gsd review-status reports missing live review state for the current unit explicitly`
   - `/gsd review-status sanitizes broker lookup failures for explicit review IDs`
3. Confirm one case runs with no live state and the other runs with an explicit `review/<review-id>` target whose broker lookup throws an error containing unsafe diff-like content.

Expected outcomes:
- missing live state produces a normalized `error` state with code `review_state_missing`
- broker lookup failure produces a normalized `error` state with a sanitized message such as `Review broker unavailable`
- raw diff bodies, secret-like lines, or unsanitized error payloads are not surfaced in command output
- retryability and error code remain visible when provided

## Test Case 5 — discoverability surfaces expose both review commands
**Goal:** prove a human can find the new commands in the normal `/gsd` surfaces.

Steps:
1. Run:
   `node --import /home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test /home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/review-command-discoverability.test.ts`
2. Inspect the command description string, top-level catalog entries, and completions for `rev`.
3. Inspect `/gsd help` source coverage assertions.

Expected outcomes:
- `review` and `review-status` appear in the top-level command description
- both commands exist in `TOP_LEVEL_SUBCOMMANDS`
- top-level completions for `rev` return exactly `review` and `review-status`
- `/gsd help` text stays aligned with the handler-visible syntax and descriptions

## Test Case 6 — full slice verification matrix passes from the tandem worktree context
**Goal:** prove the assembled slice is actually verified complete, not just individually plausible.

Steps:
1. From the tandem worktree, run:
   `node --import /home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test /home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/review-runtime.test.ts /home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/review-command.test.ts /home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/auto-review-gate.test.ts`
2. Then run:
   `node --import /home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test /home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/review-status-command.test.ts /home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/review-command-discoverability.test.ts`
3. Record the TAP results.

Expected outcomes:
- both commands exit 0
- review runtime, review command, gate-state reuse, review-status, and discoverability tests all pass together
- the tandem strip-types harness resolves required external imports through the shim/redirect layer without changing production runtime imports

## Optional Interactive Confirmation — command-surface sanity check inside `gsd-2`

### Interactive Case A — trigger review for current unit
Steps:
1. Start a disposable `gsd-2` session with review preferences enabled and a deterministic review stub.
2. Ensure an active task exists.
3. Run `/gsd review`.

Expected outcomes:
- the command targets the current unit
- output includes the review ID and normalized status
- output does not expose raw artifact content

### Interactive Case B — inspect current review status
Steps:
1. In the same session, run `/gsd review-status`.
2. If a review ID is active, let the stubbed broker return an allow or block outcome.

Expected outcomes:
- output includes target source and state source
- output shows phase, review ID, normalized status, and normalized decision
- the state matches the same review currently visible to auto-mode

## Edge Cases

### Edge Case A — explicit review ID target
Steps:
1. Run `/gsd review-status review/rev-123` or the equivalent focused test path.

Expected outcomes:
- the command treats the target as an explicit review ID
- no unit-target parsing ambiguity occurs
- broker lookup uses `rev-123`

### Edge Case B — broker client unavailable on submit
Steps:
1. Configure review preferences so the broker client is unavailable or invalid.
2. Run `/gsd review`.

Expected outcomes:
- the command returns a normalized error state
- the output includes an explicit error code such as `review_client_unavailable`
- the command does not silently no-op

### Edge Case C — no live session state for current unit
Steps:
1. Run `/gsd review-status` when no `AutoSession.reviewGateState` exists and no explicit review ID is supplied.

Expected outcomes:
- the command reports missing live review state explicitly
- the user is told to run `/gsd review` first or provide a review ID

### Edge Case D — discoverability regression guard
Steps:
1. Remove or alter one of the review command descriptions in a temporary local experiment.
2. Re-run `review-command-discoverability.test.ts`.

Expected outcomes:
- the test fails immediately
- help/catalog/completion drift is caught before release
