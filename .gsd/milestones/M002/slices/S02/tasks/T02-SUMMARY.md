---
id: T02
parent: S02
milestone: M002
provides:
  - `/gsd review-status` runtime and handler wiring over live gate state plus broker lookups
  - A read-only `auto.ts` accessor for the singleton `AutoSession.reviewGateState`
  - Test-harness shims for MCP/pi package imports in the tandem strip-types environment
key_files:
  - /home/cari/repos/gsd-2/src/resources/extensions/gsd/auto.ts
  - /home/cari/repos/gsd-2/src/resources/extensions/gsd/review/runtime.ts
  - /home/cari/repos/gsd-2/src/resources/extensions/gsd/commands/handlers/review.ts
  - /home/cari/repos/gsd-2/src/resources/extensions/gsd/commands/handlers/ops.ts
  - /home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/review-status-command.test.ts
  - /home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/auto-review-gate.test.ts
  - /home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/dist-redirect.mjs
  - /home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/mcp-sdk-shim.mjs
  - /home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/pi-package-shim.mjs
key_decisions:
  - Kept the production MCP client imports in `review/runtime.ts` and pushed tandem-worktree compatibility into the strip-types test loader instead of weakening the shipped runtime seam.
  - Avoided `commands/context.ts` in the review handler once it became clear that its runtime imports drag `auto.ts` and unrelated secure-env dependencies into focused command tests.
patterns_established:
  - Manual status resolution prefers the live gate state for unit/review targeting, then refreshes broker state through the same normalized `getReviewStatus()` path when a review ID is available.
  - Strip-types verification from this tandem worktree needs narrow shims for external package aliases rather than redirecting broad package trees into raw TypeScript source.
observability_surfaces:
  - /gsd review-status command output
  - getAutoReviewGateState() in auto.ts
  - review-status-command.test.ts and auto-review-gate.test.ts
  - .gsd/KNOWLEDGE.md
duration: partial
verification_result: failed
completed_at: 2026-03-22T02:29:50Z
blocker_discovered: false
---

# T02: Add `/gsd review-status` and reuse live gate state

**Added the live-state-backed `/gsd review-status` seam and tandem test-loader shims, but verification is still incomplete under the strip-types harness.**

## What Happened

I added a read-only `getAutoReviewGateState()` export in `gsd-2/src/resources/extensions/gsd/auto.ts` so command code can inspect the singleton auto-session review state without mutating `AutoSession` internals. In `review/runtime.ts` I added status-target resolution for live session state, explicit unit IDs, and explicit review IDs, plus a `readReviewStatus()` helper that reuses the existing normalized broker status path when it has a review ID and falls back to explicit normalized live-state or missing-state errors otherwise.

I rewrote `commands/handlers/review.ts` to keep `/gsd review` working, add `/gsd review-status`, format phase/status/decision/summary/error output, and lazily read live gate state instead of coupling the handler directly to `AutoSession`. I also wired the real `review-status` route in `commands/handlers/ops.ts` so the command can actually run.

For focused tests, I added `review-status-command.test.ts`, extended `auto-review-gate.test.ts` to exercise the shared live gate-state contract, and added tandem-only loader shims (`dist-redirect.mjs`, `mcp-sdk-shim.mjs`, `pi-package-shim.mjs`) after the prior S01 failure reproduced on the missing MCP SDK package.

I then ran the verification commands. The harness moved past the original MCP import failure, but the strip-types environment still failed before assertions because broader dependency aliasing in the tandem worktree test setup is incomplete. I made one more narrowing pass by removing the review handler’s dependency on `commands/context.ts` and by extending the package shims, but I did **not** rerun the full test matrix after those final edits because the context-budget warning fired and I had to wrap up this unit.

## Verification

I attempted the carried-forward S01 review-runtime/review-command test command, the T02 review-status/auto-review-gate test command, and the task-plan grep proof. Both Node test commands failed in the tandem strip-types harness before meaningful assertions completed; the grep proof passed and confirms the new accessor/handler/test surfaces are on disk.

