# S01 Research: Pi-mono integration and reviewer agent tools

## Summary

This slice adds `@gsd/pi-agent-core` and `@gsd/pi-ai` as dependencies to `review-broker-server`, defines 5 broker operations as typed `AgentTool`s using TypeBox schemas, creates a `createReviewerAgent()` factory, and proves the full cycle (claim → read proposal → submit verdict) via integration test.

**Research depth:** Deep — unfamiliar SDK integration, TypeBox ↔ Zod schema bridging, dependency wiring for internal monorepo packages, and agent loop behavior must all be proven.

**Risk verdict:** The SDK surface is clean and well-structured. The `Agent` class construction with typed tools was proven to work via manual verification. The main risks are (1) wiring `@gsd/pi-agent-core` + `@gsd/pi-ai` into the pnpm workspace, and (2) the integration test needing a mock or real LLM call.

## Recommendation

### Dependency installation approach
Use `link:` protocol in `review-broker-server/package.json` pointing to the globally installed gsd-pi packages:

```json
{
  "dependencies": {
    "@gsd/pi-agent-core": "link:/home/cari/.nvm/versions/node/v22.19.0/lib/node_modules/gsd-pi/packages/pi-agent-core",
    "@gsd/pi-ai": "link:/home/cari/.nvm/versions/node/v22.19.0/lib/node_modules/gsd-pi/packages/pi-ai"
  }
}
```

This is preferable over `file:` (which copies) because the packages have transitive dependencies (`@anthropic-ai/sdk`, `@sinclair/typebox`, `ajv`, etc.) that are resolved from the gsd-pi monorepo's `node_modules`. The `link:` approach preserves the symlink chain.

**Alternative:** Add `@sinclair/typebox` as a direct devDep and import `Type` from it, bypassing `@gsd/pi-ai`'s re-export. This would decouple the tool schema definitions from the runtime dependency. However, this creates a version drift risk — stick with `@gsd/pi-ai`'s re-export of `Type` and `Static`.

### Tool schema strategy
Define TypeBox schemas **parallel** to the existing Zod schemas in `review-broker-core`. The TypeBox schemas are purpose-built for the agent tool interface (simpler — only the fields the agent sends, not the full Zod shapes with `.strict()` and `.extend()`). The `BrokerService` methods handle their own Zod validation internally, so the TypeBox schemas serve as the LLM-facing parameter definitions, not as runtime validation gates.

### Agent factory pattern
Create `src/agent/reviewer-agent.ts` in `review-broker-server` with:
- `createReviewerAgentTools(brokerService)` — returns the 5 `AgentTool` definitions
- `createReviewerAgent(options)` — constructs an `Agent` with tools, model, and system prompt
- A focused system prompt for code review

### Test approach
The integration test should use a **mock `streamFn`** that returns pre-scripted tool calls instead of hitting the real Anthropic API. The `Agent` constructor accepts `streamFn` in `AgentOptions`, and the agent loop calls it instead of `streamSimple`. This allows deterministic testing of the full agent → tool → broker → database cycle without API keys or network.

## Implementation Landscape

### Files to create (new)

| File | Purpose |
|------|---------|
| `packages/review-broker-server/src/agent/reviewer-tools.ts` | 5 `AgentTool` implementations wrapping `BrokerService` methods |
| `packages/review-broker-server/src/agent/reviewer-agent.ts` | `createReviewerAgent()` factory, system prompt, agent construction |
| `packages/review-broker-server/src/agent/reviewer-prompt.ts` | System prompt constant for the reviewer agent |
| `packages/review-broker-server/test/reviewer-agent.test.ts` | Integration test: mock stream → agent claims, reads, verdicts |

### Files to modify (existing)

| File | Change |
|------|--------|
| `packages/review-broker-server/package.json` | Add `@gsd/pi-agent-core` and `@gsd/pi-ai` as dependencies |
| `packages/review-broker-server/src/index.ts` | Export agent factory and tools |
| `packages/review-broker-server/tsup.config.ts` | May need to mark `@gsd/pi-agent-core` and `@gsd/pi-ai` as external |

### Files for reference only (do not modify)

| File | Why |
|------|-----|
| `packages/review-broker-server/src/runtime/broker-service.ts` | The `BrokerService` interface — tools call these methods |
| `packages/review-broker-core/src/contracts.ts` | Zod schemas — reference for TypeBox equivalents |
| `packages/review-broker-core/src/domain.ts` | Domain types, enums, and interfaces |
| `packages/review-broker-server/src/runtime/app-context.ts` | `createAppContext()` — test harness uses this |
| `packages/review-broker-server/test/test-paths.ts` | `WORKTREE_ROOT` — test path constants |

## Key Findings

### 1. Agent SDK surface is minimal and clean

The `Agent` class (`@gsd/pi-agent-core`) is a standalone class with no implicit initialization:

