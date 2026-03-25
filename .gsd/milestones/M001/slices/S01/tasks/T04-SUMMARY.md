---
id: T04
parent: S01
milestone: M001
provides:
  - A standalone broker runtime entrypoint with `--once` smoke mode, reusable startup helpers, and restart-safe SQLite proof through the real CLI path
key_files:
  - package.json
  - packages/review-broker-server/package.json
  - packages/review-broker-server/src/index.ts
  - packages/review-broker-server/src/cli/start-broker.ts
  - packages/review-broker-server/test/restart-persistence.test.ts
  - packages/review-broker-server/test/start-broker.smoke.test.ts
key_decisions:
  - D010: Expose startup through a reusable `startBroker()` helper plus the package CLI/bin, and emit structured JSON startup events with redacted runtime diagnostics.
patterns_established:
  - `packages/review-broker-server/src/index.ts` now owns runtime startup composition so later slices can launch the broker either in-process (`startBroker()`) or through the standalone CLI without duplicating DB/context/service wiring.
  - The CLI `--once` mode emits `broker.started` and `broker.once_complete` JSON events, then exits after reporting migration and row-count state for automation-friendly smoke checks.
observability_surfaces:
  - CLI stdout/stderr JSON events: `broker.started`, `broker.once_complete`, and `broker.start_failed`
  - `packages/review-broker-server/test/restart-persistence.test.ts` and `packages/review-broker-server/test/start-broker.smoke.test.ts`
  - SQLite `reviews`, `audit_events`, and `schema_migrations` tables in the smoke DB created by the standalone command
duration: 56m
verification_result: passed
completed_at: 2026-03-21T03:16:59-07:00
blocker_discovered: false
---

# T04: Wire the standalone runtime entrypoint and restart-safe proof

**Added a standalone broker CLI with `--once` smoke mode and restart-safe SQLite proof through the real entrypoint.**

## What Happened

I turned the in-process server package into a real launch surface by extending `packages/review-broker-server/src/index.ts` with a reusable `startBroker()` helper and `inspectBrokerRuntime()` snapshot function. That keeps the existing app-context and broker-service composition in one place for later client/MCP slices instead of forcing every caller to wire SQLite, repositories, notifications, and service creation by hand.

On top of that reusable surface, I added `packages/review-broker-server/src/cli/start-broker.ts` as the standalone command. It supports `--db-path`, `--cwd`, `--busy-timeout-ms`, `--help`, and an automation-friendly `--once` mode. Startup now emits structured JSON diagnostics that include the resolved DB path, workspace root, config path, PRAGMAs, and applied migration IDs; `--once` additionally emits row-count snapshots and exits cleanly. Failures surface through `broker.start_failed` stderr output without logging diff bodies or secrets.

I updated the package manifests so later slices have real launch points: the server package now exposes a `review-broker-server` bin plus local `start` and `start:once` scripts, and the workspace root now has `broker:start`, `broker:smoke`, and `broker:test` commands. I also ignored `/.tmp` artifacts so the smoke database used by the verification contract stays out of version control.

For proof, I added `packages/review-broker-server/test/restart-persistence.test.ts`, which creates and claims a review against a file-backed DB, reopens the same SQLite file through a fresh runtime instance, and confirms the persisted review, proposal metadata, and audit rows remain intact. I also added `packages/review-broker-server/test/start-broker.smoke.test.ts`, which invokes the real CLI entrypoint through `tsx`, runs it twice in `--once` mode against the same DB file, verifies the structured startup output, and inspects SQLite directly to confirm migrations/reopen safety without any Python broker dependency.

I also recorded D010 for the reusable startup surface plus JSON-line runtime diagnostics, and added a knowledge note that `corepack pnpm --filter review-broker-server exec ...` resolves relative paths from `packages/review-broker-server`, which matters for locating the smoke DB created by the slice verification commands.

## Verification

I first ran the targeted restart/smoke Vitest files directly to prove the new runtime behaviors in isolation, then rebuilt the workspace to confirm the new CLI/bin exports compile cleanly. After that, I ran the full S01 slice verification contract: the complete nine-file Vitest suite, the real standalone smoke command, and the direct SQLite inspection command against the smoke DB created by the CLI. All required checks passed.

