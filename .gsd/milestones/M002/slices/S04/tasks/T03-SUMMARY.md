---
id: T03
parent: S04
milestone: M002
provides:
  - A deterministic broker-backed proof now asserts auto/manual review lineage reuse, pause/restart continuity, and durable runtime artifacts under `.tmp-review-runtime-proof/`.
key_files:
  - src/resources/extensions/gsd/tests/review-real-runtime-flow.ts
  - src/resources/extensions/gsd/tests/review-real-runtime.test.ts
  - src/resources/extensions/gsd/tests/scripts/review-real-runtime-proof.ts
  - .gsd/DECISIONS.md
  - .gsd/KNOWLEDGE.md
  - .gsd/milestones/M002/slices/S04/S04-PLAN.md
key_decisions:
  - D020: Keep the integrated proof under one deterministic `.tmp-review-runtime-proof/` root with per-scenario project roots sharing one spawned broker fixture and SQLite database.
patterns_established:
  - P005: Preserve multiple paused-session envelopes by giving each scenario its own project root while sharing one broker-backed review lineage.
observability_surfaces:
  - src/resources/extensions/gsd/tests/review-real-runtime.test.ts
  - src/resources/extensions/gsd/tests/scripts/review-real-runtime-proof.ts
  - .tmp-review-runtime-proof/proof-summary.json
  - .tmp-review-runtime-proof/broker-rows.json
  - .tmp-review-runtime-proof/*/.gsd/runtime/paused-session.json
duration: 1h
verification_result: passed
completed_at: 2026-03-21T21:19:59-07:00
blocker_discovered: false
---

# T03: Prove auto/manual convergence and persist runtime evidence

**Added a broker-backed real-runtime proof that reuses one review lineage across finalize, manual submit/status, and pause/restart artifacts.**

## What Happened

I added `src/resources/extensions/gsd/tests/review-real-runtime-flow.ts` as the shared assembled proof runner for T03. It launches the spawned broker fixture from T02, drives three real scenarios against it (`wait`, `block`, and `error`), persists per-scenario paused-session envelopes under one deterministic proof root, and asserts the proof contract directly instead of relying on log interpretation.

The wait-path scenario proves the core convergence claim: manual submit creates the first broker review, `finalizeReviewForUnit()` refreshes the same review into a waiting pause, `handleReviewStatus()` can see that paused lineage before and after `startAuto()`, and a later manual submit reuses the same broker review ID rather than creating a duplicate row.

The blocked-path scenario proves the human/intervene branch stays inspectable through the real finalize seam and still converges with manual submit on the same broker-backed review lineage after restart. The error-path scenario proves broker failures remain sanitized and persist only redacted error metadata in the paused-session envelope and summary artifacts; no phantom broker row is created for the failing unit.

I wrapped that shared runner in `src/resources/extensions/gsd/tests/review-real-runtime.test.ts` and added the deterministic proof entrypoint `src/resources/extensions/gsd/tests/scripts/review-real-runtime-proof.ts`, which writes `proof-summary.json`, `broker-rows.json`, per-scenario paused-session files, and captured manual output text files under `.tmp-review-runtime-proof/`.

I did not need to widen `src/resources/extensions/gsd/tests/auto-loop.test.ts` or `src/resources/extensions/gsd/tests/review-pause-state.test.ts`; the existing focused regressions still cover the in-process invariants, and the new T03 proof now covers the real cross-process integration boundary on top.

I also recorded the artifact-topology choice in `D020` and the reusable per-scenario proof-layout pattern in `P005`.

## Verification

I first ran the new task-level verification commands: the integrated node:test proof and the standalone proof script both passed.

I then ran the full S04 slice verification matrix. All four slice checks now pass in this worktree, including the existing review/pause-state regressions, the spawned broker runtime proof from T02, the new integrated proof test, and the deterministic proof script.

For the Observability Impact check, I directly inspected `.tmp-review-runtime-proof/proof-summary.json`, `.tmp-review-runtime-proof/broker-rows.json`, and the per-scenario `paused-session.json` files. They expose the required signals: reused `reviewId` lineage, normalized `status` / `decision`, blocked-policy resolution, sanitized broker errors, paused-review envelopes, and durable broker rows without storing raw diff or secret-bearing payload content.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test ./src/resources/extensions/gsd/tests/review-preferences.test.ts ./src/resources/extensions/gsd/tests/auto-review-gate.test.ts ./src/resources/extensions/gsd/tests/auto-loop.test.ts ./src/resources/extensions/gsd/tests/review-command.test.ts ./src/resources/extensions/gsd/tests/review-status-command.test.ts ./src/resources/extensions/gsd/tests/review-pause-state.test.ts` | 0 | ✅ pass | 0.195s |
| 2 | `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test ./src/resources/extensions/gsd/tests/review-broker-runtime.test.ts` | 0 | ✅ pass | 0.278s |
| 3 | `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test ./src/resources/extensions/gsd/tests/review-real-runtime.test.ts` | 0 | ✅ pass | 0.333s |
| 4 | `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types ./src/resources/extensions/gsd/tests/scripts/review-real-runtime-proof.ts && test -f .tmp-review-runtime-proof/proof-summary.json` | 0 | ✅ pass | 0.278s |
| 5 | `test -f .tmp-review-runtime-proof/proof-summary.json && test -f .tmp-review-runtime-proof/broker-rows.json && test -f .tmp-review-runtime-proof/wait-continuity/.gsd/runtime/paused-session.json && test -f .tmp-review-runtime-proof/blocked-visibility/.gsd/runtime/paused-session.json && test -f .tmp-review-runtime-proof/error-visibility/.gsd/runtime/paused-session.json && rg -n '"waitReviewReused": true|"blockedReviewReused": true|"errorVisibilityVisible": true|"unitId": "M002-S04-T03-ERROR"' .tmp-review-runtime-proof/proof-summary.json` | 0 | ✅ pass | 0.004s |

## Diagnostics

Future agents can inspect the finished proof by:

- running `src/resources/extensions/gsd/tests/review-real-runtime.test.ts` for the integrated assertions
- running `src/resources/extensions/gsd/tests/scripts/review-real-runtime-proof.ts` to regenerate artifacts under `.tmp-review-runtime-proof/`
- reading `.tmp-review-runtime-proof/proof-summary.json` for the structured end-to-end summary
- reading `.tmp-review-runtime-proof/broker-rows.json` for the durable broker review rows
- reading `.tmp-review-runtime-proof/wait-continuity/.gsd/runtime/paused-session.json`, `.tmp-review-runtime-proof/blocked-visibility/.gsd/runtime/paused-session.json`, and `.tmp-review-runtime-proof/error-visibility/.gsd/runtime/paused-session.json` for persisted paused envelopes
- reading the captured manual command outputs in each scenario directory (for example `manual-submit-before-finalize.txt`, `paused-status.txt`, and `manual-submit-after-restart.txt`)

The proof artifacts now make these failure states mechanically visible: duplicate-review submission, lost paused continuity, incorrect blocked-policy handling, sanitized broker-error propagation, and missing durable broker rows.

## Deviations

I added one small shared helper file, `src/resources/extensions/gsd/tests/review-real-runtime-flow.ts`, even though the plan only named the test and script entrypoints. That local adaptation keeps the node:test wrapper and the standalone proof script on the exact same assembled flow so they cannot drift.

## Known Issues

None.

## Files Created/Modified

- `src/resources/extensions/gsd/tests/review-real-runtime-flow.ts` — added the shared broker-backed proof runner that exercises wait/block/error paths, pause/restart continuity, artifact writing, and durable row assertions.
- `src/resources/extensions/gsd/tests/review-real-runtime.test.ts` — added the integrated node:test wrapper that proves auto/manual convergence through the shared real-runtime flow.
- `src/resources/extensions/gsd/tests/scripts/review-real-runtime-proof.ts` — added the deterministic proof script that emits durable evidence under `.tmp-review-runtime-proof/`.
- `.gsd/DECISIONS.md` — recorded D020 about the scenario-split proof artifact topology under one shared broker database.
- `.gsd/KNOWLEDGE.md` — recorded P005 describing the per-scenario project-root pattern for preserving multiple paused-session envelopes in one proof run.
- `.gsd/milestones/M002/slices/S04/S04-PLAN.md` — marked T03 complete.
- `.gsd/milestones/M002/slices/S04/tasks/T03-SUMMARY.md` — recorded the execution narrative, verification evidence, and inspection guidance for T03.
