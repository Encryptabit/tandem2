---
id: T01
parent: S04
milestone: M001
provides:
  - Canonical broker operation registry with shared method/tool/schema metadata and typed lookup helpers
key_files:
  - packages/review-broker-core/src/operations.ts
  - packages/review-broker-core/src/operations.js
  - packages/review-broker-core/test/contracts.test.ts
  - packages/review-broker-core/test/reviewer-contracts.test.ts
  - packages/review-broker-core/package.json
  - pnpm-lock.yaml
key_decisions:
  - Export one `BROKER_OPERATIONS` catalog from core and derive all method/tool lookups from it instead of maintaining per-surface operation lists
patterns_established:
  - Freeze broker method names, MCP tool names, and request/response schema pairings in core contract tests before adding new client or MCP surfaces
observability_surfaces:
  - packages/review-broker-core/src/operations.ts
  - packages/review-broker-core/test/contracts.test.ts
  - packages/review-broker-core/test/reviewer-contracts.test.ts
  - packages/review-broker-server/src/cli/start-broker.ts --once
duration: 30m
verification_result: passed
completed_at: 2026-03-21T06:38:14-07:00
blocker_discovered: false
---

# T01: Freeze a shared broker operation registry and unblock MCP schema compatibility

**Added a shared broker operation registry with frozen method, MCP tool, and schema mappings in `review-broker-core`.**

## What Happened

I fixed the required pre-flight observability gaps first by adding an explicit broker smoke verification step to `S04-PLAN.md` and by adding an `## Observability Impact` section to `T01-PLAN.md`.

For the implementation itself, I added `packages/review-broker-core/src/operations.ts` and `packages/review-broker-core/src/operations.js` as the canonical operation catalog. Each entry now carries the broker `methodName`, the snake_case `mcpToolName`, and the shared request/response Zod schemas. I also exported derived method/tool-name arrays, lookup maps, and parse helpers so later typed-client and MCP code can iterate or resolve operations without re-describing schema pairings.

I exposed the registry from the package root, aligned `packages/review-broker-core/package.json` to the MCP SDK-compatible Zod range (`^3.25.0`), refreshed `pnpm-lock.yaml`, and extended both core contract suites so the operation list, external MCP names, and schema pairings are mechanically frozen alongside the pre-existing review and reviewer vocabulary.

I also recorded the downstream-facing implementation choice in `.gsd/DECISIONS.md` because later S04 tasks will consume this exact registry shape.

## Verification

Task-level verification passed in full:
- Ran the core contract tests for review and reviewer schemas.
- Ran the `review-broker-core` TypeScript build.

Slice-level verification was also executed for intermediate-task tracking:
- The new core contract command passes.
- `broker:smoke` passes and still surfaces startup/once-complete diagnostics.
- The not-yet-implemented client and MCP verification commands fail as expected because those files do not exist yet.
- An existing server lifecycle parity suite still fails on timestamp expectations in `packages/review-broker-server/test/review-lifecycle-parity.test.ts`; this is outside T01’s core-registry scope and is documented below for follow-up.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-core/test/contracts.test.ts packages/review-broker-core/test/reviewer-contracts.test.ts` | 0 | ✅ pass | 364ms |
| 2 | `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 --filter review-broker-core run build` | 0 | ✅ pass | 2.4s |
| 3 | `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-client/test/in-process-client.test.ts` | 1 | ❌ fail | 6.3s |
| 4 | `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-server/test/mcp-server.test.ts packages/review-broker-server/test/client-mcp-parity.test.ts` | 1 | ❌ fail | 6.3s |
| 5 | `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-server/test/review-lifecycle-parity.test.ts packages/review-broker-server/test/reviewer-lifecycle.test.ts packages/review-broker-server/test/reviewer-recovery.test.ts packages/review-broker-server/test/start-broker.smoke.test.ts` | 1 | ❌ fail | 1.03s |
| 6 | `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 broker:smoke` | 0 | ✅ pass | 6.3s |

## Diagnostics

Inspect `packages/review-broker-core/src/operations.ts` for the canonical registry and the derived `BROKER_OPERATIONS`, `BROKER_OPERATION_METHOD_NAMES`, `BROKER_OPERATION_MCP_TOOL_NAMES`, and lookup helpers.

If later work introduces drift, rerun:
- `packages/review-broker-core/test/contracts.test.ts`
- `packages/review-broker-core/test/reviewer-contracts.test.ts`

For runtime inspection outside core, `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 broker:smoke` still emits the existing structured `broker.started` and `broker.once_complete` JSON diagnostics, including startup recovery and snapshot counts.

## Deviations

Updated `.gsd/milestones/M001/slices/S04/S04-PLAN.md` and `.gsd/milestones/M001/slices/S04/tasks/T01-PLAN.md` before implementation to satisfy the task contract’s required observability-gap fixes.

## Known Issues

- `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-client/test/in-process-client.test.ts` fails because the `review-broker-client` package and test file are not created until T02.
- `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-server/test/mcp-server.test.ts packages/review-broker-server/test/client-mcp-parity.test.ts` fails because the MCP server surface and parity tests are not created until T03/T04.
- `packages/review-broker-server/test/review-lifecycle-parity.test.ts` currently fails on `lastActivityAt` / `lastMessageAt` timestamp expectations during existing runtime lifecycle flows; reviewer lifecycle and broker smoke coverage still pass, so this appears to be a separate pre-existing lifecycle assertion mismatch rather than a T01 registry regression.

## Files Created/Modified

- `.gsd/milestones/M001/slices/S04/S04-PLAN.md` — added an explicit broker smoke verification command for slice-level diagnostics.
- `.gsd/milestones/M001/slices/S04/tasks/T01-PLAN.md` — added the missing `## Observability Impact` section.
- `.gsd/DECISIONS.md` — recorded the T01 registry-shape decision for downstream tasks.
- `packages/review-broker-core/package.json` — updated the Zod range to `^3.25.0` for MCP SDK compatibility.
- `packages/review-broker-core/src/operations.ts` — added the canonical typed broker operation registry and helper APIs.
- `packages/review-broker-core/src/operations.js` — added the checked-in runtime sibling for the registry.
- `packages/review-broker-core/src/index.ts` — exported the new registry surface.
- `packages/review-broker-core/src/index.js` — exported the new registry surface for runtime imports.
- `packages/review-broker-core/test/contracts.test.ts` — froze review operation names, MCP tool names, and schema pairings.
- `packages/review-broker-core/test/reviewer-contracts.test.ts` — froze reviewer operation pairings and reverse MCP lookups.
- `pnpm-lock.yaml` — refreshed the lockfile importer specifier for the Zod range update.
