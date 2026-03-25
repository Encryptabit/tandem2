# S04 Summary — Real-runtime integrated proof

## Outcome

S04 is **slice-complete**.

This closer pass re-ran the full S04 verification matrix and confirmed that the restored in-worktree `gsd` extension substrate now proves the milestone’s integrated behavior against a real spawned broker process with durable SQLite state. Auto finalize behavior, manual review submission, manual review status, and pause/restart continuity all converge on one broker-backed review-state model, and the slice now leaves deterministic proof artifacts under `.tmp-review-runtime-proof/` for later inspection.

## What this slice delivers

### 1. Manual and automatic review now share one runtime-owned submit/status seam
- `src/resources/extensions/gsd/review/runtime.ts` now owns both status refresh and manual submission normalization.
- `src/resources/extensions/gsd/commands/handlers/review.ts` uses that shared seam for `/gsd review` and `/gsd review-status` formatting instead of inventing command-local broker logic.
- Manual submit only persists returned review state into `AutoSession.reviewGateState` when the command targets the current/live unit.
- Explicit off-session targets remain output-only, which keeps manual ad hoc review requests from mutating unrelated live session state.

### 2. The slice proves a real cross-process broker boundary with durable state
- `src/resources/extensions/gsd/tests/fixtures/review-broker-fixture.mjs` runs as a separate child process and persists broker review rows into SQLite.
- `src/resources/extensions/gsd/tests/review-broker-transport.ts` keeps the runtime-facing contract on the typed `ReviewTransport` seam while adding fixture lifecycle and SQLite inspection helpers for tests.
- `src/resources/extensions/gsd/tests/review-broker-runtime.test.ts` proves submit + refresh cross that process boundary and leave durable broker rows behind after the fixture exits.
- This proof stays test-only and does not leak HTTP fixture details or SQLite CLI concerns into the shipped runtime seam.

### 3. The assembled proof now exercises the real finalize seam plus manual command surfaces together
- `src/resources/extensions/gsd/tests/review-real-runtime-flow.ts` is the shared assembled proof runner for the integrated flow.
- `src/resources/extensions/gsd/tests/review-real-runtime.test.ts` proves the behavior under `node:test`.
- `src/resources/extensions/gsd/tests/scripts/review-real-runtime-proof.ts` regenerates durable proof artifacts under `.tmp-review-runtime-proof/`.
- The integrated proof covers three concrete scenarios against one shared spawned broker database:
  - **wait continuity** — manual submit creates `rev-0001`, finalize reuses it and pauses with `review-waiting`, paused status sees it, restart rehydrates it, and re-submit still reuses `rev-0001`
  - **blocked visibility** — finalize pauses with `review-blocked`, persists `blockedPolicy: intervene`, paused/manual surfaces still show the same review lineage, and re-submit reuses `rev-0002`
  - **error visibility** — broker failure pauses with sanitized `broker_unavailable` metadata, status/manual surfaces show the same normalized error vocabulary, and no broker row is created for the failing unit

### 4. Pause/restart continuity is now proven with inspectable runtime artifacts
- Per-scenario paused envelopes live under:
  - `.tmp-review-runtime-proof/wait-continuity/.gsd/runtime/paused-session.json`
  - `.tmp-review-runtime-proof/blocked-visibility/.gsd/runtime/paused-session.json`
  - `.tmp-review-runtime-proof/error-visibility/.gsd/runtime/paused-session.json`
- These files retain only inspectable review metadata:
  - unit identity
  - review ID
  - normalized status/decision
  - blocked policy
  - summary
  - sanitized error payloads
- Restarted status confirmation and manual command outputs are also preserved as plain text artifacts in each scenario directory.

### 5. The slice closes the milestone’s mapped integration proof
The full slice verification matrix now proves the milestone’s remaining integrated claims:
- the direct typed review transport is the deterministic integration seam, not MCP-mediated control flow
- `.gsd`/unit-context shaping remains in the local adapter/runtime layer rather than the broker core
- review-before-progression control flow is real and mode-aware
- blocked/wait/error outcomes remain visibly inspectable through shared runtime state, command output, paused-session envelopes, and durable proof artifacts

## Verification status

### Planned slice verification re-run
The S04 plan required these commands:

1. `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test ./src/resources/extensions/gsd/tests/review-preferences.test.ts ./src/resources/extensions/gsd/tests/auto-review-gate.test.ts ./src/resources/extensions/gsd/tests/auto-loop.test.ts ./src/resources/extensions/gsd/tests/review-command.test.ts ./src/resources/extensions/gsd/tests/review-status-command.test.ts ./src/resources/extensions/gsd/tests/review-pause-state.test.ts`
2. `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test ./src/resources/extensions/gsd/tests/review-broker-runtime.test.ts`
3. `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test ./src/resources/extensions/gsd/tests/review-real-runtime.test.ts`
4. `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types ./src/resources/extensions/gsd/tests/scripts/review-real-runtime-proof.ts`

### Actual result in this closer pass
All four planned slice checks passed.

