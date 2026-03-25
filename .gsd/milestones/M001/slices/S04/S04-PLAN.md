# S04: Typed client and MCP exposure

**Goal:** Add one canonical operation surface for the standalone broker, then expose it through a direct typed TypeScript client and a stdio MCP server without re-describing request/response schemas per caller.
**Demo:** A local broker started from the existing TypeScript runtime can be driven either by `review-broker-client` or by MCP stdio tools, and writes performed on one surface are immediately visible on the other through the same review/reviewer payloads, versions, wait semantics, and failure vocabulary.

## Must-Haves

- `packages/review-broker-core` exports a shared operation registry that binds camelCase broker methods, snake_case MCP tool names, and the existing Zod request/response schemas in one place, directly advancing the anti-drift requirement behind R006 and R007.
- A new `packages/review-broker-client` package provides a direct typed TS client over the existing broker runtime/service using shared core contracts instead of redefined DTOs, directly advancing R006.
- `packages/review-broker-server` exposes the same broker operations through an official stdio MCP surface plus checked-in project MCP configuration, directly advancing R007.
- Cross-surface tests prove the typed client and MCP tools operate on the same SQLite-backed broker state and preserve the reviewer/audit/failure vocabulary already frozen in S02/S03, supporting R001 and R010.

## Proof Level

- This slice proves: integration
- Real runtime required: yes
- Human/UAT required: no

## Verification

- `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-core/test/contracts.test.ts packages/review-broker-core/test/reviewer-contracts.test.ts`
- `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-client/test/in-process-client.test.ts`
- `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-server/test/mcp-server.test.ts`
- `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-server/test/mcp-server.test.ts packages/review-broker-server/test/client-mcp-parity.test.ts`
- `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-server/test/review-lifecycle-parity.test.ts packages/review-broker-server/test/reviewer-lifecycle.test.ts packages/review-broker-server/test/reviewer-recovery.test.ts packages/review-broker-server/test/start-broker.smoke.test.ts`
- `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 broker:smoke`

## Observability / Diagnostics

- Runtime signals: review/reviewer notification versions stay authoritative, MCP tool errors surface as structured protocol failures, and broker startup/recovery diagnostics continue to come from the existing runtime inspection and `start-broker.ts --once` surfaces.
- Inspection surfaces: `packages/review-broker-core/src/operations.ts`, `packages/review-broker-client/test/in-process-client.test.ts`, `packages/review-broker-server/test/mcp-server.test.ts`, `packages/review-broker-server/test/client-mcp-parity.test.ts`, `.mcp.json`, and `packages/review-broker-server/src/cli/start-broker.ts --once`.
- Failure visibility: schema parse failures, tool-registration drift, wait/version mismatches, and MCP transport startup errors must be localizable from tests plus stderr-only MCP diagnostics without attaching a debugger.
- Redaction constraints: keep MCP stdout protocol-clean, send operational logs to stderr only, and do not leak patch bodies, secrets, or secret-bearing argv in tool output or diagnostics.

## Integration Closure

- Upstream surfaces consumed: `packages/review-broker-core/src/contracts.ts`, `packages/review-broker-core/src/notifications.ts`, `packages/review-broker-server/src/runtime/broker-service.ts`, `packages/review-broker-server/src/index.ts`, `packages/review-broker-server/src/cli/start-broker.ts`, and the parity/reviewer tests from S02 and S03.
- New wiring introduced in this slice: `packages/review-broker-core/src/operations.ts`, the `packages/review-broker-client` package, `packages/review-broker-server/src/mcp/*`, `packages/review-broker-server/src/cli/start-mcp.ts`, and project `.mcp.json` wiring.
- What remains before the milestone is truly usable end-to-end: S05 still needs final assembled parity proof that re-exercises the standalone runtime, persistence, reviewer lifecycle, typed client, and MCP surface together across restart-safe scenarios.

## Tasks

- [x] **T01: Freeze a shared broker operation registry and unblock MCP schema compatibility** `est:1h15m`
  - Why: S04 only stays thin if the operation list, schema pairing, and external names live in one place before client and MCP work begin.
  - Files: `packages/review-broker-core/package.json`, `packages/review-broker-core/src/contracts.ts`, `packages/review-broker-core/src/contracts.js`, `packages/review-broker-core/src/operations.ts`, `packages/review-broker-core/src/operations.js`, `packages/review-broker-core/src/index.ts`, `packages/review-broker-core/src/index.js`, `packages/review-broker-core/test/contracts.test.ts`, `packages/review-broker-core/test/reviewer-contracts.test.ts`, `pnpm-lock.yaml`
  - Do: Add a canonical core registry that maps each broker method to its request schema, response schema, and MCP tool name; export typed helpers that later client/MCP code can consume instead of hard-coding lists; update core package dependencies to an MCP-SDK-compatible Zod version; and keep the checked-in core `.js` siblings in sync with the TypeScript source.
  - Verify: `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-core/test/contracts.test.ts packages/review-broker-core/test/reviewer-contracts.test.ts && corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 --filter review-broker-core run build`
  - Done when: one exported core registry defines the broker operation catalog and tests freeze the method/tool/schema mapping without breaking the shared review or reviewer contracts.
