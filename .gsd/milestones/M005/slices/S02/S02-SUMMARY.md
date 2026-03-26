---
id: S02
parent: M005
milestone: M005
provides:
  - config.ts module with readConfig, writeConfig, setConfigValue for dot-path JSON config management
  - config show and config set CLI handlers
  - 7 write command handlers (reviews claim/reclaim/verdict/close, discussion add, proposal accept/reject)
  - requireFlag helper for mandatory flag validation with descriptive error messages
  - SUBCOMMAND_HELP entries for all 9 new commands
  - 10 config unit tests and 15 CLI smoke tests (3 config + 12 write commands)
requires:
  - slice: S01
    provides: CLI entrypoint scaffold, dispatch router, parseGlobalArgs, formatJson/formatDetail/formatTable, extractFlagWithEquals, startBroker helper
affects:
  - S03
key_files:
  - packages/review-broker-server/src/cli/config.ts
  - packages/review-broker-server/src/cli/tandem.ts
  - packages/review-broker-server/test/config.test.ts
  - packages/review-broker-server/test/tandem-cli.test.ts
key_decisions:
  - Config stored as simple JSON at configPath with dot-path key nesting; no schema validation on read — consumers validate at point of use (D031)
  - Config smoke tests use REVIEW_BROKER_CONFIG_PATH env var to isolate config file from workspace detection
  - Test cases ordered by state-machine progression (claim → verdict → discussion add → close) since all tests share one DB
patterns_established:
  - Config handlers follow the same dispatch pattern as read commands but only need runtime.context.configPath, not runtime.service
  - requireFlag(args, flag, commandName) extracts mandatory flags and throws descriptive errors for write commands
  - Verdict validation against REVIEW_VERDICTS enum before calling service, matching extractStatusFlag pattern for required flags
observability_surfaces:
  - "tandem config show --json" returns full config as machine-readable JSON (or {} if no config file)
  - Missing required flags emit "Missing required --flag" to stderr with exit code 1
  - Invalid --verdict values emit "Invalid verdict" to stderr with valid values listed
  - All 7 write commands support --json for machine-readable output with version field for concurrency tracking
drill_down_paths:
  - .gsd/milestones/M005/slices/S02/tasks/T01-SUMMARY.md
  - .gsd/milestones/M005/slices/S02/tasks/T02-SUMMARY.md
duration: 27m
verification_result: passed
completed_at: 2026-03-25
---

# S02: Config management and write commands

**Config persistence module with dot-path key nesting, plus all 7 write command handlers with flag validation and descriptive error messages**

## What Happened

T01 created the `config.ts` module — the only novel backend piece in M005. Three functions: `readConfig` returns `{}` for missing files, `writeConfig` creates parent directories and writes pretty-printed JSON, and `setConfigValue` splits dot-path keys (e.g. `reviewer.provider`) into nested JSON objects. Config handlers were wired into the dispatch router using `runtime.context.configPath` without needing the broker service. 10 unit tests cover all config I/O paths including dot-path nesting, key preservation, and overwrites.

T02 added the remaining 7 write commands: `reviews claim`, `reviews reclaim`, `reviews verdict`, `reviews close`, `discussion add`, `proposal accept`, and `proposal reject`. A `requireFlag` helper was introduced for mandatory flag extraction — it wraps `extractFlagWithEquals` and throws a descriptive error if the flag is absent. The verdict handler validates `--verdict` against the `REVIEW_VERDICTS` enum before calling the service. All handlers follow the same pattern: parse flags → call BrokerService method → format response. 12 smoke tests cover 5 happy-path commands, 1 help output, and 6 error cases.

## Verification

