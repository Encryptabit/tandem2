# S04 UAT: Typed client and MCP exposure

S04 does not require human UI acceptance, so this UAT is a **mechanical acceptance checklist** for the shared broker operation registry, the direct typed client package, the stdio MCP server, and shared-state parity between the two surfaces.

## Preconditions
- Working directory: `/home/cari/repos/tandem2/.gsd/worktrees/M001`
- Dependencies are installed for this worktree.
- `corepack`, `tsx`, and the workspace Vitest toolchain are available.
- Remove stale smoke DBs before starting:
  - `rm -f packages/review-broker-server/.tmp/s01-smoke.sqlite*`
- Confirm these files exist before starting:
  - `packages/review-broker-core/src/operations.ts`
  - `packages/review-broker-client/src/client.ts`
  - `packages/review-broker-server/src/cli/start-mcp.ts`
  - `.mcp.json`

---

## Test Case 1 — Full slice verification contract

**Goal:** Prove the exact slice-level verification commands from the plan all pass.

### Steps
1. Run:
   - `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-core/test/contracts.test.ts packages/review-broker-core/test/reviewer-contracts.test.ts`
2. Run:
   - `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-client/test/in-process-client.test.ts`
3. Run:
   - `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-server/test/mcp-server.test.ts`
4. Run:
   - `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-server/test/mcp-server.test.ts packages/review-broker-server/test/client-mcp-parity.test.ts`
5. Run:
   - `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-server/test/review-lifecycle-parity.test.ts packages/review-broker-server/test/reviewer-lifecycle.test.ts packages/review-broker-server/test/reviewer-recovery.test.ts packages/review-broker-server/test/start-broker.smoke.test.ts`
6. Run:
   - `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 broker:smoke`

### Expected outcome
- All six commands exit `0`.
- Step 1 reports **2 passed files** and **17 passed tests**.
- Step 2 reports **1 passed file** and **4 passed tests**.
- Step 3 reports **1 passed file** and **4 passed tests**.
- Step 4 reports **2 passed files** and **5 passed tests**.
- Step 5 reports **4 passed files** and **9 passed tests**.
- Step 6 emits `broker.started` and `broker.once_complete` JSON containing:
  - `migrations: ["001_init", "002_review_lifecycle_parity", "003_reviewer_lifecycle"]`
  - `migrationCount: 3`
  - `reviewCount: 0`
  - `reviewerCount: 0`
  - `startupRecovery.recoveredReviewerIds: []`

### Failure signals to inspect
- registry drift between `BROKER_OPERATIONS` and contract tests
- typed-client request/response validation failures
- MCP tool registration mismatch or transport startup failure
- lifecycle regressions in S02/S03 suites after S04 landed
- smoke output missing structured startup or recovery fields

---

## Test Case 2 — Canonical operation registry stays authoritative

**Goal:** Confirm client and MCP surfaces are both derived from one shared operation catalog.

### Steps
1. Run:
   - `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-core/test/contracts.test.ts --testNamePattern "freezes the broker operation registry"`
2. Run:
   - `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-core/test/reviewer-contracts.test.ts --testNamePattern "freezes reviewer MCP mappings"`
3. Open `packages/review-broker-core/src/operations.ts` and inspect the exported registry and helper names.

### Expected outcome
- Both focused test commands exit `0`.
- The review-contract test proves:
  - the broker operation list is frozen in one place
  - camelCase method names map to snake_case MCP names
  - each operation has both a request schema and response schema
- The reviewer-contract test proves reviewer operations participate in the same registry mapping.
- The code inspection shows these exports exist and are intended for reuse:
  - `BROKER_OPERATIONS`
  - `BROKER_OPERATION_METHOD_NAMES`
  - `BROKER_OPERATION_MCP_TOOL_NAMES`
  - `BROKER_OPERATIONS_BY_METHOD_NAME`
  - `BROKER_OPERATIONS_BY_MCP_TOOL_NAME`
  - request/response parse helpers

### Failure signals to inspect
- an operation present on one surface but missing from the registry
- MCP names diverging from broker method names without a registry update
- request/response validation being defined outside the core contract package

---

## Test Case 3 — Direct typed client remains the deterministic integration seam

**Goal:** Confirm the new `review-broker-client` package can drive a real started runtime and rejects schema drift cleanly.

### Steps
1. Run:
   - `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-client/test/in-process-client.test.ts`
2. Review the test names and output.
3. Open these files:
   - `packages/review-broker-client/src/client.ts`
   - `packages/review-broker-client/src/in-process.ts`

### Expected outcome
- The test command exits `0`.
- The suite proves all of the following:
  - a client can wrap an existing broker service
  - a client can start an in-process runtime through `startInProcessBrokerClient(...)`
  - invalid request payloads fail before dispatch via shared core schemas
  - malformed service responses fail after dispatch via shared core schemas
  - broker lifecycle errors still surface through typed client calls
  - versioned wait behavior remains unchanged when accessed through the client
- File inspection shows:
  - the public client method surface is derived from `BrokerOperationMethodName`
  - request parsing uses `parseBrokerOperationRequest(...)`
  - response parsing uses `parseBrokerOperationResponse(...)`
  - no hand-maintained parallel DTO layer exists in the client package

### Failure signals to inspect
- client method names being hand-coded instead of registry-derived
- request validation happening only inside the server, not at the client boundary
- response-shape drift not being caught until downstream code dereferences invalid payloads

---

## Test Case 4 — MCP stdio surface is public, registry-driven, and protocol-clean

**Goal:** Confirm the broker exposes one stdio MCP tool per core operation and keeps diagnostics off stdout.

### Steps
1. Run:
   - `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-server/test/mcp-server.test.ts`
