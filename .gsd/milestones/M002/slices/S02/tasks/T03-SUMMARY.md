---
id: T03
parent: S02
milestone: M002
provides:
  - First-class `/gsd review` and `/gsd review-status` discoverability in command description, top-level completions, and `/gsd help`
  - A focused regression test that locks help/catalog/completion visibility to the handler-visible review syntax contract
key_files:
  - /home/cari/repos/gsd-2/src/resources/extensions/gsd/commands/catalog.ts
  - /home/cari/repos/gsd-2/src/resources/extensions/gsd/commands/handlers/core.ts
  - /home/cari/repos/gsd-2/src/resources/extensions/gsd/commands/handlers/review.ts
  - /home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/review-command-discoverability.test.ts
key_decisions:
  - Kept the shipped command/runtime code untouched and locked discoverability drift with a focused regression test rather than introducing a new shared metadata module late in the slice.
patterns_established:
  - Command discoverability surfaces can stay synchronized with runtime usage strings by asserting catalog/help text against exported handler syntax and description constants.
observability_surfaces:
  - /gsd help
  - getGsdArgumentCompletions() / top-level `/gsd` completions
  - review-command-discoverability.test.ts
  - .gsd/KNOWLEDGE.md (L003)
duration: 1h
verification_result: passed
completed_at: 2026-03-22T02:37:00Z
blocker_discovered: false
---

# T03: Publish review commands in help/completions and lock discoverability regression

**Published `/gsd review` and `/gsd review-status` in the catalog/help surfaces and added a regression test that keeps them discoverable.**

## What Happened

I first reran the carried-forward strip-types commands from T01/T02 before making changes. Both passed, which confirmed the earlier harness failures were cleared and let me finish T03 on top of the real current state instead of stale failure assumptions.

I then updated `gsd-2/src/resources/extensions/gsd/commands/catalog.ts` so the one-line command description and `TOP_LEVEL_SUBCOMMANDS` both expose `review` and `review-status` as first-class top-level commands. I kept the descriptions aligned with the dedicated review handler semantics rather than using vague placeholder copy.

Next, I updated `gsd-2/src/resources/extensions/gsd/commands/handlers/review.ts` to publish explicit syntax/description constants and corrected the visible `review-status` syntax to include the explicit `review/<review-id>` path that the runtime target parser actually accepts. I mirrored that exact syntax and intent in `gsd-2/src/resources/extensions/gsd/commands/handlers/core.ts` so `/gsd help` now documents both review commands clearly.

Finally, I added `gsd-2/src/resources/extensions/gsd/tests/review-command-discoverability.test.ts`. The test proves four discoverability surfaces stay in sync: the top-level command description string, `TOP_LEVEL_SUBCOMMANDS`, top-level completions returned for `rev`, and the static `/gsd help` text in `core.ts`. I initially tried importing `showHelp()` directly, but the tandem strip-types harness pulled a broader setup dependency chain and failed before assertions; I kept the test focused by asserting the static help source instead and recorded that harness gotcha as `L003` in `.gsd/KNOWLEDGE.md`.

I also filled the missing `## Observability Impact` section in `.gsd/milestones/M002/slices/S02/tasks/T03-PLAN.md`, marked T03 complete in `.gsd/milestones/M002/slices/S02/S02-PLAN.md`, and confirmed the full slice verification matrix passes now that T03 is in place.

## Verification

I verified the task-specific discoverability test and grep contract, then ran both slice-level verification commands. All passed.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `node --import ../../../../../repos/gsd-2/src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test ../../../../../repos/gsd-2/src/resources/extensions/gsd/tests/review-command-discoverability.test.ts` | 0 | ✅ pass | 363ms |
| 2 | `rg -n "review-status|/gsd review|/gsd help|GSD_COMMAND_DESCRIPTION" ../../../../../repos/gsd-2/src/resources/extensions/gsd/commands/catalog.ts ../../../../../repos/gsd-2/src/resources/extensions/gsd/commands/handlers/core.ts ../../../../../repos/gsd-2/src/resources/extensions/gsd/commands/handlers/review.ts` | 0 | ✅ pass | 5ms |
| 3 | `node --import ../../../../../repos/gsd-2/src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test ../../../../../repos/gsd-2/src/resources/extensions/gsd/tests/review-runtime.test.ts ../../../../../repos/gsd-2/src/resources/extensions/gsd/tests/review-command.test.ts ../../../../../repos/gsd-2/src/resources/extensions/gsd/tests/auto-review-gate.test.ts` | 0 | ✅ pass | 413ms |
| 4 | `node --import ../../../../../repos/gsd-2/src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test ../../../../../repos/gsd-2/src/resources/extensions/gsd/tests/review-status-command.test.ts ../../../../../repos/gsd-2/src/resources/extensions/gsd/tests/review-command-discoverability.test.ts` | 0 | ✅ pass | 393ms |

## Diagnostics

Inspect these surfaces if discoverability regresses later:

- `gsd-2/src/resources/extensions/gsd/commands/catalog.ts` for `GSD_COMMAND_DESCRIPTION`, `TOP_LEVEL_SUBCOMMANDS`, and top-level completion behavior.
- `gsd-2/src/resources/extensions/gsd/commands/handlers/core.ts` for `/gsd help` text.
- `gsd-2/src/resources/extensions/gsd/commands/handlers/review.ts` for the authoritative review command syntax/description constants.
- `gsd-2/src/resources/extensions/gsd/tests/review-command-discoverability.test.ts` for the regression proof.
- `.gsd/KNOWLEDGE.md` entry `L003` for the tandem strip-types harness constraint around importing `core.ts` in narrow tests.

## Deviations

- The discoverability regression test validates the static help source in `core.ts` instead of importing `showHelp()` directly. That was an intentional harness adaptation after a focused import of `core.ts` pulled broader setup modules and failed before the discoverability assertions could run.

## Known Issues

- None.

## Files Created/Modified

- `/home/cari/repos/gsd-2/src/resources/extensions/gsd/commands/catalog.ts` — added `review` and `review-status` to the top-level command description and completion/catalog entries.
- `/home/cari/repos/gsd-2/src/resources/extensions/gsd/commands/handlers/core.ts` — documented both manual review commands in `/gsd help` with the real accepted target syntax.
- `/home/cari/repos/gsd-2/src/resources/extensions/gsd/commands/handlers/review.ts` — published synchronized review syntax/description constants and corrected the status usage string to include `review/<review-id>`.
- `/home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/review-command-discoverability.test.ts` — added a focused regression test for command description, catalog, completions, and help discoverability.
- `/home/cari/repos/tandem2/.gsd/worktrees/M002/.gsd/milestones/M002/slices/S02/tasks/T03-PLAN.md` — added the missing `## Observability Impact` section required by the pre-flight note.
- `/home/cari/repos/tandem2/.gsd/worktrees/M002/.gsd/milestones/M002/slices/S02/S02-PLAN.md` — marked T03 complete.
- `/home/cari/repos/tandem2/.gsd/worktrees/M002/.gsd/KNOWLEDGE.md` — recorded the `core.ts` help-test harness gotcha as `L003`.
