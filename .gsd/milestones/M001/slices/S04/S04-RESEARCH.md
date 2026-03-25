# S04 Research — Typed client and MCP exposure

## Summary
S04 is a **targeted integration slice**. The core broker contract and durable runtime already exist; the missing work is exposing that same contract through two new surfaces without re-describing schemas per caller:

- a **direct typed TypeScript client** for deterministic integrations (R006)
- an **MCP surface** for manual/tool/LLM access (R007)

The codebase is already set up for this if the slice stays thin:

- `packages/review-broker-core/src/contracts.ts` is already the canonical request/response schema source.
- `packages/review-broker-server/src/runtime/broker-service.ts` already exposes the full operation set as one interface.
- `packages/review-broker-server/src/index.ts` already gives a reusable `startBroker()` composition entrypoint.
- the notification/version semantics that external callers need are already frozen and tested.

The main design risk is **drift through duplication**. Right now the operation schemas exist in core, but there is **no central operation registry/dispatcher metadata**. If S04 adds a client and MCP tools ad hoc, the same operation list, schema pairing, and naming will be re-encoded 2-3 more times.

## Requirement targets
Primary slice-owned requirements:
- **R006** — direct typed TS client
- **R007** — MCP public integration surface

Requirements materially supported by this slice:
- **R001** — strengthens the standalone boundary by adding actual external access surfaces
- **R010** — external callers should see the same reviewer/audit/failure vocabulary already frozen in S02/S03

## Skill discovery
Installed skills already relevant:
- `test` — follow existing Vitest conventions and verify generated tests immediately
- `review` — read full surrounding files before deciding where abstraction belongs
- `debug-like-expert` — verify actual runtime seams; do not assume there is already an RPC layer
- `best-practices` — prefer existing config/tooling rather than inventing new stack layers

No installed skill directly covers MCP SDK or Zod contract reuse. `npx skills find` surfaced these relevant candidates:
- `modelcontextprotocol/ext-apps@create-mcp-app` — 596 installs
- `0xdarkmatter/claude-mods@mcp-patterns` — 25 installs
- `pproenca/dot-skills@zod` — 870 installs

Do **not** install them during S04; they are only optional follow-up references if implementation friction appears.

## Recommendation
Use the lowest-risk M001 shape:

1. **Add a new `packages/review-broker-client` package** as a thin typed wrapper over the existing broker contract.
2. **Add a shared operation registry** (preferably in `review-broker-core`) that binds together:
   - operation id / method name
   - request schema
   - response schema
   - external MCP tool name
3. **Keep the direct client in-process for M001** rather than inventing HTTP/IPC.
4. **Expose MCP via stdio** from `review-broker-server` using the official MCP TypeScript SDK.
5. **Use the same operation registry for both client and MCP dispatch** so schemas and naming are not redefined.

This matches the already-accepted direction in `docs/standalone-broker-starting-point.md:57-94`: typed client is the deterministic path, MCP is additive/public.

### Why this is the right S04 scope
Current server code is **not** a request-serving daemon yet. `packages/review-broker-server/src/cli/start-broker.ts:14-55` starts the runtime, emits startup JSON, and either:
- exits in `--once` mode, or
- waits for shutdown in "serve" mode

There is no HTTP listener or RPC loop. Adding a true remote client protocol in S04 would expand the slice beyond the roadmap ask. For M001, the thin-client + stdio-MCP path is enough to prove shared contract reuse and cross-surface behavior.

## Implementation landscape

### What already exists

#### 1. Canonical shared schemas already live in core
`packages/review-broker-core/src/contracts.ts`
- review request/response schemas start at `CreateReviewRequestSchema` (`:143`)
- reviewer request/response schemas start at `SpawnReviewerRequestSchema` (`:173`)
- all request/response inferred TS types are exported from `:382+`

This is already the right single source of truth. S04 should not create parallel DTOs anywhere else.

#### 2. Notification/version semantics are already frozen
- `packages/review-broker-core/src/notifications.ts`
- `packages/review-broker-core/test/contracts.test.ts:51`
- `packages/review-broker-core/test/reviewer-contracts.test.ts:17`
- `packages/review-broker-core/test/notifications.test.ts:5`

Important downstream fact: wait-style polling/versioning is already part of the public contract for:
- review status
- review queue/listing
- reviewer listing

The typed client and MCP tools should surface these fields unchanged.

#### 3. The broker service already exposes the full callable surface
`packages/review-broker-server/src/runtime/broker-service.ts`
- `BrokerService` interface at `:112`
- lifecycle methods already implemented in one place
- versioned list/status methods already call the notification bus:
  - `listReviews()` at `:257`
  - `listReviewers()` at `:289`
  - `getReviewStatus()` at `:433`
- mutation fan-out happens via `notifyReviewMutation()` at `:1158`

This is the natural dispatch target for both the typed client and MCP layer.

#### 4. Reusable runtime composition already exists
`packages/review-broker-server/src/index.ts`
- `StartBrokerOptions` at `:32`
- `startBroker()` at `:127`

