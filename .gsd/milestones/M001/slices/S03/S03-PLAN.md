# S03: Reviewer lifecycle and recovery

**Goal:** Extend the standalone TypeScript broker so reviewer processes are broker-owned runtime entities with durable spawn/list/kill state, recovery-safe review reclaim behavior, and operator-visible failure diagnostics.
**Demo:** A local broker can spawn and list real reviewer child processes, kill or observe them going offline, reclaim limbo-prone reviews after reviewer exit or restart without clobbering newer claims, and expose reviewer/failure state through tests plus the real `start-broker --once` inspection path.

## Must-Haves

- `packages/review-broker-core` freezes reviewer lifecycle payloads, reviewer record shapes, and reviewer audit vocabulary for spawn/list/kill operations so downstream server, client, and MCP work can reuse one canonical contract, directly advancing R005.
- `packages/review-broker-server` adds additive reviewer persistence plus an isolated reviewer manager that tracks real child-process launch and exit state durably, derives reviewer assignment from `reviews.claimed_by` instead of duplicating a second assignment source of truth, and keeps cleanup/recovery logic out of the already-large `broker-service.ts`.
- The started broker exposes broker-owned reviewer spawn/list/kill behavior, marks reviewer exits and operator kills visibly in audit/state surfaces, reclaims only `claimed` and `submitted` reviews with `claim_generation` fencing on reviewer death or stale-session recovery, and surfaces reviewer/failure diagnostics through `inspectBrokerRuntime()` and `start-broker.ts --once`, closing R005 and R010 while advancing R001 and the M001 support portion of R012.

## Proof Level

- This slice proves: integration
- Real runtime required: yes
- Human/UAT required: no

## Verification

- `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-core/test/reviewer-contracts.test.ts`
- `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-server/test/sqlite-bootstrap.test.ts packages/review-broker-server/test/reviewer-lifecycle.test.ts packages/review-broker-server/test/reviewer-recovery.test.ts packages/review-broker-server/test/restart-persistence.test.ts packages/review-broker-server/test/start-broker.smoke.test.ts`
- `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-server/test/reviewer-lifecycle.test.ts`
- `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-server/test/reviewer-recovery.test.ts`
- `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 --filter review-broker-server exec tsx src/cli/start-broker.ts --db-path ./.tmp/s03-smoke.sqlite --once`

## Observability / Diagnostics

- Runtime signals: durable `reviewer.*` audit rows, per-review `review.reclaimed` metadata that records recovery cause, reviewer-state versions/topics for list invalidation, and structured reviewer snapshots in CLI/runtime inspection output.
- Inspection surfaces: SQLite `reviewers`, `reviews`, and `audit_events` tables; `packages/review-broker-server/test/reviewer-lifecycle.test.ts`; `packages/review-broker-server/test/reviewer-recovery.test.ts`; `inspectBrokerRuntime()`; and `packages/review-broker-server/src/cli/start-broker.ts --once`.
- Failure visibility: reviewer pid / exit code / signal / timestamps, offline reason, claimed review visibility, stale-session recovery cause, and reclaim outcomes remain inspectable after exit, operator kill, or restart.
- Redaction constraints: do not log environment variables, secret-bearing argv, or patch bodies; diagnostics should stick to reviewer IDs, command basenames, relative fixture paths, review IDs, statuses, timestamps, and exit metadata.

## Integration Closure

- Upstream surfaces consumed: `packages/review-broker-core/src/domain.ts`, `packages/review-broker-core/src/contracts.ts`, `packages/review-broker-core/src/notifications.ts`, `packages/review-broker-server/src/db/reviews-repository.ts`, `packages/review-broker-server/src/db/audit-repository.ts`, `packages/review-broker-server/src/runtime/app-context.ts`, `packages/review-broker-server/src/runtime/broker-service.ts`, and `packages/review-broker-server/src/index.ts`.
- New wiring introduced in this slice: shared reviewer schemas, `003_reviewer_lifecycle.sql`, `packages/review-broker-server/src/db/reviewers-repository.ts`, `packages/review-broker-server/src/runtime/reviewer-manager.ts`, broker-service reviewer operations, and reviewer visibility added to runtime/CLI inspection surfaces.
- What remains before the milestone is truly usable end-to-end: S04 still needs the typed client and MCP surfaces to consume the reviewer lifecycle contract, and S05 still needs final assembled parity proof across all broker surfaces.

