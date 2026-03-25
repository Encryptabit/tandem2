---
id: T03
parent: S01
milestone: M004
provides:
  - CLI --dashboard mode for starting the broker with the mounted HTTP dashboard
  - Repo-level `broker:dashboard` and package-level `start:dashboard` scripts for repeatable proof
  - Smoke test covering broker dashboard HTTP startup, event emission, and API availability
  - Stable absolute path helpers in test-paths.ts (CLI_PATH, TSX_PATH, DASHBOARD_DIST_PATH, FIXTURES_DIR)
key_files:
  - packages/review-broker-server/src/cli/start-broker.ts
  - packages/review-broker-server/test/start-broker.smoke.test.ts
  - packages/review-broker-server/test/test-paths.ts
  - packages/review-broker-server/test/broker-mounted-dashboard.integration.test.ts
  - packages/review-broker-server/package.json
  - package.json
key_decisions:
  - Dashboard dist path resolved from broker's workspaceRoot (not process.cwd) since the broker CLI runs in the package directory when invoked via pnpm --filter exec
  - Dashboard mode emits a structured broker.dashboard_ready event with url/port/distPath for machine-readable startup detection
patterns_established:
  - CLI flag composition: --dashboard enables HTTP mode, --dashboard-port/--dashboard-host control binding, combines with existing --db-path for full proof paths
  - Shared test-paths.ts exports (CLI_PATH, TSX_PATH, DASHBOARD_DIST_PATH) eliminate ad-hoc path construction across smoke and integration tests
observability_surfaces:
  - broker.dashboard_ready event on stdout with url, port, and dashboardDistPath
  - broker.started event now reports mode as 'dashboard' when --dashboard flag is used
  - Smoke test verifies the dashboard_ready event, overview API response, and mounted page accessibility from a real CLI process
duration: ~25m
verification_result: passed
completed_at: 2026-03-25
blocker_discovered: false
---

# T03: Package the real-runtime dashboard proof and operator entrypoints

**Extended the broker CLI with --dashboard mode, added repo/package scripts, shared test path helpers, and a dashboard startup smoke test so the S01 proof path is repeatable without reconstructing flags or ports**

## What Happened

Closed S01 by making the broker-served dashboard easy to start, verify, and debug against a real SQLite-backed runtime:

1. **CLI extension** (`start-broker.ts`): Added `--dashboard`, `--dashboard-port`, and `--dashboard-host` flags. When `--dashboard` is set, the broker creates the dashboard routes and HTTP server after startup, emits a structured `broker.dashboard_ready` event with the URL/port/dist-path, and gracefully tears down the dashboard server on broker shutdown. The dashboard dist path resolves from `runtime.context.workspaceRoot` (not `process.cwd()`) since `pnpm --filter ... exec` changes cwd to the package directory.

2. **Test path helpers** (`test-paths.ts`): Exported `CLI_PATH`, `TSX_PATH`, `DASHBOARD_DIST_PATH`, and `FIXTURES_DIR` as stable absolute paths. The smoke test and integration test both now import from this single source instead of constructing paths independently.

3. **Dashboard smoke test** (`start-broker.smoke.test.ts`): Added a second test in a new describe block that spawns the broker with `--dashboard --dashboard-port 0`, waits for the `broker.dashboard_ready` event, verifies the event shape, then fetches `/api/overview` and `/` from the running server to confirm the dashboard is mounted and serving real broker state.

4. **Integration test consolidation** (`broker-mounted-dashboard.integration.test.ts`): Updated to import `DASHBOARD_DIST_PATH` from the shared `test-paths.ts` instead of computing it locally.

5. **Repo/package scripts**: Added `broker:dashboard` at root level (builds dashboard first, then starts the broker with `--dashboard`) and `start:dashboard` at the package level for direct use.

## Verification

- `vitest run` on all 4 slice test files — 30 tests pass (14 contract + 8 route + 6 integration + 2 smoke)
- `pnpm --filter review-broker-dashboard build && pnpm --filter review-broker-core build && pnpm --filter review-broker-server build` — all three compile cleanly
- Browser verification: started broker with `--dashboard`, navigated to the served URL, confirmed all 8 assertions pass (Review Broker heading, CONNECTED badge, TOTAL REVIEWS card, REVIEWERS card, Startup Recovery panel, Latest Activity panel, SNAPSHOT card, overview-root element)

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `vitest run packages/review-broker-core/test/dashboard-contracts.test.ts packages/review-broker-server/test/http-dashboard-routes.test.ts` | 0 | ✅ pass | 1.5s |
| 2 | `vitest run packages/review-broker-server/test/broker-mounted-dashboard.integration.test.ts` | 0 | ✅ pass | 1.0s |
| 3 | `vitest run packages/review-broker-server/test/start-broker.smoke.test.ts` | 0 | ✅ pass | 4.4s |
| 4 | `pnpm --filter review-broker-dashboard build && pnpm --filter review-broker-core build && pnpm --filter review-broker-server build` | 0 | ✅ pass | 5.1s |
| 5 | Browser assertions (8 checks: text visibility, CONNECTED state, selector) | 0 | ✅ pass | — |

## Diagnostics

- **Dashboard startup**: Run `pnpm broker:dashboard` (repo-level) or `pnpm start:dashboard --db-path <path>` (package-level). Watch stdout for the `broker.dashboard_ready` JSON event — it contains the local URL.
- **Smoke test**: `vitest run packages/review-broker-server/test/start-broker.smoke.test.ts` exercises both `--once` and `--dashboard` modes against real broker processes.
- **API check**: `curl <url>/api/overview` returns the OverviewSnapshot JSON; compare against `OverviewSnapshotSchema` in `packages/review-broker-core/src/dashboard.ts`.
- **Failure modes**: Missing dashboard build output causes a 404 on `/`; broken routes surface through the smoke test's HTTP assertions.

## Deviations

- The `resolveDashboardDistPath` function uses `runtime.context.workspaceRoot` instead of `process.cwd()` as the plan implied. This is necessary because `pnpm --filter ... exec` changes cwd to the package directory, not the workspace root.

## Known Issues

- The `broker:dashboard` repo script uses a fixed db path `./.tmp/dashboard-proof.sqlite`. This is intentional for proof repeatability but means multiple runs accumulate state. Delete the file for a fresh start.
- The favicon.ico 404 from T02 remains — cosmetic only, not addressed in this task.

## Files Created/Modified

- `packages/review-broker-server/src/cli/start-broker.ts` — added --dashboard, --dashboard-port, --dashboard-host flags with HTTP server lifecycle and dashboard_ready event emission
- `packages/review-broker-server/test/test-paths.ts` — added CLI_PATH, TSX_PATH, DASHBOARD_DIST_PATH, FIXTURES_DIR exports
- `packages/review-broker-server/test/start-broker.smoke.test.ts` — imported paths from test-paths.ts; added dashboard mode smoke test
- `packages/review-broker-server/test/broker-mounted-dashboard.integration.test.ts` — imported DASHBOARD_DIST_PATH from test-paths.ts
- `packages/review-broker-server/package.json` — added start:dashboard script
- `package.json` — added broker:dashboard script
