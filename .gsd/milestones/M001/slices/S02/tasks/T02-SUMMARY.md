---
id: T02
parent: S02
milestone: M001
provides:
  - Durable SQLite lifecycle storage for verdicts, round-aware discussion, counter-patch decisions, and activity feed reads in review-broker-server
key_files:
  - packages/review-broker-server/src/db/migrations/002_review_lifecycle_parity.sql
  - packages/review-broker-server/src/db/reviews-repository.ts
  - packages/review-broker-server/src/db/messages-repository.ts
  - packages/review-broker-server/src/db/audit-repository.ts
  - packages/review-broker-server/src/runtime/app-context.ts
  - packages/review-broker-server/test/sqlite-bootstrap.test.ts
key_decisions:
  - D013: Store lifecycle snapshot fields plus counter-patch decision payload on reviews, and persist discussion author role plus round number on messages via additive migration 002
patterns_established:
  - Additive broker migrations must update both sqlite-bootstrap coverage and start-broker smoke expectations because the CLI snapshots applied migration IDs and counts
observability_surfaces:
  - SQLite schema_migrations, reviews, messages, and audit_events tables
  - packages/review-broker-server/test/sqlite-bootstrap.test.ts
  - packages/review-broker-server/test/start-broker.smoke.test.ts
  - packages/review-broker-server/src/cli/start-broker.ts --once JSON output
duration: 1h18m
verification_result: passed
completed_at: 2026-03-21T03:56:36-07:00
blocker_discovered: false
---

# T02: Add durable lifecycle schema and repository support

**Added additive SQLite lifecycle persistence, round-aware discussion storage, activity feed readers, and migration-aware bootstrap proof for the standalone broker.**

## What Happened

I added `packages/review-broker-server/src/db/migrations/002_review_lifecycle_parity.sql` and kept `001_init.sql` untouched. Migration 002 extends `reviews` with durable lifecycle snapshot fields (`current_round`, `latest_verdict`, `verdict_reason`, `counter_patch_status`, `last_message_at`, `last_activity_at`) plus counter-patch decision payload fields (`counter_patch_decision_actor_id`, `counter_patch_decision_note`, `counter_patch_decided_at`). It also extends `messages` with `author_role` and `round_number`, and adds a round-aware chronological index.

In `packages/review-broker-server/src/db/reviews-repository.ts`, I replaced the temporary T01 defaults with real persisted lifecycle mapping. The repository now reads and writes the lifecycle columns directly, supports lifecycle-aware `updateState()` calls, exposes helper methods for `recordVerdict()`, `recordCounterPatchDecision()`, and `recordMessageActivity()`, and adds `getCounterPatchDecision()` so later runtime work can inspect the durable counter-patch payload without hand-written SQL.

I created `packages/review-broker-server/src/db/messages-repository.ts` as the dedicated discussion store. It persists author role and round number, returns chronological per-review or per-round discussion rows, and exposes latest-message helpers for both the whole review and a specific round.

In `packages/review-broker-server/src/db/audit-repository.ts`, I preserved the existing append/list helpers and added `listActivityForReview()` plus `getLatestForReview()` so activity feeds can be assembled from durable audit rows in chronological order with a stable `summary` field sourced from persisted metadata.

I wired the new messages repository into `packages/review-broker-server/src/runtime/app-context.ts` and exported it from `packages/review-broker-server/src/index.ts` so the runtime can compose it alongside reviews and audit state.

I expanded `packages/review-broker-server/test/sqlite-bootstrap.test.ts` to prove both migrations apply, the lifecycle columns and round-aware message index exist after open, and verdict/message/counter-patch/activity data survive reopen through the new repository helpers. Local reality exposed one adjacent verification drift: `packages/review-broker-server/test/start-broker.smoke.test.ts` still expected a single migration, so I updated it to assert the CLI-reported migration list and reopened `schema_migrations` count now reflect both `001_init` and `002_review_lifecycle_parity`.

## Verification

I first ran the task-level verification contract: the focused SQLite bootstrap test passed, and the workspace build passed with the new repository file and migration-aware repository interfaces.