2. Open these files:
   - `packages/review-broker-server/src/mcp/server.ts`
   - `packages/review-broker-server/src/mcp/tool-dispatch.ts`
   - `packages/review-broker-server/src/cli/start-mcp.ts`
   - `.mcp.json`
3. Review the focused MCP test output for startup, dispatch, error, and startup-argument-failure paths.

### Expected outcome
- The test command exits `0`.
- The suite proves:
  - listed MCP tool names equal `BROKER_OPERATION_MCP_TOOL_NAMES`
  - representative review and reviewer operations succeed through the official stdio transport
  - tool success payloads return `structuredContent`
  - startup diagnostics appear on stderr
  - dispatch failures produce structured tool errors and redacted `mcp.tool_failed` stderr logs
  - invalid CLI arguments produce `mcp.start_failed` on stderr and leave stdout empty
- File inspection shows:
  - `server.ts` iterates `BROKER_OPERATIONS` to register tools
  - `tool-dispatch.ts` routes by canonical broker method and returns minimal text plus exact structured payloads
  - `start-mcp.ts` emits runtime diagnostics via `process.stderr.write(...)`
  - `.mcp.json` defines the checked-in `review-broker` stdio server entry

### Failure signals to inspect
- MCP tool catalog not matching the core registry exactly
- tool output relying on prose-only text instead of structured payloads
- stderr diagnostics leaking patch bodies or other secret-bearing input
- stdout containing startup logs or other non-protocol noise

---

## Test Case 5 — Typed client and MCP prove one shared broker state model

**Goal:** Confirm the new parity proof really shows one broker state model, shared wait semantics, and matching reviewer/audit vocabulary.

### Steps
1. Run:
   - `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-server/test/client-mcp-parity.test.ts`
2. Open `packages/review-broker-server/test/client-mcp-parity.test.ts`.
3. Review the sequence of assertions in the parity test.

### Expected outcome
- The test command exits `0`.
- The proof shows all of the following:
  - an MCP `listReviewers({ wait: true, sinceVersion })` call resolves after a typed-client `spawnReviewer(...)`
  - an MCP `listReviews({ wait: true, sinceVersion })` call resolves after a typed-client `createReview(...)`
  - MCP can create a review that the typed client reads back through `getReviewStatus(...)` and `getProposal(...)`
  - a typed-client `getReviewStatus({ wait: true, sinceVersion })` resolves after MCP `addMessage(...)`
  - killing a reviewer through MCP yields the same offline reviewer payload seen through the typed client
  - the reclaimed review returns to `pending` with `claimGeneration: 2`
  - both surfaces see the same activity-feed event sequence:
    - `review.created`
    - `review.claimed`
    - `review.submitted`
    - `review.message_added`
    - `review.reclaimed`
- File inspection shows the parity test uses the MCP SDK’s `InMemoryTransport` so both surfaces share the same `BrokerService` instance.

### Failure signals to inspect
- wait semantics only working when the same surface performs both the wait and the mutation
- reviewer or activity payloads differing between client and MCP for the same review/reviewer
- parity being simulated with two separate runtimes instead of one shared runtime

---

## Test Case 6 — Legacy lifecycle and recovery proof still holds after S04

**Goal:** Confirm S04 did not regress the S02/S03 contract while adding new surfaces.

### Steps
1. Run:
   - `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-server/test/review-lifecycle-parity.test.ts`
2. Run:
   - `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-server/test/reviewer-lifecycle.test.ts packages/review-broker-server/test/reviewer-recovery.test.ts packages/review-broker-server/test/start-broker.smoke.test.ts`
3. Review the passing output.

### Expected outcome
- Both commands exit `0`.
- The lifecycle parity suite still proves create → claim → discussion/submission → verdict → close/requeue behaviors.
- The reviewer suites still prove spawn/list/kill, reviewer exit recovery, operator-kill recovery, and startup recovery.
- The smoke suite still proves real CLI startup and restart-safe recovery diagnostics.

### Failure signals to inspect
- timestamp-order regressions in `review-lifecycle-parity.test.ts`
- reviewer recovery failing after typed client or MCP changes landed
- real CLI smoke diagnostics no longer matching actual runtime state

---

## Edge-case checklist

### Edge Case A — MCP tool failures do not leak patch bodies
- Covered by `packages/review-broker-server/test/mcp-server.test.ts`
- Expected outcome:
  - an invalid diff sent through `create_review` returns an error result
  - stderr contains `"event":"mcp.tool_failed"`
  - stderr does **not** contain the injected patch-body sentinel

### Edge Case B — MCP startup argument errors keep stdout clean
- Covered by `packages/review-broker-server/test/mcp-server.test.ts`
- Expected outcome:
  - invalid `--busy-timeout-ms` causes `mcp.start_failed`
  - process exit code is `1`
  - stdout is exactly empty

### Edge Case C — Shared-runtime parity uses one broker service, not two
- Covered by `packages/review-broker-server/test/client-mcp-parity.test.ts`
- Expected outcome:
  - the test uses `InMemoryTransport.createLinkedPair()`
  - one started runtime is shared by both the typed client and the MCP client

### Edge Case D — Project-level MCP discovery wiring exists
- Covered by file inspection of `.mcp.json`
- Expected outcome:
  - `mcpServers.review-broker.type === "stdio"`
  - `command === "corepack"`
  - `args === ["pnpm", "broker:mcp"]`

---

## Acceptance decision
S04 is acceptable only if **all six test cases pass** and the edge-case expectations remain true. Any failure means the broker still has contract drift risk between the typed client and MCP surfaces, or the new external surfaces are not yet mechanically proven against one shared broker state model.