Because the context-budget warning interrupted execution, the latest shim and `review.ts` narrowing edits were not re-verified by rerunning the Node commands. The next agent should rerun both exact test commands first before making any additional code changes.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `node --import /home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test /home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/review-runtime.test.ts /home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/review-command.test.ts` | 1 | ❌ fail | n/a |
| 2 | `node --import /home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test /home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/review-status-command.test.ts /home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/auto-review-gate.test.ts` | 1 | ❌ fail | n/a |
| 3 | `rg -n "reviewGateState|review-status|decision|summary|error" /home/cari/repos/gsd-2/src/resources/extensions/gsd/auto.ts /home/cari/repos/gsd-2/src/resources/extensions/gsd/commands/handlers/review.ts /home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/review-status-command.test.ts` | 0 | ✅ pass | n/a |

## Diagnostics

Resume here:

1. Rerun these two commands exactly, **without further edits first**:
   - `node --import /home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test /home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/review-runtime.test.ts /home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/review-command.test.ts`
   - `node --import /home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test /home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/review-status-command.test.ts /home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/auto-review-gate.test.ts`
2. If they still fail in the harness, inspect these files together before changing code again:
   - `/home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/dist-redirect.mjs`
   - `/home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/pi-package-shim.mjs`
   - `/home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/mcp-sdk-shim.mjs`
   - `/home/cari/repos/gsd-2/src/resources/extensions/gsd/commands/handlers/review.ts`
3. The new non-obvious tandem harness rule is recorded in `.gsd/KNOWLEDGE.md` as `L002`.

## Deviations

- I touched `/home/cari/repos/gsd-2/src/resources/extensions/gsd/commands/handlers/ops.ts` even though it was not listed in the T02 expected-output file list, because the shipped `/gsd review-status` command needs a real dispatcher route to work at runtime.
- I also added tandem-only test loader shims under `gsd-2/src/resources/extensions/gsd/tests/` to address the existing harness import mismatch from T01 before command assertions could run.

## Known Issues

- The tandem strip-types test harness is still not fully re-verified after the last shim/base-path cleanup edits; the final observed failures were harness-import related rather than review-runtime assertion failures.
- `review.ts` now avoids `commands/context.ts`, but that narrowing change was made after the last Node test run and still needs confirmation.
- Slice-level verification is still incomplete for T02 because the focused Node commands were failing before assertions and the T03 discoverability command has not been attempted in this task.

## Files Created/Modified

- `/home/cari/repos/gsd-2/src/resources/extensions/gsd/auto.ts` — added `getAutoReviewGateState()` as a read-only accessor over the singleton auto-session review state.
- `/home/cari/repos/gsd-2/src/resources/extensions/gsd/review/runtime.ts` — added live-state-aware status target resolution and `readReviewStatus()` over the shared normalized review contract.
- `/home/cari/repos/gsd-2/src/resources/extensions/gsd/commands/handlers/review.ts` — implemented `/gsd review-status`, formatted live/broker status output, and narrowed default base-path resolution away from `commands/context.ts`.
- `/home/cari/repos/gsd-2/src/resources/extensions/gsd/commands/handlers/ops.ts` — routed `review-status` through the operational command dispatcher.
- `/home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/review-status-command.test.ts` — added focused manual status command tests for live-state reuse, missing-live-state visibility, and sanitized broker failures.
- `/home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/auto-review-gate.test.ts` — extended the gate tests to prove manual status reads can consume `session.reviewGateState` directly.
- `/home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/dist-redirect.mjs` — added tandem-only loader redirects for MCP and `pi-*` package shims.
- `/home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/mcp-sdk-shim.mjs` — added a minimal MCP client shim for strip-types test loading.
- `/home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/pi-package-shim.mjs` — added a lightweight shim for `@gsd/pi-*` and `@sinclair/typebox` package aliases in the tandem test harness.
- `/home/cari/repos/tandem2/.gsd/worktrees/M002/.gsd/KNOWLEDGE.md` — recorded the `commands/context.ts` → `auto.ts` harness-coupling lesson as `L002`.
