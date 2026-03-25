---
id: T02
parent: S01
milestone: M001
provides:
  - SQLite-backed broker server bootstrap with idempotent migrations, explicit path resolution, and durable review/audit repositories for later service flows
key_files:
  - package.json
  - packages/review-broker-server/package.json
  - packages/review-broker-server/src/db/migrations/001_init.sql
  - packages/review-broker-server/src/db/open-database.ts
  - packages/review-broker-server/src/runtime/path-resolution.ts
  - packages/review-broker-server/src/db/reviews-repository.ts
  - packages/review-broker-server/src/db/audit-repository.ts
  - packages/review-broker-server/test/sqlite-bootstrap.test.ts
  - packages/review-broker-server/test/path-resolution.test.ts
key_decisions:
  - D008: Allow only `better-sqlite3` native install scripts via root `pnpm.onlyBuiltDependencies` so SQLite bindings build reproducibly under pnpm 10.
patterns_established:
  - Broker schema changes are shipped as ordered `.sql` files with checksum-tracked `schema_migrations` rows and idempotent startup application.
  - Review persistence stores `affectedFiles` as JSON, preserves `claim_generation` and `claimed_at`, and exposes compare-and-set style claim updates through repository helpers.
observability_surfaces:
  - File-backed Vitest coverage in `packages/review-broker-server/test/sqlite-bootstrap.test.ts` and `packages/review-broker-server/test/path-resolution.test.ts`
  - SQLite `schema_migrations`, `reviews`, `messages`, and `audit_events` tables created by `openDatabase()`
  - Root `package.json` `pnpm.onlyBuiltDependencies` allowlist for reproducible native SQLite installs
duration: 1h 08m
verification_result: passed
completed_at: 2026-03-21T02:52:21-07:00
blocker_discovered: false
---

# T02: Add SQLite bootstrap, migrations, and persistence primitives

**Added the `review-broker-server` package with idempotent SQLite migrations, explicit path resolution, and durable review/audit repositories.**

## What Happened

I created `packages/review-broker-server` as the new durable-state package, wired it to `review-broker-core`, and added the first explicit SQL migration in `packages/review-broker-server/src/db/migrations/001_init.sql`. The bootstrap layer in `packages/review-broker-server/src/db/open-database.ts` now opens a file-backed SQLite database, creates the parent directory, applies `journal_mode=WAL`, `busy_timeout`, `synchronous=NORMAL`, and `foreign_keys=ON`, tracks applied migrations in `schema_migrations`, and rejects checksum drift with DB-path-specific errors.

I also added `packages/review-broker-server/src/runtime/path-resolution.ts` so later runtime code has one explicit place to resolve workspace root, broker DB path, and config path. The precedence is now deterministic: explicit `dbPath` argument first, then `REVIEW_BROKER_DB_PATH`, then the XDG-style per-user default; config path similarly honors `REVIEW_BROKER_CONFIG_PATH` before falling back to a repo-local `.gsd/review-broker/config.json` path.

For persistence primitives, I added `packages/review-broker-server/src/db/reviews-repository.ts` and `packages/review-broker-server/src/db/audit-repository.ts`. Reviews now persist the S01 storage fields the later broker service needs, including `claim_generation`, `claimed_at`, `claimed_by`, durable proposal fields, and JSON-encoded affected files. Audit rows persist event type, actor, status transition context, error code, and structured metadata without storing patch bodies. The repository layer exposes compare-and-set style claim updates so T03 can enforce fencing without reshaping storage.

During verification, the first build failed because the root TypeScript path mapping pulled `review-broker-core` source files into the server package build. I fixed that by compiling the server package through `tsconfig.build.json`, which resolves the core package through its built output for package builds. The first SQLite test run then failed because `better-sqlite3` rejected undefined boolean options; I fixed the opener to pass only defined booleans. After that, the remaining failure was not code-level: pnpm 10 had skipped the native `better-sqlite3` install script. I explicitly allowlisted `better-sqlite3` in the root `package.json` under `pnpm.onlyBuiltDependencies`, forced a reinstall, and confirmed the SQLite bootstrap tests passed against the real native binding.

## Verification

I ran the task-level verification commands and confirmed the new server package builds and its file-backed SQLite/path-resolution tests pass. The SQLite bootstrap test proves the migration file creates `reviews`, `messages`, `audit_events`, and `schema_migrations`, asserts the durable PRAGMAs, and proves reopen safety by persisting a claimed review row plus an audit event across a close/reopen cycle.

