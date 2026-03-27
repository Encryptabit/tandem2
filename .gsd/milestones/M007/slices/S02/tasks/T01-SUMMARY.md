---
id: T01
parent: S02
milestone: M007
provides: []
requires: []
affects: []
key_files: ["packages/review-broker-core/src/domain.ts", "packages/review-broker-core/src/contracts.ts", "packages/review-broker-server/src/runtime/reviewer-pool.ts", "packages/review-broker-server/src/runtime/pool-config.ts", "packages/review-broker-server/src/runtime/jsonl-log-writer.ts", "packages/review-broker-server/src/db/migrations/004_pool_management.sql", "packages/review-broker-server/src/db/reviewers-repository.ts", "packages/review-broker-server/src/db/reviews-repository.ts", "packages/review-broker-server/src/runtime/reviewer-manager.ts", "packages/review-broker-server/src/runtime/broker-service.ts", "packages/review-broker-server/src/runtime/app-context.ts", "packages/review-broker-server/src/index.ts", "packages/review-broker-server/test/reviewer-pool.test.ts", "packages/review-broker-server/test/pool-config.test.ts", "packages/review-broker-server/test/restart-persistence.test.ts"]
key_decisions: ["Used git show to copy M006-only files verbatim rather than re-implementing", "Added countByStatus to reviews-repository — required by reviewer-pool.ts but missing from M007", "Fixed pool opt-in guard test to use REVIEW_BROKER_CONFIG_PATH env var override", "Checked out S01 agent files from milestone/M007 branch since not yet on main"]
patterns_established: []
drill_down_paths: []
observability_surfaces: []
duration: ""
verification_result: "All 4 verification test suites pass: review-broker-core build succeeds, reviewer-agent tests (2 pass), reviewer-pool tests (35 pass), pool-config tests (20 pass), restart-persistence tests (2 pass)."
completed_at: 2026-03-27T01:52:42.390Z
blocker_discovered: false
---

# T01: Ported all M006 pool management infrastructure into M007 alongside S01 agent code — 35 pool tests, 20 config tests, 2 persistence tests, and 2 agent tests pass

> Ported all M006 pool management infrastructure into M007 alongside S01 agent code — 35 pool tests, 20 config tests, 2 persistence tests, and 2 agent tests pass

## What Happened
---
id: T01
parent: S02
milestone: M007
key_files:
  - packages/review-broker-core/src/domain.ts
  - packages/review-broker-core/src/contracts.ts
  - packages/review-broker-server/src/runtime/reviewer-pool.ts
  - packages/review-broker-server/src/runtime/pool-config.ts
  - packages/review-broker-server/src/runtime/jsonl-log-writer.ts
  - packages/review-broker-server/src/db/migrations/004_pool_management.sql
  - packages/review-broker-server/src/db/reviewers-repository.ts
  - packages/review-broker-server/src/db/reviews-repository.ts
  - packages/review-broker-server/src/runtime/reviewer-manager.ts
  - packages/review-broker-server/src/runtime/broker-service.ts
  - packages/review-broker-server/src/runtime/app-context.ts
  - packages/review-broker-server/src/index.ts
  - packages/review-broker-server/test/reviewer-pool.test.ts
  - packages/review-broker-server/test/pool-config.test.ts
  - packages/review-broker-server/test/restart-persistence.test.ts
key_decisions:
  - Used git show to copy M006-only files verbatim rather than re-implementing
  - Added countByStatus to reviews-repository — required by reviewer-pool.ts but missing from M007
  - Fixed pool opt-in guard test to use REVIEW_BROKER_CONFIG_PATH env var override
  - Checked out S01 agent files from milestone/M007 branch since not yet on main
duration: ""
verification_result: passed
completed_at: 2026-03-27T01:52:42.394Z
blocker_discovered: false
---

# T01: Ported all M006 pool management infrastructure into M007 alongside S01 agent code — 35 pool tests, 20 config tests, 2 persistence tests, and 2 agent tests pass

**Ported all M006 pool management infrastructure into M007 alongside S01 agent code — 35 pool tests, 20 config tests, 2 persistence tests, and 2 agent tests pass**

## What Happened

M006's pool management code was absent from the M007 branch. This task ported it all: domain types (draining status, pool audit events, sessionToken/drainingAt), new files (reviewer-pool.ts, pool-config.ts, jsonl-log-writer.ts, migration 004), and merged shared files (reviewers-repository, reviewer-manager, broker-service, app-context, index.ts). Also added countByStatus() to reviews-repository (required by pool but missing), fixed the pool opt-in guard test config path, checked out S01 agent files from M007 branch, and added agent dependencies.

## Verification

All 4 verification test suites pass: review-broker-core build succeeds, reviewer-agent tests (2 pass), reviewer-pool tests (35 pass), pool-config tests (20 pass), restart-persistence tests (2 pass).

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `pnpm --filter review-broker-core build` | 0 | ✅ pass | 2500ms |
| 2 | `npx vitest run packages/review-broker-server/test/reviewer-agent.test.ts --exclude .gsd/**` | 0 | ✅ pass | 2500ms |
| 3 | `npx vitest run packages/review-broker-server/test/reviewer-pool.test.ts --exclude .gsd/**` | 0 | ✅ pass | 7500ms |
| 4 | `npx vitest run packages/review-broker-server/test/pool-config.test.ts --exclude .gsd/**` | 0 | ✅ pass | 2500ms |
| 5 | `npx vitest run packages/review-broker-server/test/restart-persistence.test.ts --exclude .gsd/**` | 0 | ✅ pass | 2500ms |


## Deviations

Added countByStatus() to reviews-repository (not in task plan but required by reviewer-pool.ts). Checked out S01 agent files from M007 branch. Added pi-agent-core and pi-ai dependencies. Fixed pool opt-in guard test with env override.

## Known Issues

None.

## Files Created/Modified

- `packages/review-broker-core/src/domain.ts`
- `packages/review-broker-core/src/contracts.ts`
- `packages/review-broker-server/src/runtime/reviewer-pool.ts`
- `packages/review-broker-server/src/runtime/pool-config.ts`
- `packages/review-broker-server/src/runtime/jsonl-log-writer.ts`
- `packages/review-broker-server/src/db/migrations/004_pool_management.sql`
- `packages/review-broker-server/src/db/reviewers-repository.ts`
- `packages/review-broker-server/src/db/reviews-repository.ts`
- `packages/review-broker-server/src/runtime/reviewer-manager.ts`
- `packages/review-broker-server/src/runtime/broker-service.ts`
- `packages/review-broker-server/src/runtime/app-context.ts`
- `packages/review-broker-server/src/index.ts`
- `packages/review-broker-server/test/reviewer-pool.test.ts`
- `packages/review-broker-server/test/pool-config.test.ts`
- `packages/review-broker-server/test/restart-persistence.test.ts`


## Deviations
Added countByStatus() to reviews-repository (not in task plan but required by reviewer-pool.ts). Checked out S01 agent files from M007 branch. Added pi-agent-core and pi-ai dependencies. Fixed pool opt-in guard test with env override.

## Known Issues
None.
