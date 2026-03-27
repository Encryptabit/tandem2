---
estimated_steps: 5
estimated_files: 4
skills_used: []
---

# T02: Implement reviewer agent tools, system prompt, and factory

**Slice:** S01 — Pi-mono integration and reviewer agent tools
**Milestone:** M007

## Description

Create the three core agent modules in `packages/review-broker-server/src/agent/`:

1. **`reviewer-tools.ts`** — 6 `AgentTool` definitions wrapping `BrokerService` methods with TypeBox parameter schemas
2. **`reviewer-prompt.ts`** — System prompt for the reviewer agent
3. **`reviewer-agent.ts`** — `createReviewerAgent()` factory that assembles an Agent with tools, model, and prompt

Export all public symbols from `packages/review-broker-server/src/index.ts`.

## Steps

1. **Create `packages/review-broker-server/src/agent/reviewer-tools.ts`**

   Define 6 tools. Each tool has:
   - `name`: snake_case identifier (e.g. `list_reviews`)
   - `description`: what the tool does (for LLM context)
   - `parameters`: TypeBox schema using `Type.Object({...})`
   - `label`: human-readable label
   - `execute(toolCallId, params, signal?)`: calls the corresponding `BrokerService` method, returns `{ content: [{ type: 'text', text: JSON.stringify(result) }], details: result }`

   The function signature: `createReviewerAgentTools(brokerService: BrokerService, reviewerId: string): AgentTool<any>[]`

   The `reviewerId` is captured in the closure — used as `claimantId` for `claim_review` and `actorId` for `submit_verdict` and `add_message`.

   **Tool definitions:**

   | Tool | TypeBox params | BrokerService method | Notes |
   |------|---------------|---------------------|-------|
   | `list_reviews` | `{ status?: string, limit?: number }` | `listReviews(params)` | status is optional string enum |
   | `claim_review` | `{ reviewId: string }` | `claimReview({ reviewId, claimantId: reviewerId })` | inject reviewerId from closure |
   | `get_proposal` | `{ reviewId: string }` | `getProposal({ reviewId })` | returns diff, title, description, affected files |
   | `get_review_status` | `{ reviewId: string }` | `getReviewStatus({ reviewId })` | returns current review state |
   | `submit_verdict` | `{ reviewId: string, verdict: 'changes_requested' \| 'approved', reason: string }` | `submitVerdict({ reviewId, actorId: reviewerId, verdict, reason })` | inject reviewerId |
   | `add_message` | `{ reviewId: string, body: string }` | `addMessage({ reviewId, actorId: reviewerId, body })` | inject reviewerId |

   Import `Type`, `StringEnum` from `@gsd/pi-ai`. Import `AgentTool`, `AgentToolResult` types from `@gsd/pi-agent-core`. Import `BrokerService` from the local runtime module (relative import `../runtime/broker-service.js`).

   **Do NOT re-validate params** — the agent loop runs AJV validation against the TypeBox schema before calling `execute()`.

   For `StringEnum`, use it for the `verdict` field: `StringEnum(['changes_requested', 'approved'], { description: '...' })`. For `status` in `list_reviews`, use `Type.Optional(Type.String({ description: '...' }))` since it accepts any status string.

2. **Create `packages/review-broker-server/src/agent/reviewer-prompt.ts`**

   Export a `REVIEWER_SYSTEM_PROMPT` string constant. The prompt should instruct the agent to:
   - Act as a thorough code reviewer
   - Use `list_reviews` to find pending reviews
   - Claim one review at a time
   - Read the full proposal (diff, title, description)
   - Analyze code changes for bugs, security issues, design problems, and style
   - Submit a verdict with a detailed reason explaining the decision
   - Use `add_message` for inline/specific feedback before submitting the verdict
   - Be substantive — never rubber-stamp with "looks good"
   - When approving, explain *why* the changes are correct

   Keep the prompt focused and under ~800 words. Include the reviewer's ID placeholder: `Your reviewer ID is {reviewerId}. Use this when claiming reviews.` (will be interpolated by the factory).

