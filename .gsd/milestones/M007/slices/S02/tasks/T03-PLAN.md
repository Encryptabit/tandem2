---
estimated_steps: 5
estimated_files: 3
skills_used: []
---

# T03: Agent lifecycle integration tests and CLI display

**Slice:** S02 — In-process pool integration and agent lifecycle
**Milestone:** M007

## Description

T02 built the dual-mode agent spawn code. This task proves it works end-to-end through integration tests against a real broker runtime with a mock LLM stream. Also updates the CLI display if needed to show agent-backed reviewers distinctly.

The test strategy mirrors S01's approach: use a mock `streamFn` that returns pre-programmed tool call sequences (claim → get_proposal → submit_verdict) so the agent drives through the full review lifecycle without hitting a real LLM. The key assertions are: (1) an agent reviewer appears in the DB with `pid=null` and `command='agent:<model>'`, (2) the agent claims and completes a review, (3) the reviewer goes offline after completion, (4) aborting an agent mid-run causes review reclamation, (5) agent events are written to JSONL.

## Steps

1. **Create test harness** — Create `packages/review-broker-server/test/pool-agent-integration.test.ts` with:
   - Temp directory for SQLite DB and JSONL logs
   - `createAppContext()` with temp DB path
   - `createBrokerService()` for direct service calls
   - `createReviewerManager()` for the subprocess side (even though we're testing agents, the pool manager requires it)
   - Mock `streamFn` following the S01 pattern: create `AssistantMessageEventStream`, use `queueMicrotask` to push events, determine turn by counting `toolResult` messages. Program turns: turn 0 → `list_reviews` tool call, turn 1 → `claim_review` tool call, turn 2 → `get_proposal` tool call, turn 3 → `submit_verdict` tool call with verdict `'approved'` and reason, turn 4 → text-only response (agent done).
   - Import `createPoolManager` and configure with `model: 'claude-sonnet-4-20250514'`, `provider: 'anthropic'`
   - AfterEach cleanup: shutdown pool, close context, remove temp dir

2. **Test: "agent spawns, claims, reviews, and submits verdict"** — 
   - Create a pending review via `service.createReview({ title, description, author, diff })`
   - Call `poolManager.reactiveScale()`
   - Wait briefly for the agent to complete (the mock stream resolves immediately, so `await` on a short delay or poll)
   - Assert: reviewer exists in DB with `command` containing `'agent:'` and `pid === null`
   - Assert: review status is `'approved'` (the programmed verdict)
   - Assert: reviewer status is `'offline'` after agent completion
   - Assert: audit trail contains `reviewer.spawned` and `reviewer.offline` events

3. **Test: "agent abort triggers review reclamation"** — 
   - Create a pending review
   - Modify the mock streamFn to hang on turn 2 (never resolve the stream, simulating a long-running agent)
   - Call `poolManager.reactiveScale()` to spawn the agent
   - Wait for the agent to reach turn 2 (claimed the review)
   - Call `poolManager.stopReviewerAgent(reviewerId)` or the pool's stop method with the agent's reviewerId
   - Assert: review returns to `'pending'` status (reclaimed)
   - Assert: reviewer is `'offline'`

4. **Test: "agent events captured to JSONL"** — 
   - Create pending review, configure pool with logDir pointing to temp dir
   - Trigger reactive scale, wait for agent completion
   - Read the JSONL file for the agent
   - Assert: file exists and contains lines with `tool_execution_start` and `tool_execution_end` events

5. **Update CLI display** — Check if `tandem reviewers list` already handles `pid=null` correctly (it shows `'—'` for null PIDs and displays `r.command` directly). The `command='agent:<model>'` convention from T02 means the existing table already shows the right info. If the display needs adjustment (e.g., adding a "Type" column showing "agent" vs "process"), make that change. Also verify that `--status idle` and `--status offline` filters work for agent reviewers.

## Must-Haves

- [ ] Integration test proves agent spawn → claim → review → verdict → exit cycle
- [ ] Integration test proves abort → review reclamation
- [ ] Integration test proves JSONL event capture
- [ ] All tests use mock streamFn (no real LLM calls)
- [ ] `tandem reviewers list` displays agent reviewers (pid=null, command='agent:<model>')

## Verification

- `pnpm --filter review-broker-core build && pnpm vitest run packages/review-broker-server/test/pool-agent-integration.test.ts` — all integration tests pass
- `pnpm vitest run packages/review-broker-server/test/reviewer-agent.test.ts` — S01 tests still pass
- `pnpm vitest run packages/review-broker-server/test/reviewer-pool.test.ts` — M006 pool tests still pass

## Inputs

- `packages/review-broker-server/src/runtime/reviewer-pool.ts` — dual-mode pool manager (from T02)
- `packages/review-broker-server/src/runtime/pool-config.ts` — extended pool config (from T02)
- `packages/review-broker-server/src/db/reviewers-repository.ts` — extended repo with agent support (from T02)
- `packages/review-broker-server/src/agent/reviewer-agent.ts` — S01 agent factory
- `packages/review-broker-server/src/agent/reviewer-tools.ts` — S01 agent tools
- `packages/review-broker-server/src/runtime/broker-service.ts` — service with pool integration (from T01)
- `packages/review-broker-server/test/reviewer-agent.test.ts` — S01 test patterns (mock streamFn reference)
- `packages/review-broker-server/test/test-paths.ts` — shared test path helpers
- `packages/review-broker-server/src/cli/tandem.ts` — CLI display code

## Expected Output

- `packages/review-broker-server/test/pool-agent-integration.test.ts` — new integration test file
- `packages/review-broker-server/src/cli/tandem.ts` — updated if CLI display changes needed