## Tasks

- [x] **T01: Freeze reviewer lifecycle contracts and audit vocabulary** `est:1h`
  - Why: S03 cannot add runtime behavior safely until the shared package defines reviewer records, spawn/list/kill payloads, and reviewer-specific audit vocabulary that later slices must preserve.
  - Files: `packages/review-broker-core/src/domain.ts`, `packages/review-broker-core/src/domain.js`, `packages/review-broker-core/src/contracts.ts`, `packages/review-broker-core/src/contracts.js`, `packages/review-broker-core/src/index.ts`, `packages/review-broker-core/src/index.js`, `packages/review-broker-core/test/reviewer-contracts.test.ts`
  - Do: Add reviewer record schemas and request/response contracts for spawn/list/kill, extend audit event vocabulary for reviewer lifecycle visibility, keep reviewer assignment exposed as a derived `currentReviewId`/status view rather than a duplicated persisted assignment field, and update the checked-in source `.js` siblings in lockstep with the `.ts` files because this repo executes those runtime files directly in tests.
  - Verify: `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-core/test/reviewer-contracts.test.ts`
  - Done when: the core package exports reviewer lifecycle schemas and focused tests freeze the shared reviewer payloads, versions, and audit vocabulary without breaking the existing review lifecycle contract.
- [x] **T02: Persist reviewer state and isolate child-process management** `est:1h30m`
  - Why: Reviewer lifecycle needs durable storage plus a dedicated runtime seam for spawn/exit/kill/watch logic before broker-service can expose safe public operations.
  - Files: `packages/review-broker-server/src/db/migrations/003_reviewer_lifecycle.sql`, `packages/review-broker-server/src/db/reviewers-repository.ts`, `packages/review-broker-server/src/runtime/app-context.ts`, `packages/review-broker-server/src/runtime/reviewer-manager.ts`, `packages/review-broker-server/test/sqlite-bootstrap.test.ts`, `packages/review-broker-server/test/reviewer-manager.test.ts`, `packages/review-broker-server/test/fixtures/reviewer-worker.mjs`
  - Do: Add the additive migration and repository for reviewer launch/exit metadata, build a focused reviewer manager that spawns a real local fixture process and persists pid/offline state/kill results, wire the repository and manager into app context, and derive assigned/idle/offline state from reviewer liveness plus `reviews.claimed_by` instead of adding a second assignment table.
  - Verify: `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-server/test/sqlite-bootstrap.test.ts packages/review-broker-server/test/reviewer-manager.test.ts`
  - Done when: a fresh database applies migration `003_reviewer_lifecycle`, reviewer rows persist launch and exit metadata durably, and the isolated manager can spawn and observe a real fixture reviewer without leaked listeners or orphaned handles.
