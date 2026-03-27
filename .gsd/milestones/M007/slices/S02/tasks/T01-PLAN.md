---
estimated_steps: 9
estimated_files: 14
skills_used: []
---

# T01: Merge M006 pool management into M007

**Slice:** S02 — In-process pool integration and agent lifecycle
**Milestone:** M007

## Description

M006's pool management infrastructure does not exist in the M007 branch. M007 branched before M006 was complete, so files like `reviewer-pool.ts`, `pool-config.ts`, `jsonl-log-writer.ts`, migration `004_pool_management.sql` are absent. Additionally, several shared files (domain types, reviewers-repository, reviewer-manager, broker-service, app-context, index.ts) have M006 additions (draining status, sessionToken, pool audit events, logDir support, etc.) that are missing in M007.

This task ports all M006 pool code into M007, merging it alongside S01's agent additions (reviewer-agent.ts, reviewer-tools.ts, reviewer-prompt.ts). The merge is mechanical but large — the key risk is accidentally overwriting S01's additions.

## Steps

1. **Update `review-broker-core` domain types** — Edit `packages/review-broker-core/src/domain.ts`:
   - Change `REVIEWER_STATUSES` from `['idle', 'assigned', 'offline']` to `['idle', 'assigned', 'draining', 'offline']`
   - Change `REVIEWER_OFFLINE_REASONS` from `['spawn_failed', 'reviewer_exit', 'operator_kill', 'startup_recovery']` to `['spawn_failed', 'reviewer_exit', 'operator_kill', 'startup_recovery', 'idle_timeout', 'ttl_expired', 'pool_drain']`
   - Change `REVIEW_RECLAIM_CAUSES` from `['reviewer_exit', 'operator_kill', 'startup_recovery']` to `['reviewer_exit', 'operator_kill', 'startup_recovery', 'idle_timeout', 'ttl_expired', 'pool_drain']`
   - Add `POOL_AUDIT_EVENT_TYPES` array and type after `REVIEWER_AUDIT_EVENT_TYPES`
   - Add `...POOL_AUDIT_EVENT_TYPES` to `AUDIT_EVENT_TYPES` array
   - Add `sessionToken: string | null` and `drainingAt: string | null` to `ReviewerRecord` interface (before `createdAt`)
   - Update the corresponding `.d.ts` file to match

2. **Update `review-broker-core` contracts** — Edit `packages/review-broker-core/src/contracts.ts`:
   - Add `sessionToken: z.string().min(1).nullable()` and `drainingAt: IsoDateTimeSchema.nullable()` to `ReviewerRecordSchema` (after `exitSignal`)
   - Update the corresponding `.d.ts` file to match

3. **Rebuild review-broker-core** — Run `pnpm --filter review-broker-core build` so downstream packages pick up the new types.

4. **Copy M006-only files** — Create these files by copying from M006 branch:
   - `packages/review-broker-server/src/runtime/reviewer-pool.ts` — Copy from `git show milestone/M006:packages/review-broker-server/src/runtime/reviewer-pool.ts`
   - `packages/review-broker-server/src/runtime/pool-config.ts` — Copy from M006
   - `packages/review-broker-server/src/runtime/jsonl-log-writer.ts` — Copy from M006
   - `packages/review-broker-server/src/db/migrations/004_pool_management.sql` — Copy from M006 (content: `ALTER TABLE reviewers ADD COLUMN session_token TEXT; ALTER TABLE reviewers ADD COLUMN draining_at TEXT; CREATE INDEX IF NOT EXISTS idx_reviewers_session_token ON reviewers(session_token) WHERE session_token IS NOT NULL;`)
   - Also copy M006's pool test files: `packages/review-broker-server/test/reviewer-pool.test.ts` and `packages/review-broker-server/test/pool-config.test.ts`

5. **Merge M006 changes into reviewers-repository.ts** — Add to the M007 version:
   - Add `session_token` and `draining_at` columns to the `ReviewerRow` interface
   - Add `sessionToken` to `RecordReviewerSpawnedInput`
   - Add `MarkReviewerDrainingInput` interface
   - Add `markDraining` to `ReviewersRepository` interface
   - Add `session_token` and `draining_at` to all SELECT column lists and CTE
   - Add `draining` status case to the CTE's CASE expression (before the idle/assigned check): `WHEN reviewers.draining_at IS NOT NULL THEN 'draining'`
   - Add `session_token` to INSERT statements and the sessionToken binding
   - Implement `markDraining()` method
   - Add `sessionToken` and `drainingAt` to `mapReviewerRow()`

6. **Merge M06 changes into reviewer-manager.ts** — Add to the M007 version:
   - Add `logDir` to `CreateReviewerManagerOptions` and `SpawnReviewerInput`
   - Add `sessionToken` to `SpawnReviewerInput`
   - Add `StopReviewerOptions` interface with optional `offlineReason`
   - Update `stopReviewer` signature to accept `StopReviewerOptions`
   - Add `isProcessAlive` and `getTrackedReviewerIds` to `ReviewerManager` interface and implementation
   - Add `logWriter`, `stdoutRemainder`, `stderrRemainder` to `TrackedReviewerProcess`
   - Add JSONL log writer creation after spawn, stdout/stderr pipe capture with line-buffered handling
   - Add `sessionToken` to `recordSpawned` call
   - Add import for `createJsonlLogWriter`
   - Set up piped stdio (`['pipe', 'pipe', 'pipe']` instead of `'ignore'`) and attach data handlers
   - Flush remainder + close logWriter in `handleExit`

