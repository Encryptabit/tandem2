---
estimated_steps: 4
estimated_files: 12
skills_used:
  - gsd
  - debug-like-expert
  - review
---

# T02: Restore the missing sandbox source/test substrate for S03

**Slice:** S03 — Blocked-review policy and gate continuity
**Milestone:** M002

## Description

Unblock the slice by making the targeted `gsd-2` extension files exist inside this tandem worktree. T01 showed the remaining tasks cannot run because the planned `src/resources/extensions/gsd/...` files and tests are absent from the sandbox. This task lands the required local subtree, records its provenance, and ensures the rest of S03 can use only relative in-worktree paths.

## Steps

1. Materialize the minimum required `src/resources/extensions/gsd/...` production files and tests inside this worktree, including the local test harness at `src/resources/extensions/gsd/tests/resolve-ts.mjs`, without editing outside the assigned directory.
2. Verify that the exact files referenced by S03 now exist locally: review gate/runtime/types, auto loop/session/verification, review command handler, and the focused test files for gate/loop/status continuity.
3. Record the source provenance, commit/snapshot identity if known, and the local file manifest in `.gsd/milestones/M002/slices/S03/S03-SOURCE-HANDOFF.md` so future agents know which `gsd-2` snapshot the sandboxed tree came from.
4. Normalize any remaining slice execution notes to local relative paths only so no future task depends on `/home/cari/repos/gsd-2/...`.

## Must-Haves

- [ ] The required `src/resources/extensions/gsd/...` files exist inside this worktree before any implementation task starts.
- [ ] The local handoff note records enough provenance to detect snapshot drift later.
- [ ] S03 verification can be expressed entirely with relative in-worktree paths after this task completes.

## Verification

- `test -f src/resources/extensions/gsd/auto-loop.ts && test -f src/resources/extensions/gsd/auto.ts && test -f src/resources/extensions/gsd/auto/session.ts && test -f src/resources/extensions/gsd/auto-verification.ts`
- `test -f src/resources/extensions/gsd/review/gate.ts && test -f src/resources/extensions/gsd/review/runtime.ts && test -f src/resources/extensions/gsd/review/types.ts && test -f src/resources/extensions/gsd/commands/handlers/review.ts`
- `test -f src/resources/extensions/gsd/tests/resolve-ts.mjs && test -f src/resources/extensions/gsd/tests/auto-loop.test.ts && test -f src/resources/extensions/gsd/tests/review-status-command.test.ts`

## Observability Impact

- Signals added/changed: a local source-handoff artifact now proves the slice is working against a concrete sandboxed snapshot rather than an external checkout.
- How a future agent inspects this: read `.gsd/milestones/M002/slices/S03/S03-SOURCE-HANDOFF.md` and run the file-existence probes above.
- Failure state exposed: missing or partial source handoff becomes an explicit precondition failure instead of surfacing later as missing-file errors during implementation.

## Inputs

- `.gsd/milestones/M002/slices/S03/S03-PLAN.md` — replanned slice contract naming the required local files and relative verification paths.
- `.gsd/milestones/M002/slices/S03/tasks/T01-SUMMARY.md` — blocker record proving the source/test tree is currently missing.
- `.gsd/KNOWLEDGE.md` — workspace-level knowledge log containing the same blocker pattern.

## Expected Output

- `src/resources/extensions/gsd/...` — required local extension files present in the sandbox.
- `src/resources/extensions/gsd/tests/...` — focused local tests and `resolve-ts.mjs` present in the sandbox.
- `.gsd/milestones/M002/slices/S03/S03-SOURCE-HANDOFF.md` — provenance and manifest for the local source handoff.