- [x] **T03: Expose reviewer spawn/list/kill through the broker runtime and CLI diagnostics** `est:1h30m`
  - Why: The slice demo requires broker-owned reviewer lifecycle operations and inspectable operator surfaces, not just internal manager primitives.
  - Files: `packages/review-broker-server/src/runtime/broker-service.ts`, `packages/review-broker-server/src/runtime/reviewer-manager.ts`, `packages/review-broker-server/src/index.ts`, `packages/review-broker-server/src/cli/start-broker.ts`, `packages/review-broker-server/test/reviewer-lifecycle.test.ts`, `packages/review-broker-server/test/start-broker.smoke.test.ts`
  - Do: Add `spawnReviewer`, `listReviewers`, and `killReviewer` service methods that use the manager/repository, keep `claimReview()` additive by continuing to accept arbitrary claimant IDs outside the registered reviewer pool, add reviewer notification/version handling, expose reviewer counts/latest reviewer snapshot in runtime and CLI inspection output, and make runtime shutdown wait surfaces reflect reviewer cleanup without leaving child processes behind.
  - Verify: `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-server/test/reviewer-lifecycle.test.ts packages/review-broker-server/test/start-broker.smoke.test.ts`
  - Done when: the started broker can spawn/list/kill real reviewer processes through its public service API, `start-broker.ts --once` reports reviewer visibility alongside review/audit counts, and shutdown does not strand fixture reviewers.
- [x] **T04: Reclaim reviews on reviewer exit and prove restart-safe recovery** `est:1h30m`
  - Why: S03 only retires the lifecycle risk when reviewer crashes, operator kills, and stale sessions recover safely and leave durable evidence for operators to inspect.
  - Files: `packages/review-broker-server/src/runtime/reviewer-manager.ts`, `packages/review-broker-server/src/runtime/broker-service.ts`, `packages/review-broker-server/src/index.ts`, `packages/review-broker-server/test/reviewer-recovery.test.ts`, `packages/review-broker-server/test/restart-persistence.test.ts`, `packages/review-broker-server/test/start-broker.smoke.test.ts`
  - Do: On observed reviewer exit and startup reconciliation, mark the reviewer offline durably, append reviewer-global audit rows plus per-review `review.reclaimed` metadata that names the cause (`reviewer_exit`, `operator_kill`, or `startup_recovery`), reclaim only `claimed` and `submitted` reviews through `claim_generation`-fenced updates, and extend restart/smoke proof so dead reviewers and reclaimed reviews remain inspectable after reopening the broker.
  - Verify: `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-server/test/reviewer-recovery.test.ts packages/review-broker-server/test/restart-persistence.test.ts packages/review-broker-server/test/start-broker.smoke.test.ts && corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 --filter review-broker-server exec tsx src/cli/start-broker.ts --db-path ./.tmp/s03-smoke.sqlite --once`
  - Done when: reviewer death or kill leaves durable offline and reclaim evidence, restart-safe recovery requeues only the intended limbo-prone reviews without overwriting newer claims, and the CLI/runtime inspection surfaces show enough reviewer metadata to debug recovery failures without attaching a debugger.

## Files Likely Touched

- `packages/review-broker-core/src/domain.ts`
- `packages/review-broker-core/src/domain.js`
- `packages/review-broker-core/src/contracts.ts`
- `packages/review-broker-core/src/contracts.js`
- `packages/review-broker-core/src/index.ts`
- `packages/review-broker-core/src/index.js`
- `packages/review-broker-core/test/reviewer-contracts.test.ts`
- `packages/review-broker-server/src/db/migrations/003_reviewer_lifecycle.sql`
- `packages/review-broker-server/src/db/reviewers-repository.ts`
- `packages/review-broker-server/src/runtime/app-context.ts`
- `packages/review-broker-server/src/runtime/reviewer-manager.ts`
- `packages/review-broker-server/src/runtime/broker-service.ts`
- `packages/review-broker-server/src/index.ts`
- `packages/review-broker-server/src/cli/start-broker.ts`
- `packages/review-broker-server/test/sqlite-bootstrap.test.ts`
- `packages/review-broker-server/test/reviewer-manager.test.ts`
- `packages/review-broker-server/test/reviewer-lifecycle.test.ts`
- `packages/review-broker-server/test/reviewer-recovery.test.ts`
- `packages/review-broker-server/test/restart-persistence.test.ts`
- `packages/review-broker-server/test/start-broker.smoke.test.ts`
- `packages/review-broker-server/test/fixtures/reviewer-worker.mjs`
