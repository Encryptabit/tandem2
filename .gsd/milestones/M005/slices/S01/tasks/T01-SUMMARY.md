---
id: T01
parent: S01
milestone: M005
provides:
  - tandem CLI entrypoint with global arg parsing and subcommand router
  - format.ts output formatting module (formatJson, formatTable, formatDetail, formatStatusCounts)
  - status command in --json and human-readable modes
  - --help with full subcommand listing
  - tandem bin entry in package.json
key_files:
  - packages/review-broker-server/src/cli/tandem.ts
  - packages/review-broker-server/src/cli/format.ts
  - packages/review-broker-server/package.json
  - package.json
key_decisions:
  - CLI exits after one command with handleSignals: false — no long-running server
  - formatStatusCounts accepts Partial<Record> to match BrokerRuntimeSnapshot types without casting
patterns_established:
  - parseGlobalArgs splits --json/--db-path/--cwd/--help from subcommand positional args
  - dispatch(noun, verb, rest, runtime, options) router — T02 adds cases here
  - try/finally with runtime.close() + waitUntilStopped() for broker lifecycle
observability_surfaces:
  - tandem status --json outputs full BrokerRuntimeSnapshot for programmatic inspection
  - tandem --help is self-documenting command discovery
  - Unknown subcommands → stderr + exit code 1
duration: 15m
verification_result: passed
completed_at: 2026-03-25
blocker_discovered: false
---

# T01: Scaffold CLI entrypoint, formatting module, and status command

**Add tandem CLI entrypoint with subcommand router, output formatting helpers, and status command in both JSON and human-readable modes**

## What Happened

Created `format.ts` with four output formatting helpers: `formatJson` (pretty-printed JSON), `formatTable` (padded columns with separator), `formatDetail` (aligned key-value pairs), and `formatStatusCounts` (compact status summary accepting `Partial<Record>`). Created `tandem.ts` with `parseGlobalArgs()` splitting `--json`/`--db-path`/`--cwd`/`--help` from positional subcommand args, a `dispatch()` router matching noun → handler, `handleStatus()` calling `inspectBrokerRuntime()`, `printUsage()` listing all planned commands, and a `main()` wrapper with broker lifecycle (`startBroker({ handleSignals: false })` in try/finally with `runtime.close()`). Added `"tandem"` bin entry to `packages/review-broker-server/package.json` and `"tandem"` script to root `package.json`.

## Verification

All four task-level checks pass:
1. `tandem --help` exits 0 and prints usage with all subcommand listings
2. `tandem status --json --db-path /tmp/test-tandem-t01.sqlite` exits 0 and outputs valid JSON with `reviewCount` field
3. `tandem status --db-path /tmp/test-tandem-t01.sqlite` exits 0 and outputs human-readable text with aligned labels (Reviews, Reviewers, etc.)
4. `tandem bogus` exits 1 with error message "Unknown command: bogus" and usage hint on stderr

Slice-level verification (smoke tests) not yet applicable — `tandem-cli.test.ts` will be created in T03.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `npx tsx packages/review-broker-server/src/cli/tandem.ts --help` | 0 | ✅ pass | <1s |
| 2 | `npx tsx packages/review-broker-server/src/cli/tandem.ts status --json --db-path /tmp/test-tandem-t01.sqlite` | 0 | ✅ pass | <1s |
| 3 | `npx tsx packages/review-broker-server/src/cli/tandem.ts status --db-path /tmp/test-tandem-t01.sqlite` | 0 | ✅ pass | <1s |
| 4 | `npx tsx packages/review-broker-server/src/cli/tandem.ts bogus 2>&1` | 1 | ✅ pass | <1s |

## Diagnostics

- `tandem status --json --db-path <path>` — programmatic inspection of broker state (counts, distributions, latest entities)
- `tandem --help` — self-documenting command discovery
- Unknown subcommands produce stderr message + exit code 1
- Broker initialization failures (bad db-path, etc.) produce `Error: <message>` on stderr + exit code 1

## Deviations

- `formatStatusCounts` signature changed from `Record<string, number>` to `Partial<Record<string, number>>` to match `BrokerRuntimeSnapshot` types without unsafe casts.
- Had to run `pnpm install` and `pnpm -r build` in the worktree before verification — worktree had no `node_modules` or `dist/` artifacts.

## Known Issues

None.

## Files Created/Modified

- `packages/review-broker-server/src/cli/tandem.ts` — new CLI entrypoint with arg parsing, subcommand router, status handler, usage
- `packages/review-broker-server/src/cli/format.ts` — new output formatting module (formatJson, formatTable, formatDetail, formatStatusCounts)
- `packages/review-broker-server/package.json` — added `tandem` bin entry
- `package.json` — added root `tandem` script
