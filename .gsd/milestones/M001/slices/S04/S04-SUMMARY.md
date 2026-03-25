---
id: S04
parent: M001
milestone: M001
status: complete
validated_requirements:
  - R006
  - R007
advanced_requirements:
  - R001
  - R010
---

# S04: Typed client and MCP exposure

## Outcome
S04 completed the standalone broker’s external integration slice. The broker contract is now described once in `review-broker-core` and reused by both a direct typed TypeScript client and a stdio MCP server. Cross-surface proof now shows that typed-client calls and MCP tool calls operate against the same SQLite-backed broker state model, preserve versioned wait semantics, and surface the same reviewer/offline/audit vocabulary.

This slice did **not** close the milestone by itself: S05 still needs the final assembled parity proof across restart-safe scenarios. But S04 retired the main cross-surface drift risk by proving the broker no longer needs per-caller DTO or tool catalogs.

## What this slice delivered

### 1. One canonical broker operation registry in `review-broker-core`
`packages/review-broker-core/src/operations.ts` is now the frozen operation catalog for the standalone broker. Each entry carries:
- the canonical camelCase broker method name
- the public snake_case MCP tool name
- the shared request schema
- the shared response schema

The core package also exports derived lookup maps, method/tool-name lists, and parse helpers keyed by method or MCP tool name. That means later integrations can iterate or resolve broker operations from one source of truth instead of re-describing them per surface.

This is the key anti-drift pattern established by the slice: **method names, MCP names, and request/response schemas now change together or not at all**.

### 2. A real `review-broker-client` package for deterministic TS integrations
S04 added `packages/review-broker-client` as the runtime-owned integration seam for mechanical callers.

Key properties of the shipped client:
- the public client method surface is derived from `BROKER_OPERATIONS`, not handwritten
- every request is parsed through the shared core request schema before dispatch
- every response is parsed through the shared core response schema after dispatch
- callers can either wrap an existing `BrokerService` or start an in-process runtime through `startInProcessBrokerClient(...)`
- the scope remains intentionally in-process; this slice did **not** invent HTTP or a separate RPC layer

That delivers R006 in the intended form: deterministic integrations can call a typed broker client directly without routing critical control flow through MCP.

### 3. A registry-driven stdio MCP surface over the same broker contract
S04 added the public MCP surface in `packages/review-broker-server/src/mcp/*` plus the `start-mcp.ts` CLI entrypoint and checked-in `.mcp.json` discovery wiring.

What is now true of the MCP surface:
- one MCP tool is registered for every entry in `BROKER_OPERATIONS`
- tool input/output schemas come directly from the shared core registry
- each tool dispatches through the existing `BrokerService`
- successful calls return exact broker payloads as `structuredContent`
- human-readable tool text stays minimal
- stdout remains protocol-only
- operational diagnostics and redaction-safe failures go to stderr

The implementation uses the published monolithic `@modelcontextprotocol/sdk` package available in this harness, and the MCP tests prove the real stdio transport rather than only exercising an adapter in isolation.

### 4. Shared-state parity proof across typed client and MCP
The slice-closing proof is `packages/review-broker-server/test/client-mcp-parity.test.ts`.

That suite proves both surfaces are operating on one broker state model, not merely two similar adapters:
- the typed client creates review state that MCP reads back
- MCP creates review state that the typed client reads back
- an MCP wait call resolves after a typed-client mutation
- a typed-client wait call resolves after an MCP mutation
- reviewer kill/offline/reclaim behavior is visible with the same payload vocabulary through both surfaces
- activity-feed inspection shows the expected durable audit sequence, including `review.reclaimed`

The test uses the MCP SDK’s in-process `InMemoryTransport` specifically so the typed client and MCP client share the exact same `BrokerService` instance. Real stdio transport behavior remains covered independently by `mcp-server.test.ts`.

### 5. S02/S03 lifecycle proof remained intact after the new surfaces landed
S04 did not just add new code paths; it reran the existing review/reviewer parity suites and fixed a deterministic timestamp-fixture issue in `packages/review-broker-server/test/review-lifecycle-parity.test.ts` so the original lifecycle proof remained green.

That matters because the slice goal was not “client compiles” or “MCP lists tools”; it was “new surfaces drive the existing broker contract without changing it.”

### 6. Observability and failure localization stayed usable
The slice plan called out observability explicitly, and the shipped surfaces satisfy it:
- `packages/review-broker-server/test/mcp-server.test.ts` proves MCP startup diagnostics appear on stderr and that stdout stays protocol-clean
- dispatch failures surface as structured MCP tool errors
- invalid broker work through MCP logs redacted `mcp.tool_failed` diagnostics without leaking patch bodies
- `broker:smoke` still emits `broker.started` / `broker.once_complete` JSON with migration and startup-recovery details
- versioned review/reviewer waits remain authoritative and are now proven across both external surfaces

