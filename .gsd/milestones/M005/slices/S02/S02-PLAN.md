# S02: Config management and write commands

**Goal:** Add config management (`config show`, `config set`) and all 7 write commands (`reviews claim/reclaim/verdict/close`, `discussion add`, `proposal accept/reject`) to the tandem CLI.
**Demo:** `tandem config set reviewer.provider anthropic` persists to `config.json`, `tandem config show` reads it back, and all write commands (`claim`, `verdict`, `close`, `reclaim`, `discussion add`, `proposal accept`, `proposal reject`) execute against the broker and produce correct output.

## Must-Haves

- Config module (`config.ts`) with `readConfig`, `writeConfig`, `setConfigValue` supporting dot-path key nesting
- `tandem config show [--json]` displays config file contents (or reports no config)
- `tandem config set <key> <value>` persists changes to `.gsd/review-broker/config.json`, creating the directory if needed
- All 7 write commands wired into `tandem.ts` dispatch with `--actor`, `--verdict`, `--reason`, `--body`, `--note` flag parsing
- Each write command has a `SUBCOMMAND_HELP` entry
- `--verdict` flag validates against `REVIEW_VERDICTS` enum before calling the service
- Unit tests for config read/write/set (temp file I/O)
- Smoke tests for `config show`, `config set`, and all 7 write commands including error cases

## Proof Level

- This slice proves: integration
- Real runtime required: yes (SQLite-backed BrokerService for write commands)
- Human/UAT required: no

## Verification

- `npx vitest run test/tandem-cli.test.ts` — all existing 12 tests pass plus new write-command and config tests
- `npx vitest run test/config.test.ts` — config module unit tests pass
- Config persistence verified: `config set` followed by `config show --json` returns the value
- Write command error cases: missing `--actor` → exit 1, invalid `--verdict` → exit 1

## Integration Closure

- Upstream surfaces consumed: `BrokerService` write methods from `broker-service.ts`, `REVIEW_VERDICTS` from `review-broker-core`, `configPath` from `AppContext`
- New wiring introduced in this slice: `config.ts` module (new), `config show`/`config set` handlers + 7 write command handlers in `tandem.ts`
- What remains before the milestone is truly usable end-to-end: S03 adds `reviews create`, `reviewers spawn/kill`, `dashboard`; S04 proves full parity

## Tasks

- [x] **T01: Create config management module and CLI handlers** `est:30m`
  - Why: Config management is the only novel backend piece in this slice — no config read/write exists today. S03 depends on config being in place for provider resolution. The config module + CLI handlers are a self-contained unit.
  - Files: `packages/review-broker-server/src/cli/config.ts`, `packages/review-broker-server/src/cli/tandem.ts`, `packages/review-broker-server/test/config.test.ts`
  - Do: Create `config.ts` with `readConfig(configPath)` → JSON.parse with `{}` fallback, `writeConfig(configPath, data)` → mkdirSync + writeFileSync, `setConfigValue(configPath, dotKey, value)` → read/deep-set/write. Add `"config"` noun case to `dispatch()` in `tandem.ts` with `show` and `set` verbs. Config handlers use `runtime.context.configPath` but don't need `runtime.service`. Add `SUBCOMMAND_HELP` entries. Write unit tests in `test/config.test.ts` covering: read non-existent file → `{}`, write + read roundtrip, dot-path nesting (`a.b.c` → `{ a: { b: { c: "val" } } }`), overwrite existing key. Add smoke tests in `test/tandem-cli.test.ts` for `config set` and `config show --json`.
  - Verify: `cd packages/review-broker-server && npx vitest run test/config.test.ts` passes, `npx vitest run test/tandem-cli.test.ts` passes (old + new tests)
  - Done when: `tandem config set reviewer.provider anthropic --db-path <temp>` exits 0 and `tandem config show --json --db-path <temp>` returns JSON containing `reviewer.provider: "anthropic"`

- [x] **T02: Add all 7 write command handlers with smoke tests** `est:45m`
  - Why: The 7 write commands complete the non-create, non-spawn surface of the CLI. Each is ~20-30 lines following the exact handler pattern from S01 read commands. Tests need careful state-machine seed setup (create → claim → verdict → counter-patch flow).
  - Files: `packages/review-broker-server/src/cli/tandem.ts`, `packages/review-broker-server/test/tandem-cli.test.ts`
  - Do: Add handler functions and dispatch cases for: `reviews claim <id> --actor`, `reviews reclaim <id> --actor`, `reviews verdict <id> --actor --verdict --reason`, `reviews close <id> --actor`, `discussion add <id> --actor --body`, `proposal accept <id> --actor [--note]`, `proposal reject <id> --actor [--note]`. Import `REVIEW_VERDICTS` from `review-broker-core` and validate `--verdict` using the `extractStatusFlag` pattern. Each handler: parse flags → call service method → format response with `formatJson`/`formatDetail`. Add `SUBCOMMAND_HELP` entries for all 7. In tests: extend `beforeAll` seed to claim the review (so verdict/close can be tested), add a second review for commands that need different state. Test each command with `--json` output assertions. Test error cases: missing `--actor`, missing `--verdict`, invalid verdict value.
  - Verify: `cd packages/review-broker-server && npx vitest run test/tandem-cli.test.ts` — all old + new tests pass
  - Done when: All 7 write commands produce correct JSON output in smoke tests, error cases exit non-zero with descriptive messages

## Files Likely Touched

- `packages/review-broker-server/src/cli/config.ts` (new)
- `packages/review-broker-server/src/cli/tandem.ts` (modified — add config handlers + 7 write handlers)
- `packages/review-broker-server/test/config.test.ts` (new)
- `packages/review-broker-server/test/tandem-cli.test.ts` (modified — add write command + config smoke tests)

## Observability / Diagnostics

- **Config path visibility:** `tandem config show --json` always reports the full parsed config (or `{}` if absent), letting an agent verify that config persists correctly between invocations.
- **Write command stderr:** Every write command failure (missing `--actor`, invalid `--verdict`, unknown review ID) emits a structured error to stderr and exits non-zero. An agent can detect failures by checking exit code and `stderr` content.
- **Broker startup diagnostics:** Config and write commands still go through `startBroker()`, so any startup failure (DB corruption, path resolution error) surfaces the same error message pattern as read commands.
- **Redaction:** Config values are user-chosen strings (e.g. `reviewer.provider`). No secrets are stored in config today; if API keys are added later, `config show` output should be audited for redaction.
