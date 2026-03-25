---
id: T02
parent: S02
milestone: M003
provides:
  - Typed client and MCP callers can request one broker-owned runtime continuity snapshot that exposes current ownership, reviewer state, action-required cases, and recent recovery activity without stitching generic list APIs together.
key_files:
  - packages/review-broker-core/src/contracts.ts
  - packages/review-broker-core/src/operations.ts
  - packages/review-broker-server/src/runtime/broker-service.ts
  - packages/review-broker-core/test/runtime-continuity-contracts.test.ts
  - packages/review-broker-server/test/client-mcp-parity.test.ts
  - packages/review-broker-server/test/mcp-server.test.ts
key_decisions:
  - Keep the new continuity inspection response argv-safe by exposing continuity reviewer snapshots with `commandBasename` and timestamps/session IDs, but not reviewer args or raw command text.
patterns_established:
  - Additive broker operations can project an existing runtime read model through `review-broker-core` schemas/registry, then let the typed client and MCP surface pick it up automatically once `BrokerService` implements the new method.
observability_surfaces:
  - packages/review-broker-server/src/runtime/broker-service.ts inspectRuntimeContinuity()
  - inspect_runtime_continuity MCP tool and typed client method
  - packages/review-broker-core/test/runtime-continuity-contracts.test.ts
  - packages/review-broker-server/test/client-mcp-parity.test.ts
  - packages/review-broker-server/test/mcp-server.test.ts
duration: 16m
verification_result: passed
completed_at: 2026-03-24T01:47:44-07:00
blocker_discovered: false
---

# T02: Publish a dedicated continuity inspection operation across broker surfaces

**Added a dedicated, continuity-safe runtime inspection operation across the broker core, typed client, and MCP surfaces.**

## What Happened

I first verified the local T02 baseline and found two local-reality mismatches from the planner snapshot: the core contract test file named in the plan did not exist yet, and the existing parity test was still asserting an outdated reviewer-kill/reclaim behavior. I then added an additive `inspectRuntimeContinuity` broker contract in `packages/review-broker-core/src/contracts.ts` and `packages/review-broker-core/src/operations.ts`, with response shapes that reuse the T01 recovery snapshot while adding reviewer-state data in an argv-safe form (`commandBasename`, session IDs, statuses, timestamps, current review IDs, but no args or raw command strings).

On the server side, I extended `packages/review-broker-server/src/runtime/broker-service.ts` with `inspectRuntimeContinuity()` so the shared operation registry could expose the same runtime snapshot through both the typed client and MCP without bespoke client wiring. The method projects the existing T01 continuity read model and augments it with continuity-safe reviewer snapshots plus reviewer status counts.

I then regenerated the checked-in `packages/review-broker-core/src/contracts.js`, `packages/review-broker-core/src/operations.js`, and `packages/review-broker-core/src/index.js` mirrors from the updated TypeScript sources, and rebuilt `packages/review-broker-core/dist` so workspace-package imports used by server runtime/tests could see the new named exports.

Finally, I added `packages/review-broker-core/test/runtime-continuity-contracts.test.ts` and extended the parity/MCP coverage so the new operation is exercised through the real typed-client and MCP tool paths. While doing that, I aligned the parity proof to the shipped continuity contract: `submitted` work detaches and becomes action-required when recovery actually runs, while reviewers that are already offline can leave the runtime with no new recovery event yet; in both cases the typed client and MCP now match the runtime service exactly.

## Verification

