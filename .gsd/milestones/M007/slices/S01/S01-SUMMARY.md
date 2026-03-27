---
id: S01
parent: M007
milestone: M007
provides:
  - createReviewerAgent() factory for in-process reviewer agents
  - 6 AgentTools wrapping BrokerService methods
  - REVIEWER_SYSTEM_PROMPT for reviewer agent behavior
requires:
  []
affects:
  - S02
key_files:
  - packages/review-broker-server/src/agent/reviewer-tools.ts
  - packages/review-broker-server/src/agent/reviewer-prompt.ts
  - packages/review-broker-server/src/agent/reviewer-agent.ts
  - packages/review-broker-server/src/index.ts
  - packages/review-broker-server/test/reviewer-agent.test.ts
  - packages/review-broker-server/package.json
  - packages/review-broker-server/tsup.config.ts
key_decisions:
  - Used link: protocol with absolute paths to globally installed gsd-pi packages (D035)
  - Return { content, details } from tool execute() for dual LLM/programmatic access (D036)
  - Closure-inject reviewerId to keep identity out of tool schemas
patterns_established:
  - AgentTool wrapping pattern: closure-injected reviewerId, TypeBox schemas, { content, details } returns
  - Mock stream pattern for agent testing: AssistantMessageEventStream with queueMicrotask-driven events
observability_surfaces:
  - Agent events via agent.subscribe() — tool_execution_start, tool_execution_end, agent_end
drill_down_paths:
  - .gsd/milestones/M007/slices/S01/tasks/T01-SUMMARY.md
  - .gsd/milestones/M007/slices/S01/tasks/T02-SUMMARY.md
  - .gsd/milestones/M007/slices/S01/tasks/T03-SUMMARY.md
duration: ""
verification_result: passed
completed_at: 2026-03-27T02:11:06.802Z
blocker_discovered: false
---

# S01: Pi-mono integration and reviewer agent tools

**Wired pi-mono SDK, created 6 AgentTools wrapping BrokerService, and proved full agent review lifecycle with mock LLM integration test**

## What Happened

Wired @gsd/pi-agent-core and @gsd/pi-ai into review-broker-server as link dependencies (T01). Created 6 typed AgentTools wrapping BrokerService methods with TypeBox schemas — each tool calls BrokerService directly with closure-injected reviewerId (T02). Built createReviewerAgent() factory and reviewer system prompt (T02). Proved the full agent review lifecycle through an integration test with mock LLM stream against real BrokerService + SQLite — agent claims review, reads proposal, submits verdict, database state confirms approved status (T03).

## Verification

All 2 tests pass in reviewer-agent.test.ts (89ms). Agent successfully claims review, reads proposal, submits verdict through real BrokerService + SQLite. Database state confirms approved status and correct claimantId.

## Requirements Advanced

None.

## Requirements Validated

None.

## New Requirements Surfaced

None.

## Requirements Invalidated or Re-scoped

None.

## Deviations

None.

## Known Limitations

Agent cancellation mechanism (AbortController integration) not yet wired. Agent events not yet piped to JSONL.

## Follow-ups

Wire createReviewerAgent() into pool manager as dual-mode spawn path. Extend PoolConfig with model/provider fields.

## Files Created/Modified

- `packages/review-broker-server/package.json` — Added link: deps for pi-agent-core and pi-ai
- `packages/review-broker-server/tsup.config.ts` — Marked pi packages as external
- `packages/review-broker-server/src/agent/reviewer-tools.ts` — 6 AgentTools wrapping BrokerService methods
- `packages/review-broker-server/src/agent/reviewer-prompt.ts` — Reviewer system prompt
- `packages/review-broker-server/src/agent/reviewer-agent.ts` — createReviewerAgent() factory
- `packages/review-broker-server/src/index.ts` — Re-exports for agent modules
- `packages/review-broker-server/test/reviewer-agent.test.ts` — Integration test proving full agent review lifecycle
