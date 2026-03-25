# S04 Research — Real-runtime integrated proof

**Date:** 2026-03-21

## Summary

S04 is now mostly a **proof-and-gap-closing slice**, not a new policy slice. Based on the local S03 substrate, the remaining milestone risk sits at the runtime boundary: current tests prove review gating, pause/resume continuity, and manual status inspection with in-process transport doubles, but they do **not** yet prove a separate broker process, shared persisted broker state, or convergence between auto-mode and a manual review trigger against the same external runtime.

This slice supports the milestone’s still-active integration requirements: **R006, R008, R009, and R010**. In S04 those requirements are validated together rather than redefined:
- **R006** — the proof must cross a real typed/runtime transport boundary instead of staying in object-literal transports.
- **R008** — the `.gsd`-side runtime must remain the owner of unit/gate/pause semantics even when the broker is external.
- **R009** — the real finalize seam must still stop or continue correctly after verification.
- **R010** — blocked/wait/error state must stay visible through session state, paused-session state, and command-visible status.

Two important surprises came from the local code inspection:
1. The assigned worktree still contains only the reconstructed focused `src/resources/extensions/gsd/...` subtree recorded in `S03-SOURCE-HANDOFF.md`, not a full `gsd-2` checkout and not the M001 broker packages.
2. The local command surface currently includes **manual review status** only; there is **no local manual review submit handler/runtime helper** even though S02’s summary describes one.

That means S04 cannot be planned honestly as “just run the existing app against the broker.” The slice needs at least one small restoration step before the integrated proof can be truthful.

## Recommendation

Treat S04 as four ordered deliverables:

1. **Restore the missing manual review submit seam locally** so the slice can actually prove “manual trigger + manual status + auto gate converge on one broker state.”
2. **Add a real cross-process transport path** by introducing a small broker fixture process and a typed transport/helper that talks to it.
3. **Add one scripted integration proof** that exercises the real finalize path plus manual status/submit against the same broker-backed review records.
4. **Capture durable evidence** from the same run: session history, paused-session payload, command output, and broker SQLite rows.

The current code already has the right orchestration boundary. Per the loaded `create-gsd-extension` skill, session semantics should stay in explicit modules/handlers, not hidden in hooks; that matches the existing `review/gate.ts` and dedicated handler pattern. Per `debug-like-expert`, S04 should verify through observed persisted state and process boundaries, not infer success from mocked control-flow alone. Per the `test` skill, new proof should match the existing `node:test` + `assert/strict` style and reuse temp-root cleanup helpers instead of introducing a different test framework.

## Implementation Landscape

### What exists and is already trustworthy

- **Real finalize seam** — `src/resources/extensions/gsd/auto-loop.ts:41`
  - `finalizeReviewForUnit()` is the real post-verification orchestration seam.
  - It already distinguishes `progress`, `retry-unit`, and `pause` outcomes.
  - It records finalize-path evidence in `AutoSession.history` at `src/resources/extensions/gsd/auto-loop.ts:56-86`.
  - It only depends on an injected `transport`, so it is ready for real cross-process proof without embedding broker logic into loop orchestration.

- **Gate-owned broker interpretation** — `src/resources/extensions/gsd/review/gate.ts:22-134`
  - `shouldRefreshExistingReview()` at `:22` reuses an existing same-unit `reviewId` when state is still `pending` / `waiting` / `blocked`.
  - `runReviewGate()` at `:81` resolves review preferences, submits or refreshes through the injected transport, normalizes outcomes, and writes `session.reviewGateState`.
  - This remains the natural boundary for S04 because it keeps review semantics out of `auto-loop.ts`, consistent with D012/D015.

- **Shared read-side review status seam** — `src/resources/extensions/gsd/review/runtime.ts:83-105`
  - `readReviewStatus()` reuses live or paused review state and refreshes pending/waiting reviews through the transport when a `reviewId` exists.
  - `sanitizeReviewError()` and `stateFromStatusRecord()` at `:23-81` already provide the normalization/sanitization vocabulary S04 should keep using.