I verified the new contract lane directly: the new runtime continuity contract test passes, the typed-client/MCP parity lane passes, and the MCP stdio coverage passes with the new `inspect_runtime_continuity` tool. I also ran the slice-level verification gate to capture honest mid-slice status: the restart/smoke/runtime continuity lane still passes, the workspace build passes, and `start-broker.ts --once` still emits the richer runtime continuity snapshot. The T03 continuity CLI verification remains red because `packages/review-broker-server/test/continuity-cli.test.ts` and `src/cli/inspect-continuity.ts` are still downstream work.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M003 exec vitest run packages/review-broker-server/test/restart-persistence.test.ts packages/review-broker-server/test/start-broker.smoke.test.ts packages/review-broker-server/test/runtime-continuity-inspection.test.ts` | 0 | ✅ pass | 1.80s |
| 2 | `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M003 exec vitest run packages/review-broker-core/test/runtime-continuity-contracts.test.ts packages/review-broker-server/test/client-mcp-parity.test.ts packages/review-broker-server/test/mcp-server.test.ts` | 0 | ✅ pass | 3.79s |
| 3 | `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M003 exec vitest run packages/review-broker-server/test/continuity-cli.test.ts` | 1 | ❌ fail | 0.47s |
| 4 | `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M003 build` | 0 | ✅ pass | 4.53s |
| 5 | `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M003 --filter review-broker-server exec tsx src/cli/start-broker.ts --db-path /home/cari/repos/tandem2/.gsd/worktrees/M003/.tmp/m003-s02-inspect.sqlite --once` | 0 | ✅ pass | 0.68s |
| 6 | `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M003 --filter review-broker-server exec tsx src/cli/inspect-continuity.ts --db-path /home/cari/repos/tandem2/.gsd/worktrees/M003/.tmp/m003-s02-inspect.sqlite --limit 10` | 1 | ❌ fail | 0.48s |
| 7 | `test -f /home/cari/repos/tandem2/.gsd/worktrees/M003/packages/review-broker-core/src/contracts.js` | 0 | ✅ pass | 0.00s |
| 8 | `corepack pnpm exec vitest run packages/review-broker-core/test/contracts.test.ts packages/review-broker-core/test/continuity-contracts.test.ts packages/review-broker-core/test/reviewer-contracts.test.ts` | 0 | ✅ pass | 0.94s |

## Diagnostics

Use `inspectRuntimeContinuity({ limit })` on the typed client or call the `inspect_runtime_continuity` MCP tool to inspect the broker-owned continuity payload. The response now exposes `reviewerCount`, `reviewerStatusCounts`, argv-safe `reviewers`, `actionRequiredReviewIds`, `recentRecoveryActivity`, and `recoveryReviews` without leaking reviewer args or raw command text. For cross-surface proof, rerun `packages/review-broker-core/test/runtime-continuity-contracts.test.ts`, `packages/review-broker-server/test/client-mcp-parity.test.ts`, and `packages/review-broker-server/test/mcp-server.test.ts`.

## Deviations

- I created `packages/review-broker-core/test/runtime-continuity-contracts.test.ts` because the local repo still only had `continuity-contracts.test.ts`, while the task plan and slice verification expected the new dedicated file.
- I rebuilt `packages/review-broker-core/dist` in this task because local server runtime/tests import `review-broker-core` through the workspace package name, and the new named export was otherwise invisible even after the checked-in `src/*.js` mirrors were regenerated.

## Known Issues

- `packages/review-broker-server/test/continuity-cli.test.ts` still does not exist, so that slice verification command remains red until T03 creates the CLI proof.
- `packages/review-broker-server/src/cli/inspect-continuity.ts` is still absent, so the slice-level continuity CLI command remains red until T03 lands.

## Files Created/Modified

- `packages/review-broker-core/src/contracts.ts` — added the additive runtime continuity request/response schemas and argv-safe reviewer snapshot shape.
- `packages/review-broker-core/src/operations.ts` — registered `inspectRuntimeContinuity` / `inspect_runtime_continuity` in the shared broker registry.
- `packages/review-broker-core/src/contracts.js` — regenerated the checked-in JS mirror for the continuity contract additions.
- `packages/review-broker-core/src/operations.js` — regenerated the checked-in JS mirror for the new operation.
- `packages/review-broker-core/src/index.js` — regenerated the checked-in JS mirror after the core export surface changed.
- `packages/review-broker-core/test/runtime-continuity-contracts.test.ts` — added contract proof for the new request/response schemas and registry entry.
- `packages/review-broker-core/test/contracts.test.ts` — updated the shared operation registry expectations to include the new continuity method/tool.
- `packages/review-broker-server/src/runtime/broker-service.ts` — implemented the broker service method that projects the runtime continuity snapshot plus continuity-safe reviewer state.
- `packages/review-broker-server/test/client-mcp-parity.test.ts` — added typed-client/MCP/runtime parity coverage for the new continuity operation and aligned reviewer recovery expectations to the shipped detach-vs-reclaim contract.
- `packages/review-broker-server/test/mcp-server.test.ts` — added MCP tool response coverage for `inspect_runtime_continuity`.
- `.gsd/DECISIONS.md` — recorded the continuity reviewer-state redaction decision.
- `.gsd/KNOWLEDGE.md` — recorded the `review-broker-core` export/dist rebuild gotcha after adding new named exports.