```typescript
import { Agent } from '@gsd/pi-agent-core';
import { Type, getModel } from '@gsd/pi-ai';

const agent = new Agent({
  initialState: {
    systemPrompt: '...',
    model: getModel('anthropic', 'claude-sonnet-4-20250514'),
    tools: [/* AgentTool[] */],
  },
});

await agent.prompt('Review the next pending review.');
```

**Key interfaces:**
- `AgentTool<TParameters extends TSchema, TDetails>` extends `Tool<TParameters>` with `label: string` and `execute(toolCallId, params, signal?, onUpdate?) => Promise<AgentToolResult<TDetails>>`
- `AgentToolResult<T>` = `{ content: (TextContent | ImageContent)[]; details: T }`
- Tool parameters use TypeBox `TSchema` (via `Type.Object(...)`)
- Tool argument validation uses AJV internally (in `validateToolArguments`)

### 2. API key resolution is straightforward

`getEnvApiKey('anthropic')` checks `process.env.ANTHROPIC_OAUTH_TOKEN || process.env.ANTHROPIC_API_KEY`. No config wizard, no OAuth flow needed. The `Agent` can receive an `apiKey` via `getApiKey` callback in `AgentOptions`, or it can be passed through the model's provider configuration. For standalone use, just set `ANTHROPIC_API_KEY` env var.

### 3. TypeBox schema definitions for the 5 agent tools

Based on the Zod schemas in `contracts.ts`, the TypeBox equivalents are:

**`claim_review`** — `{ reviewId: string, claimantId: string }`
**`get_proposal`** — `{ reviewId: string }`
**`get_review_status`** — `{ reviewId: string }`
**`submit_verdict`** — `{ reviewId: string, actorId: string, verdict: 'changes_requested' | 'approved', reason: string }`
**`add_message`** — `{ reviewId: string, actorId: string, body: string }`

The reviewer agent also needs `list_reviews` to find pending reviews — add this as a 6th tool:
**`list_reviews`** — `{ status?: string, limit?: number }` (optional params)

In TypeBox:
```typescript
const ClaimReviewParams = Type.Object({
  reviewId: Type.String({ description: 'The review ID to claim' }),
  claimantId: Type.String({ description: 'The reviewer ID claiming the review' }),
});
```

The `StringEnum` helper from `@gsd/pi-ai` creates enum schemas compatible with all LLM providers:
```typescript
import { StringEnum } from '@gsd/pi-ai';
const VerdictParam = StringEnum(['changes_requested', 'approved'], { description: '...' });
```

### 4. Mock stream function for testing

The `Agent` constructor accepts `streamFn` in `AgentOptions`. The agent loop calls `streamFn(model, context, options)` which returns an `AssistantMessageEventStream`. For testing, create a factory that returns scripted assistant messages with tool calls:

```typescript
const mockStreamFn: StreamFn = (model, context, options) => {
  // Inspect context.messages to determine what tool call to emit
  // Return an EventStream that yields toolCall events
};
```

The `EventStream` class is exported from `@gsd/pi-ai` and supports push-based event emission. This approach is proven by the existing `agent-loop.ts` tests pattern.

### 5. Existing test harness pattern

All broker tests follow this pattern (from `broker-service.test.ts`):
```typescript
function createHarness() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'prefix-'));
  const context = createAppContext({ cwd: WORKTREE_ROOT, dbPath: path.join(dir, 'broker.sqlite') });
  return { context, service: createBrokerService(context) };
}
```

The agent test will extend this by also constructing an `Agent` with the broker service's tools.

### 6. Dependency wiring considerations

- `@gsd/pi-agent-core` has zero npm dependencies — it only imports from `@gsd/pi-ai`
- `@gsd/pi-ai` has heavy transitive deps: `@anthropic-ai/sdk`, `@sinclair/typebox`, `ajv`, `openai`, etc. — all installed in the gsd-pi monorepo's node_modules
- `link:` references resolve transitive deps from the linked package's own `node_modules`, not from the consumer's
- `tsup.config.ts` currently bundles `review-broker-core` via `noExternal`. The pi packages should be treated as **external** (not bundled) since they're runtime dependencies

### 7. The BrokerService interface has 16 methods; the agent needs 6

The full `BrokerService` has: `createReview`, `listReviews`, `spawnReviewer`, `listReviewers`, `killReviewer`, `claimReview`, `getReviewStatus`, `getProposal`, `reclaimReview`, `submitVerdict`, `closeReview`, `addMessage`, `getDiscussion`, `getActivityFeed`, `acceptCounterPatch`, `rejectCounterPatch`.

The reviewer agent needs only 6 of these for its review workflow:
1. `list_reviews` — find pending reviews
2. `claim_review` — claim a pending review
3. `get_proposal` — read the diff and metadata
4. `get_review_status` — check review state
5. `submit_verdict` — submit approved/changes_requested
6. `add_message` — add discussion messages

The roadmap says 5, but `list_reviews` is essential for the agent to discover what to review. Without it, the orchestrating code would need to pre-select the review and pass the ID in the prompt.

### 8. Agent lifecycle for a single review

