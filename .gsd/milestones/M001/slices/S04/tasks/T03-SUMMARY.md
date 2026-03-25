---
id: T03
parent: S04
milestone: M001
provides:
  - Registry-driven stdio MCP server surface for the standalone broker plus checked-in project MCP config
key_files:
  - .mcp.json
  - packages/review-broker-server/src/cli/start-mcp.ts
  - packages/review-broker-server/src/mcp/server.ts
  - packages/review-broker-server/src/mcp/tool-dispatch.ts
  - packages/review-broker-server/test/mcp-server.test.ts
  - packages/review-broker-server/package.json
  - package.json
key_decisions:
  - Use the published official `@modelcontextprotocol/sdk` package and its subpath exports because the split-package docs are ahead of the npm registry available in this harness
patterns_established:
  - Derive MCP tool registration directly from `BROKER_OPERATIONS`, and keep stderr-only MCP diagnostics focused on startup/dispatch failures because the official high-level SDK converts thrown tool errors into `isError` tool results
observability_surfaces:
  - .mcp.json
  - packages/review-broker-server/src/cli/start-mcp.ts
  - packages/review-broker-server/src/mcp/tool-dispatch.ts
  - packages/review-broker-server/test/mcp-server.test.ts
  - corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-server/test/mcp-server.test.ts
duration: 1h20m
verification_result: passed
completed_at: 2026-03-21T07:09:00-07:00
blocker_discovered: false
---

# T03: Expose the broker contract as stdio MCP tools and project MCP config

**Added a registry-driven stdio MCP server, CLI entrypoint, and checked-in `.mcp.json` wiring for the standalone broker.**

## What Happened

I first fixed the required pre-flight gap by adding a dedicated `packages/review-broker-server/test/mcp-server.test.ts` verification step to the slice plan so S04 now names an inspectable MCP failure-path check instead of only bundling MCP coverage into a broader command.

For the implementation, I added the MCP runtime surface under `packages/review-broker-server/src/mcp/`. `server.ts` now registers one MCP tool per shared core operation by iterating `BROKER_OPERATIONS`, so the server does not carry a second hand-maintained tool list. Each tool uses the core request and response schemas directly for registration, and `tool-dispatch.ts` routes calls to the existing `BrokerService` by canonical method name, returns exact shared payloads as `structuredContent`, emits minimal human-readable text content, and logs redacted failures to stderr only.

I added `packages/review-broker-server/src/cli/start-mcp.ts` as a dedicated stdio entrypoint that starts the existing broker runtime, connects the official MCP stdio transport, emits startup/transport/shutdown diagnostics to stderr only, and keeps stdout clean for MCP protocol traffic. I also exported the new MCP helpers from `packages/review-broker-server/src/index.ts`.

To make the surface discoverable to local tooling, I added a checked-in project `.mcp.json` entry and a root `broker:mcp` convenience script, plus package-level `start:mcp`/bin wiring in `packages/review-broker-server/package.json`.

For verification and future inspection, I added `packages/review-broker-server/test/mcp-server.test.ts`. The suite uses the official `StdioClientTransport` to spawn the real CLI, lists tools, drives representative reviewer and review operations over the MCP transport, verifies stderr-only startup and dispatch diagnostics, and proves startup-argument failures leave stdout protocol-clean.

One local adaptation was required during execution: the published official SDK in npm for this harness is still the monolithic `@modelcontextprotocol/sdk` package, so I used its `client/*`, `server/*`, and `types.js` subpath exports rather than the split-package names shown in newer migration docs.

## Verification

Task-level verification passed in full:
- `packages/review-broker-server/test/mcp-server.test.ts` passes against the real stdio CLI and official client transport.
- `review-broker-server` builds successfully with the new MCP surface.

