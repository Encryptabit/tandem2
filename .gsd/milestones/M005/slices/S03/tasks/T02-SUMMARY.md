---
id: T02
parent: S03
milestone: M005
provides:
  - reviewers spawn command handler with dual-mode support (--command and --provider)
  - resolveProvider() config function for named provider template resolution
  - dispatch routing, SUBCOMMAND_HELP, and printUsage entry for reviewers spawn
  - 6 new resolveProvider unit tests in config.test.ts
  - 4 new CLI smoke tests for spawn (explicit, provider, both error cases)
key_files:
  - packages/review-broker-server/src/cli/config.ts
  - packages/review-broker-server/src/cli/tandem.ts
  - packages/review-broker-server/test/config.test.ts
  - packages/review-broker-server/test/tandem-cli.test.ts
key_decisions:
  - resolveProvider accepts JSON-stringified args (from setConfigValue) or native arrays — both forms parsed transparently
patterns_established:
  - Provider config stored at reviewer.providers.<name>.{command, args} with args as JSON string or native array
  - Spawn handler dual-mode pattern: --command takes precedence, --provider falls back to config resolution
observability_surfaces:
  - reviewers spawn returns reviewer.reviewerId + reviewer.status + reviewer.pid in JSON for tracing
  - Missing both --command and --provider produces stderr with 'Either --command or --provider is required for "reviewers spawn".'
  - Unknown provider produces stderr with 'Unknown provider "<name>". No provider configured at "reviewer.providers.<name>".'
  - Provider missing command field produces stderr with 'Provider "<name>" is missing required "command" field.'
duration: 10m
verification_result: passed
completed_at: 2026-03-25
blocker_discovered: false
---

# T02: Implement `reviewers spawn` with provider resolution and tests

**Added `reviewers spawn` command with dual-mode support (explicit `--command` or config-based `--provider`), `resolveProvider()` config function, and 10 new tests across both test suites.**

## What Happened

Implemented the `reviewers spawn` command and supporting config infrastructure in two layers:

1. **`resolveProvider()` in config.ts** — Navigates `reviewer.providers.<name>` in the config object, validates the entry has a `command` field, extracts optional `args` (handling both native arrays and JSON-stringified arrays from `setConfigValue`), and returns `{ command, args }`. Throws descriptive errors for unknown provider, missing providers section, or missing command field.

2. **`handleReviewersSpawn` in tandem.ts** — Parses `--command`, `--provider`, `--args`, and `--cwd` flags. If `--command` is given, uses it directly with comma-separated `--args`. If `--provider` is given, calls `resolveProvider()` to get `{ command, args }` from config. If neither is given, throws a clear error. Calls `runtime.service.spawnReviewer()` and outputs Reviewer ID, Status, Command, and PID. Wired into the dispatch router under `case 'spawn'`.

Added `SUBCOMMAND_HELP` for `reviewers spawn` documenting both modes, and updated `printUsage()` to list it.

## Verification

- `npx vitest run test/config.test.ts` → 16 tests passed (10 existing + 6 new resolveProvider tests)
- `npx vitest run test/tandem-cli.test.ts` → 38 tests passed (34 existing + 4 new spawn tests)
- `npx vitest run test/tandem-cli.test.ts test/config.test.ts` → 54 tests passed (all combined)
- Explicit `--command` spawn: JSON output has `reviewer.reviewerId` and `reviewer.status`
- `--provider` spawn: config seeded via `setConfigValue`, reviewer spawned successfully via provider resolution
- Error cases: missing both flags → stderr + exit 1; unknown provider → stderr + exit 1
- Spawned reviewer processes cleaned up in test `afterAll` via `reviewers kill`

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `npx vitest run test/config.test.ts` | 0 | ✅ pass | 5.7s |
| 2 | `npx vitest run test/tandem-cli.test.ts` | 0 | ✅ pass | 21.7s |
| 3 | `npx vitest run test/tandem-cli.test.ts test/config.test.ts` | 0 | ✅ pass | 19.3s |

## Diagnostics

- Inspect spawned reviewers: `tandem reviewers list --json --db-path <path>`
- Inspect provider config: `tandem config show --json` (with `REVIEW_BROKER_CONFIG_PATH` set)
- Error shapes:
  - `Error: Either --command or --provider is required for "reviewers spawn".` — when both flags missing
  - `Error: Unknown provider "<name>". No provider configured at "reviewer.providers.<name>".` — unknown provider
  - `Error: Provider "<name>" is missing required "command" field.` — malformed provider config

## Deviations

- The `args` parameter in `SpawnReviewerRequest` is required (not optional with default) at the TypeScript type level despite the Zod schema having `.default([])`. The handler passes `args: spawnArgs ?? []` to satisfy the type contract. This is a minor adaptation, not a plan deviation.

## Known Issues

None.

## Files Created/Modified

- `packages/review-broker-server/src/cli/config.ts` — added `resolveProvider()` export with JSON-stringified args parsing
- `packages/review-broker-server/src/cli/tandem.ts` — added `handleReviewersSpawn`, imported `resolveProvider`, wired dispatch, added SUBCOMMAND_HELP, updated printUsage
- `packages/review-broker-server/test/config.test.ts` — added 6 resolveProvider unit tests (command+args, command-only, JSON-stringified args, unknown provider, missing command, no providers section)
- `packages/review-broker-server/test/tandem-cli.test.ts` — added 4 spawn smoke tests (explicit command, provider mode, missing flags error, unknown provider error), updated help assertion to include `reviewers spawn`, imported `setConfigValue`