I then ran the slice-level verification contract as required for an intermediate slice task. The shared core contract tests passed, the broader existing server suite passed once the smoke test expectation was updated for migration 002, and the real `start-broker.ts --once` smoke command emitted the expected structured JSON with both migration IDs. The only remaining slice-level failure is the targeted `review-lifecycle-parity.test.ts` command, which still reports "No test files found" because that proof file is scheduled for T04 and has not been created yet.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-server/test/sqlite-bootstrap.test.ts` | 0 | ✅ pass | 1.16s |
| 2 | `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 build` | 0 | ✅ pass | 2.52s |
| 3 | `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-core/test/contracts.test.ts packages/review-broker-core/test/state-machine.test.ts` | 0 | ✅ pass | 1.20s |
| 4 | `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-server/test/sqlite-bootstrap.test.ts packages/review-broker-server/test/broker-service.test.ts packages/review-broker-server/test/review-discussion.test.ts packages/review-broker-server/test/review-verdicts.test.ts packages/review-broker-server/test/review-lifecycle-parity.test.ts packages/review-broker-server/test/restart-persistence.test.ts packages/review-broker-server/test/start-broker.smoke.test.ts` | 0 | ✅ pass | 1.36s |
| 5 | `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-server/test/review-lifecycle-parity.test.ts --testNamePattern "invalid lifecycle transitions remain inspectable"` | 1 | ❌ fail | 0.56s |
| 6 | `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 --filter review-broker-server exec tsx src/cli/start-broker.ts --db-path ./.tmp/s02-smoke.sqlite --once` | 0 | ✅ pass | 0.82s |

## Diagnostics

Open the SQLite file created by `packages/review-broker-server/test/sqlite-bootstrap.test.ts` and inspect `schema_migrations`, `reviews`, `messages`, and `audit_events` to verify the durable lifecycle shape directly. Repository-level inspection points are now `createReviewsRepository().getById()`, `getCounterPatchDecision()`, `createMessagesRepository().listForReview()` / `getLatestForRound()`, and `createAuditRepository().listActivityForReview()`.

For runtime observability, `packages/review-broker-server/src/cli/start-broker.ts --once` now reports both migration IDs in `broker.started` and the applied migration count in `broker.once_complete`, which makes migration drift and bootstrap regressions visible without needing a long-running process.

## Deviations

- Updated `packages/review-broker-server/test/start-broker.smoke.test.ts` even though it was not listed in the T02 file set, because migration 002 changed the real CLI bootstrap output and the existing smoke assertion became stale immediately.

## Known Issues

- `packages/review-broker-server/test/review-lifecycle-parity.test.ts` still does not exist, so the slice-level targeted failure-path verification command continues to fail with "No test files found" until T04 adds that parity proof.

## Files Created/Modified

- `packages/review-broker-server/src/db/migrations/002_review_lifecycle_parity.sql` — added the additive lifecycle migration for reviews and messages without mutating `001_init.sql`.
- `packages/review-broker-server/src/db/reviews-repository.ts` — persisted lifecycle snapshot fields, counter-patch decision payloads, and lifecycle-specific update helpers.
- `packages/review-broker-server/src/db/messages-repository.ts` — added the dedicated round-aware discussion persistence repository.
- `packages/review-broker-server/src/db/audit-repository.ts` — added chronological activity-feed and latest-activity read helpers over durable audit rows.
- `packages/review-broker-server/src/runtime/app-context.ts` — wired the new messages repository into the runtime context.
- `packages/review-broker-server/src/index.ts` — exported the messages repository from the package surface.
- `packages/review-broker-server/test/sqlite-bootstrap.test.ts` — proved both migrations, the lifecycle schema shape, and reopen persistence for review/message/activity data.
- `packages/review-broker-server/test/start-broker.smoke.test.ts` — updated CLI migration expectations for the additive 002 schema change.
- `.gsd/DECISIONS.md` — recorded D013 for the durable lifecycle storage layout.
- `.gsd/KNOWLEDGE.md` — documented the migration-count smoke-test gotcha for future additive broker migrations.
