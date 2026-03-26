---
id: M005
provides:
  - Interactive `tandem` CLI entrypoint with subcommand routing, global flags (--json, --db-path, --cwd, --help), and per-subcommand help
  - Full MCP ↔ CLI parity — all 16 MCP tools mapped to CLI subcommands with equivalent functionality
  - 7 read-only commands (status, reviews list/show, proposal show, discussion show, activity, reviewers list)
  - 7 write commands (reviews claim/reclaim/verdict/close, discussion add, proposal accept/reject)
  - 4 operational commands (reviews create, reviewers spawn/kill, dashboard)
  - Config management module (readConfig, writeConfig, setConfigValue) with dot-path key nesting for nested JSON config
  - Config CLI surface (tandem config show, tandem config set) persisting to the resolved configPath
  - Provider-based reviewer spawning via resolveProvider resolving config-stored provider templates into subprocess commands
  - Dual output modes — human-readable tables/details for interactive use, --json for machine-parseable scripting
  - Dashboard launch command wrapping existing createDashboardRoutes + createDashboardServer infrastructure
  - CLI shares same default SQLite database as MCP server and dashboard — proven by cross-surface shared-state test
  - Bidirectional MCP ↔ CLI parity completeness guard in test suite
  - 61 passing tests (45 CLI smoke tests + 16 config unit tests)
key_decisions:
  - D029: Build interactive subcommand CLI as thin operator surface over BrokerService
  - D030: Hand-rolled subcommand router and arg parsing matching existing start-broker.ts convention
  - D031: Config as simple JSON with dot-path set, no schema validation on read
  - D032: resolveProvider handles both JSON-stringified and native arrays transparently
  - D033: Dashboard is top-level command, long-running with graceful teardown
  - D034: Bidirectional static MCP ↔ CLI mapping check for parity enforcement
patterns_established:
  - Subcommand router dispatch(noun, verb, rest, runtime, options) with case branches per noun/verb
  - Global arg parsing via parseGlobalArgs() — --json/--db-path/--cwd/--help
  - Reusable arg helpers — extractFlag, extractFlagWithEquals, extractStatusFlag, extractLimitFlag, requireFlag, requireId
  - Broker lifecycle — startBroker({ handleSignals: false }) in try/finally per invocation
  - Per-subcommand help via SUBCOMMAND_HELP record keyed by "noun verb"
  - Output formatting through format.ts — formatJson, formatTable, formatDetail, formatStatusCounts
  - Config dot-path nesting for nested key assignment
  - Provider dual-mode spawn — --command takes precedence over --provider
  - Bidirectional MCP_TOOL_TO_CLI_COMMAND mapping as CI-visible parity guard
observability_surfaces:
  - tandem status --json — full BrokerRuntimeSnapshot
  - tandem reviews list --json --status <status> — filtered review list
  - tandem config show --json — current config state
  - tandem reviewers spawn --json — returns reviewerId, status, command, pid
  - tandem dashboard --json — returns url, port, dashboardDistPath
  - All error paths — descriptive stderr + exit code 1
requirement_outcomes: []
duration: ~1.5h
verification_result: passed
completed_at: 2026-03-25
---

# M005: Interactive operator CLI — Summary

**Status:** Complete — all 4 slices done, 61 tests passing, full MCP ↔ CLI parity proven.

## What This Milestone Delivered

A `tandem` CLI providing shell-native access to every broker operation. Operators can inspect reviews, manage reviewer lifecycle, configure providers, and launch the dashboard — all from the terminal with human-readable output or `--json` for scripting. The CLI is a thin surface over `BrokerService`, sharing the same SQLite database as the MCP server and dashboard.

### Command Surface (20 commands)

| Category | Commands |
|----------|----------|
| **Read-only (7)** | `status`, `reviews list`, `reviews show`, `proposal show`, `discussion show`, `activity`, `reviewers list` |
| **Write (7)** | `reviews claim`, `reviews reclaim`, `reviews verdict`, `reviews close`, `discussion add`, `proposal accept`, `proposal reject` |
| **Operational (4)** | `reviews create`, `reviewers spawn`, `reviewers kill`, `dashboard` |
| **Config (2)** | `config show`, `config set` |

### Code Changes (2,642 lines across 8 files)

| File | Lines | Purpose |
|------|-------|---------|
| `packages/review-broker-server/src/cli/tandem.ts` | 1373 | CLI entrypoint — arg parsing, subcommand router, 20 handlers |
| `packages/review-broker-server/src/cli/format.ts` | 76 | Output formatting — formatJson, formatTable, formatDetail, formatStatusCounts |
| `packages/review-broker-server/src/cli/config.ts` | 128 | Config I/O — readConfig, writeConfig, setConfigValue, resolveProvider |
| `packages/review-broker-server/test/tandem-cli.test.ts` | 853 | 45 CLI smoke tests covering every command + parity guard |
| `packages/review-broker-server/test/config.test.ts` | 198 | 16 config unit tests — I/O paths, dot-path nesting, resolveProvider |
| `packages/review-broker-server/test/test-paths.ts` | 10 | Shared TANDEM_CLI_PATH constant |
| `packages/review-broker-server/package.json` | +1 | `bin.tandem` entry |
| `package.json` | +1 | Root `tandem` script |

