---
id: S02
parent: M007
milestone: M007
provides:
  - M006 pool management infrastructure (reviewer-pool, pool-config, JSONL writer, migration 004) coexisting with S01 agent code on M007 branch
  - countByStatus() on reviews-repository for pool scaling decisions
requires:
  []
affects:
  []
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
patterns_established:
  - Cross-milestone port via git show — copy verbatim from source branch, then merge shared files manually
observability_surfaces:
  - none
drill_down_paths:
  - .gsd/milestones/M007/slices/S02/tasks/T01-SUMMARY.md
duration: ""
verification_result: passed
completed_at: 2026-03-27T01:55:52.187Z
blocker_discovered: false
---

# S02: M006 pool infrastructure port to M007

**Ported all M006 pool management infrastructure (reviewer-pool, pool-config, JSONL writer, migration 004, and updated repositories/runtime) into M007 alongside S01 agent code — 59 tests pass across 5 suites**

## What Happened

M007's S01 delivered the in-process reviewer agent but worked on a branch that had diverged from M006's pool management code. S02 bridged the gap by porting every M006-only file and change into M007.

T01 used `git show` to copy M006-only files verbatim (reviewer-pool.ts, pool-config.ts, jsonl-log-writer.ts, migration 004_pool_management.sql) and then merged shared files that had M006 additions (reviewers-repository.ts, reviews-repository.ts, reviewer-manager.ts, broker-service.ts, app-context.ts, index.ts). Domain types (draining status, pool audit events, sessionToken/drainingAt) were merged into review-broker-core's domain.ts and contracts.ts.

One gap was discovered: reviewer-pool.ts depends on `countByStatus()` in reviews-repository, which M007 didn't have. This was added as a deviation. The pool opt-in guard test needed a fix to use the `REVIEW_BROKER_CONFIG_PATH` env var override. S01 agent files were also checked out from the M007 branch since they weren't yet on main, and pi-agent-core/pi-ai link dependencies were added.

After the port, all five test suites pass: review-broker-core builds cleanly, reviewer-agent (2 tests), reviewer-pool (35 tests), pool-config (20 tests), and restart-persistence (2 tests). The M006 pool infrastructure and S01 agent infrastructure now coexist on the same codebase, ready for the next slice to wire them together.

## Verification

All 5 verification suites pass (59 tests total):
- `pnpm --filter review-broker-core build` — exit 0, TypeScript compilation succeeds
- `vitest run reviewer-agent.test.ts` — 2/2 pass (145ms)
- `vitest run reviewer-pool.test.ts` — 35/35 pass (6091ms)
- `vitest run pool-config.test.ts` — 20/20 pass (45ms)
- `vitest run restart-persistence.test.ts` — 2/2 pass (150ms)

## Requirements Advanced

None.

## Requirements Validated

None.

## New Requirements Surfaced

None.

## Requirements Invalidated or Re-scoped

None.

## Deviations

Added countByStatus() to reviews-repository — not in task plan but required by reviewer-pool.ts. Checked out S01 agent files from M007 branch. Added pi-agent-core and pi-ai link dependencies. Fixed pool opt-in guard test with REVIEW_BROKER_CONFIG_PATH env var override.

## Known Limitations

The pool manager still only spawns subprocess-based reviewers. The agent-based spawn path (dual-mode spawn) was not part of this slice — it will be wired in a subsequent slice.

## Follow-ups

Next slice should wire createReviewerAgent() into the pool manager as an alternative to subprocess spawn, extend PoolConfig with model/provider fields, and handle PID-less reviewer DB registration for in-process agents.

## Files Created/Modified

- `packages/review-broker-core/src/domain.ts` — Added draining status, pool audit event types, sessionToken/drainingAt fields from M006
- `packages/review-broker-core/src/contracts.ts` — Added pool-related contract types from M006
- `packages/review-broker-server/src/runtime/reviewer-pool.ts` — New file — M006 pool manager with background scaling loop, drain lifecycle, reactive scaling
- `packages/review-broker-server/src/runtime/pool-config.ts` — New file — Zod-validated pool configuration with production-safe minimums
- `packages/review-broker-server/src/runtime/jsonl-log-writer.ts` — New file — JSONL structured log writer for reviewer output capture
- `packages/review-broker-server/src/db/migrations/004_pool_management.sql` — New migration — pool management schema (sessionToken, drainingAt columns)
- `packages/review-broker-server/src/db/reviewers-repository.ts` — Merged M006 additions for pool lifecycle queries
- `packages/review-broker-server/src/db/reviews-repository.ts` — Added countByStatus() required by pool scaling logic
- `packages/review-broker-server/src/runtime/reviewer-manager.ts` — Merged M006 subprocess spawn and lifecycle changes
- `packages/review-broker-server/src/runtime/broker-service.ts` — Merged M006 pool-aware service methods
- `packages/review-broker-server/src/runtime/app-context.ts` — Merged M006 pool initialization and lifecycle integration
- `packages/review-broker-server/src/index.ts` — Re-exports for pool and agent modules
- `packages/review-broker-server/test/reviewer-pool.test.ts` — 35 pool integration tests from M006
- `packages/review-broker-server/test/pool-config.test.ts` — 20 pool config validation tests from M006
- `packages/review-broker-server/test/restart-persistence.test.ts` — Updated migration assertions for 004_pool_management
