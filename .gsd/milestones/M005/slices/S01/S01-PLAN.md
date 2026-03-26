# S01: CLI scaffold and read-only commands

**Goal:** Ship the `tandem` CLI entrypoint with subcommand routing, output formatting, and all read-only commands — proving the full scaffold pattern before write commands land in S02.
**Demo:** `tandem status`, `tandem reviews list`, `tandem reviews show <id>`, `tandem proposal show <id>`, `tandem discussion show <id>`, `tandem activity <id>`, `tandem reviewers list` all produce readable terminal output and support `--json`. `tandem --help` lists all subcommands, and each subcommand supports `--help`.

## Must-Haves

- CLI entrypoint at `packages/review-broker-server/src/cli/tandem.ts` with `tandem` bin entry in `package.json`
- Subcommand router supporting `<noun> <verb> [id] [--flags]` pattern via hand-rolled arg parsing (no CLI framework — matches codebase convention)
- `--json` top-level flag switches all output to machine-parseable JSON
- `--db-path` and `--cwd` flags match existing CLIs for database and workspace resolution
- `--help` at root and per-subcommand
- `status` command calling `inspectBrokerRuntime()` with formatted output
- `reviews list [--status X]` and `reviews show <id>` commands
- `proposal show <id>`, `discussion show <id>`, `activity <id>` commands
- `reviewers list [--status X]` command
- Output formatting module with table and detail helpers
- Broker lifecycle: `startBroker({ handleSignals: false })` → run command → `runtime.close()` on all code paths
- Smoke tests proving all commands work via real CLI process invocation

## Verification

- `cd packages/review-broker-server && npx vitest run test/tandem-cli.test.ts` — all smoke tests pass
- Each of the 7 commands (`status`, `reviews list`, `reviews show`, `proposal show`, `discussion show`, `activity`, `reviewers list`) has at least one `--json` smoke test asserting response shape
- Error cases tested: unknown subcommand → non-zero exit + usage hint, missing `<id>` → error message
- Human-readable output tested: `status` without `--json` contains expected field labels

## Tasks

- [x] **T01: Scaffold CLI entrypoint, formatting module, and status command** `est:1h`
  - Why: Proves the entire CLI pattern — arg parsing, broker lifecycle, subcommand routing, output formatting (human + JSON), `--help`, and the `tandem` bin entry. Every subsequent command just plugs into this scaffold.
  - Files: `packages/review-broker-server/src/cli/tandem.ts`, `packages/review-broker-server/src/cli/format.ts`, `packages/review-broker-server/package.json`
  - Do: Create `tandem.ts` with `main()`, `parseGlobalArgs()` for `--json`/`--db-path`/`--cwd`/`--help`, a subcommand router dispatching to handler functions, and the `status` handler calling `inspectBrokerRuntime()`. Create `format.ts` with `formatTable()`, `formatDetail()`, and `formatJson()` helpers. Add `"tandem": "./dist/cli/tandem.js"` to the `bin` field and a `"tandem"` script to root `package.json`. Use `startBroker({ handleSignals: false })` and ensure `runtime.close()` runs in a `finally` block. Follow the `emit()` / `printUsage()` patterns from `start-broker.ts`.
  - Verify: `cd packages/review-broker-server && npx tsx src/cli/tandem.ts --help` prints usage; `npx tsx src/cli/tandem.ts status --json --db-path /tmp/test-tandem.sqlite` exits 0 and outputs valid JSON with `reviewCount` field
  - Done when: `tandem status` works in both `--json` and human-readable modes; `tandem --help` lists subcommands; unknown subcommands exit non-zero

- [x] **T02: Add all read-only subcommands** `est:45m`
  - Why: Fills out the remaining 6 read commands that complete S01 scope. Each is a thin handler calling one BrokerService method and formatting the result — no new patterns, just applying the scaffold from T01.
  - Files: `packages/review-broker-server/src/cli/tandem.ts`
  - Do: Add handlers for `reviews list [--status X]`, `reviews show <id>`, `proposal show <id>`, `discussion show <id>`, `activity <id> [--limit N]`, `reviewers list [--status X]`. Each handler: parse subcommand-specific args, call the corresponding `service.*()` method, format with `formatTable()` or `formatDetail()` depending on list vs show, output JSON when `--json` is set. Add `--help` text for each subcommand. Validate `--status` against `REVIEW_STATUSES` / `REVIEWER_STATUSES` from `review-broker-core`. Report missing `<id>` args with a clear error message and non-zero exit.
  - Verify: `npx tsx src/cli/tandem.ts reviews list --json --db-path /tmp/test-tandem.sqlite` exits 0 with `{"reviews":[...]}` shape; `npx tsx src/cli/tandem.ts reviews show nonexistent --db-path /tmp/test-tandem.sqlite` exits non-zero with error message
  - Done when: All 6 commands produce correct output in both `--json` and human-readable modes; `--status` filtering works for list commands; missing ID args produce clear errors

- [x] **T03: Add smoke tests for all CLI commands** `est:45m`
  - Why: Proves all 7 commands work end-to-end via real process invocation — the objective verification for the slice. Follows the existing `start-broker.smoke.test.ts` pattern of `spawnSync` → parse output → assert shape.
  - Files: `packages/review-broker-server/test/tandem-cli.test.ts`, `packages/review-broker-server/test/test-paths.ts`
  - Do: Add `TANDEM_CLI_PATH` to `test-paths.ts`. Create `tandem-cli.test.ts` with: (1) a `seedTestData()` helper that uses `createAppContext` + `createBrokerService` to insert a review, message, and reviewer into a temp DB; (2) smoke tests for each command in `--json` mode asserting response shape matches the expected contract; (3) a human-readable output test for `status` checking for expected labels; (4) error case tests: unknown subcommand → exit code 1, missing ID → exit code 1. Use `spawnSync(TSX_PATH, [TANDEM_CLI_PATH, ...args])` with `cwd: WORKTREE_ROOT`.
  - Verify: `cd packages/review-broker-server && npx vitest run test/tandem-cli.test.ts` — all tests pass
  - Done when: All 7 commands have passing `--json` smoke tests; error cases covered; `vitest run` exits 0

## Observability / Diagnostics

- **Runtime signals:** The `tandem` CLI emits structured JSON to stdout when `--json` is set. Human-readable output goes to stdout; errors go to stderr. Exit code 0 = success, 1 = error (unknown subcommand, missing ID, broker failure).
- **Inspection surfaces:** `tandem status --json` is the primary diagnostic command — it returns the full `BrokerRuntimeSnapshot` (review/reviewer/message/audit counts, status distributions, latest entities). All read-only commands double as inspection surfaces for their respective domains.
- **Failure visibility:** Broker initialization failures (bad db-path, migration errors) produce stderr messages and exit code 1. Unknown subcommands print a usage hint to stderr. Missing required args (e.g. `<id>`) produce a specific error message.
- **Redaction constraints:** No secrets are handled by the CLI. Database paths may appear in output but contain no sensitive data. The `--json` output mirrors the same shapes used by the MCP tools and dashboard API, so no new redaction concerns arise.

## Files Likely Touched

- `packages/review-broker-server/src/cli/tandem.ts` — new CLI entrypoint
- `packages/review-broker-server/src/cli/format.ts` — new output formatting module
- `packages/review-broker-server/package.json` — `bin.tandem` entry
- `package.json` — root `tandem` script
- `packages/review-broker-server/test/tandem-cli.test.ts` — new smoke tests
- `packages/review-broker-server/test/test-paths.ts` — `TANDEM_CLI_PATH` constant
