---
estimated_steps: 7
estimated_files: 5
skills_used: []
---

# T02: Extend pool manager with dual-mode agent spawn and JSONL capture

**Slice:** S02 — In-process pool integration and agent lifecycle
**Milestone:** M007

## Description

After T01 merges M006's pool infrastructure into M007, this task extends the pool manager to support a second spawn mode: in-process reviewer agents. When pool config includes `model` and `provider` fields, `reactiveScale()` spawns agents via `createReviewerAgent()` instead of child processes via `reviewerManager.spawnReviewer()`.

Agent-backed reviewers are tracked differently from subprocess reviewers: no PID, no ChildProcess handle, instead an AbortController + Promise representing the agent's lifetime. Agent events (tool calls, completions) are piped to JSONL log files. When an agent completes (normally or via abort), the reviewer is marked offline and any claimed review is reclaimed.

Key design constraint: the existing subprocess path must remain completely intact. The agent path is additive, activated only when pool config has model+provider.

## Steps

1. **Extend PoolConfigSchema** — In `packages/review-broker-server/src/runtime/pool-config.ts`, add optional `model` (string) and `provider` (string, default `'anthropic'`) fields to `PoolConfigSchema`. These are optional — when absent, the pool uses the existing subprocess path.

2. **Add `recordAgentSpawned` to reviewers-repository** — In `packages/review-broker-server/src/db/reviewers-repository.ts`, add a `recordAgentSpawned` method that creates a reviewer record with `pid=null`, `command='agent:<model>'`, and `args=[]`. This reuses the existing `recordSpawned` infrastructure but with `pid=null` — which requires adjusting the reviewer status CTE to not treat `pid IS NULL` as always offline. The new logic: `WHEN reviewers.offline_at IS NOT NULL THEN 'offline'` (remove the `pid IS NULL` condition from the offline case). Add a separate insert statement for agents that doesn't require a pid.

3. **Add agent tracking to pool manager** — In `packages/review-broker-server/src/runtime/reviewer-pool.ts`:
   - Add `CreatePoolManagerOptions` fields: `brokerService` (BrokerService), `streamFn` (optional StreamFn for mock injection)
   - Add a `trackedAgents` map: `Map<string, { abortController: AbortController, completion: Promise<void>, reviewerId: string }>`
   - Import `createReviewerAgent` from the agent module
   - Import `createJsonlLogWriter` from `jsonl-log-writer.ts`

4. **Implement `spawnReviewerAgent()`** — New async function in the pool manager:
   - Generate `reviewerId` using the factory
   - Register in DB via `reviewers.recordAgentSpawned({ reviewerId, command: 'agent:<model>', startedAt, ... })`
   - Create JSONL log writer for this agent: `createJsonlLogWriter({ filePath: path.join(logDir, `agent-${reviewerId}.jsonl`) })` (if logDir configured)
   - Create an AbortController
   - Create the agent: `createReviewerAgent({ brokerService, reviewerId, model: getModel(provider, modelName), streamFn })`
   - Subscribe to agent events: `agent.subscribe(event => logWriter?.write({ ts, reviewerId, event }))`
   - Start the agent: `const completion = agent.prompt('You have been activated as a reviewer. List pending reviews, claim one, read its proposal, analyze the diff, and submit your verdict.').then(...).catch(...)`
   - On completion (success): mark reviewer offline with reason `'reviewer_exit'`, log writer close
   - On completion (error): mark reviewer offline with reason `'reviewer_exit'`, attempt review reclamation for any claimed review
   - Store in `trackedAgents` map
   - Emit `pool.agent_spawned` audit event

5. **Wire dual-mode into `reactiveScale()`** — In the `reactiveScale()` function, after computing `spawnCount`, check if `poolConfig.model` is set:
   - If yes: call `spawnReviewerAgent()` for each spawn
   - If no: call `reviewerManager.spawnReviewer()` as before (existing path)

6. **Implement agent-aware stop and drain** — 
   - Add `stopReviewerAgent(reviewerId)` that looks up the agent in `trackedAgents`, calls `abortController.abort()`, and awaits completion
   - Modify `checkDrainCompletion()` to handle agent reviewers (check `trackedAgents` in addition to `reviewerManager`)
   - Modify `reapDeadProcesses()` to skip agent reviewers (they don't have PIDs to check)
   - Modify `shutdownAll()` to abort all tracked agents in addition to shutting down subprocess reviewers

7. **Update pool manager exports** — Ensure the `PoolManager` interface exposes `getTrackedAgentCount()` for inspection, and that `shutdownAll()` handles both modes.

## Must-Haves

- [ ] `PoolConfigSchema` accepts optional `model` and `provider` fields
- [ ] Reviewers repository can record agent-backed reviewers with `pid=null`
- [ ] Pool manager tracks agent Promises with AbortControllers in `trackedAgents` map
- [ ] `spawnReviewerAgent()` creates an agent, subscribes to events for JSONL, starts the prompt, and handles completion
- [ ] `reactiveScale()` uses agent path when model is configured, subprocess path otherwise
- [ ] `stopReviewerAgent()` aborts the agent via AbortController
- [ ] Agent completion (success or error) marks reviewer offline and reclaims claimed reviews on failure
- [ ] Existing subprocess pool tests still pass — subprocess path is not modified

## Verification

- `pnpm vitest run packages/review-broker-server/test/reviewer-pool.test.ts` — existing subprocess pool tests pass unchanged
- `pnpm vitest run packages/review-broker-server/test/pool-config.test.ts` — pool config with model/provider parses correctly
- TypeScript compilation succeeds: `npx tsc --noEmit -p packages/review-broker-server/tsconfig.json` (or vitest type-checks during test run)

## Inputs

- `packages/review-broker-server/src/runtime/reviewer-pool.ts` — M006 pool manager (from T01)
- `packages/review-broker-server/src/runtime/pool-config.ts` — M006 pool config (from T01)
- `packages/review-broker-server/src/runtime/jsonl-log-writer.ts` — M006 JSONL writer (from T01)
- `packages/review-broker-server/src/db/reviewers-repository.ts` — updated repo with draining/session (from T01)
- `packages/review-broker-server/src/runtime/reviewer-manager.ts` — updated manager (from T01)
- `packages/review-broker-server/src/agent/reviewer-agent.ts` — S01 agent factory
- `packages/review-broker-server/src/agent/reviewer-tools.ts` — S01 agent tools
- `packages/review-broker-server/src/runtime/broker-service.ts` — updated service with pool integration (from T01)

## Expected Output

- `packages/review-broker-server/src/runtime/pool-config.ts` — extended with model/provider fields
- `packages/review-broker-server/src/runtime/reviewer-pool.ts` — extended with agent spawn, tracking, stop, drain, shutdown
- `packages/review-broker-server/src/db/reviewers-repository.ts` — extended with `recordAgentSpawned`, updated status CTE
- `packages/review-broker-server/src/index.ts` — updated if new exports needed