Per the slice instructions, I also ran the full slice verification set. At T02, the slice-level test command still exits successfully while only the existing T01/T02 test files are present, so it is not yet a trustworthy end-to-end slice pass. The two runtime smoke commands correctly fail because `src/cli/start-broker.ts` and the smoke database file belong to later tasks (T04).

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `corepack pnpm test -- --run packages/review-broker-server/test/sqlite-bootstrap.test.ts packages/review-broker-server/test/path-resolution.test.ts` | 0 | ✅ pass | 1.36s |
| 2 | `corepack pnpm build` | 0 | ✅ pass | 2.46s |
| 3 | `corepack pnpm test -- --run packages/review-broker-core/test/contracts.test.ts packages/review-broker-core/test/state-machine.test.ts packages/review-broker-core/test/notifications.test.ts packages/review-broker-server/test/sqlite-bootstrap.test.ts packages/review-broker-server/test/path-resolution.test.ts packages/review-broker-server/test/broker-service.test.ts packages/review-broker-server/test/claim-concurrency.test.ts packages/review-broker-server/test/restart-persistence.test.ts packages/review-broker-server/test/start-broker.smoke.test.ts` | 0 | ❌ fail | 1.38s |
| 4 | `corepack pnpm --filter review-broker-server exec tsx src/cli/start-broker.ts --db-path ./.tmp/s01-smoke.sqlite --once` | 1 | ❌ fail | 0.54s |
| 5 | `corepack pnpm --filter review-broker-server exec tsx -e "import Database from \"better-sqlite3\"; const db = new Database(\"./.tmp/s01-smoke.sqlite\", { readonly: true }); const reviewCount = db.prepare(\"select count(*) as count from reviews\").get(); const auditCount = db.prepare(\"select count(*) as count from audit_events\").get(); const migrationCount = db.prepare(\"select count(*) as count from schema_migrations\").get(); console.log(JSON.stringify({ reviewCount, auditCount, migrationCount })); db.close();"` | 1 | ❌ fail | 0.73s |

## Diagnostics

Inspect the durable storage layer through:

- `packages/review-broker-server/test/sqlite-bootstrap.test.ts` for schema creation, PRAGMA assertions, migration idempotency, and reopen-safe review/audit persistence proof.
- `packages/review-broker-server/test/path-resolution.test.ts` for DB/config path precedence and workspace-root discovery behavior.
- `packages/review-broker-server/src/db/open-database.ts` for migration checksum enforcement and DB-path-specific startup errors.
- SQLite `schema_migrations`, `reviews`, `messages`, and `audit_events` tables in any DB created through `openDatabase()`.
- Root `package.json` for the `pnpm.onlyBuiltDependencies` allowlist needed to build the native SQLite binding in this harness.

## Deviations

- I added `packages/review-broker-server/tsconfig.build.json` and changed the server package build script to use it so package builds resolve `review-broker-core` through its built output instead of pulling core source files under the server package `rootDir`.
- I persisted pnpm’s generated `onlyBuiltDependencies` allowlist in the root `package.json` because native SQLite bindings will not build reliably in this harness without an explicit allowlist.

## Known Issues

- The slice-level `pnpm test -- --run ...` command still behaves as a partial proof at T02 because the later T03/T04 test files do not exist yet; it exits 0 while only the currently implemented files run.
- `corepack pnpm --filter review-broker-server exec tsx src/cli/start-broker.ts --db-path ./.tmp/s01-smoke.sqlite --once` still fails because the CLI entrypoint is planned for T04, not T02.
- The direct SQLite smoke inspection command still fails at T02 because no runtime has created `./.tmp/s01-smoke.sqlite` yet.

## Files Created/Modified

- `package.json` — persisted pnpm’s `onlyBuiltDependencies` allowlist so `better-sqlite3` native bindings build reproducibly in this workspace.
- `pnpm-lock.yaml` — updated the workspace lockfile for the new server package and native SQLite dependency.
- `packages/review-broker-server/package.json` — added the new server package metadata, dependencies, exports, and build/test scripts.
- `packages/review-broker-server/tsconfig.json` — added package-local TypeScript settings for source development.
- `packages/review-broker-server/tsconfig.build.json` — added a build-only TS config that resolves `review-broker-core` through built package output.
- `packages/review-broker-server/src/db/migrations/001_init.sql` — created the initial `reviews`, `messages`, and `audit_events` schema plus indexes.
- `packages/review-broker-server/src/db/open-database.ts` — implemented file-backed DB open, PRAGMA setup, migration tracking, checksum enforcement, and DB-path-specific startup errors.
- `packages/review-broker-server/src/runtime/path-resolution.ts` — implemented explicit workspace/db/config path resolution with argument and env precedence.
- `packages/review-broker-server/src/db/reviews-repository.ts` — added durable review persistence helpers, JSON affected-file storage, and claim-generation-aware state updates.
- `packages/review-broker-server/src/db/audit-repository.ts` — added durable audit-event persistence helpers with structured metadata.
- `packages/review-broker-server/src/index.ts` — exposed the server package bootstrap and repository APIs.
- `packages/review-broker-server/test/sqlite-bootstrap.test.ts` — added file-backed migration/PRAGMA/idempotency/reopen tests.
- `packages/review-broker-server/test/path-resolution.test.ts` — added path precedence and workspace-root resolution tests.
- `.gsd/DECISIONS.md` — recorded D008 for the pnpm 10 native-build allowlist decision.
- `.gsd/KNOWLEDGE.md` — recorded the pnpm 10 native-build workaround for future agents.
- `.gsd/milestones/M001/slices/S01/S01-PLAN.md` — marked T02 complete.