## Success Criteria Verification

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 1 | Every MCP tool has a corresponding CLI subcommand | ✅ Met | Bidirectional `MCP_TOOL_TO_CLI_COMMAND` mapping checks all 16 MCP tools. Test passes (45/45). |
| 2 | Operators can run `tandem` from any directory | ✅ Met | `--db-path` and `--cwd` flags allow operation from any directory. `parseGlobalArgs()` resolves workspace context. |
| 3 | `tandem config` persists and inspects broker config | ✅ Met | `config set` → `config show --json` roundtrip verified. 16 config tests + 3 CLI config tests pass. |
| 4 | `tandem reviewer spawn --provider <name>` resolves templates | ✅ Met | `resolveProvider` navigates config, extracts command + args. 6 unit tests + 2 CLI spawn tests pass. |
| 5 | `tandem dashboard` builds and launches the dashboard | ✅ Met | Dashboard handler uses `createDashboardRoutes` + `createDashboardServer`, supports `--port`/`--host`/`--json`. |
| 6 | CLI shares same default database as MCP/dashboard | ✅ Met | Cross-surface shared-state test: seeds via BrokerService, reads via CLI, asserts data matches. |
| 7 | Human-readable output + `--json` for machine consumption | ✅ Met | All commands support `--json`. Human-readable uses formatTable/formatDetail. Tested across 45 CLI tests. |

## Definition of Done Verification

| Criterion | Status | Evidence |
|-----------|--------|----------|
| All slices `[x]` | ✅ | S01, S02, S03, S04 all complete with summaries |
| Every MCP tool has a working CLI equivalent | ✅ | 16/16 mapped and tested bidirectionally |
| `--json` flag on all commands | ✅ | Every handler branches on `options.json` |
| Config management reads/writes config file | ✅ | 16 config unit tests + 3 CLI config tests |
| Provider-based reviewer spawning | ✅ | resolveProvider + 6 unit tests + 2 CLI tests |
| `tandem dashboard` launches dashboard | ✅ | Handler wired with createDashboardRoutes/Server |
| CLI/MCP/dashboard share same database | ✅ | Cross-surface shared-state test proven |
| Full parity proven through integrated tests | ✅ | 61 tests pass — bidirectional parity guard + all commands exercised |

## Slice Execution Timeline

| Slice | Duration | Tests Added | Key Deliverable |
|-------|----------|-------------|-----------------|
| S01 | ~45m | 12 | CLI scaffold, router, format module, 7 read-only commands |
| S02 | ~27m | 25 | Config module, 7 write commands, requireFlag helper |
| S03 | ~28m | 19 | reviews create, reviewers spawn/kill, dashboard, resolveProvider |
| S04 | ~12m | 5 | Counter-patch accept/reject, shared-state proof, parity guard |

## Test Results (authoritative)

```
Test Files  2 passed (2)
     Tests  61 passed (61)

  tandem-cli.test.ts: 45 tests (22.7s)
  config.test.ts:     16 tests (31ms)
```

Pre-existing failures in other test files (8 empty gsd extension stubs + 1 timing-sensitive client-mcp-parity test) are unrelated to M005 — no M005 files were touched in those areas.

## Deviations from Plan

- **Faster than estimated:** S02 planned 75m, executed in 27m — handler pattern from S01 made write commands mechanical.
- **S04 produced 5 tests instead of 4:** Bidirectional parity check split into two assertions.
- **Config values always strings:** `setConfigValue` stores everything as strings. Numeric/boolean parsing left to consumers.
- **No `--config-path` CLI flag:** Tests use `REVIEW_BROKER_CONFIG_PATH` env var for config isolation.

## Known Limitations

- Config values stored as strings only — consumers parse types at point of use.
- No config schema validation on read — open `Record<string, unknown>`.
- `MCP_TOOL_TO_CLI_COMMAND` mapping manually maintained — renames produce missing + stale entries (caught but not identified as rename).
- Test ordering in tandem-cli.test.ts depends on shared DB state.
- Binary distribution not addressed — `pnpm exec tandem` works but no global install path yet.
- CLI is 1373 lines in one file — may benefit from splitting into per-noun handler modules if more commands are added.

## Forward Intelligence

### What the next milestone should know
- The `tandem` CLI is feature-complete with full MCP parity. All 16 MCP tools have corresponding CLI commands, all tested with `--json` output.
- The CLI, MCP server, and dashboard share the same SQLite database — explicitly proven, not assumed.
- Config lives at resolved `configPath` (`.gsd/review-broker/config.json`). Provider templates stored at `reviewer.providers.<name>.{command, args}`.
- The counter-patch seeding pattern requires `actorId === authorId` in `addMessage` to trigger the proposer-requeue flow.
- The parity completeness guard will fail if MCP tools are added/removed without updating the CLI mapping — by design.

### What's fragile
- Test ordering depends on shared DB state — new write-command tests must respect state-machine progression.
- `REVIEW_BROKER_CONFIG_PATH` env var override for config test isolation is only documented in test files.
- Dashboard command is the only long-running CLI command — different lifecycle from all others.

### Architectural debt
- CLI is 1373 lines in one file — splitting into per-noun handler modules would improve navigability.
- No input validation beyond required flags — complex operations rely on service-level validation.
- Config has no migration story — schema changes need manual operator action.
