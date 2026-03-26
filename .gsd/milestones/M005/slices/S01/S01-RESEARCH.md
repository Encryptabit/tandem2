# S01 — CLI scaffold and read-only commands — Research

**Date:** 2025-03-25

## Summary

S01 is straightforward composition work. Every read-only CLI command maps 1:1 to an existing `BrokerService` method or `inspectBrokerRuntime()` function. The backend logic is complete and covered by 20+ test files — the CLI adds no new data paths. The main implementation decision is how to structure the subcommand router given the codebase's established pattern of hand-rolled arg parsing (no CLI framework dependency) and JSON-line output via `emit()`.

The existing `start-broker.ts` and `start-mcp.ts` already demonstrate the project's CLI pattern: hand-parsed `argv`, a `main()` entrypoint, and structured JSON output on stdout. The new `tandem` CLI should follow this pattern for the `--json` mode while adding human-readable table/detail formatting for interactive use.

## Recommendation

Hand-roll the subcommand router and arg parsing to match the existing codebase conventions (`start-broker.ts`, `start-mcp.ts`). No CLI framework — the project already manages 275-line CLI entrypoints without one, and the S01 commands are all simple `<noun> <verb> [id] [--flags]` patterns.

Place the new CLI at `packages/review-broker-server/src/cli/tandem.ts` as a new entrypoint, add a `"tandem"` bin entry in `package.json`, and keep it thin: parse args → `startBroker()` → call `BrokerService` method → format output → exit. Add a root `pnpm` script like `"tandem": "corepack pnpm --filter review-broker-server exec tsx src/cli/tandem.ts"`.

## Implementation Landscape

### Key Files

- **`packages/review-broker-server/src/cli/start-broker.ts`** — Existing CLI pattern to follow. Shows `parseCliArgs()`, `emit()`, `printUsage()`, signal binding. The `--once` mode already does runtime inspection + exit, which is the closest analog to `tandem status`.
- **`packages/review-broker-server/src/cli/start-mcp.ts`** — Second example of the hand-rolled CLI pattern. Same arg parsing conventions.
- **`packages/review-broker-server/src/runtime/broker-service.ts`** — The `BrokerService` interface defines all 16 operations. S01 needs: `listReviews`, `getReviewStatus`, `getProposal`, `getDiscussion`, `getActivityFeed`, `listReviewers`. All return Zod-parsed response objects.
- **`packages/review-broker-server/src/index.ts`** — Exports `startBroker()` (returns `StartedBrokerRuntime`) and `inspectBrokerRuntime()` (returns `BrokerRuntimeSnapshot`). The CLI will call `startBroker()` once to get context+service, run the command, then `runtime.close()`.
- **`packages/review-broker-server/src/runtime/path-resolution.ts`** — Already resolves `workspaceRoot`, `dbPath`, `configPath`. The CLI needs the same `--db-path` and `--cwd` flags the existing CLIs support.
- **`packages/review-broker-core/src/contracts.ts`** — Zod schemas for all request/response types. `ReviewSummarySchema`, `ReviewerRecordSchema`, `ReviewActivityEntrySchema`, etc. These define the shapes the CLI will format.
- **`packages/review-broker-core/src/domain.ts`** — Domain enums: `REVIEW_STATUSES`, `REVIEWER_STATUSES`, etc. Used for `--status` flag validation.
- **`packages/review-broker-server/package.json`** — Has `"bin"` with `review-broker-server` and `review-broker-mcp`. Needs a new `"tandem"` entry pointing to `./dist/cli/tandem.js`.
- **`packages/review-broker-server/test/test-paths.ts`** — Test infrastructure: exports `CLI_PATH`, `TSX_PATH`, `WORKTREE_ROOT`. Needs a `TANDEM_CLI_PATH` constant.
- **`packages/review-broker-server/test/start-broker.smoke.test.ts`** — Smoke test pattern: `spawnSync(TSX_PATH, [CLI_PATH, ...args])` → parse JSON lines → assert. S01 tests should follow this.

### New Files

