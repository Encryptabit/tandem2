---
estimated_steps: 5
estimated_files: 1
skills_used:
  - test
---

# T03: Integration test proving full agent review cycle

**Slice:** S01 — Pi-mono integration and reviewer agent tools
**Milestone:** M007

## Description

Create `packages/review-broker-server/test/reviewer-agent.test.ts` — a vitest integration test that proves the slice goal: an agent with a mock LLM stream executes the full review lifecycle through real BrokerService and SQLite.

The test creates a review, constructs a reviewer agent with a scripted mock `streamFn`, prompts the agent, and verifies the database reflects a completed review with the expected verdict.

## Steps

1. **Create the test file** at `packages/review-broker-server/test/reviewer-agent.test.ts`

2. **Set up the test harness** following the existing pattern from `broker-service.test.ts`:
   ```typescript
   import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
   import os from 'node:os';
   import path from 'node:path';
   import { afterEach, describe, expect, it } from 'vitest';
   import { createAppContext } from '../src/runtime/app-context.js';
   import { createBrokerService } from '../src/runtime/broker-service.js';
   import { createReviewerAgent } from '../src/agent/reviewer-agent.js';
   import { WORKTREE_ROOT } from './test-paths.js';
   ```
   Create a `createHarness()` helper that returns `{ context, service }` with a temp SQLite db. Track temp dirs and contexts for cleanup in `afterEach`.

3. **Build the mock `streamFn`** — this is the critical piece. The mock inspects `context.messages` to determine which turn it's on and returns scripted assistant messages with tool calls.

   The mock stream function must use `EventStream` from `@gsd/pi-ai`. For each turn:
   - **Turn 1** (initial prompt only, no tool results yet): Return assistant message with `list_reviews` tool call
   - **Turn 2** (after list_reviews result): Return assistant message with `claim_review` tool call (using the reviewId from the list result)
   - **Turn 3** (after claim result): Return assistant message with `get_proposal` tool call
   - **Turn 4** (after proposal result): Return assistant message with `submit_verdict` tool call (`verdict: 'approved'`, `reason: 'Code changes are correct and well-structured...'`)
   - **Turn 5** (after verdict result): Return text-only assistant message (no tool calls) to end the loop

   Each turn's mock response must be a valid `AssistantMessage` with the right structure:
   ```typescript
   {
     role: 'assistant',
     content: [{ type: 'toolCall', toolCallId: 'call_N', name: 'tool_name', args: {...} }],
     api: 'anthropic-messages',
     provider: 'anthropic',
     model: 'claude-sonnet-4-20250514',
     usage: ZERO_USAGE,  // from @gsd/pi-agent-core
     stopReason: 'tool_use',
     timestamp: Date.now(),
   }
   ```

   The mock stream function signature:
   ```typescript
   const mockStreamFn: StreamFn = (model, context, options) => { ... }
   ```
   It must return an `EventStream` (or `AssistantMessageEventStream`) that emits `start`, then `end` events for the assistant message. The simplest approach: create an EventStream, push the message events synchronously (or via microtask), and return it.

   To determine turn number, count `toolResult` messages in `context.messages`. Turn 1 has 0 tool results, turn 2 has 1, etc.

   To extract the reviewId for tool calls after turn 1, parse the tool result content from the `list_reviews` response in `context.messages`.

4. **Write the main test case:**
   ```
   it('agent claims a review, reads proposal, and submits verdict via mock stream', async () => {
     // 1. Create harness
     // 2. Create a review via service.createReview()
     // 3. Create agent with mock streamFn
     // 4. Call agent.prompt('Review the next pending review.')
     // 5. Assert: getReviewStatus shows status='submitted', latestVerdict='approved'
     // 6. Assert: review.claimedBy === reviewerId
   })
   ```

   Use the `valid-review.diff` fixture for the review's diff (read from `test/fixtures/valid-review.diff`).

5. **Add an edge case test** (optional but valuable):
   ```
   it('agent tools return correct content structure', () => {
     // Unit-test one tool's execute() directly (e.g. list_reviews)
     // Verify it returns { content: [{ type: 'text', text: '...' }], details: {...} }
   })
   ```

## Must-Haves

- [ ] Test file exists at `packages/review-broker-server/test/reviewer-agent.test.ts`
- [ ] Test uses real BrokerService + SQLite (not mocked DB)
- [ ] Mock `streamFn` scripts the multi-turn tool call sequence
- [ ] Agent executes `list_reviews` → `claim_review` → `get_proposal` → `submit_verdict`
- [ ] Final assertions check database state (review status, verdict, claimedBy)
- [ ] Test cleans up temp directories in afterEach

## Verification

- `pnpm vitest run packages/review-broker-server/test/reviewer-agent.test.ts` — all tests pass
- Test output shows the agent completed the tool call sequence without errors

## Observability Impact

- Signals added/changed: The mock stream validates that the agent loop correctly sequences tool calls and processes tool results — if the agent loop's event emission changes in future pi-mono updates, this test will catch the regression
- How a future agent inspects this: Run the test with `--reporter=verbose` to see each assertion
- Failure state exposed: Test failures show which turn's mock response was incorrect or which database assertion failed

## Inputs

- `packages/review-broker-server/src/agent/reviewer-agent.ts` — `createReviewerAgent()` factory (from T02)
- `packages/review-broker-server/src/agent/reviewer-tools.ts` — tool definitions (from T02)
- `packages/review-broker-server/src/runtime/broker-service.ts` — `createBrokerService` for test harness
- `packages/review-broker-server/src/runtime/app-context.ts` — `createAppContext` for test harness
- `packages/review-broker-server/test/test-paths.ts` — `WORKTREE_ROOT` constant
- `packages/review-broker-server/test/fixtures/valid-review.diff` — diff fixture for creating a test review

## Expected Output

- `packages/review-broker-server/test/reviewer-agent.test.ts` — integration test proving full agent review cycle
