# S02: Full review lifecycle parity

**Goal:** Extend the standalone TypeScript broker so the shared contract, durable SQLite state, and runtime service preserve the existing review lifecycle for verdicts, discussion, activity, close/requeue, and counter-patch decisions.
**Demo:** A local broker can drive a review through create → claim → discussion → verdict → requeue or close, expose chronological discussion and activity data, reflect counter-patch decisions in proposal/status payloads, and prove those behaviors with parity-oriented tests plus the real `start-broker` smoke path.

## Must-Haves

- `packages/review-broker-core` freezes the S02 lifecycle contract for verdict submission, close, add-message, discussion retrieval, activity retrieval, and counter-patch decisions, while keeping TypeScript `submitted` as the broker’s equivalent of legacy Python `in_review`, directly delivering R004.
- `packages/review-broker-server` adds an additive `002_review_lifecycle_parity.sql` migration plus repository support for verdict reason, current round, counter-patch metadata, richer messages, and activity queries without editing `001_init.sql`, preserving restart-safe durability from S01.
- The standalone broker service persists verdict/discussion/activity/close/requeue/counter-patch behavior with explicit audit events and notification wakeups, and parity-oriented tests prove the contract-level lifecycle expected by downstream slices, closing R004 and advancing R001 and R010.

## Proof Level

- This slice proves: integration
- Real runtime required: yes
- Human/UAT required: no

## Verification

- `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-core/test/contracts.test.ts packages/review-broker-core/test/state-machine.test.ts`
- `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-server/test/sqlite-bootstrap.test.ts packages/review-broker-server/test/broker-service.test.ts packages/review-broker-server/test/review-discussion.test.ts packages/review-broker-server/test/review-verdicts.test.ts packages/review-broker-server/test/review-lifecycle-parity.test.ts packages/review-broker-server/test/restart-persistence.test.ts packages/review-broker-server/test/start-broker.smoke.test.ts`
- `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-server/test/review-lifecycle-parity.test.ts --testNamePattern "invalid lifecycle transitions remain inspectable"`
- `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 --filter review-broker-server exec tsx src/cli/start-broker.ts --db-path ./.tmp/s02-smoke.sqlite --once`

## Observability / Diagnostics

- Runtime signals: persisted `audit_events` for verdicts, discussion messages, close/requeue transitions, and counter-patch decisions; monotonic notification versions on `review-queue` plus `review-status:<reviewId>`; structured CLI JSON from `start-broker.ts --once`.
- Inspection surfaces: SQLite `reviews`, `messages`, `audit_events`, and `schema_migrations` tables; targeted Vitest files; CLI stdout/stderr from `packages/review-broker-server/src/cli/start-broker.ts`.
- Failure visibility: invalid lifecycle transitions, stale counter-patch decisions, current round / verdict reason drift, missing message history, and migration regressions remain inspectable after the failing operation.
- Redaction constraints: diagnostics must keep patch bodies and secrets out of logs; use review IDs, status values, affected-file metadata, and error codes instead.

## Integration Closure

- Upstream surfaces consumed: `packages/review-broker-core/src/domain.ts`, `packages/review-broker-core/src/contracts.ts`, `packages/review-broker-core/src/state-machine.ts`, `packages/review-broker-server/src/db/open-database.ts`, `packages/review-broker-server/src/db/reviews-repository.ts`, `packages/review-broker-server/src/db/audit-repository.ts`, `packages/review-broker-server/src/runtime/app-context.ts`, and `packages/review-broker-server/src/runtime/broker-service.ts`.
- New wiring introduced in this slice: shared lifecycle request/response schemas, `002_review_lifecycle_parity.sql`, `packages/review-broker-server/src/db/messages-repository.ts`, richer repository query/update helpers, and broker-service methods for verdict, discussion, activity, close, and counter-patch flows.
- What remains before the milestone is truly usable end-to-end: reviewer lifecycle and recovery work in S03, typed client and MCP surfaces in S04, and assembled multi-surface parity proof in S05.

## Tasks

- [x] **T01: Reconcile the shared lifecycle contract and transition table** `est:1h`
  - Why: The server cannot preserve parity safely until the shared TypeScript vocabulary explicitly defines verdict, discussion, close, requeue, activity, and counter-patch behavior.
  - Files: `packages/review-broker-core/src/domain.ts`, `packages/review-broker-core/src/contracts.ts`, `packages/review-broker-core/src/state-machine.ts`, `packages/review-broker-core/src/index.ts`, `packages/review-broker-core/test/contracts.test.ts`, `packages/review-broker-core/test/state-machine.test.ts`
  - Do: Extend the core domain and zod contracts for lifecycle operations, enrich proposal/status payloads with round/verdict/counter-patch metadata, and tighten the transition table so `submitted` is the TypeScript equivalent of legacy `in_review`, reviewer discussion can move `claimed -> submitted`, proposer follow-up after `changes_requested` can requeue to `pending`, and close only succeeds from the approved path.
  - Verify: `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-core/test/contracts.test.ts packages/review-broker-core/test/state-machine.test.ts`
  - Done when: the shared package exports the new lifecycle request/response shapes and the core tests freeze the intended S02 transition semantics.