Passing coverage included:
- allow-path regression coverage in `auto-loop.test.ts`
- manual submit/status convergence on the shared runtime seam
- spawned broker transport round-trip across a separate process with SQLite persistence
- wait/block/error real-runtime proof through `finalizeReviewForUnit()` and the manual command handlers
- review ID reuse vs duplicate submission prevention
- paused-session continuity before and after `startAuto()`
- sanitized broker-failure visibility with no phantom broker row for the failing unit
- deterministic artifact generation under `.tmp-review-runtime-proof/`

## Observability / diagnostics confirmed

The slice plan’s explicit observability surfaces were confirmed in this closer pass:

- **`AutoSession.reviewGateState`**
  - remains the shared in-memory review-state contract for auto, manual submit, and manual status
  - visibly carries `reviewId`, `status`, `decision`, `blockedPolicy`, `summary`, and sanitized errors
- **manual command output**
  - emits deterministic `targetSource`, `target`, `source`, `refreshed`, `reviewId`, `status`, `decision`, `blockedPolicy`, `summary`, and sanitized `error` lines
- **`.tmp-review-runtime-proof/proof-summary.json`**
  - captures the integrated proof result, reused review IDs, paused continuity, blocked visibility, and error visibility assertions
- **`.tmp-review-runtime-proof/broker-rows.json`**
  - exposes the durable broker rows for the wait and blocked scenarios and proves no row was created for the error scenario
- **per-scenario `paused-session.json` files**
  - preserve paused review envelopes across restart boundaries without storing raw diff/patch bodies

## Files landed in the local S04 substrate

### New or materially expanded runtime/test/proof surfaces
- `src/resources/extensions/gsd/review/runtime.ts`
- `src/resources/extensions/gsd/commands/handlers/review.ts`
- `src/resources/extensions/gsd/tests/review-command.test.ts`
- `src/resources/extensions/gsd/tests/review-status-command.test.ts`
- `src/resources/extensions/gsd/tests/fixtures/review-broker-fixture.mjs`
- `src/resources/extensions/gsd/tests/review-broker-transport.ts`
- `src/resources/extensions/gsd/tests/review-broker-runtime.test.ts`
- `src/resources/extensions/gsd/tests/review-real-runtime-flow.ts`
- `src/resources/extensions/gsd/tests/review-real-runtime.test.ts`
- `src/resources/extensions/gsd/tests/scripts/review-real-runtime-proof.ts`

### Durable proof surfaces
- `.tmp-review-runtime-proof/proof-summary.json`
- `.tmp-review-runtime-proof/broker-rows.json`
- `.tmp-review-runtime-proof/wait-continuity/.gsd/runtime/paused-session.json`
- `.tmp-review-runtime-proof/blocked-visibility/.gsd/runtime/paused-session.json`
- `.tmp-review-runtime-proof/error-visibility/.gsd/runtime/paused-session.json`

## Requirement impact

This closer pass updated `.gsd/REQUIREMENTS.md` based on executed proof, not just planning intent.

The slice now validates:
- **R006** — the direct typed review transport is exercised across the spawned broker boundary and reused by auto/manual flows without MCP mediation
- **R008** — workflow-specific review semantics remain in the local `gsd` adapter/runtime seam, not the broker core
- **R009** — review-before-progression gating is proven through the real finalize seam with allow-path regression coverage and wait/block/error runtime proof
- **R010** — review visibility is now proven through command output, paused-session state, proof JSON, and durable broker rows

## Decisions and patterns this slice establishes

- **D018** — keep manual submit normalization in `review/runtime.ts` and only persist returned review state into the live `AutoSession` for current/live-unit submissions.
- **D019** — keep the spawned broker proof boundary test-only, backed by an HTTP fixture plus the system `sqlite3` CLI, while leaving the production `ReviewTransport` seam unchanged.
- **D020** — keep the integrated proof under one deterministic `.tmp-review-runtime-proof/` root with separate per-scenario project roots sharing one broker database.
- **P003** — explicit off-session manual review submissions stay output-only; current/live submissions reuse and update the shared `AutoSession.reviewGateState`.
- **P004** — inspect spawned-broker persistence by reading the SQLite file directly with `sqlite3 -json` after the fixture exits.
- **P005** — preserve multiple paused-session envelopes by giving each scenario its own project root while sharing one broker-backed review lineage.

## Downstream guidance

### For roadmap reassessment
- M002’s remaining integrated proof gap is closed in this worktree.
- The milestone’s mapped requirements for deterministic typed integration, adapter ownership, review-before-progression gating, and failure visibility now have executable evidence, not just isolated unit tests.

### For later milestone work
- Reuse `review/runtime.ts` as the only submit/status normalization seam; do not fork command-local or broker-local review vocabularies.
- Keep `ReviewGateState`, `AutoSession.reviewGateState`, and the paused-session envelope as the continuity contract.
- Regenerate `.tmp-review-runtime-proof/` with `src/resources/extensions/gsd/tests/scripts/review-real-runtime-proof.ts` whenever future changes might affect review lineage reuse, blocked-policy visibility, or restart continuity.
- Treat the spawned broker fixture and transport helper as proof infrastructure only; later production work should keep consuming the typed transport seam rather than the test fixture implementation.