The reviewer agent is stateless per review — one prompt, one review cycle, exit:
1. Agent receives prompt: "Review the next pending review. Your reviewer ID is {reviewerId}."
2. Agent calls `list_reviews({ status: 'pending' })` → finds review IDs
3. Agent calls `claim_review({ reviewId, claimantId: reviewerId })` → claims it
4. Agent calls `get_proposal({ reviewId })` → reads the diff, title, description
5. Agent analyzes the code diff
6. Agent calls `submit_verdict({ reviewId, actorId: reviewerId, verdict, reason })` → submits verdict
7. Agent may call `add_message()` for inline comments
8. Agent completes — promise resolves

### 9. Available Anthropic models

Verified in the model registry:
- `claude-sonnet-4-20250514` — available ✓
- `claude-opus-4-6` — available ✓ (the roadmap mentions this)
- Model IDs follow the pattern `provider/model-id` in `getModel('anthropic', 'model-id')`

## Pitfalls and Constraints

### P1: link: dependency resolution in worktrees

This work is executing in a git worktree at `.gsd/worktrees/M007`. The `link:` path must be absolute (to the global gsd-pi install), not relative. Relative `link:` paths would resolve from the worktree, not the main repo. **Use absolute paths.**

### P2: tsup bundling of pi packages

The `tsup.config.ts` uses `noExternal: ['review-broker-core']` to bundle the broker-core package. The pi packages (`@gsd/pi-agent-core`, `@gsd/pi-ai`) must NOT be bundled — they have complex transitive dependencies and provider registration side effects (the `import "./providers/register-builtins.js"` in `stream.ts`). Mark them as external in tsup config, or rely on the default (packages not in `noExternal` are treated as external).

### P3: Provider registration side effect

`@gsd/pi-ai/src/stream.ts` starts with `import "./providers/register-builtins.js"`. This side-effect import registers all built-in API providers (Anthropic, OpenAI, Google, etc.) into the provider registry. Without this import executing, `streamSimple()` will fail with "No API provider registered for api: anthropic-messages". This happens automatically when importing from `@gsd/pi-ai`'s barrel export, but only if the import chain reaches `stream.ts`. Importing only `Type` from `@gsd/pi-ai` does trigger the barrel, so this should be fine.

### P4: The test mock stream must simulate multi-turn tool use

The agent loop calls `streamFn` once per turn. Each turn, the LLM sees the full conversation including previous tool results. The mock must:
1. First call → return a `list_reviews` tool call
2. After seeing `list_reviews` result → return `claim_review` + `get_proposal` tool calls
3. After seeing proposal → return `submit_verdict` tool call
4. Final call → return a text-only response (no tool calls) to end the loop

The mock inspects `context.messages` to determine which turn it's on.

### P5: Agent factory should accept BrokerService, not AppContext

The `createReviewerAgent()` factory should accept a `BrokerService` instance (the service interface), not the raw `AppContext`. This keeps the agent tools decoupled from database internals. The tools call `service.claimReview(...)`, `service.getProposal(...)`, etc.

### P6: reviewerId must be injected at agent creation time

The reviewer agent needs a `reviewerId` to pass as `claimantId` / `actorId` in tool calls. This should be a parameter to `createReviewerAgent()`, baked into the system prompt and available to tool implementations as a closure variable.

## Natural Task Decomposition

The work divides cleanly into 4 sequential tasks:

1. **T01: Add pi-mono dependencies** — Modify `package.json`, run `pnpm install`, verify imports resolve. Modify `tsup.config.ts` if needed. Smallest possible commit — just wiring.

2. **T02: Define agent tools** — Create `reviewer-tools.ts` with 6 `AgentTool` definitions using TypeBox schemas. Each tool wraps a `BrokerService` method call. Create `reviewer-prompt.ts` with the system prompt.

3. **T03: Create agent factory** — Create `reviewer-agent.ts` with `createReviewerAgent(options)` that constructs an `Agent` instance with tools, model, and prompt. Export from `index.ts`.

4. **T04: Integration test** — Create `reviewer-agent.test.ts` that proves the full cycle: create harness → create review → create agent with mock stream → agent prompts → tools fire → verdict submitted. Verify via database state assertions.

T01 must complete first. T02 and T03 could be done in either order but T02 logically comes first (tools are inputs to the factory). T04 depends on all three.

## Don't Hand-Roll

- **Tool argument validation:** The agent loop calls `validateToolArguments()` from `@gsd/pi-ai` using AJV against the TypeBox schema automatically. Do NOT add manual validation in tool `execute()` — the params are already validated.
- **Zod-to-TypeBox conversion:** Do NOT try to automate Zod → TypeBox conversion. The TypeBox schemas are simple (5-6 flat objects) and should be written by hand for clarity. The `zod-to-json-schema` dep in `@gsd/pi-ai` goes the other direction.
- **Custom event streaming:** Do NOT build custom event handling for the mock stream. Use `EventStream` from `@gsd/pi-ai` directly — it's the same class the real providers use.
