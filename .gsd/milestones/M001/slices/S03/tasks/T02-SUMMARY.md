---
id: T02
parent: S03
milestone: M001
provides:
  - Durable reviewer persistence, a dedicated reviewer child-process manager, and focused real-process verification for reviewer spawn/stop state
key_files:
  - packages/review-broker-server/src/db/migrations/003_reviewer_lifecycle.sql
  - packages/review-broker-server/src/db/reviewers-repository.ts
  - packages/review-broker-server/src/runtime/reviewer-manager.ts
  - packages/review-broker-server/src/runtime/app-context.ts
  - packages/review-broker-server/test/sqlite-bootstrap.test.ts
  - packages/review-broker-server/test/reviewer-manager.test.ts
key_decisions:
  - Derived reviewer `status` and `currentReviewId` at read time from reviewer liveness plus `reviews.claimed_by` for active `claimed`/`submitted` rows instead of persisting a second assignment field
  - Kept child-process ownership inside `reviewer-manager.ts`, with app-context teardown detaching listeners before closing SQLite and then signalling child shutdown
patterns_established:
  - Additive reviewer migrations must update bootstrap/restart/smoke migration-count expectations together with the new repository/manager coverage
observability_surfaces:
  - packages/review-broker-server/test/reviewer-manager.test.ts
  - packages/review-broker-server/test/sqlite-bootstrap.test.ts
  - SQLite `reviewers` rows plus global `reviewer.*` audit events
  - `reviewer-state` notification topic/version bumps from reviewer-manager mutations
duration: 1h35m
verification_result: passed
completed_at: 2026-03-21T12:23:30Z
blocker_discovered: false
---

# T02: Persist reviewer state and isolate child-process management

**Added durable reviewer storage plus an isolated reviewer manager that spawns, stops, and records real reviewer processes with focused fixture coverage.**

## What Happened

I added `packages/review-broker-server/src/db/migrations/003_reviewer_lifecycle.sql`, which creates the durable `reviewers` table plus reviewer-oriented indexes and a supporting `reviews(claimed_by, status, updated_at)` index so later list/recovery flows can derive assignment cheaply without adding a second assignment column.

I implemented `packages/review-broker-server/src/db/reviewers-repository.ts` as the persistence seam for reviewer runtime state. It records spawn success, spawn failure, offline transitions, and derived reviewer status/current-review views by joining live reviewer rows against `reviews.claimed_by` for active `claimed`/`submitted` reviews.

I added `packages/review-broker-server/src/runtime/reviewer-manager.ts` as the dedicated child-process seam. It owns spawn/stop behavior, records `reviewer.spawned` / `reviewer.spawn_failed` / `reviewer.killed` / `reviewer.offline` audit rows, bumps the `reviewer-state` notification topic, sanitizes persisted command diagnostics to basename/relative-path form for the local fixture flow, and detaches process listeners before shutdown so late child exits do not hit a closed SQLite handle.

I wired the new repository and manager into `packages/review-broker-server/src/runtime/app-context.ts` and re-exported them from `packages/review-broker-server/src/index.ts`. `broker-service.ts` stayed free of ad hoc subprocess branches, which preserves the intended separation for later T03/T04 runtime work.

For proof, I added `packages/review-broker-server/test/fixtures/reviewer-worker.mjs` as the real local reviewer process used by `packages/review-broker-server/test/reviewer-manager.test.ts`. That test exercises an actual spawned Node child, verifies durable launch/offline state plus `reviewer.*` audit rows, checks `reviewer-state` version bumps, and confirms the manager’s tracked listener/process registry is empty after stop.

I also rewrote `packages/review-broker-server/test/sqlite-bootstrap.test.ts` to cover migration `003_reviewer_lifecycle` and reviewer-row durability, and I updated the existing migration-count expectations in restart/smoke parity tests to account for the new additive migration.

## Verification

Task-level verification passed:
- `sqlite-bootstrap.test.ts` now proves the reviewer schema, indexes, migration set, and durable reviewer row persistence.
- `reviewer-manager.test.ts` passes against a real local fixture process and verifies spawn/stop cleanup plus durable offline/audit state.
- The package build passed after the repository/manager wiring landed.
- The required fixture file exists on disk.