3. **Create `packages/review-broker-server/src/agent/reviewer-agent.ts`**

   Export:
   ```typescript
   interface CreateReviewerAgentOptions {
     brokerService: BrokerService;
     reviewerId: string;
     model?: Model<any>;           // default: getModel('anthropic', 'claude-sonnet-4-20250514')
     streamFn?: StreamFn;          // default: streamSimple (from @gsd/pi-ai)
   }

   function createReviewerAgent(options: CreateReviewerAgentOptions): Agent
   ```

   Implementation:
   - Call `createReviewerAgentTools(options.brokerService, options.reviewerId)` to get tools
   - Interpolate `{reviewerId}` in the system prompt
   - Construct `new Agent({ initialState: { systemPrompt, model, tools }, streamFn })`
   - Return the agent

   Import `Agent` from `@gsd/pi-agent-core`, `getModel` from `@gsd/pi-ai`, `StreamFn` type from `@gsd/pi-agent-core`.

4. **Update `packages/review-broker-server/src/index.ts`**

   Add these exports at the end of the file:
   ```typescript
   export * from './agent/reviewer-tools.js';
   export * from './agent/reviewer-prompt.js';
   export * from './agent/reviewer-agent.js';
   ```

5. **Verify TypeScript compilation**

   Run `cd packages/review-broker-server && npx tsc --noEmit` to confirm no type errors. If the full project has pre-existing errors, narrow to `npx tsc --noEmit src/agent/reviewer-agent.ts` or verify with `node -e "import('./src/agent/reviewer-agent.ts')"` via tsx.

## Must-Haves

- [ ] `reviewer-tools.ts` defines 6 AgentTools with TypeBox schemas
- [ ] Each tool's `execute()` calls the correct BrokerService method
- [ ] `reviewerId` is captured in closure — no `claimantId`/`actorId` param exposed to LLM
- [ ] `reviewer-prompt.ts` exports `REVIEWER_SYSTEM_PROMPT` — substantive, not rubber-stamp
- [ ] `reviewer-agent.ts` exports `createReviewerAgent()` and `CreateReviewerAgentOptions`
- [ ] Factory interpolates `{reviewerId}` into the system prompt
- [ ] All three modules exported from `index.ts`
- [ ] Code type-checks cleanly

## Verification

- `cd packages/review-broker-server && npx tsc --noEmit src/agent/reviewer-agent.ts` — no errors (or the broader `npx tsc --noEmit` if no pre-existing errors)
- `grep -c "AgentTool" packages/review-broker-server/src/agent/reviewer-tools.ts` returns 6 or more (one per tool definition)
- `grep "createReviewerAgent" packages/review-broker-server/src/index.ts` matches (exported)

## Inputs

- `packages/review-broker-server/package.json` — must already have `@gsd/pi-agent-core` and `@gsd/pi-ai` deps (from T01)
- `packages/review-broker-server/tsup.config.ts` — must already mark pi packages as external (from T01)
- `packages/review-broker-server/src/runtime/broker-service.ts` — `BrokerService` interface (read-only reference)
- `packages/review-broker-core/src/contracts.ts` — Zod schemas (read-only reference for TypeBox equivalents)
- `packages/review-broker-core/src/domain.ts` — Domain constants like `REVIEW_VERDICTS` (read-only reference)
- `packages/review-broker-server/src/index.ts` — existing exports file to extend

## Observability Impact

- **New signals:** `createReviewerAgent()` returns an `Agent` instance whose `subscribe()` emits `tool_execution_start`, `tool_execution_end`, and `agent_end` events — these are the primary lifecycle signals for monitoring agent review activity.
- **Tool-level tracing:** Each tool's `execute()` returns `{ content, details }` where `details` is the raw BrokerService response. On failure, the agent loop surfaces errors as `isError: true` tool results visible in `tool_execution_end` events.
- **Inspection:** After an agent run, `BrokerService.getReviewStatus({ reviewId })` shows whether the review transitioned to `submitted`/`approved`/`changes_requested`, and `BrokerService.getActivityFeed({ reviewId })` shows the audit trail of all tool-triggered actions.
- **Failure visibility:** If the agent errors during a loop, `agent.state.error` contains the error message and the final `agent_end` event surfaces the incomplete message chain.

## Expected Output

- `packages/review-broker-server/src/agent/reviewer-tools.ts` — 6 AgentTool definitions
- `packages/review-broker-server/src/agent/reviewer-prompt.ts` — reviewer system prompt
- `packages/review-broker-server/src/agent/reviewer-agent.ts` — createReviewerAgent factory
- `packages/review-broker-server/src/index.ts` — updated with agent module exports
