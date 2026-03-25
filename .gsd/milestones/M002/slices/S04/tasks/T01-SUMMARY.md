---
id: T01
parent: S04
milestone: M002
provides:
  - Shared manual review submission and status now converge on one runtime-owned normalized review-state seam.
key_files:
  - src/resources/extensions/gsd/review/runtime.ts
  - src/resources/extensions/gsd/commands/handlers/review.ts
  - src/resources/extensions/gsd/tests/review-command.test.ts
  - src/resources/extensions/gsd/tests/review-status-command.test.ts
  - .gsd/DECISIONS.md
  - .gsd/KNOWLEDGE.md
key_decisions:
  - D018: Keep manual submit normalization in review/runtime.ts and only persist returned review state into the live AutoSession for current/live-unit submissions.
patterns_established:
  - P003: Explicit off-session manual review submissions stay output-only; current/live submissions reuse and update the shared AutoSession reviewGateState.
observability_surfaces:
  - src/resources/extensions/gsd/commands/handlers/review.ts deterministic submit/status output
  - src/resources/extensions/gsd/tests/review-command.test.ts
  - src/resources/extensions/gsd/tests/review-status-command.test.ts
duration: 1h
verification_result: passed
completed_at: 2026-03-21T20:50:18-07:00
blocker_discovered: false
---

# T01: Restore the shared manual review submit seam

**Added a shared manual review submit path that reuses runtime normalization/error handling and makes current-unit submissions visible through the same review-state model used by status and auto gating.**

## What Happened

I extended `src/resources/extensions/gsd/review/runtime.ts` with `submitReviewForUnit()` so manual submission now goes through the same normalized `ReviewGateState` vocabulary and `sanitizeReviewError()` path that the auto review gate already uses.

I then updated `src/resources/extensions/gsd/commands/handlers/review.ts` to add `handleReviewSubmit()`. The handler resolves either an explicit target or the current live unit, calls the shared runtime submit helper, formats deterministic output with the normalized review fields, and only writes the returned state back into `AutoSession.reviewGateState` when the command is acting on the current/live unit. That keeps submit/status convergence real without inventing a command-local cache or contaminating unrelated explicit-target runs.

I added `src/resources/extensions/gsd/tests/review-command.test.ts` to cover current-target submission, explicit-target submission, missing-target visibility, shared review ID visibility through `handleReviewStatus()`, and sanitized broker failure formatting. I also tightened `src/resources/extensions/gsd/tests/review-status-command.test.ts` so status assertions continue proving the shared normalized state vocabulary after the submit path exists.

I recorded the state-ownership choice in `D018` and captured the pattern in `P003` for later S04 tasks.

## Verification

I ran the two task-plan verification commands first; both passed and proved the new submit seam plus preserved status behavior.

I then ran the slice-level verification matrix. The first bundled slice command now passes, including the new review-command coverage. The remaining three slice-level commands still fail because their T02/T03 proof files do not exist yet in this worktree (`review-broker-runtime.test.ts`, `review-real-runtime.test.ts`, and `tests/scripts/review-real-runtime-proof.ts`). That is expected at this task boundary and does not invalidate T01.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test ./src/resources/extensions/gsd/tests/review-command.test.ts` | 0 | ✅ pass | 0.168s |
| 2 | `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test ./src/resources/extensions/gsd/tests/review-status-command.test.ts` | 0 | ✅ pass | 0.168s |
| 3 | `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test ./src/resources/extensions/gsd/tests/review-preferences.test.ts ./src/resources/extensions/gsd/tests/auto-review-gate.test.ts ./src/resources/extensions/gsd/tests/auto-loop.test.ts ./src/resources/extensions/gsd/tests/review-command.test.ts ./src/resources/extensions/gsd/tests/review-status-command.test.ts ./src/resources/extensions/gsd/tests/review-pause-state.test.ts` | 0 | ✅ pass | 0.190s |
| 4 | `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test ./src/resources/extensions/gsd/tests/review-broker-runtime.test.ts` | 1 | ❌ fail | 0.027s |
| 5 | `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test ./src/resources/extensions/gsd/tests/review-real-runtime.test.ts` | 1 | ❌ fail | 0.028s |
| 6 | `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types ./src/resources/extensions/gsd/tests/scripts/review-real-runtime-proof.ts` | 1 | ❌ fail | 0.022s |

## Diagnostics

Future agents can inspect the shared manual review seam by reading `src/resources/extensions/gsd/review/runtime.ts` and `src/resources/extensions/gsd/commands/handlers/review.ts`, then running `src/resources/extensions/gsd/tests/review-command.test.ts`.

The deterministic handler output now exposes:
- `targetSource` / `target` for submit resolution
- normalized `reviewId`, `status`, `decision`, `blockedPolicy`, and `summary`
- sanitized `error: code:message` lines on broker failures
- status-side `source` and `refreshed` fields through the same formatter family

## Deviations

None.

## Known Issues

The later S04 slice verification commands for the spawned broker/runtime proof still fail because the T02/T03 files have not been created yet:
- `src/resources/extensions/gsd/tests/review-broker-runtime.test.ts`
- `src/resources/extensions/gsd/tests/review-real-runtime.test.ts`
- `src/resources/extensions/gsd/tests/scripts/review-real-runtime-proof.ts`

## Files Created/Modified

- `src/resources/extensions/gsd/review/runtime.ts` — added the shared manual submit runtime helper that returns normalized review state and sanitized errors.
- `src/resources/extensions/gsd/commands/handlers/review.ts` — added manual submit handling, current-vs-explicit target resolution, shared output formatting, and guarded live-session state persistence.
- `src/resources/extensions/gsd/tests/review-command.test.ts` — added focused coverage for current-target submit, explicit-target submit, missing-target output, shared review ID visibility, and sanitized broker failures.
- `src/resources/extensions/gsd/tests/review-status-command.test.ts` — strengthened status assertions so they still prove the shared normalized review-state vocabulary.
- `.gsd/DECISIONS.md` — recorded D018 about manual submit/state ownership.
- `.gsd/KNOWLEDGE.md` — recorded P003 describing the no-command-cache/manual-submit persistence pattern.
- `.gsd/milestones/M002/slices/S04/S04-PLAN.md` — marked T01 complete.
