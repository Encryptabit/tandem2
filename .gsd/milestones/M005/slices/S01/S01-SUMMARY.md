# S01 Summary: CLI scaffold and read-only commands

**Status:** Complete
**Duration:** ~45m across 3 tasks
**Verification:** 12/12 smoke tests pass (`npx vitest run test/tandem-cli.test.ts`)

## What This Slice Delivered

A fully working `tandem` CLI entrypoint with 7 read-only commands, dual output modes (human-readable + `--json`), subcommand routing, and comprehensive smoke tests. The CLI is a thin operator surface over `BrokerService` — every command opens the broker, calls one service method, formats the result, and closes.

### Commands Shipped

| Command | Service Method | Output Mode |
|---|---|---|
| `tandem status` | `inspectBrokerRuntime()` | detail (key-value pairs) |
| `tandem reviews list [--status X] [--limit N]` | `service.listReviews()` | table |
| `tandem reviews show <id>` | `service.getReviewStatus()` | detail |
| `tandem proposal show <id>` | `service.getProposal()` | detail (truncated diff) |
| `tandem discussion show <id>` | `service.getDiscussion()` | table |
| `tandem activity <id> [--limit N]` | `service.getActivityFeed()` | table |
| `tandem reviewers list [--status X] [--limit N]` | `service.listReviewers()` | table |

### Key Files

- `packages/review-broker-server/src/cli/tandem.ts` — CLI entrypoint with arg parsing, subcommand router, all 7 handlers
- `packages/review-broker-server/src/cli/format.ts` — output formatting module (`formatJson`, `formatTable`, `formatDetail`, `formatStatusCounts`)
- `packages/review-broker-server/package.json` — `bin.tandem` entry
- `package.json` — root `tandem` script
- `packages/review-broker-server/test/tandem-cli.test.ts` — 12 smoke tests
- `packages/review-broker-server/test/test-paths.ts` — `TANDEM_CLI_PATH` constant

## Patterns Established (for S02/S03)

1. **Subcommand router:** `dispatch(noun, verb, rest, runtime, options)` — S02 adds new `case` branches for write commands in the same switch.
2. **Global arg parsing:** `parseGlobalArgs()` splits `--json`/`--db-path`/`--cwd`/`--help` from positional args. Shared by all commands.
3. **Subcommand arg helpers:** `extractFlag()`, `extractFlagWithEquals()`, `extractStatusFlag()`, `extractLimitFlag()`, `requireId()` — all reusable for S02 write commands that accept `--body`, `--verdict`, `--diff-file`, etc.
4. **Broker lifecycle:** `startBroker({ handleSignals: false })` in try/finally with `runtime.close()` + `waitUntilStopped()`. One broker open per invocation, no long-running server.
5. **Per-subcommand help:** `SUBCOMMAND_HELP` record keyed by `"noun verb"` — `printSubcommandHelp(noun, verb)` resolves it. S02 adds entries.
6. **Error handling:** `IdRequiredError` for missing `<id>`, `BrokerServiceError` with `REVIEW_NOT_FOUND` caught in the main try/catch → clean stderr message + exit 1.
7. **Test pattern:** `runTandem(args)` helper wrapping `spawnSync(TSX_PATH, [TANDEM_CLI_PATH, ...args])`. `parseJsonOutput(stdout)` for `--json` output. `seedTestData()` inserts a review + message + reviewer via `BrokerService` into a temp DB.

## What S02 Should Know

- The `dispatch()` function is async and the router switch handles `noun` then `verb`. Write commands (claim, close, verdict, etc.) go into the existing `"reviews"` noun branch.
- `activity` uses a special pattern: the `<id>` occupies the verb position, so the router pushes verb back into rest args before calling the handler. New noun-only commands (like `config`) should follow a similar pattern.
- `extractStatusFlag()` validates against domain enum arrays imported from `review-broker-core`. The same pattern applies for `--verdict` validation.
- All output goes through `format.ts` helpers — don't write raw `console.log` in handlers.
- The smoke test file seeds one review, one message, and one reviewer via `beforeAll`. S02 write-command tests can extend this seed or add their own.

## Deviations from Plan

- `formatStatusCounts` accepts `Partial<Record>` instead of `Record<string, number>` to match `BrokerRuntimeSnapshot` types without unsafe casts.
- Added `truncate()` helper for human-readable output of long fields (not in plan, but needed for usable terminal display of diff/message bodies).
- Created reusable arg parsing helpers as shared functions instead of inline parsing per handler — reduces duplication across the 7 handlers.

## Known Issues

None.