- **`packages/review-broker-server/src/cli/tandem.ts`** — Main entrypoint. Parses top-level args (`--json`, `--db-path`, `--cwd`, `--help`), routes to subcommand handler.
- **`packages/review-broker-server/src/cli/format.ts`** — Output formatting: `formatTable()` for list commands, `formatDetail()` for show commands, `formatJson()` for `--json` mode. Keep it simple — padded columns, not a full table library.
- **`packages/review-broker-server/test/tandem-cli.test.ts`** — Smoke tests following the `start-broker.smoke.test.ts` pattern.

### Build Order

1. **Entrypoint + `status` command first.** This proves the scaffold pattern: arg parsing, `startBroker()`, `inspectBrokerRuntime()`, output formatting (both human and `--json`), clean exit. The `status` command maps to the same `inspectBrokerRuntime()` used by `--once` mode, so verification is easy.

2. **Output formatting module.** Extract `formatTable()` and `formatDetail()` helpers. These are shared by all subsequent commands. Start simple — `console.log()` with padded columns. Can use `String.prototype.padEnd()`.

3. **`reviews list` and `reviews show <id>`.** These prove the noun-verb routing pattern (`tandem reviews list [--status X]`, `tandem reviews show <id>`). Calls `service.listReviews()` and `service.getReviewStatus()`. The list command formats `ReviewSummary[]` as a table; show formats a single review as key-value pairs.

4. **`proposal show <id>`, `discussion show <id>`, `activity <id>`.** These add the remaining review-scoped read commands. Each calls one `BrokerService` method and formats the result. No new routing patterns needed — they follow the same noun-verb shape.

5. **`reviewers list`.** Calls `service.listReviewers()`, formats `ReviewerRecord[]` as a table. Completes S01 scope.

6. **`--help` for all commands.** Each subcommand prints its own usage when passed `--help`. The root `tandem --help` lists all available subcommands.

### Verification Approach

- **Smoke tests via `spawnSync`**: Follow the `start-broker.smoke.test.ts` pattern. Spawn `tsx src/cli/tandem.ts status --json --db-path <tmpDb>`, parse stdout as JSON, assert shape matches `BrokerRuntimeSnapshot`.
- **Human-readable output tests**: Spawn without `--json`, check stdout contains expected column headers or field labels.
- **Each command gets at least one smoke test**: `status`, `reviews list`, `reviews show`, `proposal show`, `discussion show`, `activity`, `reviewers list`.
- **Error cases**: Unknown subcommand → non-zero exit + usage hint. Missing required `<id>` arg → error message.
- **Manual verification**: `pnpm tandem status --json | jq .reviewCount` from the workspace root.

## Constraints

- **No new dependencies.** The project hand-rolls CLI arg parsing. Adding commander/yargs would break convention and require a dependency review. The subcommand structure is simple enough (`<noun> <verb> [id] [--flags]`) that hand-rolling is appropriate.
- **Same database default.** `tandem` must use the same `resolveBrokerPaths()` logic as `start-broker.ts` and `start-mcp.ts`. The XDG-compliant default DB path is `~/.local/state/tandem2/review-broker.sqlite`.
- **`--json` flag must be top-level.** It applies to all commands and switches the entire output mode, not just individual commands. Pattern: `tandem --json reviews list`.
- **The CLI opens and closes the broker per-invocation.** Unlike `start-broker.ts` which runs long, `tandem` starts a broker, runs one command, closes. Similar to `--once` mode but for arbitrary commands. Startup recovery runs on every invocation (same as `startBroker()` always does), which is correct — it keeps the CLI's view consistent.
- **TypeScript/ESM.** The project uses `"type": "module"` throughout. The CLI runs via `tsx` for development and compiles to `dist/cli/tandem.js` for the built binary.

## Common Pitfalls

- **Forgetting to close the runtime.** Every code path (success, error, `--help`) must call `runtime.close()` before exit. The existing `start-broker.ts` shows the pattern: open in try, close in all branches. Use a `finally` or explicit close calls.
- **`startBroker()` with `handleSignals: false`.** The `tandem` CLI is not a long-running server, so it should not register SIGINT/SIGTERM handlers. Pass `handleSignals: false` to `startBroker()`.
- **Reviewer manager interference.** `startBroker()` initializes the `ReviewerManager` which watches child processes. For read-only commands this is harmless but unnecessary. Startup recovery still runs correctly — it's a synchronous DB operation.
