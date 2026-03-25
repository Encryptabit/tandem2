# S04 UAT — Real-runtime integrated proof

## UAT Type
- UAT mode: assembled local runtime verification against a spawned broker fixture with durable SQLite-backed proof artifacts

## Preconditions
1. Run from this worktree root.
2. Node supports `--experimental-strip-types`.
3. The system `sqlite3` CLI is installed and available on `PATH`.
4. The local proof/runtime files exist:
   - `src/resources/extensions/gsd/tests/fixtures/review-broker-fixture.mjs`
   - `src/resources/extensions/gsd/tests/review-broker-transport.ts`
   - `src/resources/extensions/gsd/tests/review-real-runtime-flow.ts`
   - `src/resources/extensions/gsd/tests/review-real-runtime.test.ts`
   - `src/resources/extensions/gsd/tests/scripts/review-real-runtime-proof.ts`
5. The worktree is writable so `.tmp-review-broker-runtime-tests/`, `.tmp-review-real-runtime-tests/`, and `.tmp-review-runtime-proof/` can be regenerated.
6. Use only relative paths inside this worktree.

## Test Case 1 — Regression bundle still proves the gate, manual commands, and allow-path behavior
**Goal:** confirm the focused runtime and command regressions remain green before the cross-process proof runs.

Steps:
1. Run:
   `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test ./src/resources/extensions/gsd/tests/review-preferences.test.ts ./src/resources/extensions/gsd/tests/auto-review-gate.test.ts ./src/resources/extensions/gsd/tests/auto-loop.test.ts ./src/resources/extensions/gsd/tests/review-command.test.ts ./src/resources/extensions/gsd/tests/review-status-command.test.ts ./src/resources/extensions/gsd/tests/review-pause-state.test.ts`
2. Confirm these key cases appear in TAP output:
   - `allow outcome progresses through post-verification seam and clears stale retry context`
   - `submits manual review for the current unit and makes the shared review id visible to status`
   - `formats broker submission failures through the shared sanitized runtime path`
   - `pauseAuto persists review metadata and startAuto restores reviewGateState from paused-session.json`

Expected outcomes:
- the command exits 0
- allow-path regression coverage remains green
- manual submit/status still converge on the shared runtime seam
- paused-session continuity still works before the real-runtime proof is layered on top

## Test Case 2 — Spawned broker transport crosses a real process boundary and leaves durable SQLite state
**Goal:** prove the broker-backed review seam is no longer only in-process.

Steps:
1. Run:
   `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test ./src/resources/extensions/gsd/tests/review-broker-runtime.test.ts`
2. After it passes, confirm the TAP output includes:
   - `launches a spawned broker fixture, round-trips the review transport contract, and leaves durable SQLite state`
3. Optionally inspect the test helper source in `src/resources/extensions/gsd/tests/review-broker-transport.ts` to confirm it uses the system `sqlite3` CLI for durable row inspection after fixture shutdown.

Expected outcomes:
- the command exits 0
- the broker fixture runs in a different PID than the test process
- review submit and status refresh both succeed through the typed transport seam
- a persisted SQLite row remains inspectable after the fixture exits

## Test Case 3 — Integrated proof test shows auto/manual convergence on one broker-backed lineage
**Goal:** prove finalize, manual submit, and manual status all converge on the same persisted review identity and state model.

Steps:
1. Run:
   `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test ./src/resources/extensions/gsd/tests/review-real-runtime.test.ts`
2. Confirm the TAP output includes:
   - `proves auto/manual review convergence across a spawned broker runtime and leaves inspectable artifacts`
3. Inspect the resulting artifact directory:
   `find .tmp-review-real-runtime-tests -maxdepth 3 -type f | sort`

Expected outcomes:
- the command exits 0
- the proof asserts wait-review reuse, blocked-review reuse, paused continuity visibility, blocked-state visibility, error visibility, duplicate-row prevention, and error-row absence
- the test leaves `proof-summary.json` and `broker-rows.json` behind for inspection

## Test Case 4 — Deterministic proof script regenerates the milestone evidence bundle
**Goal:** prove a human can regenerate the exact S04 evidence outside `node:test`.

