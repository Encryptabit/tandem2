---
slice: S01
milestone: M007
title: "Pi-mono integration and reviewer agent tools"
status: done
risk_retired:
  - "pi-mono as a library dependency — proven: link: deps resolve, imports work, TypeBox schemas compile"
  - "API key resolution — proven: @gsd/pi-ai loads standalone with env ANTHROPIC_API_KEY"
  - "Agent tool schema format — proven: TypeBox schemas accepted by pi-agent-core Agent loop via AJV"
delivers:
  - "@gsd/pi-agent-core and @gsd/pi-ai wired as link: dependencies in review-broker-server"
  - "6 typed AgentTools wrapping BrokerService methods (list_reviews, claim_review, get_proposal, get_review_status, submit_verdict, add_message)"
  - "createReviewerAgent() factory returning a configured Agent instance with closure-injected reviewerId"
  - "REVIEWER_SYSTEM_PROMPT with structured review workflow guidance"
  - "Integration test proving full agent review lifecycle with mock LLM stream and real BrokerService + SQLite"
duration_total: 30m
tasks_completed: 3/3
tests_passing: 2
verification_result: passed
completed_at: 2026-03-26
---

# S01 Summary: Pi-mono integration and reviewer agent tools

## What This Slice Delivered

Wired `@gsd/pi-agent-core` and `@gsd/pi-ai` into `review-broker-server` as link dependencies, created 6 typed AgentTools wrapping BrokerService methods, built a `createReviewerAgent()` factory, and proved the full agent review lifecycle through an integration test with a mock LLM stream against real BrokerService + SQLite.

## Key Artifacts

| File | Purpose |
|------|---------|
| `packages/review-broker-server/src/agent/reviewer-tools.ts` | 6 AgentTools with TypeBox schemas — each tool calls BrokerService directly |
| `packages/review-broker-server/src/agent/reviewer-prompt.ts` | System prompt (~3200 chars) with structured review workflow |
| `packages/review-broker-server/src/agent/reviewer-agent.ts` | `createReviewerAgent()` factory with `CreateReviewerAgentOptions` interface |
| `packages/review-broker-server/src/index.ts` | Re-exports all agent modules |
| `packages/review-broker-server/test/reviewer-agent.test.ts` | Integration test (2 tests, both pass) |
| `packages/review-broker-server/package.json` | `link:` deps to pi-mono packages |
| `packages/review-broker-server/tsup.config.ts` | Both pi packages marked external |

## Architecture Established

### Dependency wiring
- `@gsd/pi-agent-core` and `@gsd/pi-ai` are `link:` dependencies with absolute paths to the globally installed gsd-pi monorepo under `~/.nvm`. Both are marked `external` in tsup to prevent bundling provider side effects.

### AgentTool wrapping pattern
- `createReviewerAgentTools(brokerService, reviewerId)` returns 6 `AgentTool` instances. Each tool has a TypeBox schema for LLM-facing parameters and an `execute()` that calls the corresponding BrokerService method.
- `reviewerId` is captured in the closure and injected as `claimantId`/`actorId` — the LLM never sees identity fields in tool parameters.
- Tools return `{ content: [{ type: 'text', text: JSON.stringify(result) }], details: result }` — text for LLM consumption, details for programmatic access.

### Agent factory
- `createReviewerAgent({ brokerService, reviewerId, model?, streamFn? })` creates tools via the closure factory, interpolates `{reviewerId}` into the system prompt, and constructs an `Agent` with defaults (claude-sonnet-4-20250514, streamSimple).
- The `streamFn` parameter allows mock injection for testing without real LLM calls.

### Mock stream pattern for tests
- Create `AssistantMessageEventStream`, push `start` + `done` events via `queueMicrotask`, return the stream.
- Turn number determined by counting `toolResult` messages in `context.messages`.
- Each turn returns one assistant message with one tool call (agent loop processes one LLM response per turn).

## Risks Retired

| Risk | How Retired |
|------|------------|
| pi-mono as library dependency | `link:` deps resolve, all 3 key exports importable (Agent, Type, getModel) |
| API key resolution | `@gsd/pi-ai` loads standalone with env-based ANTHROPIC_API_KEY |
| Agent tool schema format | TypeBox schemas work through pi-agent-core's AJV validation |

## Verification

| Check | Result |
|-------|--------|
| `pnpm vitest run packages/review-broker-server/test/reviewer-agent.test.ts` | ✅ 2/2 tests pass (89ms) |
| `node -e "import('@gsd/pi-agent-core').then(m => console.log('Agent:', typeof m.Agent))"` | ✅ `Agent: function` |
| Integration test: agent claims review, reads proposal, submits verdict | ✅ Database state confirms `approved` status, correct claimantId |
| Integration test: audit trail contains review.created, review.claimed, review.approved | ✅ All 3 events present |
| Tool content structure: returns `{ content, details }` with parseable JSON text | ✅ Verified by unit test |

## What S02 Should Know

1. **Import pattern:** Use `import { createReviewerAgent } from '../src/agent/reviewer-agent.ts'` (or from the package index). The factory returns a configured `Agent` instance ready for `agent.prompt()`.

2. **Agent lifecycle:** `agent.prompt(userMessage)` runs the full agent loop — the agent will use tools autonomously across multiple turns until it produces a text-only response (no tool calls), indicating it's done.

3. **In-process cancellation:** The `Agent` constructor doesn't accept an `AbortSignal` directly. S02 will need to determine how `@gsd/pi-agent-core` supports cancellation — likely via the `streamFn` or by aborting the underlying HTTP request.

4. **JSONL capture:** Agent events are available via `agent.subscribe()` — emits `tool_execution_start`, `tool_execution_end`, `agent_end`. S02 should pipe these to the existing JSONL log writer.

5. **Two-step verdict status:** `submitVerdict(verdict: 'approved')` results in final status `'approved'`, not `'submitted'`. The broker does `claimed → submitted → approved` in one transaction. Pool health checks should look for terminal verdict statuses, not intermediate ones.

6. **build review-broker-core first:** In worktree environments, `pnpm --filter review-broker-core build` may be needed before running tests since Vite's module resolution needs compiled `dist/` output.