This gives S04 a stable way to:
- start a broker runtime for tests
- build a direct client against a started runtime/service
- share `{ cwd, dbPath }` semantics with any new surface

#### 5. Path resolution/config conventions already exist
`packages/review-broker-server/src/runtime/path-resolution.ts:4-45`
- `REVIEW_BROKER_DB_PATH`
- `REVIEW_BROKER_CONFIG_PATH`
- `cwd`-relative DB path resolution
- workspace-root detection

Any client factory that starts or attaches to broker runtime state should reuse this option shape instead of inventing new path flags.

#### 6. Existing tests already prove the right integration style
Key patterns to copy:
- real started runtime parity: `packages/review-broker-server/test/review-lifecycle-parity.test.ts:30`
- real reviewer lifecycle parity: `packages/review-broker-server/test/reviewer-lifecycle.test.ts:38`
- wait/version behavior: `packages/review-broker-server/test/broker-service.test.ts:196`
- real CLI smoke against child process: `packages/review-broker-server/test/start-broker.smoke.test.ts:29`

S04 should extend this same style rather than inventing a different test harness.

### What is missing

#### Missing package: typed client
There is currently no `packages/review-broker-client/` directory. Only `review-broker-core` and `review-broker-server` exist.

#### Missing MCP surface
There is currently no MCP package, no MCP CLI, no `.mcp.json`, and no MCP dependency in workspace `package.json` / package manifests.

#### Missing shared operation metadata
The biggest structural gap: there is **no exported registry** that says, in one place:
- `createReview` uses `CreateReviewRequestSchema` -> `CreateReviewResponseSchema`
- external MCP tool name is `create_review`
- dispatch target is `service.createReview`

Without this registry, the slice will drift immediately.

## Natural seams for planner tasking

### Seam 1 — Contract registry in core (build first)
Likely files:
- `packages/review-broker-core/src/contracts.ts` or new `src/operations.ts`
- `packages/review-broker-core/src/index.ts`
- `packages/review-broker-core/test/contracts.test.ts`
- `packages/review-broker-core/test/reviewer-contracts.test.ts`
- **plus checked-in JS/DTS siblings in `src/` if new core source files are added**

Goal:
- define the canonical operation list once
- keep camelCase method names and explicit MCP snake_case tool names together
- export typed helpers for request/response lookup by operation name

Why first:
- both the typed client and MCP layer depend on this
- this is the main anti-drift guardrail

### Seam 2 — Typed client package (can start after registry)
Likely new files:
- `packages/review-broker-client/package.json`
- `packages/review-broker-client/tsconfig.json`
- `packages/review-broker-client/src/index.ts`
- probably `src/client.ts` and `src/transports/in-process.ts`
- `packages/review-broker-client/test/*.test.ts`

Recommended shape:
- one method per broker operation, mirroring `BrokerService`
- parse inputs/outputs with shared core schemas, even for in-process use
- support an in-process invoker first (`BrokerService` / started runtime)
- optionally expose a small factory that creates a runtime from `{ cwd, dbPath }`

Do **not** overbuild a network transport in S04.

### Seam 3 — MCP adapter/server in `review-broker-server`
Likely files:
- `packages/review-broker-server/package.json`
- `packages/review-broker-server/src/index.ts`
- new `src/mcp/*.ts`
- new CLI entrypoint, e.g. `src/cli/start-mcp.ts`
- new server tests for stdio MCP behavior

Recommended shape:
- use `@modelcontextprotocol/sdk`
- register one MCP tool per broker operation
- tool implementation should dispatch through the same shared operation registry / dispatcher
- return:
  - `structuredContent` containing the exact shared response payload
  - minimal text `content` for human/LLM readability
- preserve legacy/public external names in snake_case (e.g. `create_review`, `list_reviewers`)

### Seam 4 — Cross-surface proof (last)
Likely test files:
- new `packages/review-broker-server/test/mcp-*.test.ts`
- possibly new `packages/review-broker-server/test/client-mcp-parity.test.ts`
- optionally a `review-broker-client` package integration test against started runtime

What to prove:
- typed client and MCP both hit the same broker contract
- state written through one surface is immediately visible through the other
- review and reviewer version fields remain stable across surfaces
- reviewer/audit/failure vocabulary remains unchanged

## Important constraints / gotchas

### 1. MCP SDK dependency will force a Zod decision up front
Current core dependency:
- `packages/review-broker-core/package.json:21` → `"zod": "^3.24.2"`

Current MCP SDK package metadata (`npm view @modelcontextprotocol/sdk ...`):
- peer/dependency requires `zod: ^3.25 || ^4.0`

Implication:
- S04 needs an explicit plan for Zod compatibility before adding MCP.
- Lowest-risk option is likely bumping workspace/core to a compatible Zod 3.25+ version rather than splitting schema stacks.

This should be treated as an **early unblocker**, not discovered halfway through MCP wiring.

### 2. MCP docs/examples assume official SDK usage — do not hand-roll JSON-RPC
Context7 MCP TS SDK docs show the intended path:
- `McpServer` + `StdioServerTransport` for server stdio exposure
- `Client` + `StdioClientTransport` for tests/consumers
- `registerTool()` with full Zod schemas