Steps:
1. Run:
   `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types ./src/resources/extensions/gsd/tests/scripts/review-real-runtime-proof.ts`
2. Confirm console output reports:
   - `proofRoot:`
   - `brokerDb:`
   - `waitReviewId:`
   - `blockedReviewId:`
   - `errorDecision: error`
   - `summaryPath:`
3. Confirm the files exist:
   - `.tmp-review-runtime-proof/proof-summary.json`
   - `.tmp-review-runtime-proof/broker-rows.json`
   - `.tmp-review-runtime-proof/wait-continuity/.gsd/runtime/paused-session.json`
   - `.tmp-review-runtime-proof/blocked-visibility/.gsd/runtime/paused-session.json`
   - `.tmp-review-runtime-proof/error-visibility/.gsd/runtime/paused-session.json`

Expected outcomes:
- the script exits 0
- a deterministic proof root is recreated under `.tmp-review-runtime-proof/`
- the bundle contains both JSON summaries and per-scenario paused-session artifacts

## Test Case 5 — Wait continuity shows one reused review ID before finalize, after pause, and after restart
**Goal:** prove the same review lineage survives manual submit, finalize pause, status inspection, restart, and re-submit.

Steps:
1. Run the proof script from Test Case 4 if needed.
2. Open these files:
   - `.tmp-review-runtime-proof/wait-continuity/manual-submit-before-finalize.txt`
   - `.tmp-review-runtime-proof/wait-continuity/paused-status-before-restart.txt`
   - `.tmp-review-runtime-proof/wait-continuity/restarted-status.txt`
   - `.tmp-review-runtime-proof/wait-continuity/manual-submit-after-restart.txt`
   - `.tmp-review-runtime-proof/wait-continuity/.gsd/runtime/paused-session.json`
3. Confirm all four command-output files reference the same `reviewId`.
4. Confirm the paused-session file records `reason: review-waiting` and the same `reviewId` under `pausedReviewState.reviewGateState.reviewId`.

Expected outcomes:
- the initial manual submit uses `targetSource: current`
- the paused status shows `source: paused` and `refreshed: no`
- the restarted status shows `source: live` and `refreshed: yes`
- the final re-submit still uses the same review ID rather than creating a duplicate review row

## Test Case 6 — Blocked human-mode visibility preserves policy and review lineage
**Goal:** prove blocked review behavior remains visible and reusable after pause/restart.

Steps:
1. Run the proof script from Test Case 4 if needed.
2. Open:
   - `.tmp-review-runtime-proof/proof-summary.json`
   - `.tmp-review-runtime-proof/blocked-visibility/paused-status.txt`
   - `.tmp-review-runtime-proof/blocked-visibility/manual-submit-after-block.txt`
   - `.tmp-review-runtime-proof/blocked-visibility/.gsd/runtime/paused-session.json`
3. Confirm the blocked summary shows:
   - `reason: review-blocked`
   - `kind: block`
   - `blockedPolicy: intervene`
4. Confirm the paused status output and the manual re-submit output use the same blocked `reviewId`.

Expected outcomes:
- blocked reviews pause instead of silently progressing
- the paused envelope keeps `decision: block` and `blockedPolicy: intervene`
- the manual re-submit reuses the existing blocked review ID instead of creating a second broker row

## Test Case 7 — Broker-unavailable visibility stays sanitized and does not create a phantom review row
**Goal:** prove the error path is inspectable without leaking raw broker internals or inventing broker state.

Steps:
1. Run the proof script from Test Case 4 if needed.
2. Open:
   - `.tmp-review-runtime-proof/error-visibility/.gsd/runtime/paused-session.json`
   - `.tmp-review-runtime-proof/error-visibility/paused-status.txt`
   - `.tmp-review-runtime-proof/error-visibility/manual-submit.txt`
   - `.tmp-review-runtime-proof/broker-rows.json`
3. Confirm the paused-session file contains only sanitized error metadata:
   - `code: broker_unavailable`
   - `message: Broker unavailable.`
   - `retryable: true`
4. Confirm the paused status and manual submit outputs both include:
   - `decision: error`
   - `reviewId: none`
   - `error: broker_unavailable:Broker unavailable.`
