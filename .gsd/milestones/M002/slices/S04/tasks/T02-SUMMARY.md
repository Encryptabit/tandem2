---
id: T02
parent: S04
milestone: M002
provides:
  - Spawned broker-fixture transport coverage now proves the review runtime can cross a real process boundary and leave durable SQLite-backed review state behind for later inspection.
key_files:
  - src/resources/extensions/gsd/tests/fixtures/review-broker-fixture.mjs
  - src/resources/extensions/gsd/tests/review-broker-transport.ts
  - src/resources/extensions/gsd/tests/review-broker-runtime.test.ts
  - .gitignore
key_decisions:
  - D019: Keep the spawned broker proof boundary test-only, use an HTTP fixture plus the system sqlite3 CLI, and preserve the production ReviewTransport seam unchanged.
patterns_established:
  - P004: Inspect spawned-broker persistence by reading the SQLite file directly with sqlite3 -json after the fixture exits.
observability_surfaces:
  - src/resources/extensions/gsd/tests/review-broker-runtime.test.ts
  - src/resources/extensions/gsd/tests/review-broker-transport.ts
  - src/resources/extensions/gsd/tests/fixtures/review-broker-fixture.mjs
  - .tmp-review-broker-runtime-tests/
duration: 0.5h
verification_result: passed
completed_at: 2026-03-21T21:10:49-07:00
blocker_discovered: false
---

# T02: Add a spawned broker fixture with typed cross-process transport

**Added a spawned SQLite-backed broker fixture and typed review transport that prove review state survives a real cross-process runtime boundary.**

## What Happened

I verified the assigned worktree already contained the planned T02 deliverables and validated them against the slice contract instead of widening the production runtime seam.

`src/resources/extensions/gsd/tests/fixtures/review-broker-fixture.mjs` now serves as the spawned broker fixture process. It exposes `/submit`, `/status`, and admin scenario endpoints over HTTP, persists review rows into a SQLite database through the system `sqlite3` CLI, reuses open review IDs when configured to do so, and keeps failure payloads constrained to review-safe metadata.

`src/resources/extensions/gsd/tests/review-broker-transport.ts` launches and stops that fixture as a child process, waits for an explicit `READY` handshake, exposes the existing `ReviewTransport` contract to callers, and adds helper inspection functions that read durable broker rows back out of SQLite after the fixture exits.

`src/resources/extensions/gsd/tests/review-broker-runtime.test.ts` exercises the real boundary end to end: it asserts the broker runs in a different PID, submits a review through the typed transport, refreshes status through the same seam, stops the process, and then proves the persisted SQLite row still exists with the updated status and `statusCalls` count.

I also confirmed `.gitignore` already covers deterministic temp review roots through `.tmp-review-*/` plus `.tmp-review-runtime-proof/`, so the broker/proof artifacts stay local and untracked without leaking broker-specific wiring into `src/resources/extensions/gsd/review/gate.ts` or `src/resources/extensions/gsd/auto-loop.ts`.

## Verification

I ran the task-level verification command for the spawned broker proof and confirmed it passes with a real child process and durable SQLite state.

I also re-ran the `.gitignore` verification check and the first slice-level regression bundle to confirm T02 does not disturb the existing review/runtime surfaces from T01.

For the Observability Impact check, I launched the broker helper with a failing scenario and confirmed the typed transport surfaces explicit broker error metadata (`code`, `message`, `retryable`) alongside the emitted `baseUrl` and persisted SQLite path. This verified that transport-call failures are inspectable instead of collapsing into opaque in-memory doubles.

As expected for the middle task in S04, the T03-specific slice checks still fail because `src/resources/extensions/gsd/tests/review-real-runtime.test.ts` and `src/resources/extensions/gsd/tests/scripts/review-real-runtime-proof.ts` do not exist yet in this worktree.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test ./src/resources/extensions/gsd/tests/review-broker-runtime.test.ts` | 0 | ✅ pass | 0.311s |
| 2 | `rg -n "tmp-review\|review-runtime-proof" .gitignore` | 0 | ✅ pass | 0.016s |
| 3 | `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test ./src/resources/extensions/gsd/tests/review-preferences.test.ts ./src/resources/extensions/gsd/tests/auto-review-gate.test.ts ./src/resources/extensions/gsd/tests/auto-loop.test.ts ./src/resources/extensions/gsd/tests/review-command.test.ts ./src/resources/extensions/gsd/tests/review-status-command.test.ts ./src/resources/extensions/gsd/tests/review-pause-state.test.ts` | 0 | ✅ pass | 0.214s |
| 4 | `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test ./src/resources/extensions/gsd/tests/review-real-runtime.test.ts` | 1 | ❌ fail | 0.030s |
| 5 | `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types ./src/resources/extensions/gsd/tests/scripts/review-real-runtime-proof.ts` | 1 | ❌ fail | 0.024s |

## Diagnostics

Future agents can inspect this task by running `src/resources/extensions/gsd/tests/review-broker-runtime.test.ts` and then inspecting the emitted SQLite database path through the helper or reading the resulting file with `sqlite3 -json`.

Key inspectable signals now include:
- spawned broker PID vs the test process PID
- fixture `baseUrl` and `dbPath`
- persisted review rows with `reviewId`, `unitId`, `status`, `summary`, and `statusCalls`
- explicit transport failure payloads with `code`, `message`, and `retryable`

The canonical inspection surfaces remain:
- `src/resources/extensions/gsd/tests/review-broker-runtime.test.ts`
- `src/resources/extensions/gsd/tests/review-broker-transport.ts`
- `src/resources/extensions/gsd/tests/fixtures/review-broker-fixture.mjs`
- `.tmp-review-broker-runtime-tests/`

## Deviations

None.

## Known Issues

The remaining T03 proof files are still absent, so the later slice-level verification commands continue to fail until T03 lands:
- `src/resources/extensions/gsd/tests/review-real-runtime.test.ts`
- `src/resources/extensions/gsd/tests/scripts/review-real-runtime-proof.ts`

## Files Created/Modified

- `src/resources/extensions/gsd/tests/fixtures/review-broker-fixture.mjs` — verified the spawned HTTP broker fixture persists review rows into SQLite and exposes submit/status/admin scenario endpoints for proof flows.
- `src/resources/extensions/gsd/tests/review-broker-transport.ts` — verified the typed helper launches/stops the fixture, preserves the `ReviewTransport` contract, and inspects durable rows via `sqlite3 -json`.
- `src/resources/extensions/gsd/tests/review-broker-runtime.test.ts` — verified the cross-process transport and persistence proof passes against the spawned fixture.
- `.gitignore` — verified deterministic temp review/proof directories are ignored locally.
- `.gsd/milestones/M002/slices/S04/tasks/T02-SUMMARY.md` — recorded the T02 execution narrative and verification evidence.
- `.gsd/milestones/M002/slices/S04/S04-PLAN.md` — marked T02 complete.