Do not write custom stdio framing or custom JSON-RPC plumbing for S04.

### 3. MCP stdio must keep stdout clean
The MCP SDK docs explicitly treat stdio as protocol transport. Operational logs should go to `stderr` or SDK logging, not `stdout`, or the transport will corrupt.

That matters because `start-broker.ts` currently emits JSON events to stdout; a separate MCP CLI should **not** reuse that output style.

### 4. Preserve external/public vocabulary carefully
Current broker service methods are camelCase, but preserved prior-art operation names are snake_case (`docs/standalone-broker-starting-point.md:24-40`).

Recommended split:
- direct TS client: camelCase methods mirroring `BrokerService`
- MCP tools: snake_case names for external/public compatibility

Put both names in the same registry so the mapping is explicit and tested.

### 5. Core source JS/DTS siblings are a real maintenance constraint
S02/S03 already warned about this, and the repo still shows checked-in core runtime siblings in `packages/review-broker-core/src/*.js` / `*.d.ts`.

If S04 adds a new core source file (for example `operations.ts`), planner must include the corresponding generated/runtime artifacts or ensure the chosen build/test path does not break imports.

### 6. Avoid widening scope into HTTP
Nothing in the current codebase requires HTTP for M001, and there is no HTTP server dependency today. The roadmap only requires typed client + MCP exposure. If the slice starts inventing an HTTP API, it risks becoming S04.5.

## Verification plan
Use the existing Vitest-heavy proof style and add focused integration tests.

### Minimum expected automated checks
1. **Core contract tests** for any new operation registry / exported metadata
   - `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-core/test/contracts.test.ts packages/review-broker-core/test/reviewer-contracts.test.ts packages/review-broker-core/test/notifications.test.ts`

2. **Typed client tests**
   - direct client method calls against a started runtime
   - validate request/response parsing and version fields

3. **MCP server tests**
   - spawn the MCP CLI over stdio
   - connect with official MCP client transport
   - verify `listTools()` exposes the expected tool names
   - call representative review and reviewer operations
   - check `structuredContent` matches shared response payloads

4. **Cross-surface parity test**
   - create/claim/review through typed client
   - observe/fetch via MCP (or vice versa)
   - verify both surfaces read/write the same SQLite-backed state

5. **Existing server regression slice**
   - at minimum rerun the review/reviewer parity tests already used by S02/S03:
   - `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-server/test/review-lifecycle-parity.test.ts packages/review-broker-server/test/reviewer-lifecycle.test.ts packages/review-broker-server/test/reviewer-recovery.test.ts packages/review-broker-server/test/start-broker.smoke.test.ts`

### High-value proof scenarios
Planner should ensure at least these scenarios are explicitly covered:
- **review queue/state visibility across surfaces**
  - client creates review
  - MCP `list_reviews` and `get_review_status` see it with same versioned fields
- **reviewer visibility across surfaces**
  - client spawns reviewer
  - MCP `list_reviewers` sees reviewer record and version
- **failure visibility survives surface boundary**
  - provoke a recoverable reviewer/offline path and confirm client/MCP surfaces both expose the same reviewer/audit vocabulary
- **wait semantics are preserved**
  - at least one client or MCP proof should exercise `wait + sinceVersion + timeoutMs`

## Don’t hand-roll
- **Do not hand-roll MCP protocol transport.** Use `@modelcontextprotocol/sdk` stdio transports.
- **Do not hand-roll parallel DTOs.** Reuse `review-broker-core` schemas.
- **Do not hand-roll a new runtime abstraction if `BrokerService` already covers it.** Wrap it.
- **Do not introduce HTTP unless a failing verification case proves stdio + in-process client are insufficient.**

## Sources
- `docs/standalone-broker-starting-point.md:57-94`
- `packages/review-broker-core/src/contracts.ts:143-413`
- `packages/review-broker-core/package.json:21`
- `packages/review-broker-core/test/contracts.test.ts:51,203,233`
- `packages/review-broker-core/test/reviewer-contracts.test.ts:17`
- `packages/review-broker-core/test/notifications.test.ts:5`
- `packages/review-broker-server/src/runtime/broker-service.ts:112,257,289,433,1158`
- `packages/review-broker-server/src/index.ts:32,127`
- `packages/review-broker-server/src/cli/start-broker.ts:14-55,182`
- `packages/review-broker-server/src/runtime/path-resolution.ts:4-45`
- `packages/review-broker-server/test/broker-service.test.ts:196`
- `packages/review-broker-server/test/review-lifecycle-parity.test.ts:30`
- `packages/review-broker-server/test/reviewer-lifecycle.test.ts:38`
- `packages/review-broker-server/test/start-broker.smoke.test.ts:29`
- Context7: `/modelcontextprotocol/typescript-sdk` docs on `registerTool`, `StdioServerTransport`, `StdioClientTransport`, tool error handling, and `structuredContent`
- `npm view @modelcontextprotocol/sdk version peerDependencies dependencies --json`
