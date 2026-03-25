# S03 Replan — blocked-review policy and gate continuity

## Blocker discovered

- **Discovered in:** `T01`
- **Blocker:** the assigned tandem worktree does not contain the targeted `src/resources/extensions/gsd/...` source and test files that the original remaining tasks expected to edit and verify.
- **Impact:** the original `T02` and `T03` could not be executed as written because every implementation and test command pointed at files that are absent from this sandboxed worktree. Per the blocker summary, work must stay inside the assigned directory and must not edit the external `gsd-2` checkout directly.

## What changed and why

The remaining plan now starts by restoring the missing execution substrate inside this worktree before resuming the original implementation work.

1. **Added a new prerequisite task at `T02`** to materialize or otherwise land the required `gsd-2` extension subtree and tests inside this sandbox, verify the needed files exist locally, and record the source handoff/provenance.
2. **Moved the original finalize-loop implementation work to `T03`** so it only starts after the local source tree exists and all paths can stay in-worktree and relative.
3. **Moved the original paused-state/manual-status continuity work to `T04`** for the same reason: it still belongs to S03, but it is downstream of the source-availability prerequisite.
4. **Retargeted verification commands to local relative paths** so the slice no longer depends on `/home/cari/repos/gsd-2/...` during execution.

This keeps the slice goal intact while making the plan honest about the discovered blocker: S03 cannot deliver policy/continuity behavior until the actual extension files exist in the assigned worktree.

## Incomplete-task changes

### Modified

- **`T02`**
  - **Before:** wire the real finalize loop to honor blocked-review policy.
  - **After:** restore the missing sandbox source/test substrate for S03 and record a local handoff manifest.
  - **Why:** the finalize-loop work cannot start until the target files exist locally.

- **`T03`**
  - **Before:** persist paused review state and restore manual status continuity.
  - **After:** wire the local finalize loop to honor blocked-review policy.
  - **Why:** this is the original highest-risk implementation task, but it must come after the source handoff.

### Added

- **`T04`**
  - **Purpose:** move the original paused review-state persistence/manual status continuity work behind the new source-availability prerequisite.
  - **Why:** restart/status continuity is still required for S03, but it depends on the same missing local extension files.

### Removed

- None. The original implementation goals remain necessary; they were reordered and reframed around the source-availability blocker instead of being dropped.

## New risks and considerations

- **Snapshot drift risk:** if the sandboxed `src/resources/extensions/gsd/...` tree is copied from the wrong `gsd-2` revision, S03 work could be implemented against stale interfaces.
- **Partial handoff risk:** a subset of files is not enough. The source handoff must include the production files, tests, and the local test harness (`resolve-ts.mjs`) referenced by slice verification.
- **Path-discipline risk:** all future commands must stay relative to this worktree. Any lingering absolute references to `/home/cari/repos/gsd-2/...` will reintroduce the blocker.
- **Continuity coupling risk:** once the local tree is present, `T03` and `T04` still need to preserve one shared `ReviewGateState` contract so auto-mode and `/gsd review-status` do not fork into separate state models.

## Resulting plan shape

- `T01` remains the completed blocker-discovery record exactly as-is.
- `T02` now creates the missing local execution substrate.
- `T03` then lands blocked-policy behavior in the real finalize seam.
- `T04` finishes paused-state persistence and manual-status continuity.
