---
id: T02
parent: S01
milestone: M007
provides:
  - "6 typed AgentTools wrapping BrokerService methods (list_reviews, claim_review, get_proposal, get_review_status, submit_verdict, add_message)"
  - "REVIEWER_SYSTEM_PROMPT with {reviewerId} interpolation placeholder"
  - "createReviewerAgent() factory returning a configured Agent instance"
  - "All agent modules re-exported from review-broker-server index.ts"
key_files:
  - packages/review-broker-server/src/agent/reviewer-tools.ts
  - packages/review-broker-server/src/agent/reviewer-prompt.ts
  - packages/review-broker-server/src/agent/reviewer-agent.ts
  - packages/review-broker-server/src/index.ts
key_decisions:
  - "AgentTool execute() returns { content: [{ type: 'text', text: JSON.stringify(result) }], details: result } — text content for LLM consumption, details for programmatic access"
  - "reviewerId captured in createReviewerAgentTools closure, injected as claimantId/actorId — LLM never sees these identity fields in tool parameters"
patterns_established:
  - "AgentTool wrapping pattern: thin function with TypeBox schema + BrokerService delegation + textResult helper"
  - "System prompt uses {reviewerId} placeholder interpolated by factory via String.replace()"
observability_surfaces:
  - "agent.subscribe() emits tool_execution_start/tool_execution_end/agent_end lifecycle events"
  - "Each tool's details field contains the raw BrokerService response for programmatic inspection"
  - "BrokerService.getReviewStatus() and getActivityFeed() show review state transitions caused by agent tools"
duration: 12m
verification_result: passed
completed_at: 2026-03-26
blocker_discovered: false
---

# T02: Implement reviewer agent tools, system prompt, and factory

**Created 6 AgentTools with TypeBox schemas wrapping BrokerService methods, a substantive reviewer system prompt, and a createReviewerAgent() factory — all exported from review-broker-server index**

## What Happened

Created three new modules in `packages/review-broker-server/src/agent/`:

1. **`reviewer-tools.ts`** — `createReviewerAgentTools(brokerService, reviewerId)` returns 6 `AgentTool` instances: `list_reviews`, `claim_review`, `get_proposal`, `get_review_status`, `submit_verdict`, and `add_message`. Each tool has TypeBox parameter schemas (using `Type.Object`, `Type.Optional`, `Type.String`, `Type.Number`, and `StringEnum` for verdict values). The `reviewerId` is captured in the closure and injected as `claimantId`/`actorId` into BrokerService calls — the LLM never sees these fields. A shared `textResult()` helper produces the `{ content, details }` return shape.

2. **`reviewer-prompt.ts`** — Exports `REVIEWER_SYSTEM_PROMPT`, a ~3200-character system prompt instructing the agent to follow a structured review workflow (list → claim → read → analyze → comment → verdict). The prompt emphasizes substantive reasoning, covers 6 evaluation criteria, and includes error handling guidance.

3. **`reviewer-agent.ts`** — Exports `CreateReviewerAgentOptions` interface and `createReviewerAgent()` factory. The factory creates tools via the closure-based factory, interpolates `{reviewerId}` into the system prompt, and constructs an `Agent` with defaults for model (claude-sonnet-4-20250514) and streamFn (streamSimple).

Updated `packages/review-broker-server/src/index.ts` with `export *` for all three new modules.

## Verification

- All 3 modules import and resolve correctly via `node --import tsx/esm` — `createReviewerAgent: function`, `REVIEWER_SYSTEM_PROMPT: string (len 3218)`, `createReviewerAgentTools: function`
- TypeScript compilation shows zero errors in agent files (pre-existing TS6059 rootDir errors from path aliases are unrelated)
- 6 tool names confirmed: `list_reviews`, `claim_review`, `get_proposal`, `get_review_status`, `submit_verdict`, `add_message`
- `reviewerId` injected in 3 places (claimantId × 1, actorId × 2), never exposed in TypeBox schemas
- `{reviewerId}` placeholder present in prompt, interpolation via `.replace(/{reviewerId}/g, ...)` in factory
- Slice-level import resolution check passes: `import('@gsd/pi-agent-core').then(m => console.log('Agent:', typeof m.Agent))` → `Agent: function`
- Slice-level test file (`reviewer-agent.test.ts`) does not exist yet — expected (T03 deliverable)

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `npx tsc --noEmit` (filtered for agent/ errors) | 0 (agent files) | ✅ pass | ~3s |
| 2 | `grep -c "name: '" reviewer-tools.ts` → 6 | 0 | ✅ pass | <1s |
| 3 | `grep "reviewer-agent\|reviewer-prompt\|reviewer-tools" index.ts` → 3 lines | 0 | ✅ pass | <1s |
| 4 | `node --import tsx/esm` import verification | 0 | ✅ pass | ~2s |
| 5 | `node -e "import('@gsd/pi-agent-core')..."` (slice check) | 0 | ✅ pass | <1s |
| 6 | `pnpm vitest run .../reviewer-agent.test.ts` | 1 (no file) | ⏭️ skip (T03) | <1s |

## Diagnostics

- **Module health:** `cd packages/review-broker-server && node --import tsx/esm -e "import { createReviewerAgent } from './src/agent/reviewer-agent.ts'; console.log(typeof createReviewerAgent)"` — prints `function` if agent module is healthy
- **Tool count:** `grep -c "name: '" packages/review-broker-server/src/agent/reviewer-tools.ts` — should return 6
- **Export chain:** `grep "reviewer-" packages/review-broker-server/src/index.ts` — should show 3 export lines for agent modules
- **Failure mode:** If pi packages are unavailable, imports of `@gsd/pi-agent-core` or `@gsd/pi-ai` will throw `ERR_MODULE_NOT_FOUND`

## Deviations

- Plan's verification check `grep "createReviewerAgent" packages/review-broker-server/src/index.ts` doesn't match because `index.ts` uses `export * from './agent/reviewer-agent.js'` (the function name isn't literally in the file). Verified the re-export chain works via runtime import instead.
- Used `node --import tsx/esm` for runtime verification instead of bare `npx tsx` because tsx's CJS loader doesn't resolve the `link:` packages (known issue from T01 — the ESM loader works fine).

## Known Issues

None.

## Files Created/Modified

- `packages/review-broker-server/src/agent/reviewer-tools.ts` — 6 AgentTool definitions wrapping BrokerService methods with TypeBox schemas
- `packages/review-broker-server/src/agent/reviewer-prompt.ts` — REVIEWER_SYSTEM_PROMPT constant with {reviewerId} placeholder
- `packages/review-broker-server/src/agent/reviewer-agent.ts` — createReviewerAgent() factory and CreateReviewerAgentOptions interface
- `packages/review-broker-server/src/index.ts` — added 3 export lines for agent modules
- `.gsd/milestones/M007/slices/S01/tasks/T02-PLAN.md` — added Observability Impact section (pre-flight fix)
