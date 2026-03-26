---
id: T01
parent: S02
milestone: M005
provides:
  - config.ts module with readConfig, writeConfig, setConfigValue
  - config show and config set CLI handlers in tandem.ts
  - config unit tests (10 tests)
  - config CLI smoke tests (3 tests)
key_files:
  - packages/review-broker-server/src/cli/config.ts
  - packages/review-broker-server/src/cli/tandem.ts
  - packages/review-broker-server/test/config.test.ts
  - packages/review-broker-server/test/tandem-cli.test.ts
key_decisions:
  - Config values stored as strings via setConfigValue; dot-path keys create nested JSON objects
  - Config smoke tests use REVIEW_BROKER_CONFIG_PATH env var to isolate config file from workspace
patterns_established:
  - Config handlers follow same dispatch pattern as read commands but only need runtime.context.configPath, not runtime.service
observability_surfaces:
  - "tandem config show --json" returns full config as machine-readable JSON
  - Missing key/value args emit Error to stderr with exit code 1
duration: 15m
verification_result: passed
completed_at: 2026-03-25
blocker_discovered: false
---

# T01: Create config management module and CLI handlers

**Added config.ts module with dot-path key nesting and wired `config show`/`config set` handlers into tandem CLI**

## What Happened

Created `config.ts` with three exported functions: `readConfig` (returns `{}` for missing files), `writeConfig` (creates parent dirs with `mkdirSync`), and `setConfigValue` (splits dot-path keys, walks/creates nested objects, sets leaf value). Added `config show` and `config set` handlers to the dispatch router in `tandem.ts`, with SUBCOMMAND_HELP entries and updated root help text. Wrote 10 config unit tests and 3 CLI smoke tests covering roundtrip persistence, dot-path nesting, and human-readable output.

## Verification

- `npx vitest run test/config.test.ts` — 10/10 tests pass (readConfig on missing file, writeConfig creates dirs, setConfigValue with simple/dot-path/deep keys, preserves existing keys, overwrites)
- `npx vitest run test/tandem-cli.test.ts` — 15/15 tests pass (12 original + 3 new config smoke tests)
- Config persistence verified: `config set reviewer.provider anthropic` followed by `config show --json` returns `{ reviewer: { provider: "anthropic" } }`

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `npx vitest run test/config.test.ts` | 0 | ✅ pass | 0.7s |
| 2 | `npx vitest run test/tandem-cli.test.ts` | 0 | ✅ pass | 7.9s |

## Diagnostics

- Run `tandem config show --json --db-path <path>` to inspect persisted config as JSON.
- Run `tandem config set <key> <value> --db-path <path>` to verify write; exit code 1 + stderr `Error:` on missing args.
- Config file location: `runtime.context.configPath` (defaults to `<workspace>/.gsd/review-broker/config.json`, overridable via `REVIEW_BROKER_CONFIG_PATH` env var).

## Deviations

- Config smoke tests use `REVIEW_BROKER_CONFIG_PATH` env var rather than `--cwd` to redirect config writes to a temp directory, since the CLI doesn't expose a `--config-path` flag. This is cleaner than depending on workspace root detection in test environments.

## Known Issues

None.

## Files Created/Modified

- `packages/review-broker-server/src/cli/config.ts` — new config module with readConfig, writeConfig, setConfigValue
- `packages/review-broker-server/src/cli/tandem.ts` — added config import, config show/set handlers, dispatch case, SUBCOMMAND_HELP entries, updated help text
- `packages/review-broker-server/test/config.test.ts` — new unit test file (10 tests)
- `packages/review-broker-server/test/tandem-cli.test.ts` — added 3 config smoke tests with isolated config file
- `.gsd/milestones/M005/slices/S02/S02-PLAN.md` — added Observability / Diagnostics section (pre-flight fix)
- `.gsd/milestones/M005/slices/S02/tasks/T01-PLAN.md` — added Observability Impact section (pre-flight fix)
