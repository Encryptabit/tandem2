# S03: Create, spawn, kill, and dashboard commands

**Goal:** Add the 4 remaining CLI commands (`reviews create`, `reviewers spawn`, `reviewers kill`, `dashboard`) to complete MCP parity and operator convenience features.
**Demo:** `tandem reviews create --diff-file patch.diff --title "..." --description "..." --author cli-user` creates a review. `tandem reviewers spawn --provider anthropic` resolves a configured provider template and starts a reviewer subprocess. `tandem reviewers kill <id>` stops a reviewer. `tandem dashboard` launches the dashboard HTTP server.

## Must-Haves

- `reviews create` reads a diff from `--diff-file <path>`, resolves the path relative to `process.cwd()`, and calls `service.createReview()` with `--title`, `--description`, `--author`, and optional `--priority`.
- `reviewers kill <id>` calls `service.killReviewer()` and outputs the outcome.
- `reviewers spawn` supports two modes: explicit `--command <cmd>` with optional `--args`/`--cwd`, or `--provider <name>` which resolves a config-stored provider template via a new `resolveProvider()` function in `config.ts`.
- `dashboard` reuses `createDashboardRoutes` + `createDashboardServer` from the HTTP module, resolves the dashboard dist path, starts the server, prints the URL, and keeps the process alive.
- All 4 commands support `--json` output and have `SUBCOMMAND_HELP` entries.
- Error paths produce clear stderr messages and exit 1 (missing flags, nonexistent diff file, unknown provider, etc.).

## Proof Level

- This slice proves: operational
- Real runtime required: yes (SQLite-backed BrokerService for all commands)
- Human/UAT required: no

## Verification

- `npx vitest run test/tandem-cli.test.ts test/config.test.ts` — all existing 37 tests pass + new tests for the 4 commands.
- New `reviews create` tests: create via `--diff-file` using the existing `valid-review.diff` fixture → verify JSON response has `review.reviewId` and `review.status === 'pending'`. Error cases: missing `--title`, missing `--diff-file`, nonexistent diff file path.
- New `reviewers kill` tests: kill a spawned reviewer → verify outcome in JSON response.
- New `reviewers spawn` tests: spawn with explicit `--command`, spawn with `--provider` after configuring provider via `setConfigValue`. Error cases: missing `--command` and `--provider`, unknown provider name.
- New `dashboard` test: verify graceful error or startup behavior when invoked (may be limited to error-path testing since the command starts a long-running server; full integration belongs in S04).
- At least one error-path test per new command (verifies structured stderr + exit code 1).

## Observability / Diagnostics

- Runtime signals: `reviews create` returns `review.reviewId` + `review.status` for tracing. `reviewers spawn` returns `reviewer.reviewerId` + `reviewer.pid`. `reviewers kill` returns `outcome` + `message`.
- Inspection surfaces: `tandem reviews show <id> --json` to inspect created reviews; `tandem reviewers list --json` to inspect spawned/killed reviewers; `tandem config show --json` to inspect provider config.
- Failure visibility: Missing flags → descriptive stderr with flag name. Nonexistent diff file → stderr with path. Unknown provider → stderr listing the attempted provider name. All exit code 1.
- Redaction constraints: none

## Integration Closure

- Upstream surfaces consumed: `config.ts` (`readConfig`), `format.ts` (`formatJson`, `formatDetail`), `tandem.ts` (dispatch router, arg helpers), `dashboard-routes.ts` (`createDashboardRoutes`), `dashboard-server.ts` (`createDashboardServer`), `start-broker.ts` (`resolveDashboardDistPath` logic)
- New wiring introduced in this slice: `resolveProvider()` function in `config.ts`; 4 new dispatch cases in the router; dashboard server lifecycle management in the CLI process
- What remains before the milestone is truly usable end-to-end: S04 integrated acceptance proving full MCP ↔ CLI parity against a real broker runtime

## Tasks

- [x] **T01: Implement `reviews create` and `reviewers kill` command handlers with tests** `est:25m`
  - Why: These are the two simplest new commands — `reviews create` proves diff-file reading (the most-used new command), and `reviewers kill` is a trivial one-liner. Neither requires config interaction, so they can be added and tested immediately using the established handler pattern.
  - Files: `packages/review-broker-server/src/cli/tandem.ts`, `packages/review-broker-server/test/tandem-cli.test.ts`
  - Do: Add `handleReviewsCreate` (parse `--title`, `--description`, `--author`, `--diff-file`, optional `--priority`; `readFileSync(path.resolve(diffFilePath))` for diff content; call `service.createReview()`). Add `handleReviewersKill` (parse positional `<id>`; call `service.killReviewer()`). Wire both into `dispatch()` switch. Add `SUBCOMMAND_HELP` entries. Update `printUsage()`. Add tests: create happy path with `valid-review.diff` fixture, create error cases (missing title, missing diff-file, nonexistent file), kill happy path using the test reviewer, kill error case (missing id). **Important:** `--diff-file` path must be resolved with `path.resolve()` relative to `process.cwd()`. The kill test must run AFTER any test that needs `test-reviewer-1`.
  - Verify: `cd packages/review-broker-server && npx vitest run test/tandem-cli.test.ts`
  - Done when: `reviews create` and `reviewers kill` work with `--json` output, error cases produce stderr + exit 1, all existing 27 tests + new tests pass.