TypeScript LSP diagnostics were unavailable in this harness because no language server is installed, so static verification for this task relied on the successful workspace build plus the passing Vitest and CLI smoke checks.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `cd /home/cari/repos/tandem2/.gsd/worktrees/M001 && corepack pnpm exec vitest run packages/review-broker-server/test/restart-persistence.test.ts packages/review-broker-server/test/start-broker.smoke.test.ts` | 0 | ✅ pass | 1.364s |
| 2 | `cd /home/cari/repos/tandem2/.gsd/worktrees/M001 && corepack pnpm build` | 0 | ✅ pass | 2.231s |
| 3 | `cd /home/cari/repos/tandem2/.gsd/worktrees/M001 && corepack pnpm test -- --run packages/review-broker-core/test/contracts.test.ts packages/review-broker-core/test/state-machine.test.ts packages/review-broker-core/test/notifications.test.ts packages/review-broker-server/test/sqlite-bootstrap.test.ts packages/review-broker-server/test/path-resolution.test.ts packages/review-broker-server/test/broker-service.test.ts packages/review-broker-server/test/claim-concurrency.test.ts packages/review-broker-server/test/restart-persistence.test.ts packages/review-broker-server/test/start-broker.smoke.test.ts` | 0 | ✅ pass | 1.392s |
| 4 | `cd /home/cari/repos/tandem2/.gsd/worktrees/M001 && corepack pnpm --filter review-broker-server exec tsx src/cli/start-broker.ts --db-path ./.tmp/s01-smoke.sqlite --once` | 0 | ✅ pass | 0.532s |
| 5 | `cd /home/cari/repos/tandem2/.gsd/worktrees/M001 && corepack pnpm --filter review-broker-server exec tsx -e "import Database from 'better-sqlite3'; const db = new Database('./.tmp/s01-smoke.sqlite', { readonly: true }); const reviewCount = db.prepare('select count(*) as count from reviews').get(); const auditCount = db.prepare('select count(*) as count from audit_events').get(); const migrationCount = db.prepare('select count(*) as count from schema_migrations').get(); console.log(JSON.stringify({ reviewCount, auditCount, migrationCount })); db.close();"` | 0 | ✅ pass | 0.546s |

## Diagnostics

Inspect the standalone runtime through:

- `packages/review-broker-server/src/cli/start-broker.ts` for the real CLI argument parsing, `--once` behavior, and structured startup/failure output.
- `packages/review-broker-server/src/index.ts` for the reusable `startBroker()` and `inspectBrokerRuntime()` composition surface used by later integrations.
- `packages/review-broker-server/test/restart-persistence.test.ts` for the reopen-safe file-backed runtime proof.
- `packages/review-broker-server/test/start-broker.smoke.test.ts` for the real-entrypoint smoke proof.
- CLI JSON lines `broker.started`, `broker.once_complete`, and `broker.start_failed` for DB path, migration, and row-count diagnostics.
- The smoke SQLite file at `packages/review-broker-server/.tmp/s01-smoke.sqlite` when using the slice verification command, then the `reviews`, `audit_events`, and `schema_migrations` tables inside it.

## Deviations

- I exported reusable startup helpers from `packages/review-broker-server/src/index.ts` and added a package `bin` entry in addition to the requested CLI file so later slices can launch the broker both programmatically and as a standalone command without duplicating runtime composition logic.

## Known Issues

- No project language servers are installed in this harness, so LSP diagnostics were unavailable during execution; `corepack pnpm build` served as the static type-checking proof instead.

## Files Created/Modified

- `package.json` — added root `broker:start`, `broker:smoke`, and `broker:test` scripts for the standalone runtime.
- `packages/review-broker-server/package.json` — added the package `bin` plus local `start` and `start:once` scripts.
- `packages/review-broker-server/src/index.ts` — added reusable `startBroker()` runtime composition and `inspectBrokerRuntime()` DB snapshot helpers.
- `packages/review-broker-server/src/cli/start-broker.ts` — added the standalone broker command with `--once` smoke mode and structured JSON diagnostics.
- `packages/review-broker-server/test/restart-persistence.test.ts` — added the file-backed reopen-safe persistence proof.
- `packages/review-broker-server/test/start-broker.smoke.test.ts` — added the real-entrypoint smoke test that invokes the CLI twice against the same DB.
- `.gitignore` — ignored `/.tmp` smoke artifacts.
- `.gsd/DECISIONS.md` — appended D010 for the reusable startup surface and structured runtime diagnostics.
- `.gsd/KNOWLEDGE.md` — recorded the filtered `pnpm exec` package-directory relative-path gotcha for the smoke DB.
