# S01 UAT: Pi-mono integration and reviewer agent tools

## Preconditions

- Working directory: `tandem2` repo (or M007 worktree)
- Node.js ≥ 22 with gsd-pi globally installed at `~/.nvm/versions/node/v22.19.0/lib/node_modules/gsd-pi/`
- `pnpm install` has been run
- `review-broker-core` built: `pnpm --filter review-broker-core build`

---

## Test Case 1: Pi-mono dependency resolution

**Goal:** Verify `@gsd/pi-agent-core` and `@gsd/pi-ai` are importable from within `review-broker-server`.

### Steps

1. `cd packages/review-broker-server`
2. Run: `node -e "import('@gsd/pi-agent-core').then(m => console.log('Agent:', typeof m.Agent))"`
   - **Expected:** Prints `Agent: function`
3. Run: `node -e "import('@gsd/pi-ai').then(m => console.log('Type:', typeof m.Type, 'getModel:', typeof m.getModel, 'StringEnum:', typeof m.StringEnum))"`
   - **Expected:** Prints `Type: object getModel: function StringEnum: function`
4. Run: `pnpm ls @gsd/pi-agent-core @gsd/pi-ai`
   - **Expected:** Both show as `link:` dependencies with resolved paths

### Edge Cases

- If gsd-pi is uninstalled or moved, imports should throw `ERR_MODULE_NOT_FOUND`
- If tsup builds without `external` config, the build will fail or produce oversized bundles with provider side effects

---

## Test Case 2: Agent tool definitions

**Goal:** Verify all 6 AgentTools exist with correct names and TypeBox schemas.

### Steps

1. Run: `grep -c "name: '" packages/review-broker-server/src/agent/reviewer-tools.ts`
   - **Expected:** `6`
2. Run: `grep "name: '" packages/review-broker-server/src/agent/reviewer-tools.ts`
   - **Expected:** Contains exactly: `list_reviews`, `claim_review`, `get_proposal`, `get_review_status`, `submit_verdict`, `add_message`
3. Run (from `packages/review-broker-server`):
   ```
   node --import tsx/esm -e "
     import { createReviewerAgentTools } from './src/agent/reviewer-tools.ts';
     const tools = createReviewerAgentTools({} as any, 'test-id');
     console.log('count:', tools.length);
     console.log('names:', tools.map(t => t.name).join(', '));
   "
   ```
   - **Expected:** `count: 6` and all 6 names listed

### Edge Cases

- Tools should NOT expose `reviewerId`, `claimantId`, or `actorId` in their TypeBox schemas — the LLM must not see identity fields
- `submit_verdict` schema must include `StringEnum(['approved', 'changes_requested'])` for the verdict parameter

---

## Test Case 3: Agent factory construction

**Goal:** Verify `createReviewerAgent()` produces a working Agent instance.

### Steps

1. Run (from `packages/review-broker-server`):
   ```
   node --import tsx/esm -e "
     import { createReviewerAgent, REVIEWER_SYSTEM_PROMPT } from './src/index.ts';
     console.log('factory:', typeof createReviewerAgent);
     console.log('prompt length:', REVIEWER_SYSTEM_PROMPT.length);
     console.log('has reviewerId placeholder:', REVIEWER_SYSTEM_PROMPT.includes('{reviewerId}'));
   "
   ```
   - **Expected:** `factory: function`, prompt length > 3000, `has reviewerId placeholder: true`
2. Verify all 3 agent modules are exported from index.ts:
   ```
   grep "reviewer-" packages/review-broker-server/src/index.ts
   ```
   - **Expected:** 3 export lines for `reviewer-tools`, `reviewer-prompt`, `reviewer-agent`

---

## Test Case 4: Full agent review lifecycle (integration)

**Goal:** Prove the agent claims a review, reads the proposal, and submits a verdict through real BrokerService + SQLite with mock LLM.

### Steps

1. Run: `pnpm vitest run packages/review-broker-server/test/reviewer-agent.test.ts --reporter=verbose`
   - **Expected:** 2 tests pass:
     - `agent claims a review, reads proposal, and submits verdict via mock stream`
     - `agent tools return correct content structure`
2. Verify test exercises the full lifecycle by checking these assertions exist in the test file:
   - Review status transitions to `approved` (not `submitted`)
   - `claimedBy` matches the test reviewerId
   - Tool execution sequence is `[list_reviews, claim_review, get_proposal, submit_verdict]`
   - Audit trail contains `review.created`, `review.claimed`, `review.approved`

### Edge Cases

- Verdict status is the verdict value itself (`approved`), not `submitted` — the broker does a two-step transition in one transaction
- The mock streamFn must return exactly one tool call per assistant message — the agent loop processes one response per turn
- If `review-broker-core/dist/` is missing, tests will fail with module resolution errors — run `pnpm --filter review-broker-core build` first

---

## Test Case 5: Tool content structure contract

**Goal:** Verify AgentTool execute() returns the correct shape for LLM consumption.

### Steps

1. The second test in `reviewer-agent.test.ts` exercises this directly. After running the test suite (Test Case 4), confirm:
   - `content` is `[{ type: 'text', text: '<json>' }]`
   - `details` is the raw BrokerService response object
   - `JSON.parse(content[0].text)` matches `details` structure
2. Verify by inspecting the test assertions:
   ```
   grep -A5 "content structure" packages/review-broker-server/test/reviewer-agent.test.ts
   ```

---

## Test Case 6: System prompt quality

**Goal:** Verify the reviewer system prompt is substantive, not a rubber-stamp prompt.

### Steps

1. Read `packages/review-broker-server/src/agent/reviewer-prompt.ts`
2. Verify the prompt:
   - Defines a structured workflow (list → claim → read → analyze → verdict)
   - Lists specific evaluation criteria (correctness, security, performance, etc.)
   - Instructs the agent to provide reasoning before verdicts
   - Handles error cases (no reviews available, claim failures)
   - Uses `{reviewerId}` placeholder for identity injection