- [x] **T02: Add durable lifecycle schema and repository support** `est:1h15m`
  - Why: Verdicts, discussion rounds, counter-patch metadata, and activity feeds need additive durable storage before runtime methods can implement parity behavior without raw SQL drift.
  - Files: `packages/review-broker-server/src/db/migrations/002_review_lifecycle_parity.sql`, `packages/review-broker-server/src/db/reviews-repository.ts`, `packages/review-broker-server/src/db/audit-repository.ts`, `packages/review-broker-server/src/db/messages-repository.ts`, `packages/review-broker-server/src/runtime/app-context.ts`, `packages/review-broker-server/test/sqlite-bootstrap.test.ts`
  - Do: Add an additive migration instead of editing `001_init.sql`, extend the review repository for verdict/counter-patch/current-round state, add a dedicated messages repository for chronological discussion storage, expand audit queries for activity reads, and wire the new repository into the app context.
  - Verify: `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-server/test/sqlite-bootstrap.test.ts`
  - Done when: a fresh or reopened SQLite file applies both migrations, exposes the new lifecycle columns/indexes, and the repositories can read/write the durable state S02 needs.
- [x] **T03: Implement verdict, discussion, activity, and counter-patch runtime flows** `est:1h30m`
  - Why: The slice demo depends on real broker-service behavior, not just schema preparation, so the runtime must persist lifecycle transitions and expose the shared payloads directly.
  - Files: `packages/review-broker-server/src/runtime/broker-service.ts`, `packages/review-broker-server/src/index.ts`, `packages/review-broker-server/test/broker-service.test.ts`, `packages/review-broker-server/test/review-discussion.test.ts`, `packages/review-broker-server/test/review-verdicts.test.ts`
  - Do: Implement `submitVerdict`, `closeReview`, `addMessage`, `getDiscussion`, `getActivityFeed`, `acceptCounterPatch`, and `rejectCounterPatch` in `broker-service.ts`, ensure activity/timeline queries are chronological and durable, and bump `review-queue` plus `review-status:<reviewId>` versions on every lifecycle mutation that should wake waiters.
  - Verify: `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-server/test/broker-service.test.ts packages/review-broker-server/test/review-discussion.test.ts packages/review-broker-server/test/review-verdicts.test.ts`
  - Done when: review status/proposal/activity/discussion surfaces all reflect persisted lifecycle state, and the focused service tests prove requeue, verdict, and counter-patch behavior.
- [x] **T04: Prove full lifecycle parity through end-to-end tests and smoke diagnostics** `est:1h`
  - Why: S02 only retires the parity risk when a fresh runtime can exercise the whole lifecycle contract and the smoke path still exposes migration/runtime state clearly.
  - Files: `packages/review-broker-server/test/review-lifecycle-parity.test.ts`, `packages/review-broker-server/test/restart-persistence.test.ts`, `packages/review-broker-server/test/start-broker.smoke.test.ts`, `packages/review-broker-server/src/cli/start-broker.ts`
  - Do: Add a parity-oriented end-to-end test that covers create → claim → discussion → changes_requested → proposer follow-up requeue and create → claim → approved → close with ordered activity output, update restart/smoke proof for the second migration and persisted lifecycle metadata, and keep the CLI JSON diagnostics aligned with the richer state.
  - Verify: `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-server/test/review-lifecycle-parity.test.ts packages/review-broker-server/test/restart-persistence.test.ts packages/review-broker-server/test/start-broker.smoke.test.ts && corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 --filter review-broker-server exec tsx src/cli/start-broker.ts --db-path ./.tmp/s02-smoke.sqlite --once`
  - Done when: the end-to-end lifecycle proof passes, the smoke path reopens a migrated DB cleanly, and S02’s slice-level verification contract is fully executable.

## Files Likely Touched

- `packages/review-broker-core/src/domain.ts`
- `packages/review-broker-core/src/contracts.ts`
- `packages/review-broker-core/src/state-machine.ts`
- `packages/review-broker-core/src/index.ts`
- `packages/review-broker-core/test/contracts.test.ts`
- `packages/review-broker-core/test/state-machine.test.ts`
- `packages/review-broker-server/src/db/migrations/002_review_lifecycle_parity.sql`
- `packages/review-broker-server/src/db/reviews-repository.ts`
- `packages/review-broker-server/src/db/audit-repository.ts`
- `packages/review-broker-server/src/db/messages-repository.ts`
- `packages/review-broker-server/src/runtime/app-context.ts`
- `packages/review-broker-server/src/runtime/broker-service.ts`
- `packages/review-broker-server/src/cli/start-broker.ts`
- `packages/review-broker-server/test/sqlite-bootstrap.test.ts`
- `packages/review-broker-server/test/broker-service.test.ts`
- `packages/review-broker-server/test/review-discussion.test.ts`
- `packages/review-broker-server/test/review-verdicts.test.ts`
- `packages/review-broker-server/test/review-lifecycle-parity.test.ts`
- `packages/review-broker-server/test/restart-persistence.test.ts`
- `packages/review-broker-server/test/start-broker.smoke.test.ts`