## Patterns established for later slices
- **Add broker operations in the core registry first.** New surfaces should derive from `BROKER_OPERATIONS`; do not maintain separate method lists, MCP catalogs, or DTO layers.
- **Generate the typed client from the shared registry.** The client surface is intentionally a mapped type over broker operations, with shared request/response parsing on both sides of the transport.
- **Keep MCP transport thin.** Tool registration should stay registry-driven and dispatch straight into `BrokerService`, with shared schemas and redaction-safe stderr diagnostics.
- **Prove parity by crossing the mutation/wait direction.** One surface should block on `wait: true` while the other causes the state change; that is how version semantics are actually proven.
- **Use `InMemoryTransport` when the goal is one-service parity proof.** Use stdio tests for transport behavior, but use an in-process MCP client when you need exact shared-runtime evidence.
- **Treat stdout cleanliness as part of the MCP contract.** Operational logs belong on stderr only.

## Verification performed
All slice-level verification passed.

### Automated verification
1. `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-core/test/contracts.test.ts packages/review-broker-core/test/reviewer-contracts.test.ts`
   - Result: **pass**
   - Evidence: 2 test files passed, 17 tests passed

2. `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-client/test/in-process-client.test.ts`
   - Result: **pass**
   - Evidence: 1 test file passed, 4 tests passed

3. `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-server/test/mcp-server.test.ts`
   - Result: **pass**
   - Evidence: 1 test file passed, 4 tests passed

4. `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-server/test/mcp-server.test.ts packages/review-broker-server/test/client-mcp-parity.test.ts`
   - Result: **pass**
   - Evidence: 2 test files passed, 5 tests passed

5. `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-server/test/review-lifecycle-parity.test.ts packages/review-broker-server/test/reviewer-lifecycle.test.ts packages/review-broker-server/test/reviewer-recovery.test.ts packages/review-broker-server/test/start-broker.smoke.test.ts`
   - Result: **pass**
   - Evidence: 4 test files passed, 9 tests passed

6. `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 broker:smoke`
   - Result: **pass**
   - Evidence: emitted `broker.started` and `broker.once_complete` JSON with `migrations: ["001_init", "002_review_lifecycle_parity", "003_reviewer_lifecycle"]`, `migrationCount: 3`, and an empty fresh-DB `startupRecovery` snapshot

### Observability / diagnostic confirmation
The slice’s required observability surfaces are working:
- `packages/review-broker-core/src/operations.ts` is the inspectable canonical contract registry
- `packages/review-broker-client/test/in-process-client.test.ts` proves shared-schema validation catches invalid request/response shapes and preserves runtime error visibility
- `packages/review-broker-server/test/mcp-server.test.ts` proves tool registration matches the shared registry, startup failures land on stderr, dispatch failures are structured, and stdout stays clean
- `packages/review-broker-server/test/client-mcp-parity.test.ts` proves cross-surface wait/version behavior and matching reviewer/audit vocabulary
- `.mcp.json` exposes a checked-in project MCP server entry
- `broker:smoke` continues to expose redaction-safe broker startup and recovery diagnostics

## Requirement impact
- **Validated:** R006 direct typed TypeScript client for deterministic integrations
- **Validated:** R007 public MCP integration surface
- **Advanced but not closed:**
  - R001 is stronger because the standalone runtime now has both direct typed and MCP access surfaces operating against one state model, but S05 still owns final assembled parity proof across restart-safe scenarios
  - R010 is stronger because reviewer/offline/reclaim diagnostics are now proven visible through both client and MCP surfaces, but the requirement itself was already validated in S03

## What remains for the next slice

### For S05 (end-to-end standalone parity proof)
- Re-exercise the assembled system through restart-safe scenarios that involve the standalone runtime, persistence, reviewer lifecycle, typed client, and MCP surface together.
- Keep using `BROKER_OPERATIONS` as the single contract authority; S05 should not introduce surface-local schema shortcuts.
- Reuse the S04 parity pattern when proving integrated waits and lifecycle transitions across surfaces.
- Preserve stderr-only operational diagnostics for MCP and the existing `start-broker.ts --once` smoke diagnostics for runtime inspection.

## Downstream cautions
- `corepack pnpm --filter review-broker-server exec ...` runs from `packages/review-broker-server`, so relative smoke DB paths land under that package’s `.tmp/` directory.
- The published MCP SDK in this harness is the monolithic `@modelcontextprotocol/sdk` package, even though newer docs may mention split packages.
- High-level MCP tool failures from this SDK can appear as `CallToolResult` objects with `isError: true`, not only as rejected promises.
- Core shared-contract edits still need checked-in `packages/review-broker-core/src/*.js` runtime siblings kept in sync with the `.ts` sources.

## Bottom line
S04 retired the milestone’s cross-surface integration risk. The standalone broker now exposes one canonical contract through both a deterministic typed TypeScript client and a public stdio MCP surface, and the slice mechanically proves those surfaces converge on the same broker state, wait semantics, and failure vocabulary instead of drifting apart.