- `npx vitest run test/config.test.ts` — 10/10 tests pass (config read/write/set roundtrips, dot-path nesting, key preservation)
- `npx vitest run test/tandem-cli.test.ts` — 27/27 tests pass (12 original S01 + 3 config + 12 write commands)
- Config persistence verified: `config set reviewer.provider anthropic` → `config show --json` returns `{ reviewer: { provider: "anthropic" } }`
- Write command error cases verified: missing `--actor` → exit 1 with descriptive stderr, invalid `--verdict` → exit 1, missing `--verdict` → exit 1, missing `--body` → exit 1
- Observability surfaces confirmed: `--json` on all commands, structured error messages on stderr, help text lists all write commands

## Deviations

- Config smoke tests use `REVIEW_BROKER_CONFIG_PATH` env var instead of `--cwd` to redirect config writes to a temp directory. The CLI doesn't expose a `--config-path` flag, so env var isolation is cleaner than depending on workspace root detection in tests.
- `proposal accept`/`reject` happy-path tests omitted because they require complex counter-patch state-machine setup (create → claim → verdict with changes_requested → counter-patch generation). Error case tests prove the handlers are correctly wired since they reach the `requireFlag` validation layer. Full happy-path coverage deferred to S04 integrated acceptance.
- `discussion add` test moved before `reviews close` test to respect state-machine ordering — adding a message to a closed review is rejected by the service.

## Known Limitations

- Config values are always stored as strings. Numeric or boolean config values (if needed later) would require consumer-side parsing.
- No config validation on read — the config is an open `Record<string, unknown>`. S03's provider resolver will need to validate its own expected keys.
- `proposal accept`/`reject` happy-path not yet proven — requires the full counter-patch state machine which S04 will exercise.

## Follow-ups

- S03 should consume `readConfig` to resolve provider templates for `reviewers spawn --provider <name>`.
- S04 should exercise `proposal accept`/`reject` happy paths with a fully seeded counter-patch state machine.

## Files Created/Modified

- `packages/review-broker-server/src/cli/config.ts` — new config module with readConfig, writeConfig, setConfigValue
- `packages/review-broker-server/src/cli/tandem.ts` — added REVIEW_VERDICTS import, config import, requireFlag helper, 7 write command handlers, config show/set handlers, dispatch routing, SUBCOMMAND_HELP entries, updated printUsage()
- `packages/review-broker-server/test/config.test.ts` — new unit test file (10 tests covering all config I/O paths)
- `packages/review-broker-server/test/tandem-cli.test.ts` — extended seed with claim + second review, added 15 new tests (3 config + 12 write commands)

## Forward Intelligence

### What the next slice should know
- `readConfig(configPath)` returns a plain `Record<string, unknown>` — S03's provider resolver should call this and validate the `reviewer.provider` / `reviewer.providers.*` keys it expects, since the config module intentionally does no schema validation.
- The `configPath` is available on `runtime.context.configPath` after `startBroker()` — same lifecycle as the service. Config handlers don't need the running service, only the path.
- All write command handlers follow the pattern: `requireFlag` for mandatory flags → service method call → `formatJson`/`formatDetail` for output. S03's `reviews create` and `reviewers spawn/kill` should follow the same shape.

### What's fragile
- Test ordering in `tandem-cli.test.ts` depends on shared DB state — tests run sequentially and build on each other's mutations (claim → verdict → close). Adding new write-command tests must respect the state machine progression or use a separate seeded review.
- The `REVIEW_BROKER_CONFIG_PATH` env var override for config isolation in tests is not documented outside the test file — if future config tests don't set it, they'll write to the workspace config path.

### Authoritative diagnostics
- `npx vitest run test/config.test.ts test/tandem-cli.test.ts` — combined 37-test pass proves config module + all CLI commands. Duration ~12s on SQLite.
- `tandem config show --json --db-path <path>` — machine-readable config state for any debugging.

### What assumptions changed
- The plan estimated T01 at 30m and T02 at 45m — actual execution was 15m and 12m respectively. The handler pattern established in S01 made write commands nearly mechanical to add.
- No config schema validation was needed — the open-record approach kept the module simple and independently testable without coupling to S03's provider requirements.
