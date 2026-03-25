---
estimated_steps: 5
estimated_files: 6
skills_used:
  - gsd
  - best-practices
  - test
  - debug-like-expert
---

# T02: Add durable lifecycle schema and repository support

**Slice:** S02 — Full review lifecycle parity
**Milestone:** M001

## Description

Add the additive durable state needed for full lifecycle parity. This task should make the SQLite layer capable of storing verdicts, discussion rounds, counter-patch decisions, and activity metadata without editing the historical `001_init.sql` migration that S01 already proved restart-safe.

## Steps

1. Create `packages/review-broker-server/src/db/migrations/002_review_lifecycle_parity.sql` to extend `reviews` and `messages` with the fields S02 needs, keeping `001_init.sql` unchanged.
2. Extend `packages/review-broker-server/src/db/reviews-repository.ts` with read/write helpers for verdict reason, current round, counter-patch payloads, and lifecycle-aware state updates.
3. Add `packages/review-broker-server/src/db/messages-repository.ts` for chronological discussion persistence, round-aware queries, and latest-message retrieval, and extend `packages/review-broker-server/src/db/audit-repository.ts` with the read helpers needed for activity feeds.
4. Wire the new repository into `packages/review-broker-server/src/runtime/app-context.ts` so runtime code can compose it the same way as reviews and audit state.
5. Update `packages/review-broker-server/test/sqlite-bootstrap.test.ts` to prove both migrations apply idempotently and that the lifecycle columns/indexes exist after reopen.

## Must-Haves

- [ ] The new lifecycle fields arrive through `002_review_lifecycle_parity.sql`, not by mutating `packages/review-broker-server/src/db/migrations/001_init.sql`.
- [ ] Repository helpers exist for durable verdict, counter-patch, message, and activity state so `broker-service.ts` does not need to hand-roll schema-specific SQL.
- [ ] SQLite bootstrap proof asserts the second migration and the new lifecycle storage shape on a reopened database file.

## Verification

- `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-server/test/sqlite-bootstrap.test.ts`
- `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 build`

## Observability Impact

- Signals added/changed: durable lifecycle columns on `reviews`, richer `messages` rows, and activity-queryable audit metadata after migration 002.
- How a future agent inspects this: by opening the SQLite file created in `packages/review-broker-server/test/sqlite-bootstrap.test.ts` and by reading repository-level failures against the migrated schema.
- Failure state exposed: migration checksum drift, missing lifecycle columns, and message/activity schema mismatches become explicit startup or test failures.

## Inputs

- `packages/review-broker-server/src/db/migrations/001_init.sql` — immutable baseline schema from S01 that must remain untouched.
- `packages/review-broker-server/src/db/open-database.ts` — migration runner with checksum enforcement.
- `packages/review-broker-server/src/db/reviews-repository.ts` — existing durable review helpers to extend.
- `packages/review-broker-server/src/db/audit-repository.ts` — existing durable audit helpers to extend for activity reads.
- `packages/review-broker-server/src/runtime/app-context.ts` — runtime composition entrypoint that needs the new repository binding.
- `packages/review-broker-server/test/sqlite-bootstrap.test.ts` — existing migration/bootstrap proof to extend.
- `.gsd/milestones/M001/slices/S02/tasks/T01-PLAN.md` — shared lifecycle semantics the storage layer must support.

## Expected Output

- `packages/review-broker-server/src/db/migrations/002_review_lifecycle_parity.sql` — additive lifecycle migration.
- `packages/review-broker-server/src/db/reviews-repository.ts` — extended durable review helpers for S02 state.
- `packages/review-broker-server/src/db/audit-repository.ts` — activity-query helpers over persisted audit rows.
- `packages/review-broker-server/src/db/messages-repository.ts` — dedicated discussion/message persistence helpers.
- `packages/review-broker-server/src/runtime/app-context.ts` — runtime composition that exposes the new repository.
- `packages/review-broker-server/test/sqlite-bootstrap.test.ts` — migration/bootstrap proof for the S02 schema.
