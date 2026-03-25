---
id: T02
parent: S03
milestone: M002
provides:
  - A local self-contained `src/resources/extensions/gsd` substrate with runnable S03 review-gate, auto-loop, pause-state, and review-status tests inside the assigned worktree
  - A checksum-based source handoff manifest that future agents can use to detect drift without depending on an external checkout
key_files:
  - .gsd/milestones/M002/slices/S03/S03-SOURCE-HANDOFF.md
  - src/resources/extensions/gsd/review/gate.ts
  - src/resources/extensions/gsd/auto-loop.ts
  - src/resources/extensions/gsd/commands/handlers/review.ts
  - src/resources/extensions/gsd/tests/resolve-ts.mjs
  - src/resources/extensions/gsd/tests/auto-loop.test.ts
  - src/resources/extensions/gsd/tests/review-status-command.test.ts
key_decisions:
  - D014: Materialize a self-contained local `src/resources/extensions/gsd` subtree inside the sandbox and treat its checksum manifest as the S03 execution baseline.
patterns_established:
  - Read `.gsd/milestones/M002/slices/S03/S03-SOURCE-HANDOFF.md` before follow-on S03 work and keep all slice execution references relative to the worktree.
observability_surfaces:
  - `.gsd/milestones/M002/slices/S03/S03-SOURCE-HANDOFF.md`
  - `src/resources/extensions/gsd/tests/*.test.ts`
  - `.gsd/runtime/paused-session.json` via `pauseAuto()` / `readPausedReviewGateState()`
duration: 1h20m
verification_result: passed
completed_at: 2026-03-21
blocker_discovered: false
---

# T02: Restore the missing sandbox source/test substrate for S03

**Restored a local `gsd` extension subtree with a provenance manifest, relative slice paths, and passing S03 substrate tests.**

## What Happened

I started by re-checking the assigned worktree and confirmed the blocker from T01 was still real: the sandbox contained planning artifacts only, with no `src/resources/extensions/gsd/...` subtree to edit or test. Instead of reaching outside the sandbox, I kept the scope to the exact S03 execution surface and reconstructed a local, self-contained extension substrate under `src/resources/extensions/gsd`.

That substrate includes the review gate/runtime/types seam, auto-session and finalize-loop helpers, pause-state persistence helpers, a review-status command handler, and a minimal `preferences.ts` resolver so the focused review-policy tests can run locally. I also added the local strip-types harness at `src/resources/extensions/gsd/tests/resolve-ts.mjs` plus focused node:test coverage for review preferences, gate continuity, auto-loop behavior, paused review-state serialization, and manual status fallback.

After the code and tests were in place, I wrote `.gsd/milestones/M002/slices/S03/S03-SOURCE-HANDOFF.md` with explicit provenance, a checksum manifest for every restored file, and the verification snapshot used during this task. I then normalized the live S03 execution notes to local relative paths in `S03-PLAN.md`, `tasks/T01-PLAN.md`, and `S03-RESEARCH.md`, recorded the source-handoff choice as decision `D014`, and added `L005` to `.gsd/KNOWLEDGE.md` so later agents know to use the handoff manifest instead of reintroducing external absolute paths.

## Verification

I verified the restore in two layers. First, I ran the task-level file-existence probes to confirm the required production files, test harness, and focused tests now exist inside this worktree. Then I ran the full slice-level verification commands against the new local subtree. All three node-based test runs passed from the in-worktree strip-types harness, covering policy resolution, same-unit review reuse, waiting-state continuity, blocked-policy behavior, auto-loop behavior, paused review-state persistence, and `/gsd review-status` fallback. I also confirmed that the live S03 planning/research execution notes no longer contain `/home/cari/repos/gsd-2` references.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `test -f src/resources/extensions/gsd/auto-loop.ts && test -f src/resources/extensions/gsd/auto.ts && test -f src/resources/extensions/gsd/auto/session.ts && test -f src/resources/extensions/gsd/auto-verification.ts` | 0 | ✅ pass | 0.064s |
| 2 | `test -f src/resources/extensions/gsd/review/gate.ts && test -f src/resources/extensions/gsd/review/runtime.ts && test -f src/resources/extensions/gsd/review/types.ts && test -f src/resources/extensions/gsd/commands/handlers/review.ts` | 0 | ✅ pass | 0.065s |
| 3 | `test -f src/resources/extensions/gsd/tests/resolve-ts.mjs && test -f src/resources/extensions/gsd/tests/auto-loop.test.ts && test -f src/resources/extensions/gsd/tests/review-status-command.test.ts` | 0 | ✅ pass | 0.062s |
| 4 | `test -f src/resources/extensions/gsd/auto-loop.ts && test -f src/resources/extensions/gsd/review/gate.ts && test -f src/resources/extensions/gsd/commands/handlers/review.ts && test -f src/resources/extensions/gsd/tests/resolve-ts.mjs && test -f src/resources/extensions/gsd/tests/auto-loop.test.ts` | 0 | ✅ pass | 0.060s |
| 5 | `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test ./src/resources/extensions/gsd/tests/review-preferences.test.ts ./src/resources/extensions/gsd/tests/auto-review-gate.test.ts` | 0 | ✅ pass | 0.110s |
| 6 | `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test ./src/resources/extensions/gsd/tests/auto-loop.test.ts` | 0 | ✅ pass | 0.105s |
| 7 | `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test ./src/resources/extensions/gsd/tests/review-status-command.test.ts ./src/resources/extensions/gsd/tests/review-pause-state.test.ts` | 0 | ✅ pass | 0.118s |
| 8 | `rg -n '/home/cari/repos/gsd-2' .gsd/milestones/M002/slices/S03/S03-PLAN.md .gsd/milestones/M002/slices/S03/S03-RESEARCH.md .gsd/milestones/M002/slices/S03/tasks/T01-PLAN.md` | 1 | ✅ pass | 0.005s |

