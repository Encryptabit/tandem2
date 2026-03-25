---
id: T03
parent: S03
milestone: M002
provides:
  - A local finalize seam that auto-loops blocked auto-mode reviews back onto the same unit with truthful reviewer-feedback retry framing
  - Explicit pause/progress hook coverage proving blocked intervene, wait, and broker-error outcomes never fall through into post-verification progression
key_files:
  - src/resources/extensions/gsd/auto/session.ts
  - src/resources/extensions/gsd/auto-verification.ts
  - src/resources/extensions/gsd/auto-loop.ts
  - src/resources/extensions/gsd/tests/auto-loop.test.ts
key_decisions:
  - D015: Use explicit finalize hooks plus `AutoSession.history` notifications, and reserve `pendingVerificationRetry` for blocked auto-loop retries only.
patterns_established:
  - P001: Use `AutoSession.history` as the narrow finalize-path signal and leave `pendingVerificationRetry` null for intervene/wait/error branches.
observability_surfaces:
  - AutoSession.history finalize-path entries in `src/resources/extensions/gsd/auto-loop.ts`
  - `pendingVerificationRetry.source` and `formatPendingRetryPrompt()` in `src/resources/extensions/gsd/auto-verification.ts`
  - Focused finalize-path regression coverage in `src/resources/extensions/gsd/tests/auto-loop.test.ts`
duration: 1h05m
verification_result: passed
completed_at: 2026-03-21
blocker_discovered: false
---

# T03: Wire the local finalize loop to honor blocked-review policy

**Made the local review finalize seam auto-loop blocked units and pause cleanly for intervene, wait, and broker-error outcomes.**

## What Happened

I started by re-reading the restored local substrate and confirmed the gate contract from T02 was already policy-aware; the missing behavior was in the finalize seam. `auto-loop.ts` still behaved like a thin gate wrapper that mutated pause flags directly, carried retry state too loosely, and had no explicit seam proving when progression should or should not happen.

I first extended the retry context in `src/resources/extensions/gsd/auto/session.ts` and `src/resources/extensions/gsd/auto-verification.ts` so review-driven retries can carry reviewer feedback separately from generic verification failures. I added `formatPendingRetryPrompt()` to render source-aware retry wording: verification retries still say verification failed, while blocked broker reviews now say reviewer feedback blocked the attempt and include the review guidance instead of mislabeling it as a verification issue.

I then rewired `src/resources/extensions/gsd/auto-loop.ts` around explicit finalize hooks. The local finalize path now sets the current unit in focus, clears stale retry state before evaluating the new gate result, routes allow/skipped outcomes through an explicit `postUnitPostVerification` hook, and records inspectable history entries for every finalize branch. For blocked auto-mode reviews with resolved `auto-loop` policy, it now keeps the same unit active, stores only the review retry context needed for the next dispatch, skips `pauseAuto`, and skips post-verification progression. For blocked intervene, wait, and broker-error outcomes, it now pauses visibly through an explicit `pauseAuto` hook, preserves sanitized state in session history, and never leaves a misleading retry payload behind.

Finally, I replaced the focused finalize-path tests in `src/resources/extensions/gsd/tests/auto-loop.test.ts` with assertions that exercise each branch mechanically: truthful retry prompt framing, allow/progress behavior, blocked auto-loop retry behavior, blocked intervene pause behavior, wait pause behavior, and broker-error pause behavior. Those tests assert hook call counts, session state, retry payload content, and history entries so silent fallthrough is observable instead of inferred.

## Verification

I ran the task-level verification commands from the T03 plan and then re-ran the full slice verification set from `S03-PLAN.md` to confirm the finalize changes did not regress the restored local substrate. The focused `auto-loop.test.ts` suite passed with all six finalize-path cases green, the source grep confirmed the intended hook/retry/history wiring is present in the edited files, and the other slice suites for preferences/gate continuity and review-status/pause-state continuity also still passed.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test ./src/resources/extensions/gsd/tests/auto-loop.test.ts` | 0 | ✅ pass | 0.132s |
| 2 | `rg -n "review-blocked|review-error|postUnitPostVerification|pendingVerificationRetry|auto-loop" src/resources/extensions/gsd/auto-loop.ts src/resources/extensions/gsd/auto/session.ts src/resources/extensions/gsd/tests/auto-loop.test.ts` | 0 | ✅ pass | 0.005s |
| 3 | `test -f src/resources/extensions/gsd/auto-loop.ts && test -f src/resources/extensions/gsd/review/gate.ts && test -f src/resources/extensions/gsd/commands/handlers/review.ts && test -f src/resources/extensions/gsd/tests/resolve-ts.mjs && test -f src/resources/extensions/gsd/tests/auto-loop.test.ts` | 0 | ✅ pass | 0.001s |
| 4 | `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test ./src/resources/extensions/gsd/tests/review-preferences.test.ts ./src/resources/extensions/gsd/tests/auto-review-gate.test.ts` | 0 | ✅ pass | 0.126s |
| 5 | `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test ./src/resources/extensions/gsd/tests/review-status-command.test.ts ./src/resources/extensions/gsd/tests/review-pause-state.test.ts` | 0 | ✅ pass | 0.148s |

## Diagnostics

Future agents can inspect finalize-path behavior in three places: `AutoSession.history` now records branch-specific entries like `review-blocked:auto-loop:*`, `review-waiting:*`, and `review-error:*`; `pendingVerificationRetry.source` plus `formatPendingRetryPrompt()` show whether the next retry is coming from verification failure or reviewer feedback; and `src/resources/extensions/gsd/tests/auto-loop.test.ts` provides focused hook-count assertions that make pause/progress fallthrough bugs obvious.

## Deviations

None.

## Known Issues

None.

## Files Created/Modified

- `src/resources/extensions/gsd/auto/session.ts` — extended the retry-context shape so review retries can carry reviewer feedback distinctly from verification failures.
- `src/resources/extensions/gsd/auto-verification.ts` — added review-feedback capture and source-aware retry prompt formatting.
- `src/resources/extensions/gsd/auto-loop.ts` — rewired finalize behavior around explicit pause/progress hooks, same-unit auto-loop retry handling, and inspectable history entries.
- `src/resources/extensions/gsd/tests/auto-loop.test.ts` — added focused finalize-path regressions for allow, blocked auto-loop, blocked intervene, wait, and broker-error behavior.
- `.gsd/DECISIONS.md` — appended `D015` describing the explicit finalize-hook/history design for the local S03 seam.
- `.gsd/KNOWLEDGE.md` — added `P001` documenting how to treat finalize-path history vs retry payload state in later tasks.
- `.gsd/milestones/M002/slices/S03/S03-PLAN.md` — marked T03 complete.