- **Single inspectable state surface** — `src/resources/extensions/gsd/auto.ts:21-62`
  - `getAutoReviewGateState()` exposes the live in-memory state.
  - `pauseAuto()` persists `pausedReviewState` into `.gsd/runtime/paused-session.json`.
  - `startAuto()` restores `reviewGateState` from disk.
  - This is the right continuity seam for restart/resume proof.

- **Durable paused-state envelope** — `src/resources/extensions/gsd/review/pause-state.ts:28-64`
  - `serializePausedReviewState()` emits `schemaVersion`, `savedAt`, and sanitized review fields.
  - `deserializePausedReviewState()` remains backward-compatible with legacy top-level `reviewGateState` payloads.
  - S04 can prove real continuity by checking both the file and the runtime rehydration path.

- **Manual status surface** — `src/resources/extensions/gsd/commands/handlers/review.ts:32-49`
  - `handleReviewStatus()` reads live state first, falls back to paused state, then refreshes via `readReviewStatus()`.
  - `formatReviewStatus()` at `:10-29` already emits stable human-observable fields that are good evidence for an integrated proof.

### What is missing or incomplete for S04

- **No local manual review submit surface**
  - In this worktree, `src/resources/extensions/gsd/commands/handlers/review.ts` only contains status handling.
  - `src/resources/extensions/gsd/review/runtime.ts` contains read-side status helpers only; there is no submit helper analogous to the S02 summary’s claimed runtime seam.
  - There is also no local `ops.ts`, dispatcher, or command catalog subtree to route a manual `/gsd review` trigger.
  - This is the biggest concrete implementation gap for S04.

- **No real broker/client code in the assigned sandbox**
  - `find`/`rg` over the worktree shows only the focused extension subtree plus planning/docs files; there is no local `packages/review-broker-*`, no `package.json`, and no full `gsd-2` runtime checkout.
  - The S03 handoff manifest (`.gsd/milestones/M002/slices/S03/S03-SOURCE-HANDOFF.md`) confirms this subtree is the authoritative local substrate for current work, per D014.
  - S04 therefore must not assume it can “just import the M001 client/server” from elsewhere.

- **Current proof is still in-process**
  - Existing tests inject object-literal transports directly into the gate/finalize path.
  - That is sufficient for S03 policy and continuity proof, but not for the S04 milestone claim of a separate broker process and converged runtime state.

### Existing tests worth preserving and extending

- `src/resources/extensions/gsd/tests/auto-loop.test.ts`
  - `:33` proves allow → post-verification progression.
  - `:71` proves blocked auto-loop → retry same unit.
  - `:116`, `:154`, `:190` prove intervene/wait/error pause without fallthrough.

- `src/resources/extensions/gsd/tests/auto-review-gate.test.ts`
  - `:9` proves same-unit review reuse.
  - `:79` proves mode-aware blocked-policy resolution.

- `src/resources/extensions/gsd/tests/review-status-command.test.ts`
  - `:17` proves live-state inspection.
  - `:38` and `:62` prove paused-state fallback and refresh.

- `src/resources/extensions/gsd/tests/review-pause-state.test.ts`
  - `:60` proves `pauseAuto()` persistence and `startAuto()` rehydration.

These tests are already green locally and form the right baseline. S04 should add to them, not replace them.

### Environment constraints and affordances discovered locally

- `node -v` reports **v22.19.0**.
- `sqlite3 --version` succeeds (**3.45.1**), so a file-backed SQLite proof is feasible without adding new npm dependencies.
- `src/resources/extensions/gsd/tests/resolve-ts.mjs` is currently a no-op (`export {};`), so Node’s current `--experimental-strip-types` path is already sufficient for this minimal tree.
- Existing tests already use isolated temp roots under `process.cwd()` and explicit cleanup:
  - `src/resources/extensions/gsd/tests/review-status-command.test.ts:10-14`
  - `src/resources/extensions/gsd/tests/review-pause-state.test.ts:10-14`
  - Reusing that pattern will keep S04 deterministic and local.

