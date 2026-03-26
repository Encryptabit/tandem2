---
estimated_steps: 4
estimated_files: 2
skills_used: []
---

# T03: Implement `dashboard` command handler with tests

**Slice:** S03 — Create, spawn, kill, and dashboard commands
**Milestone:** M005

## Description

Add the `dashboard` command that builds and launches the broker dashboard HTTP server as a convenience for operators. This command reuses the existing `createDashboardRoutes` and `createDashboardServer` infrastructure from the HTTP module. The handler resolves the dashboard dist path, starts the server, prints the URL, and keeps the process alive until interrupted. Since this is a long-running server command, testing is limited to help output and graceful error handling when the dist directory is invalid.

## Steps

1. **Add `resolveDashboardDistPath` function to `tandem.ts`:**
   - Duplicate the 8-line `resolveDashboardDistPath(cwd: string): string` function from `start-broker.ts`. The function:
     - Tries `path.resolve(cwd, 'packages', 'review-broker-dashboard', 'dist')` first.
     - Falls back to `path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..', '..', 'review-broker-dashboard', 'dist')`.
     - Returns whichever path includes `review-broker-dashboard`.
   - This is a private function — no export needed.

2. **Add `handleDashboard` handler to `tandem.ts`:**
   - Add imports at the top: `import { createDashboardRoutes } from '../http/dashboard-routes.js'` and `import { createDashboardServer } from '../http/dashboard-server.js'`.
   - Create `async function handleDashboard(rest, runtime, options)` that:
     - Parses optional flags: `--port` (via `extractFlagWithEquals`, parsed as integer), `--host` (via `extractFlagWithEquals`).
     - Calls `resolveDashboardDistPath(runtime.context.workspaceRoot)` to get the dist path.
     - Creates routes: `const routes = createDashboardRoutes({ context: runtime.context, service: runtime.service, startupRecoverySnapshot: runtime.getStartupRecoverySnapshot() })`.
     - Creates server: `const server = await createDashboardServer({ dashboardDistPath, routes, ...(host ? { host } : {}), ...(port ? { port } : {}) })`.
     - Prints the URL: if `options.json`, output `formatJson({ url: server.baseUrl, port: server.port, dashboardDistPath })`. Otherwise `process.stdout.write(\`Dashboard running at ${server.baseUrl}\n\`)`.
     - Wraps `runtime.close` for graceful teardown (matching `start-broker.ts` pattern):
       ```
       const originalClose = runtime.close;
       runtime.close = () => {
         routes.dispose();
         void server.close();
         originalClose();
       };
       ```
     - Calls `await runtime.waitUntilStopped()` to block until the process is shut down. This is critical — without it, the main `finally` block calls `runtime.close()` and the dashboard dies immediately.

3. **Wire into dispatch and update help:**
   - In the `dispatch()` switch, add a new top-level case `'dashboard'`: `await handleDashboard(rest, runtime, options); return;`.
   - Add `SUBCOMMAND_HELP` entry for `'dashboard'` showing `--port`, `--host`, `--json` options.
   - Update `printUsage()` to list `dashboard` command.

4. **Add tests to `tandem-cli.test.ts`:**
   - **`dashboard --help`:** verify `runTandem(['dashboard', '--help'])` returns exit 0 and stdout contains `--port` and `--host`.
   - **Help listing:** verify `tandem --help` now lists `dashboard`.
   - Full lifecycle testing of the dashboard (starts server, serves files, shuts down) belongs in S04 integrated acceptance. The handler follows the proven `start-broker.ts` pattern exactly, so structural correctness is high-confidence.

## Must-Haves

- [ ] `resolveDashboardDistPath` resolves the dashboard dist directory using the same logic as `start-broker.ts`
- [ ] `handleDashboard` creates routes, starts server, prints URL, wraps close for graceful teardown, and blocks via `waitUntilStopped()`
- [ ] Both `--port` and `--host` flags are supported
- [ ] `--json` outputs structured `{ url, port, dashboardDistPath }`
- [ ] Wired into dispatch with `SUBCOMMAND_HELP` and `printUsage()` updated
- [ ] `dashboard --help` test passes

## Verification

- `cd packages/review-broker-server && npx vitest run test/tandem-cli.test.ts` — all tests pass including `dashboard --help`.
- `tandem --help` output includes `dashboard` in the command list.

## Inputs

- `packages/review-broker-server/src/cli/tandem.ts` — modified by T01 and T02 with create/kill/spawn handlers
- `packages/review-broker-server/src/cli/start-broker.ts` — reference for `resolveDashboardDistPath` function (lines 263-275, to be duplicated)
- `packages/review-broker-server/src/http/dashboard-routes.ts` — `createDashboardRoutes` function and `DashboardRouteDependencies` interface
- `packages/review-broker-server/src/http/dashboard-server.ts` — `createDashboardServer` function and `DashboardServerOptions` interface
- `packages/review-broker-server/test/tandem-cli.test.ts` — modified by T01 and T02

## Expected Output

- `packages/review-broker-server/src/cli/tandem.ts` — modified with `resolveDashboardDistPath`, `handleDashboard`, dispatch routing, SUBCOMMAND_HELP, updated printUsage
- `packages/review-broker-server/test/tandem-cli.test.ts` — modified with dashboard help test

## Observability Impact

- **New signal:** `tandem dashboard --json` outputs `{ url, port, dashboardDistPath }` — enables programmatic discovery of the running dashboard endpoint.
- **Inspection surface:** The `--port` and `--host` flags are reflected in the server's `baseUrl`, observable via stdout or JSON output.
- **Failure visibility:** Invalid `--port` produces stderr with the raw value and exits code 1. If `createDashboardServer` fails (e.g. port in use), the error propagates through the standard CLI error handler to stderr + exit 1.
- **Graceful teardown:** `runtime.close` is wrapped to call `routes.dispose()` + `server.close()` before the original close, ensuring clean shutdown of SSE connections and the HTTP listener.
