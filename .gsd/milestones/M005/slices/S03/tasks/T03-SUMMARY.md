---
id: T03
parent: S03
milestone: M005
provides:
  - dashboard command handler with HTTP server lifecycle
  - resolveDashboardDistPath function (duplicated from start-broker.ts)
  - dispatch routing, SUBCOMMAND_HELP, and printUsage entry for dashboard
  - 2 new test cases (dashboard --help, help listing)
key_files:
  - packages/review-broker-server/src/cli/tandem.ts
  - packages/review-broker-server/test/tandem-cli.test.ts
key_decisions:
  - Dashboard command is top-level (no noun/verb), matching the activity command pattern — verb is pushed back into rest if present
patterns_established:
  - Long-running server command pattern: wrap runtime.close for teardown, block via waitUntilStopped() inside dispatch, relies on main() finally block for signal-triggered cleanup
observability_surfaces:
  - dashboard --json outputs { url, port, dashboardDistPath } for programmatic discovery
  - Invalid --port produces stderr with raw value + exit code 1
  - Graceful teardown wraps runtime.close to dispose routes + close HTTP server before original close
duration: 6m
verification_result: passed
completed_at: 2026-03-25
blocker_discovered: false
---

# T03: Implement `dashboard` command handler with tests

**Added `dashboard` command that starts the broker dashboard HTTP server with `--port`/`--host`/`--json` support, graceful teardown, and 2 tests.**

## What Happened

Implemented the `dashboard` command in `tandem.ts` as the final command in the S03 slice:

1. **`resolveDashboardDistPath`** — duplicated the 8-line function from `start-broker.ts` that resolves the dashboard dist directory by trying cwd-relative and then package-relative paths.

2. **`handleDashboard`** — parses optional `--port` (integer-validated) and `--host` flags, resolves the dist path, creates dashboard routes via `createDashboardRoutes`, starts the server via `createDashboardServer`, prints the URL (JSON or human-readable), wraps `runtime.close` for graceful teardown (dispose routes + close server), and blocks via `await runtime.waitUntilStopped()` to keep the process alive.

3. **Dispatch routing** — added `case 'dashboard'` in the dispatch switch as a top-level command (like `activity`), pushing any verb position back into rest.

4. **SUBCOMMAND_HELP** — added help entry documenting `--port`, `--host`, and `--json` options.

5. **printUsage** — added `dashboard` to the command listing.

6. **Tests** — added `dashboard --help` test verifying `--port` and `--host` appear in output, and a help listing test verifying `dashboard` appears in `tandem --help`.

## Verification

- `npx vitest run test/tandem-cli.test.ts test/config.test.ts` → 56 tests passed (40 CLI + 16 config)
- `dashboard --help` test passes: exit 0, stdout contains `--port` and `--host`
- `tandem --help` output includes `dashboard` in the command list
- All 38 pre-existing CLI tests still pass (no regressions)

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `npx vitest run test/tandem-cli.test.ts test/config.test.ts` | 0 | ✅ pass | 21.5s |

## Diagnostics

- Dashboard help: `tandem dashboard --help` shows usage with `--port`, `--host`, `--json`
- Dashboard JSON output: `tandem dashboard --json` outputs `{ url, port, dashboardDistPath }`
- Error shapes: Invalid `--port` → `Error: Invalid --port value: "<raw>". Must be a non-negative integer.` + exit 1
- Full lifecycle testing (server startup, file serving, shutdown) deferred to S04 integrated acceptance

## Deviations

None — implementation matched the task plan exactly.

## Known Issues

None.

## Files Created/Modified

- `packages/review-broker-server/src/cli/tandem.ts` — added `resolveDashboardDistPath`, `handleDashboard`, dashboard imports, dispatch routing, SUBCOMMAND_HELP entry, updated printUsage
- `packages/review-broker-server/test/tandem-cli.test.ts` — added 2 dashboard test cases (help output, help listing)
- `.gsd/milestones/M005/slices/S03/tasks/T03-PLAN.md` — added Observability Impact section per pre-flight requirement