Slice-level verification was rerun for intermediate tracking:
- Core contract tests still pass.
- The typed in-process client tests still pass.
- The dedicated MCP server test passes.
- The combined MCP/parity command currently exits 0, but only the existing `mcp-server.test.ts` executed in this task because `client-mcp-parity.test.ts` is still a T04 deliverable.
- The reviewer lifecycle, reviewer recovery, and broker smoke tests pass, but the pre-existing `review-lifecycle-parity.test.ts` timestamp assertions still fail outside T03’s MCP scope.
- `broker:smoke` still passes and preserves the existing structured startup/once-complete inspection surface.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-core/test/contracts.test.ts packages/review-broker-core/test/reviewer-contracts.test.ts` | 0 | ✅ pass | 351ms |
| 2 | `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-client/test/in-process-client.test.ts` | 0 | ✅ pass | 627ms |
| 3 | `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-server/test/mcp-server.test.ts` | 0 | ✅ pass | 5.22s |
| 4 | `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-server/test/mcp-server.test.ts packages/review-broker-server/test/client-mcp-parity.test.ts` | 0 | ✅ pass | 5.17s |
| 5 | `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-server/test/review-lifecycle-parity.test.ts packages/review-broker-server/test/reviewer-lifecycle.test.ts packages/review-broker-server/test/reviewer-recovery.test.ts packages/review-broker-server/test/start-broker.smoke.test.ts` | 1 | ❌ fail | 1.29s |
| 6 | `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 --filter review-broker-server run build` | 0 | ✅ pass | not captured |
| 7 | `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 broker:smoke` | 0 | ✅ pass | not captured |

## Diagnostics

Inspect these surfaces for T03 behavior and failure visibility:
- `.mcp.json` — checked-in project MCP discovery wiring.
- `packages/review-broker-server/src/cli/start-mcp.ts` — stderr-only MCP startup/transport/shutdown diagnostics.
- `packages/review-broker-server/src/mcp/server.ts` — registry-driven tool registration.
- `packages/review-broker-server/src/mcp/tool-dispatch.ts` — broker dispatch adapter and redacted stderr failure logging.
- `packages/review-broker-server/test/mcp-server.test.ts` — official-transport list/call coverage plus stdout-clean and startup-failure checks.

The official high-level MCP SDK behavior observed here is:
- schema-invalid or domain-invalid tool calls return `CallToolResult` with `isError: true` and text content on the client side,
- stderr-only server diagnostics are still available for startup and broker-dispatch failures, and
- stdout remains reserved for protocol traffic when the CLI is started normally.

## Deviations

- The task plan said to add the “official MCP SDK dependency”; locally, that had to mean the published monolithic `@modelcontextprotocol/sdk` package, because the split-package names shown in newer migration docs were not available from the npm registry in this harness.
- The official high-level SDK wraps thrown tool failures into `isError` tool results instead of rejected client promises, so the new failure-path test asserts that official behavior while still checking stderr-only diagnostics for dispatch/startup failures.

## Known Issues

- `packages/review-broker-server/test/review-lifecycle-parity.test.ts` still fails on `lastActivityAt` / `lastMessageAt` timestamp expectations (`submitted`, `approved`, and `closed` assertions). This was already present before T03 and remains outside this task’s MCP scope.
- `packages/review-broker-server/test/client-mcp-parity.test.ts` is still a T04 deliverable. The combined MCP/parity verification command returned 0 during this task, but the only exercised suite here was `mcp-server.test.ts`.

## Files Created/Modified

- `.gsd/milestones/M001/slices/S04/S04-PLAN.md` — added the dedicated MCP failure-path verification step and marked T03 complete.
- `.gsd/DECISIONS.md` — recorded the published official MCP SDK package-shape decision for downstream tasks.
- `.gsd/KNOWLEDGE.md` — recorded the official SDK package/import and `isError` tool-failure gotchas.
- `.mcp.json` — added checked-in project MCP server discovery wiring.
- `package.json` — added the root `broker:mcp` convenience script.
- `packages/review-broker-server/package.json` — added the official MCP SDK dependency, MCP bin entry, and `start:mcp` script.
- `packages/review-broker-server/src/index.ts` — exported the new MCP helpers.
- `packages/review-broker-server/src/mcp/server.ts` — added registry-driven MCP server/tool registration.
- `packages/review-broker-server/src/mcp/tool-dispatch.ts` — added the shared broker-operation MCP dispatch adapter and stderr-only failure logging.
- `packages/review-broker-server/src/cli/start-mcp.ts` — added the stdio MCP CLI entrypoint with stderr-only operational diagnostics.
- `packages/review-broker-server/test/mcp-server.test.ts` — added official-transport integration coverage for list/call flows, stderr diagnostics, and stdout cleanliness.
- `pnpm-lock.yaml` — updated lockfile entries for the official MCP SDK and direct `zod` dependency in `review-broker-server`.
