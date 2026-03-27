# S02: M006 pool infrastructure port to M007 — UAT

**Milestone:** M007
**Written:** 2026-03-27T01:55:52.187Z

# S02: M006 pool infrastructure port to M007 — UAT

**Milestone:** M007
**Written:** 2026-03-27

## UAT Type

- UAT mode: artifact-driven
- Why this mode is sufficient: This is a code port/merge slice — success is proven by all existing tests continuing to pass on the merged codebase. No new runtime behavior was introduced.

## Preconditions

- M007 worktree checked out with S01 agent code present
- `pnpm install` completed
- `review-broker-core` built (`pnpm --filter review-broker-core build`)

## Smoke Test

Run `npx vitest run packages/review-broker-server/test/reviewer-pool.test.ts --exclude '.gsd/**'` — 35 tests pass, confirming pool infrastructure is functional in the M007 codebase.

## Test Cases

### 1. Pool management tests pass in M007 context

1. Run `npx vitest run packages/review-broker-server/test/reviewer-pool.test.ts --exclude '.gsd/**'`
2. **Expected:** 35/35 tests pass — scaling, drain lifecycle, dead process reaping, idle timeout, claim timeout, session token persistence all work

### 2. Pool config validation tests pass

1. Run `npx vitest run packages/review-broker-server/test/pool-config.test.ts --exclude '.gsd/**'`
2. **Expected:** 20/20 tests pass — Zod schema validation, production-safe minimums, opt-in guard all work

### 3. Restart persistence includes pool migration

1. Run `npx vitest run packages/review-broker-server/test/restart-persistence.test.ts --exclude '.gsd/**'`
2. **Expected:** 2/2 tests pass — migration list includes `004_pool_management`, schema survives restart

### 4. S01 agent tests unbroken by merge

1. Run `npx vitest run packages/review-broker-server/test/reviewer-agent.test.ts --exclude '.gsd/**'`
2. **Expected:** 2/2 tests pass — agent lifecycle and tool execution still work alongside pool code

### 5. Core package builds cleanly with merged domain types

1. Run `pnpm --filter review-broker-core build`
2. **Expected:** Exit 0, no TypeScript errors — merged domain types (draining status, pool audit events, sessionToken) compile correctly

## Edge Cases

### countByStatus dependency

1. Confirm `countByStatus()` exists in `reviews-repository.ts`
2. Run pool tests that exercise scaling logic (which calls countByStatus)
3. **Expected:** No runtime errors — the function returns correct counts by review status

### Pool opt-in guard with env override

1. Run pool-config tests that test opt-in guard behavior
2. **Expected:** Tests use `REVIEW_BROKER_CONFIG_PATH` env var to point at test config files, guard correctly enables/disables pool based on config presence

## Failure Signals

- Any of the 5 test suites failing (59 tests total)
- TypeScript compilation errors in review-broker-core build
- Import resolution failures for pool modules
- Missing migration 004 in restart-persistence assertions

## Not Proven By This UAT

- Agent-based pool spawning (dual-mode spawn) — not yet implemented
- Runtime integration of pool + agent (no live broker test with both systems active)
- CLI pool commands working with agent-spawned reviewers

## Notes for Tester

This is a merge/port slice. All test cases verify that existing M006 tests pass in the M007 context. No new behavior was added — the value is coexistence of pool and agent infrastructure on one codebase.
