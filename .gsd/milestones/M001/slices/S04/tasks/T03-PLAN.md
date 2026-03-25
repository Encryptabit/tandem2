---
estimated_steps: 5
estimated_files: 9
skills_used:
  - gsd
  - best-practices
  - debug-like-expert
  - review
  - test
---

# T03: Expose the broker contract as stdio MCP tools and project MCP config

**Slice:** S04 — Typed client and MCP exposure
**Milestone:** M001

## Description

Deliver the public R007 surface using the official MCP TypeScript SDK rather than custom protocol code. This task should register one MCP tool per core operation, dispatch each request through the existing broker runtime/service, and check in project MCP configuration so local tooling can discover and start the broker MCP server.

## Steps

1. Add the official MCP SDK dependency and a dedicated stdio CLI entrypoint that does not reuse the JSON-event stdout style from `start-broker.ts`.
2. Implement MCP server/tool-registration code that derives tool names and schema bindings from the shared core operation registry.
3. Dispatch tool invocations through the existing started runtime and return exact shared payloads as `structuredContent` with minimal text content for human readability.
4. Keep stdout reserved for MCP protocol traffic and route operational diagnostics to stderr only so the transport stays valid.
5. Add project `.mcp.json` wiring and integration tests that use the official MCP client transport to list tools and call representative review and reviewer operations.

## Must-Haves

- [ ] MCP tool registration is generated from the shared core registry rather than from a second hand-maintained tool list.
- [ ] The stdio server uses the official MCP SDK transport and keeps stdout protocol-clean.
- [ ] Local project tooling can discover the MCP server through checked-in config, not just ad hoc test harness code.

## Verification

- `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-server/test/mcp-server.test.ts`
- `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 --filter review-broker-server run build`

## Observability Impact

- Signals added/changed: MCP startup failures, tool dispatch errors, and protocol/tool-name drift become inspectable through dedicated stdio tests and stderr-only diagnostics.
- How a future agent inspects this: `.mcp.json`, `packages/review-broker-server/src/cli/start-mcp.ts`, and `packages/review-broker-server/test/mcp-server.test.ts`.
- Failure state exposed: broken tool registration, stdout protocol contamination, and mismatched request/response payloads should be visible without manually tracing JSON-RPC frames.

## Inputs

- `packages/review-broker-core/src/operations.ts` — canonical operation metadata from T01.
- `packages/review-broker-core/src/index.ts` — shared schema and type exports.
- `packages/review-broker-server/package.json` — current server package manifest and bin wiring.
- `packages/review-broker-server/src/index.ts` — reusable broker startup composition.
- `packages/review-broker-server/src/runtime/broker-service.ts` — broker dispatch target.
- `packages/review-broker-server/src/cli/start-broker.ts` — existing stdout behavior that the MCP entrypoint must not copy.
- `packages/review-broker-server/test/start-broker.smoke.test.ts` — process-based test style already used for real CLI surfaces.
- `.gsd/milestones/M001/slices/S04/tasks/T01-PLAN.md` — shared operation-registry constraints.

## Expected Output

- `package.json` — root scripts updated if needed for MCP launch/test convenience.
- `.mcp.json` — checked-in project MCP server configuration.
- `packages/review-broker-server/package.json` — MCP SDK dependency and CLI/bin wiring.
- `packages/review-broker-server/src/index.ts` — MCP helpers exported if needed by tests or CLI entrypoints.
- `packages/review-broker-server/src/mcp/server.ts` — MCP server construction and tool registration.
- `packages/review-broker-server/src/mcp/tool-dispatch.ts` — shared broker-operation dispatch adapter for MCP.
- `packages/review-broker-server/src/cli/start-mcp.ts` — stdio MCP server entrypoint.
- `packages/review-broker-server/test/mcp-server.test.ts` — official-transport integration test for tool listing and representative calls.
- `pnpm-lock.yaml` — lockfile updated for MCP dependency changes.