## Diagnostics

Future agents can inspect the restored substrate by reading `.gsd/milestones/M002/slices/S03/S03-SOURCE-HANDOFF.md`, which records provenance, the restored file list, and SHA-256 checksums for drift detection. Behavior is mechanically inspectable through the focused tests under `src/resources/extensions/gsd/tests/`, and the pause/resume continuity surface is visible through `.gsd/runtime/paused-session.json`, `pauseAuto()`, `readPausedReviewGateState()`, and `handleReviewStatus()`.

## Deviations

The plan implicitly assumed a copyable upstream `gsd-2` snapshot would be available, but no authoritative in-worktree source snapshot or commit identity existed. I therefore restored the substrate by reconstructing a small, runnable local `src/resources/extensions/gsd` tree inside the sandbox and recorded that provenance explicitly in `S03-SOURCE-HANDOFF.md` rather than pretending it came from a known external revision.

I also added `src/resources/extensions/gsd/preferences.ts` and `src/resources/extensions/gsd/review/pause-state.ts` even though the T02 file list emphasized a smaller minimum. Those helpers keep the restored subtree runnable and let the slice’s focused tests exercise policy resolution and paused-state continuity locally instead of leaving the new tree as dead placeholders.

## Known Issues

- The restored subtree is provenance-backed and locally testable, but its upstream external commit identity is still unknown from local evidence. Drift detection currently depends on the checksum manifest in `S03-SOURCE-HANDOFF.md`, not on comparing to a known upstream revision.

## Files Created/Modified

- `.gsd/milestones/M002/slices/S03/S03-SOURCE-HANDOFF.md` — recorded handoff provenance, checksum manifest, and local verification snapshot for the restored subtree.
- `src/resources/extensions/gsd/preferences.ts` — added a minimal local review-preference resolver so blocked-policy tests run entirely in-worktree.
- `src/resources/extensions/gsd/review/types.ts` — defined the local normalized review state/result contract used by the restored gate/runtime/status surfaces.
- `src/resources/extensions/gsd/review/runtime.ts` — added local review status normalization and refresh helpers.
- `src/resources/extensions/gsd/review/gate.ts` — added the local continuity-aware review gate seam over the restored contract.
- `src/resources/extensions/gsd/review/pause-state.ts` — added focused paused review-state serialization and restore helpers for the local substrate.
- `src/resources/extensions/gsd/auto/session.ts` — added the local auto-session model with review gate state and retry context.
- `src/resources/extensions/gsd/auto-verification.ts` — added local verification/review retry context builders.
- `src/resources/extensions/gsd/auto.ts` — added singleton auto-session access plus paused review-state persistence/restore helpers.
- `src/resources/extensions/gsd/auto-loop.ts` — added the local finalize seam that consumes review-gate outcomes.
- `src/resources/extensions/gsd/commands/handlers/review.ts` — added local `/gsd review-status` formatting and paused-state fallback behavior.
- `src/resources/extensions/gsd/tests/resolve-ts.mjs` — added the local strip-types test harness entrypoint.
- `src/resources/extensions/gsd/tests/review-preferences.test.ts` — added local review-policy resolution tests.
- `src/resources/extensions/gsd/tests/auto-review-gate.test.ts` — added local same-unit reuse, waiting-state, and blocked-policy gate tests.
- `src/resources/extensions/gsd/tests/auto-loop.test.ts` — added local finalize-path tests for allow/block/wait/error behavior.
- `src/resources/extensions/gsd/tests/review-status-command.test.ts` — added local live/paused review-status command tests.
- `src/resources/extensions/gsd/tests/review-pause-state.test.ts` — added local paused review-state serialization tests.
- `.gsd/milestones/M002/slices/S03/S03-PLAN.md` — marked `T02` complete and normalized the remaining T01 task references to local relative paths.
- `.gsd/milestones/M002/slices/S03/tasks/T01-PLAN.md` — replaced execution-time absolute paths with local relative paths.
- `.gsd/milestones/M002/slices/S03/S03-RESEARCH.md` — normalized the baseline research verification command to local relative paths.
- `.gsd/DECISIONS.md` — appended `D014` documenting the sandbox-local source handoff choice.
- `.gsd/KNOWLEDGE.md` — added `L005` pointing future agents at the handoff manifest and checksum baseline.
