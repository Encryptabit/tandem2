# S01: Broker-mounted dashboard and live overview — UAT

**Milestone:** M004
**Written:** 2026-03-25

## UAT Type

- UAT mode: live-runtime
- Why this mode is sufficient: The slice proves a broker-served dashboard rendering real state from a live SQLite-backed broker. Live-runtime UAT exercises the actual operator experience through the browser.

## Preconditions

1. The workspace is built: `corepack pnpm --filter review-broker-dashboard build && corepack pnpm --filter review-broker-core build && corepack pnpm --filter review-broker-server build`
2. No other process is using the target dashboard port (or use `--dashboard-port 0` for ephemeral).
3. A clean or existing SQLite database file is available (the broker creates one if it doesn't exist).

## Smoke Test

Start the broker with dashboard mode and verify the page loads:

```bash
corepack pnpm broker:dashboard
```

Wait for the `broker.dashboard_ready` JSON event on stdout, then open the printed URL in a browser. The page should show "Review Broker" in the header and a "CONNECTED" status badge.

## Test Cases

### 1. Dashboard serves from the broker process

1. Run `corepack pnpm broker:dashboard` (or `corepack pnpm --filter review-broker-server exec tsx src/cli/start-broker.ts --dashboard --dashboard-port 0`).
2. Watch stdout for the `broker.dashboard_ready` event containing `url`, `port`, and `dashboardDistPath`.
3. Open the URL from the event in a browser.
4. **Expected:** The page renders the "Review Broker" heading, a connection status badge, and a last-refresh timestamp in the header. Overview cards, reviewer summary, startup recovery, and latest activity panels are visible.

### 2. Overview cards show real broker state

1. Start the broker with `--dashboard` against a fresh SQLite database.
2. Open the dashboard in a browser.
3. **Expected:** Overview cards show "TOTAL REVIEWS: 0", "PENDING: 0", "REVIEWERS: 0", and "SNAPSHOT: 1" (or the current snapshot version). The startup recovery panel shows recovery stats (zeroes for a fresh DB).

### 3. Overview refreshes after a broker mutation

1. Start the broker with `--dashboard` and open the dashboard.
2. Note the current TOTAL REVIEWS count and SNAPSHOT version.
3. Create a review through the broker (e.g., via typed client, MCP, or a test harness that calls `createReview`).
4. **Expected:** Without reloading the page, the TOTAL REVIEWS count increments by 1, the SNAPSHOT version increments, the latest activity panel shows a `review.created` entry, and the last-refresh timestamp updates.

### 4. Connection status badge reflects SSE state

1. Start the broker with `--dashboard` and open the dashboard.
2. **Expected:** The connection badge shows "CONNECTED" with a green indicator.
3. Stop the broker process (Ctrl+C or kill).
4. **Expected:** The badge changes to "RECONNECTING" (amber/orange) as EventSource attempts reconnect.

### 5. API overview route returns valid JSON

1. Start the broker with `--dashboard`.
2. `curl http://127.0.0.1:<port>/api/overview`.
3. **Expected:** Response is valid JSON matching the OverviewSnapshot schema: contains `snapshotVersion`, `reviews` (with `total`, `pending`, `claimed`, `completed`), `reviewers` (with `total`, `online`, `offline`, `idle`, `reviewing`), `startupRecovery`, `latestActivity`, and `generatedAt`. No raw diff bodies, no raw reviewer argv, no secrets.

### 6. SSE stream delivers change notifications

1. Start the broker with `--dashboard`.
2. Open an SSE connection: `curl -N http://127.0.0.1:<port>/api/events`.
3. **Expected:** Immediately receive an `event: heartbeat` with data `{"type":"heartbeat"}`.
4. Create a review through the broker.
5. **Expected:** Receive an `event: change` with data containing `{"type":"change","topic":"...","version":...}`. The payload contains only topic and version — no leaked state data, no review bodies, no reviewer details.

### 7. Static assets and 404 handling

1. Start the broker with `--dashboard`.
2. Navigate to the root URL — should serve the Astro-built `index.html`.
3. Navigate to a known static asset path (e.g., `/_assets/<hash>.js`) — should serve the bundled JS.
4. Navigate to a non-existent path (e.g., `/nonexistent/path`).
5. **Expected:** The non-existent path returns HTTP 404.

## Edge Cases

### Stale data preservation on fetch failure

1. Start the broker with `--dashboard` and open the dashboard.
2. Wait for overview data to load (cards show real counts).
3. Stop the broker process.
4. Wait for the dashboard to attempt a re-fetch (triggered by reconnect or manual).
5. **Expected:** The previously loaded data remains visible (not blanked). The connection badge changes to error/reconnecting state. The dashboard does not show empty or broken cards.

### Dashboard with pre-existing data

1. Start the broker with `--dashboard` against a SQLite database that already has reviews and reviewer history.
2. Open the dashboard.
3. **Expected:** Overview cards reflect the existing state (non-zero review counts, reviewer counts if any were online). Startup recovery panel shows recovery stats from the last restart sweep. Latest activity shows recent audit events.

### Ephemeral port allocation

1. Start the broker with `--dashboard --dashboard-port 0`.
2. **Expected:** The `broker.dashboard_ready` event reports the OS-assigned port. The dashboard is accessible at that port.

## Failure Signals

- The `broker.dashboard_ready` event is never emitted — dashboard HTTP server failed to start.
- Overview cards show "Loading..." or "Error" permanently — fetch to `/api/overview` is failing.
- Connection badge stuck on "LOADING" or "ERROR" — SSE EventSource connection failed.
- SNAPSHOT version never increments after mutations — SSE change notifications are not being delivered or the re-fetch is broken.
- `curl /api/overview` returns non-JSON or an empty response — route handler or projection is broken.
- SSE stream delivers payloads containing review bodies, reviewer argv, or other sensitive data — redaction failure.

## Requirements Proved By This UAT

- **R011** — The broker serves a real dashboard from its own process, rendering live overview state as a thin client over broker-owned HTTP/SSE routes.
- **R002** — Dashboard transport contracts are shared Zod schemas in review-broker-core, not dashboard-only DTOs.
- **R005** — Reviewer state and startup-recovery context are visible through the dashboard overview.
- **R006** boundary preserved — The browser uses broker-owned HTTP JSON routes, not direct in-process client calls.
- **R007** boundary preserved — The dashboard does not route runtime behavior through MCP.

## Not Proven By This UAT

- Live event/log surface with redaction-safe structured operator events (S02 scope).
- Read-only review browsing with status, proposal, discussion, and activity detail (S03 scope).
- Reconnect/reload/restart coherence across the full assembled dashboard (S04 scope).
- Dashboard rendering on mobile/tablet viewports (not in scope for M004).

## Notes for Tester

- The `broker:dashboard` script uses a fixed DB path `./.tmp/dashboard-proof.sqlite`. Delete this file for a clean-slate test.
- favicon.ico requests return 404 — this is a known cosmetic gap, not a failure.
- The SSE bridge polls the notification bus at 250ms intervals, so there may be up to 250ms latency between a broker mutation and the SSE change event reaching the browser.
- The dashboard is designed for desktop operator use. No responsive/mobile layout work has been done.
