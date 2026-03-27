---
id: T03
parent: S01
milestone: M007
provides:
  - "Integration test proving full agent review lifecycle (list → claim → get_proposal → submit_verdict) with mock LLM stream and real BrokerService + SQLite"
  - "Tool content structure unit test verifying AgentTool return shape"
key_files:
  - packages/review-broker-server/test/reviewer-agent.test.ts
key_decisions:
  - "Mock streamFn uses AssistantMessageEventStream from @gsd/pi-ai with synchronous queueMicrotask push — avoids need for complex async stream machinery while satisfying the agent loop's async iteration contract"
  - "Turn detection via toolResult message count in context.messages — simple, stateless, and matches the agent loop's actual turn semantics"
patterns_established:
  - "Mock streamFn pattern for pi-agent-core tests: create AssistantMessageEventStream, push start+done events via queueMicrotask, return stream — agent loop iterates it correctly"
  - "Review status after submitVerdict(verdict:'approved') is 'approved' not 'submitted' — the broker does a two-step transition (claimed→submitted→approved) within a single transaction"
observability_surfaces:
  - "agent.subscribe() events captured in test — tool_execution_end events verify the tool call sequence"
  - "BrokerService.getActivityFeed() audit trail asserts review.created, review.claimed, review.approved events"
  - "Run with --reporter=verbose to see each assertion in the test output"
duration: 10m
verification_result: passed
completed_at: 2026-03-26
blocker_discovered: false
---

# T03: Integration test proving full agent review cycle

**Created vitest integration test with mock LLM streamFn that scripts 5-turn tool call sequence through real BrokerService + SQLite, proving the agent claims a review, reads the proposal, and submits an approved verdict**

## What Happened

Created `packages/review-broker-server/test/reviewer-agent.test.ts` with two tests:

1. **Full lifecycle integration test** — Creates a review via BrokerService, builds a mock `streamFn` that returns scripted AssistantMessages with tool calls across 5 turns (list_reviews → claim_review → get_proposal → submit_verdict → text-only end), creates a reviewer agent via `createReviewerAgent()`, calls `agent.prompt()`, then asserts:
   - Database state: review status is `approved`, latestVerdict is `approved`, claimedBy matches the reviewerId, verdictReason contains the expected text
   - Tool execution sequence: exactly `[list_reviews, claim_review, get_proposal, submit_verdict]` via captured agent events
   - Audit trail: contains `review.created`, `review.claimed`, `review.approved` events

2. **Tool content structure test** — Exercises `list_reviews` tool directly via `createReviewerAgentTools()`, verifies the return shape is `{ content: [{ type: 'text', text: JSON.stringify(...) }], details: { reviews: [...] } }` and that the text content parses to match the details object.

The mock streamFn uses `AssistantMessageEventStream` from `@gsd/pi-ai`. Each turn inspects the count of `toolResult` messages in `context.messages` to determine which scripted response to return. Events are pushed via `queueMicrotask` to allow the async iterator to settle before receiving the first event.

Required building `review-broker-core` first (`pnpm --filter review-broker-core build`) since its `dist/` was missing in the worktree — Vite's module resolution needs the compiled output.

## Verification

- `pnpm vitest run packages/review-broker-server/test/reviewer-agent.test.ts` — 2 tests pass (92ms)
- `cd packages/review-broker-server && node -e "import('@gsd/pi-agent-core').then(m => console.log('Agent:', typeof m.Agent))"` — prints `Agent: function`
- All slice-level verification checks pass — this is the final task in the slice

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `pnpm vitest run packages/review-broker-server/test/reviewer-agent.test.ts` | 0 | ✅ pass | 700ms |
| 2 | `cd packages/review-broker-server && node -e "import('@gsd/pi-agent-core').then(m => console.log('Agent:', typeof m.Agent))"` | 0 | ✅ pass | <1s |

## Diagnostics

- **Test health:** `pnpm vitest run packages/review-broker-server/test/reviewer-agent.test.ts --reporter=verbose` — shows each test name and timing
- **Mock stream debugging:** The mock streamFn logs turn count via toolResult counting; add `console.log('turn', turn)` inside the switch to trace which scripted response is being returned
- **Database state:** After the test, `harness.service.getReviewStatus({ reviewId })` returns the full review summary with all fields; `harness.service.getActivityFeed({ reviewId })` returns the audit trail
- **Failure mode:** If pi packages become unavailable, `AssistantMessageEventStream` import will throw `ERR_MODULE_NOT_FOUND`; if the agent loop contract changes (different event types), the mock stream will fail to produce valid events

## Deviations

- Plan suggested review status would be `submitted` after `submitVerdict()`, but the actual broker behavior is a two-step transition within a single transaction: `claimed → submitted → approved`. The final status is the verdict value itself (`approved`), not `submitted`. Fixed assertion accordingly.
- Plan suggested 4-turn mock (list → claim+get_proposal → submit_verdict → end), but the actual agent loop requires one tool call per assistant message since each turn is one LLM response. Implemented as 5 turns with one tool call each: list_reviews, claim_review, get_proposal, submit_verdict, text-only end.
- Had to build `review-broker-core` (`pnpm --filter review-broker-core build`) before tests could run — its `dist/` directory was missing in the worktree.

## Known Issues

None.

## Files Created/Modified

- `packages/review-broker-server/test/reviewer-agent.test.ts` — Integration test with mock streamFn proving full agent review lifecycle
