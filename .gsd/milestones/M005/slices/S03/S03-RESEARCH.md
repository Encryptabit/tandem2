# S03 — Research

**Date:** 2026-03-25

## Summary

S03 adds 4 commands to the existing tandem CLI: `reviews create`, `reviewers spawn`, `reviewers kill`, and `dashboard`. All four follow the established handler pattern (parse flags → call service method → format output) with two notable additions: `reviews create` needs to read a diff from a file (`--diff-file`) or stdin, and `reviewers spawn --provider <name>` needs to resolve a provider name into a command+args via config lookup. The `dashboard` command reuses the existing `createDashboardServer` + `createDashboardRoutes` infrastructure from `start-broker.ts`, and `reviewers kill` is a trivial one-liner delegating to `service.killReviewer`.

This is straightforward work. Every service method already exists and is tested. The CLI patterns are well-established from S01/S02. The two novel pieces are (1) reading diff content from a file path and (2) resolving a provider config key into a `{ command, args }` pair — both are small, self-contained functions.

## Recommendation

Build in this order: `reviews create` first (proves diff-file reading, the most-used new command), then `reviewers spawn` + `reviewers kill` together (both in the `reviewers` noun branch), then `dashboard` last (requires the most setup but lowest user-facing risk). Each command follows the existing handler pattern. Provider resolution should be a pure function in `config.ts` (or a new small helper) that reads the config, looks up a provider template, and returns `{ command: string, args: string[] }`. No CLI framework needed — hand-rolled arg parsing continues.

## Implementation Landscape

### Key Files

- `packages/review-broker-server/src/cli/tandem.ts` — Add 4 new handler functions (`handleReviewsCreate`, `handleReviewersSpawn`, `handleReviewersKill`, `handleDashboard`), wire them into the `dispatch()` switch, add `SUBCOMMAND_HELP` entries, update `printUsage()`. Also needs `import { readFileSync } from 'node:fs'` for diff-file reading, and imports for `createDashboardRoutes`/`createDashboardServer` for the dashboard command.
- `packages/review-broker-server/src/cli/config.ts` — Add a `resolveProvider(configPath, providerName)` function that reads the config, looks up `reviewer.providers.<name>` (expected shape: `{ command: string, args?: string[] }`), and returns it. This keeps provider resolution co-located with config I/O.
- `packages/review-broker-server/src/http/dashboard-server.ts` — Used as-is by the dashboard command. No changes needed.
- `packages/review-broker-server/src/http/dashboard-routes.ts` — Used as-is by the dashboard command. No changes needed.
- `packages/review-broker-server/src/cli/start-broker.ts` — Contains `resolveDashboardDistPath()` (private). Extract it or duplicate the logic in tandem.ts. Extraction is cleaner but the function is 8 lines — duplication is acceptable too.
- `packages/review-broker-server/test/tandem-cli.test.ts` — Add tests for all 4 commands (happy + error paths).
- `packages/review-broker-server/test/fixtures/valid-review.diff` — Already exists, reuse for `reviews create` tests.
- `packages/review-broker-core/src/contracts.ts` — Reference only. `CreateReviewRequestSchema` expects `{ title, description, diff, authorId, priority? }`. `SpawnReviewerRequestSchema` expects `{ command, args?, reviewerId?, cwd? }`. `KillReviewerRequestSchema` expects `{ reviewerId }`.

### Service Method Signatures (from broker-service.ts)

- `service.createReview({ title, description, diff, authorId, priority? })` → `{ review: ReviewSummary, proposal: ReviewProposal, version }`
- `service.spawnReviewer({ command, args?, reviewerId?, cwd? })` → `{ reviewer: ReviewerRecord, version }`
- `service.killReviewer({ reviewerId })` → `{ outcome, reviewer, version, message? }`

### Command Design

**`tandem reviews create`**
- Flags: `--title <text>` (required), `--description <text>` (required), `--author <id>` (required), `--diff-file <path>` (required — read file content as diff string), `--priority <level>` (optional, default: normal)
- Reads diff content via `readFileSync(diffFilePath, 'utf8')`. No stdin support needed for the first iteration — file path is sufficient and simpler. Stdin can be a follow-up.
- Calls `service.createReview({ title, description, diff, authorId, priority })`.
- JSON output: full response. Human output: `formatDetail` with review ID, status, proposal summary.

**`tandem reviewers spawn`**
- Two modes: explicit command (`--command <cmd> [--args <arg1,arg2,...>] [--cwd <dir>]`) or provider-based (`--provider <name>`).
- Provider resolution: `readConfig(configPath)` → look up `reviewer.providers.<name>` → extract `{ command, args }`. If provider not found, error to stderr with exit 1.
- Calls `service.spawnReviewer({ command, args, cwd })`.
- JSON output: full response. Human output: `formatDetail` with reviewer ID, status, command, PID.

**`tandem reviewers kill`**
- Flags: `<id>` positional (required).
- Calls `service.killReviewer({ reviewerId: id })`.
- JSON output: full response. Human output: `formatDetail` with outcome, reviewer ID.