- [x] **T02: Build the direct typed TypeScript client package on top of the shared registry** `est:1h30m`
  - Why: R006 requires a deterministic TS integration path that speaks the broker contract directly instead of forcing every caller through server internals or ad hoc wrappers.
  - Files: `packages/review-broker-client/package.json`, `packages/review-broker-client/tsconfig.json`, `packages/review-broker-client/src/client.ts`, `packages/review-broker-client/src/in-process.ts`, `packages/review-broker-client/src/index.ts`, `packages/review-broker-client/test/in-process-client.test.ts`, `package.json`
  - Do: Create the new workspace package, expose camelCase client methods that mirror `BrokerService`, validate inputs and outputs with the shared core registry, support attaching to an existing `BrokerService` plus a helper that starts an in-process runtime through `startBroker()`, and keep scope explicitly in-process rather than inventing HTTP or custom RPC.
  - Verify: `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-client/test/in-process-client.test.ts && corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 --filter review-broker-client run build`
  - Done when: external TS callers can create a client with shared request/response typing, drive representative review and reviewer operations against a real started runtime, and observe unchanged version/wait behavior.
- [x] **T03: Expose the broker contract as stdio MCP tools and project MCP config** `est:1h30m`
  - Why: R007 is only satisfied when the broker can be consumed over a real MCP transport that reuses the same contract vocabulary as the typed client.
  - Files: `package.json`, `.mcp.json`, `packages/review-broker-server/package.json`, `packages/review-broker-server/src/index.ts`, `packages/review-broker-server/src/mcp/server.ts`, `packages/review-broker-server/src/mcp/tool-dispatch.ts`, `packages/review-broker-server/src/cli/start-mcp.ts`, `packages/review-broker-server/test/mcp-server.test.ts`, `pnpm-lock.yaml`
  - Do: Add the official MCP TypeScript SDK, register one snake_case tool per core operation from the shared registry, dispatch every tool call through the existing broker runtime/service, return shared payloads as `structuredContent` plus minimal human-readable content, keep stdout reserved for MCP protocol traffic, and add project `.mcp.json` wiring so local tooling can discover the server.
  - Verify: `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-server/test/mcp-server.test.ts && corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 --filter review-broker-server run build`
  - Done when: a stdio MCP client can list the expected tools, invoke representative review and reviewer operations through the official SDK, and the project exposes a working checked-in MCP server entry without stdout corruption.
- [x] **T04: Prove typed-client and MCP parity against one broker state model** `est:1h15m`
  - Why: The slice does not close until both surfaces are shown to operate against the same persisted broker contract rather than merely compiling in isolation.
  - Files: `packages/review-broker-client/test/in-process-client.test.ts`, `packages/review-broker-server/test/mcp-server.test.ts`, `packages/review-broker-server/test/client-mcp-parity.test.ts`, `packages/review-broker-server/test/review-lifecycle-parity.test.ts`, `packages/review-broker-server/test/reviewer-lifecycle.test.ts`, `packages/review-broker-server/test/reviewer-recovery.test.ts`
  - Do: Add cross-surface parity coverage where the typed client writes broker state and MCP reads it back, plus the inverse for at least one representative flow; assert preserved versioned wait semantics on at least one list/status path; confirm reviewer visibility and failure vocabulary match across surfaces; and finish by rerunning the existing lifecycle/recovery suites so S04 does not regress S02/S03 behavior.
  - Verify: `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-client/test/in-process-client.test.ts packages/review-broker-server/test/mcp-server.test.ts packages/review-broker-server/test/client-mcp-parity.test.ts packages/review-broker-server/test/review-lifecycle-parity.test.ts packages/review-broker-server/test/reviewer-lifecycle.test.ts packages/review-broker-server/test/reviewer-recovery.test.ts packages/review-broker-server/test/start-broker.smoke.test.ts`
  - Done when: the new parity tests prove client and MCP reads/writes converge on the same broker state and the existing review/reviewer parity suites still pass unchanged.

## Files Likely Touched

- `package.json`
- `pnpm-lock.yaml`
- `.mcp.json`
- `packages/review-broker-core/package.json`
- `packages/review-broker-core/src/contracts.ts`
- `packages/review-broker-core/src/contracts.js`
- `packages/review-broker-core/src/operations.ts`
- `packages/review-broker-core/src/operations.js`
- `packages/review-broker-core/src/index.ts`
- `packages/review-broker-core/src/index.js`
- `packages/review-broker-core/test/contracts.test.ts`
- `packages/review-broker-core/test/reviewer-contracts.test.ts`
- `packages/review-broker-client/package.json`
- `packages/review-broker-client/tsconfig.json`
- `packages/review-broker-client/src/client.ts`
- `packages/review-broker-client/src/in-process.ts`
- `packages/review-broker-client/src/index.ts`
- `packages/review-broker-client/test/in-process-client.test.ts`
- `packages/review-broker-server/package.json`
- `packages/review-broker-server/src/index.ts`
- `packages/review-broker-server/src/mcp/server.ts`
- `packages/review-broker-server/src/mcp/tool-dispatch.ts`
- `packages/review-broker-server/src/cli/start-mcp.ts`
- `packages/review-broker-server/test/mcp-server.test.ts`
- `packages/review-broker-server/test/client-mcp-parity.test.ts`
- `packages/review-broker-server/test/review-lifecycle-parity.test.ts`
- `packages/review-broker-server/test/reviewer-lifecycle.test.ts`
- `packages/review-broker-server/test/reviewer-recovery.test.ts`
