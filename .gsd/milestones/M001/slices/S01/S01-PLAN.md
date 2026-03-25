# S01: Broker core runtime with durable state

**Goal:** Stand up the standalone broker core as a TypeScript workspace with shared review contracts, SQLite-backed persistence, and a smokeable local runtime.
**Demo:** A local broker runtime can create, list, claim, inspect, and reopen reviews from the same SQLite file using shared TypeScript domain types instead of Python-only models.

## Must-Haves

- Shared TypeScript domain enums, payload schemas, transition rules, and notification primitives live in `packages/review-broker-core` and are consumed by server code and tests, directly advancing R002.
- `packages/review-broker-server` opens SQLite with explicit SQL migrations and durable PRAGMA setup, persists reviews/messages/audit rows including `claim_generation` and `claimed_at`, and survives restart against the same DB file, directly delivering R003.
- A standalone broker service and start command expose the S01 review surfaces (`createReview`, `listReviews`, `claimReview`, `getReviewStatus`, `getProposal`, `reclaimReview`) with diff validation, audit visibility, and restart-safe proof, materially advancing R001.

## Proof Level

- This slice proves: integration
- Real runtime required: yes
- Human/UAT required: no

## Verification

- `pnpm test -- --run packages/review-broker-core/test/contracts.test.ts packages/review-broker-core/test/state-machine.test.ts packages/review-broker-core/test/notifications.test.ts packages/review-broker-server/test/sqlite-bootstrap.test.ts packages/review-broker-server/test/path-resolution.test.ts packages/review-broker-server/test/broker-service.test.ts packages/review-broker-server/test/claim-concurrency.test.ts packages/review-broker-server/test/restart-persistence.test.ts packages/review-broker-server/test/start-broker.smoke.test.ts`
- `pnpm --filter review-broker-server exec tsx src/cli/start-broker.ts --db-path ./.tmp/s01-smoke.sqlite --once`
- `pnpm --filter review-broker-server exec tsx -e "import Database from 'better-sqlite3'; const db = new Database('./.tmp/s01-smoke.sqlite', { readonly: true }); const reviewCount = db.prepare('select count(*) as count from reviews').get(); const auditCount = db.prepare('select count(*) as count from audit_events').get(); const migrationCount = db.prepare('select count(*) as count from schema_migrations').get(); console.log(JSON.stringify({ reviewCount, auditCount, migrationCount })); db.close();"`

## Observability / Diagnostics

- Runtime signals: persisted `audit_events` rows for create/claim/reclaim outcomes, notification-bus version changes for wait semantics, and startup/migration errors that include the DB path.
- Inspection surfaces: SQLite `reviews`, `messages`, `audit_events`, and `schema_migrations` tables; Vitest integration output; CLI stdout/stderr from `src/cli/start-broker.ts`.
- Failure visibility: invalid diff rejection, stale-claim fencing, migration failure, and restart recovery state remain inspectable after the failing operation or reopen.
- Redaction constraints: avoid logging full patch bodies or local secrets; diagnostics should prefer review IDs, status values, filesystem paths, and error codes.

## Integration Closure

- Upstream surfaces consumed: `git` executable for `git apply --check`, `parse-diff` for affected-file extraction, and `better-sqlite3` for single-writer SQLite access.
- New wiring introduced in this slice: root workspace scripts, `packages/review-broker-core` shared exports, `packages/review-broker-server` DB bootstrap/service composition, and the standalone broker CLI entrypoint.
- What remains before the milestone is truly usable end-to-end: verdict/discussion/close parity, reviewer lifecycle and recovery flows, typed client and MCP adapters, and final assembled acceptance scenarios.

## Tasks

- [x] **T01: Bootstrap the TypeScript workspace and shared broker core** `est:1h`
  - Why: S01 starts from a greenfield repo, so the first increment must create a real TS workspace, test harness, and canonical domain package before persistence or runtime code can compose against it.
  - Files: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `packages/review-broker-core/package.json`, `packages/review-broker-core/src/domain.ts`, `packages/review-broker-core/src/contracts.ts`, `packages/review-broker-core/src/state-machine.ts`, `packages/review-broker-core/src/notifications.ts`
  - Do: Set up a pnpm + TypeScript + Vitest workspace, create `review-broker-core` exports for enums/contracts/state transitions/notification bus, and freeze the S01 vocabulary with core tests so later packages import one source of truth.
  - Verify: `pnpm test -- --run packages/review-broker-core/test/contracts.test.ts packages/review-broker-core/test/state-machine.test.ts packages/review-broker-core/test/notifications.test.ts`
  - Done when: the repo installs/builds as a workspace, the core package exports the S01 review vocabulary from one place, and the named core tests pass.