7. **Merge M006 changes into broker-service.ts** — Add:
   - Import `PoolManager` type from `./reviewer-pool.js`
   - Add `_setPoolManager` to `BrokerService` interface
   - Add `poolManagerRef` variable and `triggerReactiveScaling()` helper
   - Call `triggerReactiveScaling()` after `createReview` and `addMessage` (the two mutations that can create pending work)
   - Implement `_setPoolManager` method

8. **Update restart-persistence test migration assertions** — In `packages/review-broker-server/test/restart-persistence.test.ts`, add `'004_pool_management'` to the `appliedMigrations` and `schemaMigrations` assertion arrays. (See KNOWLEDGE.md gotcha: "restart-persistence migration count assertions drift when new migrations are added".)

9. **Merge M006 changes into app-context.ts and index.ts** — Add:
   - Import `PoolConfig` and `loadPoolConfig` in `app-context.ts`
   - Add `poolConfig` to `AppContext` interface and return value
   - Add `reviewer-pool.ts`, `pool-config.ts`, `jsonl-log-writer.ts` re-exports to `index.ts`
   - Add pool-related types to the `StartBrokerOptions` interface (poolSpawnCommand, poolSpawnArgs, poolLogDir)
   - Add `startBroker()` pool manager creation, `_setPoolManager` wiring, `poolStartupRecovery()`, background loop start, and `poolManager` in the runtime return

## Must-Haves

- [ ] `review-broker-core` domain types include `draining` status, pool audit events, `sessionToken`/`drainingAt` on `ReviewerRecord`
- [ ] `review-broker-core` builds successfully with new types
- [ ] `reviewer-pool.ts`, `pool-config.ts`, `jsonl-log-writer.ts`, migration 004 exist in M007
- [ ] `reviewers-repository.ts` supports `session_token`, `draining_at` columns and `markDraining()`
- [ ] `reviewer-manager.ts` supports `logDir`, `sessionToken`, `isProcessAlive()`, `getTrackedReviewerIds()`, piped stdio capture
- [ ] `broker-service.ts` has `_setPoolManager` and reactive scaling triggers
- [ ] `app-context.ts` loads `poolConfig`
- [ ] `index.ts` re-exports pool modules alongside agent modules
- [ ] S01's agent code (reviewer-agent.ts, reviewer-tools.ts, reviewer-prompt.ts) is preserved and still works
- [ ] Existing S01 agent tests pass
- [ ] M006 pool tests pass (or are adapted to work in M007)

## Verification

- `pnpm --filter review-broker-core build` succeeds
- `pnpm vitest run packages/review-broker-server/test/reviewer-agent.test.ts` — S01 agent tests still pass
- `pnpm vitest run packages/review-broker-server/test/reviewer-pool.test.ts` — M006 pool tests pass
- `pnpm vitest run packages/review-broker-server/test/pool-config.test.ts` — pool config tests pass
- `pnpm vitest run packages/review-broker-server/test/restart-persistence.test.ts` — migration 004 is picked up (update migration count assertions)

## Inputs

- `packages/review-broker-core/src/domain.ts` — current M007 domain types (need M006 additions)
- `packages/review-broker-core/src/contracts.ts` — current M007 contracts (need M006 additions)
- `packages/review-broker-server/src/db/reviewers-repository.ts` — current M007 repo (need M006 draining/session columns)
- `packages/review-broker-server/src/runtime/reviewer-manager.ts` — current M007 manager (need M006 logDir/session/piped-stdio)
- `packages/review-broker-server/src/runtime/broker-service.ts` — current M007 service (need M006 pool integration)
- `packages/review-broker-server/src/runtime/app-context.ts` — current M007 context (need poolConfig)
- `packages/review-broker-server/src/index.ts` — current M007 index (need pool re-exports)
- `packages/review-broker-server/src/agent/reviewer-agent.ts` — S01 agent factory (must be preserved)
- `packages/review-broker-server/src/agent/reviewer-tools.ts` — S01 agent tools (must be preserved)
- `packages/review-broker-server/test/reviewer-agent.test.ts` — S01 agent tests (must still pass)

## Expected Output

- `packages/review-broker-core/src/domain.ts` — updated with M006 pool types
- `packages/review-broker-core/src/contracts.ts` — updated with sessionToken/drainingAt
- `packages/review-broker-core/src/domain.d.ts` — updated declaration file
- `packages/review-broker-core/src/contracts.d.ts` — updated declaration file
- `packages/review-broker-server/src/runtime/reviewer-pool.ts` — new file (from M006)
- `packages/review-broker-server/src/runtime/pool-config.ts` — new file (from M006)
- `packages/review-broker-server/src/runtime/jsonl-log-writer.ts` — new file (from M006)
- `packages/review-broker-server/src/db/migrations/004_pool_management.sql` — new file (from M006)
- `packages/review-broker-server/src/db/reviewers-repository.ts` — updated with draining/session support
- `packages/review-broker-server/src/runtime/reviewer-manager.ts` — updated with logDir/session/piped-stdio
- `packages/review-broker-server/src/runtime/broker-service.ts` — updated with pool manager integration
- `packages/review-broker-server/src/runtime/app-context.ts` — updated with poolConfig
- `packages/review-broker-server/src/index.ts` — updated with pool re-exports
- `packages/review-broker-server/test/reviewer-pool.test.ts` — new file (from M006)
- `packages/review-broker-server/test/pool-config.test.ts` — new file (from M006)
- `packages/review-broker-server/test/restart-persistence.test.ts` — updated migration assertions