**`tandem dashboard`**
- Flags: `--port <n>` (optional), `--host <addr>` (optional, default: 127.0.0.1).
- Reuses `createDashboardRoutes` + `createDashboardServer` from the HTTP module.
- Resolves dashboard dist path the same way `start-broker.ts` does (relative to workspace root).
- Starts the server, prints the URL, then keeps the process alive (`await runtime.waitUntilStopped()`) — same pattern as `start-broker.ts --dashboard` mode.
- The broker runtime's `close()` is wrapped to also close the dashboard server, matching start-broker.ts.

### Build Order

1. **T01: `reviews create` + `reviewers kill`** — Two simple commands. `reviews create` proves diff-file reading and is the most important new command. `reviewers kill` is trivial (one service call). Both go in the existing noun branches and need no config interaction. Write handler functions, wire dispatch, add SUBCOMMAND_HELP entries, add tests. This task changes `tandem.ts` and `tandem-cli.test.ts` only.

2. **T02: `reviewers spawn` with provider resolution** — The most novel piece. Add `resolveProvider()` to `config.ts`, then add `handleReviewersSpawn` to `tandem.ts` with dual-mode (explicit `--command` or `--provider`). Wire dispatch. Add tests including provider config setup via `setConfigValue`. Changes `config.ts`, `tandem.ts`, `tandem-cli.test.ts`, and `config.test.ts`.

3. **T03: `dashboard` command** — Extract or duplicate `resolveDashboardDistPath`, add `handleDashboard` to `tandem.ts`. This command is harder to test in a smoke test (it starts a long-running server), so verify by checking the process starts and the URL is printed. May need a timeout-based test or skip automated testing and verify manually. Changes `tandem.ts`, possibly `start-broker.ts` (extraction), `tandem-cli.test.ts`.

### Verification Approach

- `npx vitest run test/tandem-cli.test.ts test/config.test.ts` — all existing 37 tests still pass + new tests for the 4 commands.
- **`reviews create` test**: use the existing `valid-review.diff` fixture. `runTandem(['reviews', 'create', '--title', 'CLI Review', '--description', 'From CLI', '--diff-file', fixturePath, '--author', 'cli-user', '--json', '--db-path', dbPath])` → parse JSON → verify `review.reviewId` exists, `review.status === 'pending'`.
- **`reviewers kill` test**: kill the existing `test-reviewer-1` spawned in `beforeAll` → verify outcome.
- **`reviewers spawn` test**: set provider config via `setConfigValue`, then `runTandem(['reviewers', 'spawn', '--provider', 'test-provider', ...])` → verify reviewer created. Also test explicit `--command` mode.
- **`dashboard` test**: start with a short timeout or verify it errors gracefully when dist is missing. The dashboard itself is better tested in S04 integration.
- Error path tests: missing `--title`, missing `--diff-file`, nonexistent diff file, unknown provider name, missing reviewer ID for kill.

## Constraints

- The CLI entrypoint is a single 1117-line file (`tandem.ts`). Adding 4 more handlers will push it to ~1300+ lines. This is acceptable for the hand-rolled approach per D030 but getting close to the point where a refactor to separate handler files would help readability.
- `resolveDashboardDistPath` is a private function in `start-broker.ts`. Either extract it to a shared module or duplicate the 8-line function. Duplication is simpler for one consumer but creates drift risk if the path resolution logic changes.
- Test ordering: existing tests share a single DB and run sequentially. `reviewers kill` must run AFTER any test that needs the spawned reviewer. `reviews create` can run early since it creates new state.
- The `dashboard` command starts a long-running server. Testing it in `spawnSync` requires either a timeout mechanism or verifying it errors when the dist directory is invalid. A real end-to-end test belongs in S04.
- Provider config shape (`reviewer.providers.<name> = { command, args }`) is not validated by the config module (per D031) — `resolveProvider` must validate its own expected keys and produce clear errors.

## Common Pitfalls

- **Diff file path resolution** — The `--diff-file` path should be resolved relative to `process.cwd()` (not the workspace root), since the operator runs the command from their current shell directory. Use `path.resolve(diffFilePath)` to handle both relative and absolute paths.
- **Provider args splitting** — If `--args` accepts a comma-separated string, document and test edge cases (args with commas, empty strings). A simpler approach: accept multiple `--arg` flags or a single `--args` flag with comma splitting.
- **Dashboard server lifetime** — The `dashboard` handler must NOT return until the server is shut down (it needs `await runtime.waitUntilStopped()` or similar), otherwise the broker closes in the `finally` block and the dashboard dies immediately. Mirror the `start-broker.ts --dashboard` pattern exactly.
- **Reviewer spawn test cleanup** — Spawning a reviewer in a test creates a real child process. Must be killed in `afterAll` or the test suite hangs. The existing test already handles this in `beforeAll`'s finally block — new spawn tests should follow the same pattern or use the same test reviewer.