- [x] **T02: Implement `reviewers spawn` with provider resolution and tests** `est:25m`
  - Why: The most novel piece in S03 — `reviewers spawn` needs dual-mode support (explicit `--command` or config-based `--provider`) and a new `resolveProvider()` function. Separating this from T01 isolates the config interaction risk and keeps each task focused.
  - Files: `packages/review-broker-server/src/cli/config.ts`, `packages/review-broker-server/src/cli/tandem.ts`, `packages/review-broker-server/test/tandem-cli.test.ts`, `packages/review-broker-server/test/config.test.ts`
  - Do: Add `resolveProvider(configPath, providerName)` to `config.ts` — reads config via `readConfig()`, looks up `reviewer.providers.<providerName>`, validates it has a `command` key, returns `{ command: string, args?: string[] }`. Throws descriptive error if provider not found or missing `command`. Add `handleReviewersSpawn` to `tandem.ts` with two modes: (1) `--command <cmd>` with optional `--args <a,b,c>` and `--cwd <dir>`, (2) `--provider <name>` which calls `resolveProvider()`. Error if neither `--command` nor `--provider` given. Wire into dispatch. Add `SUBCOMMAND_HELP` entry. Update `printUsage()`. Add config unit tests for `resolveProvider()`. Add CLI smoke tests: explicit `--command` spawn, `--provider` spawn (after seeding config with `setConfigValue`), error cases (no command/provider, unknown provider).
  - Verify: `cd packages/review-broker-server && npx vitest run test/tandem-cli.test.ts test/config.test.ts`
  - Done when: `reviewers spawn --command ...` and `reviewers spawn --provider ...` both work with `--json` output, `resolveProvider` has unit tests in `config.test.ts`, error cases produce stderr + exit 1, all tests pass.

- [x] **T03: Implement `dashboard` command handler with tests** `est:20m`
  - Why: The `dashboard` command completes the slice by launching the broker dashboard as a convenience. It reuses existing HTTP infrastructure but needs careful lifecycle management (the process must stay alive while the server runs).
  - Files: `packages/review-broker-server/src/cli/tandem.ts`, `packages/review-broker-server/test/tandem-cli.test.ts`
  - Do: Add `handleDashboard` to `tandem.ts`. Import `createDashboardRoutes` from `../http/dashboard-routes.js` and `createDashboardServer` from `../http/dashboard-server.js`. Duplicate the 8-line `resolveDashboardDistPath` function from `start-broker.ts` (duplication is acceptable for one consumer and avoids changing the existing CLI's private function). Parse optional `--port` and `--host` flags. Build `createDashboardRoutes({ context, service, startupRecoverySnapshot: runtime.getStartupRecoverySnapshot() })`, then `await createDashboardServer({ dashboardDistPath, routes, host, port })`. Print the URL to stdout. Wrap `runtime.close` to dispose routes and close server (matching `start-broker.ts` pattern). Call `await runtime.waitUntilStopped()` to keep the process alive. Wire into dispatch. Add `SUBCOMMAND_HELP` entry. Update `printUsage()`. Add test: verify `dashboard --help` outputs the expected help text. Add a smoke test that invokes the dashboard command with a very short timeout or nonexistent dist path and verifies it starts or errors gracefully. **Important:** The dashboard handler is async and blocks — unlike other commands, it must NOT return until shutdown. The main try/finally in `main()` will still call `runtime.close()`, so the handler should `await runtime.waitUntilStopped()` which resolves when `close()` is called externally (e.g. via signal).
  - Verify: `cd packages/review-broker-server && npx vitest run test/tandem-cli.test.ts`
  - Done when: `dashboard` command wired into dispatch and help, handler reuses dashboard HTTP infrastructure, `--help` test passes, all existing tests still pass.

## Files Likely Touched

- `packages/review-broker-server/src/cli/tandem.ts`
- `packages/review-broker-server/src/cli/config.ts`
- `packages/review-broker-server/test/tandem-cli.test.ts`
- `packages/review-broker-server/test/config.test.ts`