- [x] **T02: Add SQLite bootstrap, migrations, and persistence primitives** `est:1h`
  - Why: Durable state is the slice’s highest-risk contract, so explicit schema creation, PRAGMA setup, path resolution, and repository helpers need to exist before broker lifecycle code is written.
  - Files: `packages/review-broker-server/package.json`, `packages/review-broker-server/src/db/migrations/001_init.sql`, `packages/review-broker-server/src/db/open-database.ts`, `packages/review-broker-server/src/runtime/path-resolution.ts`, `packages/review-broker-server/src/db/reviews-repository.ts`, `packages/review-broker-server/src/db/audit-repository.ts`, `packages/review-broker-server/test/sqlite-bootstrap.test.ts`, `packages/review-broker-server/test/path-resolution.test.ts`
  - Do: Create the server package around `better-sqlite3`, implement idempotent migration/bootstrap code with WAL and related PRAGMAs, add DB/config path resolution matching the research guidance, and persist the review/audit tables needed by S01 operations.
  - Verify: `pnpm test -- --run packages/review-broker-server/test/sqlite-bootstrap.test.ts packages/review-broker-server/test/path-resolution.test.ts`
  - Done when: opening the DB is idempotent, schema tables exist with the S01 claim fields, PRAGMAs are asserted in tests, and file-backed reopen preserves inserted rows.
- [x] **T03: Implement broker review flows with diff validation and fencing** `est:1h30m`
  - Why: The slice demo is only true once the broker can perform real create/list/claim/status/proposal/reclaim behavior against durable state while preserving the current lifecycle semantics closely enough for later parity work.
  - Files: `packages/review-broker-server/src/runtime/broker-service.ts`, `packages/review-broker-server/src/runtime/diff.ts`, `packages/review-broker-server/src/runtime/app-context.ts`, `packages/review-broker-server/test/broker-service.test.ts`, `packages/review-broker-server/test/claim-concurrency.test.ts`, `packages/review-broker-server/test/fixtures/valid-review.diff`, `packages/review-broker-server/test/fixtures/invalid-review.diff`
  - Do: Wire the shared core package into a broker service, validate diffs with `git apply --check` and extract affected files with `parse-diff`, implement the S01 service methods with audit rows and notification wakeups, and add parity-oriented tests for happy-path, invalid-diff, and concurrent-claim scenarios.
  - Verify: `pnpm test -- --run packages/review-broker-server/test/broker-service.test.ts packages/review-broker-server/test/claim-concurrency.test.ts`
  - Done when: invalid diffs are rejected without persisted review rows, exactly one concurrent claim wins, and the S01 service methods all return shared-contract payloads.
- [x] **T04: Wire the standalone runtime entrypoint and restart-safe proof** `est:1h`
  - Why: S01 materially advances R001 only if the new broker can actually start as its own TS runtime and prove restart-safe persistence through a real entrypoint, not just through in-process helpers.
  - Files: `packages/review-broker-server/src/cli/start-broker.ts`, `packages/review-broker-server/src/index.ts`, `packages/review-broker-server/test/restart-persistence.test.ts`, `packages/review-broker-server/test/start-broker.smoke.test.ts`, `package.json`, `.gitignore`
  - Do: Expose a real broker start command, add a `--once` smoke mode for automation, compose DB open + app context + service startup in one place, and prove that a second runtime can reopen the same SQLite file and see prior review plus audit state.
  - Verify: `pnpm test -- --run packages/review-broker-server/test/restart-persistence.test.ts packages/review-broker-server/test/start-broker.smoke.test.ts && pnpm --filter review-broker-server exec tsx src/cli/start-broker.ts --db-path ./.tmp/s01-smoke.sqlite --once`
  - Done when: the standalone command initializes without any Python broker dependency, restart tests pass against a file-backed DB, and the smoke command can open an empty DB, migrate it, and exit cleanly.

## Files Likely Touched

- `package.json`
- `pnpm-workspace.yaml`
- `tsconfig.base.json`
- `packages/review-broker-core/src/domain.ts`
- `packages/review-broker-core/src/contracts.ts`
- `packages/review-broker-core/src/state-machine.ts`
- `packages/review-broker-core/src/notifications.ts`
- `packages/review-broker-server/src/db/migrations/001_init.sql`
- `packages/review-broker-server/src/db/open-database.ts`
- `packages/review-broker-server/src/runtime/broker-service.ts`
- `packages/review-broker-server/src/runtime/diff.ts`
- `packages/review-broker-server/src/cli/start-broker.ts`
