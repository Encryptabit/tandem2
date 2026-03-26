---
id: T03
parent: S01
milestone: M005
provides:
  - 12 smoke tests covering all 7 tandem CLI commands (--json shape), error cases (unknown subcommand, missing ID), and human-readable output
  - TANDEM_CLI_PATH constant in test-paths.ts for future test files
  - seedTestData() pattern for seeding a temp DB with review + message + reviewer via BrokerService
key_files:
  - packages/review-broker-server/test/tandem-cli.test.ts
  - packages/review-broker-server/test/test-paths.ts
key_decisions:
  - Use beforeAll/afterAll for seed lifecycle instead of per-test afterEach — spawnSync CLI tests are read-only against a shared seeded database so one seed per describe block is correct and avoids temp dir cleanup race
patterns_established:
  - runTandem(args) helper wrapping spawnSync(TSX_PATH, [TANDEM_CLI_PATH, ...args]) — reusable for S02 write-command tests
  - parseJsonOutput(stdout) for tandem CLI JSON output (single pretty-printed object, unlike start-broker's NDJSON)
observability_surfaces:
  - Each test verifies CLI exit code + stdout JSON shape, so regressions in any command produce a named test failure
  - Error case tests verify stderr contains actionable messages for unknown subcommands and missing IDs
duration: 15m
verification_result: passed
completed_at: 2026-03-25
blocker_discovered: false
---

# T03: Add smoke tests for all CLI commands

**Add 12 smoke tests exercising all 7 tandem CLI commands via real process invocation with spawnSync, covering --json shape assertions, error cases, and human-readable output**

## What Happened

Created `packages/review-broker-server/test/tandem-cli.test.ts` following the existing `start-broker.smoke.test.ts` pattern. The test file seeds a temp SQLite database with a review (including a discussion message and a spawned reviewer) using `createAppContext` + `createBrokerService` directly in a `beforeAll` hook, then exercises each CLI command against that database via `spawnSync`.

Added `TANDEM_CLI_PATH` to `test-paths.ts` pointing at the tandem CLI entrypoint.

The initial implementation used an `afterEach` + lazy `ensureSeeded()` pattern copied from the smoke test, but this caused the temp directory to be cleaned up after the first test while subsequent tests still referenced the now-deleted DB. Fixed by switching to `beforeAll`/`afterAll` for seed lifecycle since all tests are read-only against the shared database.

## Verification

All 12 tests pass, covering every slice verification criterion:

- **7 `--json` smoke tests** — one per command (`status`, `reviews list`, `reviews show`, `proposal show`, `discussion show`, `activity`, `reviewers list`), each asserting response shape and meaningful data (arrays with length ≥ 1, matching seeded reviewId, etc.)
- **1 `--status` filter test** — `reviews list --status pending` returns only pending reviews
- **2 error case tests** — unknown subcommand exits non-zero with "Unknown command" on stderr; missing `<id>` exits non-zero with "Missing required <id>" on stderr
- **1 human-readable test** — `status` without `--json` outputs lines containing "Reviews:", "Reviewers:", "Messages:"
- **1 help test** — `--help` exits 0 and stdout contains "status", "reviews", "reviewers"

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `cd packages/review-broker-server && npx vitest run test/tandem-cli.test.ts` | 0 | ✅ pass | 5.68s |
| 2 | `npx vitest run packages/review-broker-server/test/tandem-cli.test.ts packages/review-broker-server/test/start-broker.smoke.test.ts` | 0 | ✅ pass | 5.83s |

## Diagnostics

- Run `cd packages/review-broker-server && npx vitest run test/tandem-cli.test.ts` to re-verify all CLI commands work end-to-end
- Each test name maps to a specific command (`tandem status`, `tandem reviews list`, etc.) so failures identify the broken command immediately
- The `seedTestData()` helper in the test file documents the minimal seeding needed for a fully exercisable broker database

## Deviations

- Changed from `afterEach` cleanup + lazy `ensureSeeded()` pattern (from the task plan) to `beforeAll`/`afterAll` lifecycle. The `afterEach` pattern caused the temp directory to be deleted after the first test, breaking all subsequent tests that still needed the shared database. Since all tandem CLI tests are read-only queries against a pre-seeded database, a single `beforeAll` seed with `afterAll` cleanup is the correct pattern.

## Known Issues

None.

## Files Created/Modified

- `packages/review-broker-server/test/tandem-cli.test.ts` — new: 12 smoke tests for all tandem CLI commands with shared seed database
- `packages/review-broker-server/test/test-paths.ts` — modified: added `TANDEM_CLI_PATH` export