## Natural seams for planning and execution

### 1. Broker fixture + transport seam

Build this first.

Why first:
- It is the slice’s main unknown.
- Everything else can keep using the existing normalized `ReviewTransport` contract.
- It proves the cross-process boundary without forcing broker logic into `auto-loop.ts` or `review/gate.ts`.

Recommended shape:
- Add a small broker fixture under `src/resources/extensions/gsd/tests/fixtures/`, e.g. `review-broker-fixture.mjs`.
- Start it as a separate Node process from tests using `child_process.spawn`.
- Back it with a temp SQLite file so the proof has durable broker state.
- Expose only the two operations the local runtime actually needs now:
  - submit review
  - get review status
- Add a small typed test transport/helper in TS that talks to the fixture over HTTP or another explicit IPC boundary.

Reasonable implementation constraint for this sandbox:
- Do **not** introduce `better-sqlite3` or other new package dependencies; there is no package manifest here.
- If SQLite persistence is required, prefer shelling out to the available `sqlite3` CLI from the fixture or proof helper.

### 2. Manual review submit restoration seam

Build this second.

Why second:
- S04 acceptance explicitly includes manual review trigger/status convergence.
- The local subtree cannot prove that today because only status handling exists.

Likely file targets:
- `src/resources/extensions/gsd/review/runtime.ts`
  - add a submit-side helper that returns the same normalized state vocabulary the gate/status surfaces already use.
- `src/resources/extensions/gsd/commands/handlers/review.ts`
  - either add a manual submit handler beside `handleReviewStatus()` or split the file into submit/status exports while keeping one shared runtime module.

Keep this narrow:
- No second status cache.
- No broker semantics duplicated in the command handler.
- Reuse `ReviewGateState`, `ReviewStatusRecord`, `sanitizeReviewError()`, and `stateFromStatusRecord()`.

### 3. Real-runtime proof seam

Build this third, after the first two seams exist.

Recommended test shape:
- Add one dedicated integration test file, e.g. `src/resources/extensions/gsd/tests/review-real-runtime.test.ts`.
- Drive the existing real seams rather than introducing a parallel harness:
  - `finalizeReviewForUnit()` for auto finalize behavior
  - `pauseAuto()` / `startAuto()` for continuity
  - `handleReviewStatus()` for manual-visible status
  - restored manual submit handler/runtime helper for explicit manual review trigger

Minimum flows worth proving:
1. **Auto submit → wait/block/allow convergence on one review id**
   - first finalize call submits to broker fixture and returns `wait` or `block`
   - later status refresh returns `approved`
   - same `reviewId` is reused instead of duplicate submission
2. **Manual status sees the same active review**
   - `handleReviewStatus()` returns the same `reviewId` and refreshed status that auto-mode created
3. **Pause/restart preserves continuity**
   - `pauseAuto()` writes `pausedReviewState`
   - `startAuto()` rehydrates it
   - manual status still refreshes through broker using that `reviewId`
4. **Blocked/error visibility remains explicit**
   - blocked auto-loop sets `pendingVerificationRetry` only for retryable blocked flow
   - intervene/wait/error pause visibly and do not hit post-verification progression
5. **Manual submit uses the same broker state model**
   - manual trigger creates or targets the same review lineage that manual status and auto gate inspect

### 4. Evidence / scripted proof seam

Build this last if the slice needs milestone-closeout evidence beyond test TAP output.

Useful outputs:
- broker DB path
- review ids created/reused
- command output from manual status
- `AutoSession.history`
- serialized `.gsd/runtime/paused-session.json`
- direct SQLite query output showing durable review rows/status

A small script under `src/resources/extensions/gsd/tests/scripts/` is enough if the test itself is already stable.

## Risks and constraints the planner should account for

### Real blocker: missing manual submit path

The local code does not currently expose a manual submit surface. If the planner assumes S02 already left that here, execution will stall. Restore this before claiming integrated manual/automatic convergence.

