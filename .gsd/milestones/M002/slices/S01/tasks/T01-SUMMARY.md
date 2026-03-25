---
id: T01
parent: S01
milestone: M002
provides:
  - First-class review preference schema for broker-backed gating
  - Runtime-owned normalized review decision/status contract
key_files:
  - ../../../../../repos/gsd-2/src/resources/extensions/gsd/preferences-types.ts
  - ../../../../../repos/gsd-2/src/resources/extensions/gsd/preferences-validation.ts
  - ../../../../../repos/gsd-2/src/resources/extensions/gsd/preferences.ts
  - ../../../../../repos/gsd-2/src/resources/extensions/gsd/review/types.ts
  - ../../../../../repos/gsd-2/src/resources/extensions/gsd/tests/review-preferences.test.ts
key_decisions:
  - Kept review configuration in a dedicated top-level `review` block instead of overloading verification settings.
  - Represented blocked-review behavior as a `mode-default` policy that resolves to `auto-loop` for autonomous runs and `intervene` for human-driven runs.
patterns_established:
  - Use `resolveReviewPreferences()` to turn sparse preference input into canonical runtime defaults.
  - Keep broker review normalization in a runtime-owned `review/types.ts` module with explicit allow/block/error outcomes.
observability_surfaces:
  - `validatePreferences()` review-field errors and unknown-key warnings
  - `resolveReviewPreferences()` canonical default resolution
  - `src/resources/extensions/gsd/tests/review-preferences.test.ts`
duration: 1h20m
verification_result: partial
completed_at: 2026-03-21T18:36:00-07:00
blocker_discovered: false
---

# T01: Define review preferences and normalized gate contract

**Added a first-class review preference surface and normalized review outcome contract for broker-backed gating.**

## What Happened

I first patched the task-plan artifacts the executor contract flagged: S01 now includes an explicit failure-path verification command, and T01 now records its observability impact. Then I implemented the real review config surface in the bundled `gsd` extension by adding a dedicated top-level `review` block, validation for transport/gate/blocked-policy settings, merge support plus a `resolveReviewPreferences()` defaulting helper, and a new runtime-owned `review/types.ts` module with explicit allow/block/error outcomes and status snapshots. I also updated the editable preferences template, the preference reference docs, and added a focused `review-preferences.test.ts` file covering schema validation, merge behavior, defaults, and contract/doc presence.

## Verification

I ran the task’s concrete checks from the mandated tandem worktree. The structural grep passed and confirms the new review key/types exist in the expected source files. The focused Node test invocation failed before executing assertions because importing `gsd-2`’s `preferences.ts` from this worktree could not resolve the `yaml` package dependency (`ERR_MODULE_NOT_FOUND`). The implementation itself is on disk, but the environment-specific module resolution problem prevented full green verification from this execution context.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `node --import ../../../../../repos/gsd-2/src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test ../../../../../repos/gsd-2/src/resources/extensions/gsd/tests/review-preferences.test.ts` | 1 | ❌ fail | 172ms |
| 2 | `rg -n '"review"\|review\?:\|interface .*Review' ../../../../../repos/gsd-2/src/resources/extensions/gsd/preferences-types.ts ../../../../../repos/gsd-2/src/resources/extensions/gsd/review/types.ts` | 0 | ✅ pass | n/a |

## Diagnostics

- Review config surface: `../../../../../repos/gsd-2/src/resources/extensions/gsd/preferences-types.ts`
- Runtime defaults: `../../../../../repos/gsd-2/src/resources/extensions/gsd/preferences.ts` → `resolveReviewPreferences()`
- Validation/failure visibility: `../../../../../repos/gsd-2/src/resources/extensions/gsd/preferences-validation.ts`
- Normalized review contract: `../../../../../repos/gsd-2/src/resources/extensions/gsd/review/types.ts`
- Focused proof file: `../../../../../repos/gsd-2/src/resources/extensions/gsd/tests/review-preferences.test.ts`
- Environment gap to inspect next: `ERR_MODULE_NOT_FOUND` for `yaml` when the test imports `../../../../../repos/gsd-2/src/resources/extensions/gsd/preferences.ts` from the mandated tandem worktree context.

## Deviations

- I added `resolveReviewPreferences()` in `preferences.ts` so the documented review defaults live in code instead of only in prose. This is a small local adaptation beyond the literal file list intent, but it stays inside the task’s merge/default-handling scope.

## Known Issues

- Full Node-test verification from this worktree is currently blocked by module resolution for `yaml` when importing `gsd-2` files through the mandated tandem worktree context.
- Because of the context-budget cutoff, I stopped after the first verification pass and did not do an additional repair loop on that environment issue.

## Files Created/Modified

- `.gsd/milestones/M002/slices/S01/S01-PLAN.md` — added an explicit slice-level failure-path verification command.
- `.gsd/milestones/M002/slices/S01/tasks/T01-PLAN.md` — added the missing Observability Impact section.
- `../../../../../repos/gsd-2/src/resources/extensions/gsd/preferences-types.ts` — added the dedicated review preference schema and known-key registration.
- `../../../../../repos/gsd-2/src/resources/extensions/gsd/preferences-validation.ts` — added review-block validation, nested-key warnings, and blocked-policy checks.
- `../../../../../repos/gsd-2/src/resources/extensions/gsd/preferences.ts` — added review-block merge handling and canonical runtime default resolution.
- `../../../../../repos/gsd-2/src/resources/extensions/gsd/review/types.ts` — added normalized review transport, policy, status, and allow/block/error contract types.
- `../../../../../repos/gsd-2/src/resources/extensions/gsd/templates/preferences.md` — documented the editable review block in the template.
- `../../../../../repos/gsd-2/src/resources/extensions/gsd/docs/preferences-reference.md` — documented review fields, defaults, merge behavior, and an example.
- `../../../../../repos/gsd-2/src/resources/extensions/gsd/tests/review-preferences.test.ts` — added focused tests for review config and contract coverage.
