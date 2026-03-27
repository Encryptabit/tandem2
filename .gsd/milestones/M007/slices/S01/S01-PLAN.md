# S01: Pi-mono integration and reviewer agent tools

**Goal:** `@gsd/pi-agent-core` and `@gsd/pi-ai` are wired as dependencies. A `createReviewerAgent()` factory constructs an Agent with 6 typed AgentTools wrapping BrokerService methods. An integration test proves the agent claims a review, reads the proposal, and submits a verdict through the real broker runtime (with a mock LLM stream).

**Demo:** `pnpm vitest run packages/review-broker-server/test/reviewer-agent.test.ts` passes — the mock-stream agent executes the full review lifecycle (list → claim → get_proposal → submit_verdict) and database state confirms the review transitions to `submitted` with the expected verdict.

## Must-Haves

- `@gsd/pi-agent-core` and `@gsd/pi-ai` added as `link:` dependencies pointing to the globally installed gsd-pi packages
- `tsup.config.ts` marks both pi packages as external (not bundled)
- 6 `AgentTool` implementations: `list_reviews`, `claim_review`, `get_proposal`, `get_review_status`, `submit_verdict`, `add_message`
- TypeBox schemas for all 6 tool parameter types
- Each tool's `execute()` calls the corresponding `BrokerService` method directly
- `createReviewerAgent(options)` factory returning a configured `Agent` instance
- Reviewer system prompt focused on substantive code review
- `reviewerId` injected at agent creation, available to tools as a closure
- Integration test using a mock `streamFn` that scripts multi-turn tool calls
- Test proves the full cycle: pending review → agent claims → reads proposal → submits verdict
- All new modules exported from `packages/review-broker-server/src/index.ts`

## Proof Level

- This slice proves: integration (agent → tools → broker service → SQLite, with mock LLM)
- Real runtime required: yes (real BrokerService + SQLite, mock LLM stream)
- Human/UAT required: no

## Verification

- `pnpm vitest run packages/review-broker-server/test/reviewer-agent.test.ts` — full agent lifecycle test passes
- `cd packages/review-broker-server && node -e "import('@gsd/pi-agent-core').then(m => console.log('Agent:', typeof m.Agent))"` — verifies import resolution

## Observability / Diagnostics

- Runtime signals: Agent events emitted via `agent.subscribe()` — `tool_execution_start`, `tool_execution_end`, `agent_end`
- Inspection surfaces: `BrokerService.getReviewStatus()` shows review state transitions; `BrokerService.getActivityFeed()` shows audit trail
- Failure visibility: Agent errors surface via `state.error` and `stopReason: 'error'` on the final assistant message; tool execution errors propagate as `isError: true` tool results

## Integration Closure

- Upstream surfaces consumed: `BrokerService` interface (16 methods, 6 used), `AppContext` + `createAppContext()` for test harness, `@gsd/pi-agent-core` Agent class + AgentTool type, `@gsd/pi-ai` TypeBox re-exports + StringEnum + getModel + streamSimple
- New wiring introduced in this slice: `link:` dependencies, `reviewer-tools.ts`, `reviewer-agent.ts`, `reviewer-prompt.ts`, agent module exports from `index.ts`
- What remains before the milestone is truly usable end-to-end: S02 (pool integration — replacing subprocess spawn with in-process agent tasks), S03 (prompt tuning + full pool lifecycle proof)

## Tasks

- [x] **T01: Wire @gsd/pi-agent-core and @gsd/pi-ai as link dependencies** `est:20m`
  - Why: All agent code depends on these packages. Must prove import resolution works in the worktree before writing any agent modules.
  - Files: `packages/review-broker-server/package.json`, `packages/review-broker-server/tsup.config.ts`
  - Do: Add both packages as `link:` deps using absolute paths to `/home/cari/.nvm/versions/node/v22.19.0/lib/node_modules/gsd-pi/packages/pi-agent-core` and `pi-ai`. Run `pnpm install`. Mark both packages as external in both tsup config entries. Verify imports resolve with a quick node -e check.
  - Verify: `cd packages/review-broker-server && node -e "import('@gsd/pi-agent-core').then(m => console.log('OK:', typeof m.Agent))"` prints `OK: function`
  - Done when: `pnpm install` succeeds without errors and both `@gsd/pi-agent-core` and `@gsd/pi-ai` are importable from within `review-broker-server`

- [x] **T02: Implement reviewer agent tools, system prompt, and factory** `est:1h30m`
  - Why: Core deliverable — the 6 AgentTools, the system prompt, and the `createReviewerAgent()` factory that S02 and S03 depend on.
  - Files: `packages/review-broker-server/src/agent/reviewer-tools.ts`, `packages/review-broker-server/src/agent/reviewer-prompt.ts`, `packages/review-broker-server/src/agent/reviewer-agent.ts`, `packages/review-broker-server/src/index.ts`
  - Do: (1) Create `reviewer-tools.ts` with 6 AgentTool definitions using TypeBox schemas — each tool's `execute()` calls the corresponding BrokerService method and returns content + details. (2) Create `reviewer-prompt.ts` with the reviewer system prompt. (3) Create `reviewer-agent.ts` with `createReviewerAgent()` factory that accepts `{ brokerService, reviewerId, model?, streamFn? }` and returns a configured `Agent`. (4) Add exports to `index.ts`. The `reviewerId` is captured in a closure and used by tool execute functions as `claimantId`/`actorId`. Tools should NOT re-validate params — the agent loop handles validation via AJV + TypeBox.
  - Verify: `pnpm vitest run packages/review-broker-server/test/reviewer-agent.test.ts` (created in T03) exercises all tools — but for T02 alone, verify TypeScript compilation: `cd packages/review-broker-server && npx tsc --noEmit src/agent/reviewer-agent.ts`
  - Done when: All 3 new files exist, type-check cleanly, and are exported from index.ts

- [x] **T03: Integration test proving full agent review cycle** `est:1h`
  - Why: Proves the slice goal — an agent using mock LLM stream claims a review, reads the proposal, and submits a verdict through the real broker runtime.
  - Files: `packages/review-broker-server/test/reviewer-agent.test.ts`
  - Do: Create a vitest test file that (1) creates a broker harness (temp dir + SQLite + BrokerService), (2) creates a review via `service.createReview()`, (3) builds a mock `streamFn` that inspects context.messages and returns scripted tool calls across 4 turns (list_reviews → claim_review + get_proposal → submit_verdict → text-only end), (4) creates an agent via `createReviewerAgent()` with the mock stream, (5) calls `agent.prompt()`, (6) asserts database state: review status is 'submitted', verdict is 'approved' or 'changes_requested', claimedBy matches the reviewerId. Use the existing test harness pattern (`createAppContext` + temp dir). The mock stream uses `EventStream` from `@gsd/pi-ai` to emit tool call events.
  - Verify: `pnpm vitest run packages/review-broker-server/test/reviewer-agent.test.ts` passes
  - Done when: Test passes proving the full cycle — agent claims, reads proposal, submits verdict, and database state reflects the completed review

## Files Likely Touched

- `packages/review-broker-server/package.json`
- `packages/review-broker-server/tsup.config.ts`
- `packages/review-broker-server/src/agent/reviewer-tools.ts`
- `packages/review-broker-server/src/agent/reviewer-prompt.ts`
- `packages/review-broker-server/src/agent/reviewer-agent.ts`
- `packages/review-broker-server/src/index.ts`
- `packages/review-broker-server/test/reviewer-agent.test.ts`