### Do not depend on external absolute-path checkouts

The local S03 handoff plus D014/L004/L005 make the intended rule clear: use the restored local subtree as the authoritative execution substrate in this sandbox. Planning should not rely on reaching out to a sibling `gsd-2` or M001 checkout through absolute paths.

### Keep broker semantics out of loop orchestration

The current architecture is good:
- `auto-loop.ts` routes workflow actions
- `review/gate.ts` interprets broker results
- `review/runtime.ts` normalizes shared state/status

S04 should preserve this. Do not let the integration proof drag broker-specific branching back into `auto-loop.ts`.

### Prefer deterministic scripted proof over broad runtime recreation

Because there is no full app/runtime in this worktree, the most honest S04 interpretation here is a **scripted real-runtime proof** using the actual local seams plus a separate broker fixture process. That is still aligned with the roadmap’s “cross-runtime integration tests and/or scripted proof runs” language.

## Verification

### Baseline already green in this sandbox

This full local matrix passed during research:

```bash
node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test ./src/resources/extensions/gsd/tests/review-preferences.test.ts ./src/resources/extensions/gsd/tests/auto-review-gate.test.ts ./src/resources/extensions/gsd/tests/auto-loop.test.ts ./src/resources/extensions/gsd/tests/review-status-command.test.ts ./src/resources/extensions/gsd/tests/review-pause-state.test.ts
```

### Recommended S04 verification additions

1. **Cross-process broker proof**
```bash
node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test ./src/resources/extensions/gsd/tests/review-real-runtime.test.ts
```

2. **If manual submit is restored in a separate focused test**
```bash
node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test ./src/resources/extensions/gsd/tests/review-command.test.ts ./src/resources/extensions/gsd/tests/review-real-runtime.test.ts
```

3. **Optional scripted proof artifact**
```bash
node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types ./src/resources/extensions/gsd/tests/scripts/review-real-runtime-proof.ts
```

4. **SQLite evidence check against the temp broker DB emitted by the proof script/test**
```bash
sqlite3 "$DB_PATH" 'select review_id, status from reviews order by review_id;'
```

### Signals the planner/executor should insist on

The integrated proof should explicitly show all of these:
- same `reviewId` visible across auto gate state, paused-session state, manual status output, and broker DB rows
- only `allow` / `skipped` reach `postUnitPostVerification()`
- blocked auto-loop sets retry context without pausing
- intervene/wait/error pause visibly and do not progress
- manual review trigger/status and auto gate do not drift onto separate state models

## Skill discovery

Installed skills already cover the core work here:
- `create-gsd-extension`
- `test`
- `review`
- `debug-like-expert`
- `gsd`

Promising uninstalled external skills discovered during research:
- **SQLite:** `martinholovsky/claude-skills-generator@sqlite-database-expert`
  - install command: `npx skills add martinholovsky/claude-skills-generator@sqlite-database-expert`
  - signal: highest install count among SQLite-specific results (671)
- **TypeScript-heavy helper typing:** `wshobson/agents@typescript-advanced-types`
  - install command: `npx skills add wshobson/agents@typescript-advanced-types`
  - signal: highest install count among TypeScript-specific results (16.9K)

## Relevant skill rules applied

- **`create-gsd-extension`** — keep command/runtime behavior in explicit modules with injected seams, not hidden hooks. That reinforces keeping S04 centered on `review/gate.ts`, `review/runtime.ts`, and dedicated handlers.
- **`debug-like-expert`** — verify, don’t assume. For S04 that means proving cross-process state with persisted files and SQLite inspection, not inferring success from mocked unit tests.
- **`test`** — match the project’s existing test style. The local convention is `node:test` + `assert/strict` + temp-root cleanup helpers.
- **`review`** — prioritize concrete correctness gaps. The missing manual submit surface is a real blocker for S04, not a cosmetic issue.
- **`gsd`** — prefer deterministic, inspectable milestone artifacts and scripted proof over ad hoc verbal confirmation.