Slice-level verification was partially run as required for this intermediate task:
- `reviewer-contracts.test.ts` still passes, so the shared core reviewer contract remained intact.
- `start-broker.ts --once` passes and reports the new migration set cleanly.
- The explicit `reviewer-recovery.test.ts` slice command still fails because that future-task proof file does not exist yet.
- The broad server-suite slice command failed before wrap-up because `start-broker.smoke.test.ts` still had stale first-run migration expectations; I updated that smoke test immediately afterward, but the full suite was not rerun before the context-budget warning forced wrap-up.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `test -f /home/cari/repos/tandem2/.gsd/worktrees/M001/packages/review-broker-server/test/fixtures/reviewer-worker.mjs` | 0 | ✅ pass | n/a |
| 2 | `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 --filter review-broker-server run build` | 0 | ✅ pass | 3.10s |
| 3 | `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-server/test/sqlite-bootstrap.test.ts packages/review-broker-server/test/reviewer-manager.test.ts` | 0 | ✅ pass | 0.46s |
| 4 | `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-core/test/reviewer-contracts.test.ts` | 0 | ✅ pass | 0.81s |
| 5 | `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-server/test/sqlite-bootstrap.test.ts packages/review-broker-server/test/reviewer-lifecycle.test.ts packages/review-broker-server/test/reviewer-recovery.test.ts packages/review-broker-server/test/restart-persistence.test.ts packages/review-broker-server/test/start-broker.smoke.test.ts` | 1 | ❌ fail | 1.37s |
| 6 | `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-server/test/reviewer-recovery.test.ts` | 1 | ❌ fail | 3.00s |
| 7 | `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 --filter review-broker-server exec tsx src/cli/start-broker.ts --db-path ./.tmp/s03-smoke.sqlite --once` | 0 | ✅ pass | 3.00s |

## Diagnostics

Inspect the reviewer runtime added in this task via:
- `packages/review-broker-server/test/reviewer-manager.test.ts` for the real-process spawn/stop proof and listener cleanup expectations.
- `packages/review-broker-server/test/sqlite-bootstrap.test.ts` for durable reviewer-row persistence and migration/index coverage.
- Direct SQLite reads from the `reviewers` and `audit_events` tables to inspect pid, launch/offline timestamps, offline reason, exit metadata, and reviewer-global audit rows.
- `reviewer-state` notification versions in `AppContext.notifications` for list invalidation signals already emitted by reviewer-manager mutations.

## Deviations

- I updated existing migration-count assertions in `restart-persistence.test.ts`, `review-lifecycle-parity.test.ts`, and `start-broker.smoke.test.ts` even though only bootstrap/manager files were listed in the task plan, because the additive migration would otherwise break slice-level verification surfaces immediately.

## Known Issues

- `packages/review-broker-server/test/reviewer-recovery.test.ts` does not exist yet, so the explicit slice verification command for that file still fails as expected until T04.
- The full slice server-suite command was run once and failed on stale first-run smoke expectations. I updated `packages/review-broker-server/test/start-broker.smoke.test.ts` afterward, but did not rerun the full suite before the context-budget warning forced wrap-up.

## Files Created/Modified

- `packages/review-broker-server/src/db/migrations/003_reviewer_lifecycle.sql` — added the durable reviewer table and supporting reviewer/claim indexes.
- `packages/review-broker-server/src/db/reviewers-repository.ts` — added reviewer spawn/failure/offline persistence with derived status/current-review reads.
- `packages/review-broker-server/src/runtime/reviewer-manager.ts` — added the isolated child-process manager, reviewer audit persistence, notification bumps, and teardown-safe listener cleanup.
- `packages/review-broker-server/src/runtime/app-context.ts` — wired reviewer repository/manager into the runtime context and teardown path.
- `packages/review-broker-server/src/index.ts` — re-exported the new reviewer repository and manager seams.
- `packages/review-broker-server/test/fixtures/reviewer-worker.mjs` — added the real local reviewer fixture process used by tests.
- `packages/review-broker-server/test/reviewer-manager.test.ts` — added focused real-process manager coverage for spawn/stop persistence and cleanup.
- `packages/review-broker-server/test/sqlite-bootstrap.test.ts` — extended bootstrap proof to cover migration `003_reviewer_lifecycle` and durable reviewer rows.
- `packages/review-broker-server/test/restart-persistence.test.ts` — updated migration expectations for the additive reviewer migration.
- `packages/review-broker-server/test/review-lifecycle-parity.test.ts` — updated runtime snapshot migration-count expectations.
- `packages/review-broker-server/test/start-broker.smoke.test.ts` — updated smoke expectations for migration `003_reviewer_lifecycle`.
- `.gsd/KNOWLEDGE.md` — recorded the teardown rule about detaching child-process listeners before closing SQLite.