5. Confirm `broker-rows.json` contains rows only for `M002-S04-T03-WAIT` and `M002-S04-T03-BLOCK`, not `M002-S04-T03-ERROR`.

Expected outcomes:
- broker failures pause visibly with sanitized error data
- no fake review ID is created for the error scenario
- the durable broker rows file proves the failing unit never created a broker row

## Test Case 8 — Broker database contents match the proof summary
**Goal:** confirm the durable SQLite database matches the emitted JSON summary.

Steps:
1. Run the proof script from Test Case 4 if needed.
2. Run:
   `sqlite3 -json ./.tmp-review-runtime-proof/broker/review-broker.sqlite "select review_id, unit_id, status, summary, feedback, status_calls from reviews order by review_id;"`
3. Compare the output against `.tmp-review-runtime-proof/broker-rows.json`.

Expected outcomes:
- exactly two rows are returned
- row 1 is the wait scenario with `unit_id = M002-S04-T03-WAIT`, `status = waiting`, and `status_calls = 1`
- row 2 is the blocked scenario with `unit_id = M002-S04-T03-BLOCK`, `status = blocked`, and feedback `Needs manual follow-up.`
- the SQLite query and `broker-rows.json` agree

## Test Case 9 — Full slice verification matrix passes as one assembled proof set
**Goal:** prove S04 is complete as a slice, not only as isolated spot checks.

Steps:
1. Run the complete matrix in order:
   - `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test ./src/resources/extensions/gsd/tests/review-preferences.test.ts ./src/resources/extensions/gsd/tests/auto-review-gate.test.ts ./src/resources/extensions/gsd/tests/auto-loop.test.ts ./src/resources/extensions/gsd/tests/review-command.test.ts ./src/resources/extensions/gsd/tests/review-status-command.test.ts ./src/resources/extensions/gsd/tests/review-pause-state.test.ts`
   - `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test ./src/resources/extensions/gsd/tests/review-broker-runtime.test.ts`
   - `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test ./src/resources/extensions/gsd/tests/review-real-runtime.test.ts`
   - `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types ./src/resources/extensions/gsd/tests/scripts/review-real-runtime-proof.ts`
2. Record exit codes and TAP output.

Expected outcomes:
- all four commands exit 0
- the regression suite, spawned broker runtime proof, integrated runtime proof, and deterministic artifact script all pass together
- the slice’s local proof remains reproducible end to end

## Edge Cases

### Edge Case A — Allow-path regression remains green while the real-runtime proof focuses on wait/block/error
Steps:
1. Re-run the regression bundle from Test Case 1.
2. Inspect the `allow outcome progresses through post-verification seam and clears stale retry context` case.

Expected outcomes:
- allow still reaches the existing post-verification seam
- stale retry context is cleared
- S04 did not regress the already-proven allow path while adding the cross-process proof

### Edge Case B — Manual submit for an explicit off-session target does not mutate unrelated live state
Steps:
1. Re-run `review-command.test.ts` directly:
   `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test ./src/resources/extensions/gsd/tests/review-command.test.ts`
2. Inspect `submits manual review for an explicit target without requiring an active session target`.

Expected outcomes:
- explicit-target submission succeeds
- output is still normalized through the shared runtime seam
- only current/live submissions persist into `AutoSession.reviewGateState`

### Edge Case C — Duplicate review creation is prevented across pause/restart continuity
Steps:
1. Run the proof script from Test Case 4.
2. Compare wait-scenario review IDs in:
   - `manual-submit-before-finalize.txt`
   - `manual-submit-after-restart.txt`
3. Compare blocked-scenario review IDs in:
   - `proof-summary.json`
   - `manual-submit-after-block.txt`

Expected outcomes:
- wait scenario reuses one review ID across both submits
- blocked scenario reuses one review ID across finalize and manual re-submit
- the broker rows file still contains only two persisted rows total

### Edge Case D — Error visibility stays inspectable after the live auto session is gone
Steps:
1. Run the proof script from Test Case 4.
2. Inspect `.tmp-review-runtime-proof/error-visibility/paused-status.txt` after the proof has already reset the live session.

Expected outcomes:
- status still reports `source: paused`
- the error remains visible as `broker_unavailable:Broker unavailable.`
- visibility does not depend on a live in-memory session surviving the restart boundary
