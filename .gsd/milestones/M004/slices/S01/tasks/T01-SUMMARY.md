---
id: T01
parent: S01
milestone: M004
provides:
  - review-broker-dashboard Astro package with minimal shell page
  - shared dashboard transport schemas (OverviewSnapshot, SSE payloads) in review-broker-core
  - broker-owned HTTP server with overview JSON + SSE routes in review-broker-server
  - route-level tests covering overview projection, startup recovery, redaction, and SSE semantics
key_files:
  - packages/review-broker-dashboard/package.json
  - packages/review-broker-core/src/dashboard.ts
  - packages/review-broker-server/src/http/dashboard-server.ts
  - packages/review-broker-server/src/http/dashboard-routes.ts
  - packages/review-broker-server/test/http-dashboard-routes.test.ts
key_decisions:
  - SSE route forwards topic + version only; browser must re-fetch the overview route for authoritative state
  - Overview snapshot uses commandBasename (not full path/argv) for reviewer redaction
  - Dashboard notification polling uses 250ms interval against the synchronous VersionedNotificationBus
patterns_established:
  - DashboardRouteHandler interface decouples route logic from HTTP server, enabling unit testing without HTTP
  - Overview projection helpers map internal BrokerRuntimeSnapshot to the dashboard transport contract
  - SSE connections tracked in a Set and cleaned up on server close
observability_surfaces:
  - GET /api/overview — returns the full OverviewSnapshot JSON (schema-validated)
  - GET /api/events — SSE stream emitting heartbeat on connect and change events on broker mutations
  - snapshotVersion field in overview tracks how many mutation cycles have occurred since server start
duration: ~45m
verification_result: passed
completed_at: 2026-03-25
blocker_discovered: false
---

# T01: Mount an Astro dashboard shell inside the broker HTTP surface

**Added broker-owned HTTP server with overview JSON + SSE routes, shared dashboard transport schemas in review-broker-core, and an Astro dashboard shell package**

## What Happened

Created the delivery architecture for the broker-mounted dashboard. The work breaks into four parts:

1. **Dashboard package**: A new `review-broker-dashboard` Astro package with a minimal shell page that fetches `/api/overview` on load and wires SSE reconnect. This is the browser entrypoint the broker mounts.

2. **Shared schemas**: `packages/review-broker-core/src/dashboard.ts` defines `OverviewSnapshotSchema`, `SSEChangePayloadSchema`, and `SSEHeartbeatPayloadSchema` using the same Zod-schema-with-strict pattern as the existing contracts. The overview projects review/reviewer counts, latest activity, and startup recovery — with `commandBasename` instead of raw `command` for redaction.

3. **HTTP layer**: `dashboard-server.ts` creates a Node HTTP server that serves static Astro build assets and delegates `/api/overview` and `/api/events` to a `DashboardRouteHandler`. `dashboard-routes.ts` implements the handler, projecting `inspectBrokerRuntime()` into the overview contract and polling the `VersionedNotificationBus` to push SSE change signals.

4. **Tests**: 14 contract tests validate schema parsing, strict rejection, redaction rules, and SSE vocabulary. 8 route tests exercise the live broker → overview pipeline including startup recovery projection, HTTP serving, SSE heartbeat delivery, and the contract that SSE carries only topic+version (never leaked state data).

## Verification

- `vitest run packages/review-broker-core/test/dashboard-contracts.test.ts packages/review-broker-server/test/http-dashboard-routes.test.ts` — 22 tests pass
- `pnpm --filter review-broker-core build && pnpm --filter review-broker-server build` — both compile cleanly
- `vitest run packages/review-broker-server/test/start-broker.smoke.test.ts` — existing smoke test unaffected (1 pass)

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `vitest run packages/review-broker-core/test/dashboard-contracts.test.ts packages/review-broker-server/test/http-dashboard-routes.test.ts` | 0 | ✅ pass | 1.4s |
| 2 | `pnpm --filter review-broker-core build && pnpm --filter review-broker-server build` | 0 | ✅ pass | 3.6s |
| 3 | `vitest run packages/review-broker-server/test/start-broker.smoke.test.ts` | 0 | ✅ pass | 1.4s |

## Diagnostics

- **Overview route**: `GET /api/overview` returns the full `OverviewSnapshot` — compare against `OverviewSnapshotSchema` in `packages/review-broker-core/src/dashboard.ts`.
- **SSE stream**: `GET /api/events` sends `event: heartbeat` on connect, then `event: change` with `{type:"change", topic, version}` payloads when the notification bus fires.
- **Route tests** in `packages/review-broker-server/test/http-dashboard-routes.test.ts` are the primary diagnostic surface — they exercise the real broker lifecycle and validate schema conformance.
- **Failure paths**: 404 for unknown static paths, schema strict rejection for extra/missing fields, SSE payloads validated to contain only topic+version.

## Deviations

- The task plan suggested the Astro dashboard build would be mounted as static assets by the HTTP server. Since T01 focuses on proving the seam (not the full build pipeline), the test uses a stub dist path. T03 will wire the actual `astro build` output into the broker entrypoint.

## Known Issues

- The SSE notification polling uses a 250ms `setInterval` rather than async waiters on the `VersionedNotificationBus`. This is intentional for simplicity since the bus is runtime-local and synchronous, but could be replaced with async wait if latency matters.
- The Astro dashboard package currently has no `tsconfig` path mapping back to `review-broker-core` — it doesn't import shared types at build time yet. T02 will address this when the Astro components need the overview types.

## Files Created/Modified

- `packages/review-broker-dashboard/package.json` — new Astro dashboard package manifest
- `packages/review-broker-dashboard/astro.config.mjs` — Astro build configuration
- `packages/review-broker-dashboard/tsconfig.json` — TypeScript config extending Astro strict
- `packages/review-broker-dashboard/src/pages/index.astro` — minimal broker-served shell with overview fetch + SSE wiring
- `packages/review-broker-core/src/dashboard.ts` — shared OverviewSnapshot and SSE payload Zod schemas
- `packages/review-broker-core/src/dashboard.js` — checked-in JS mirror of dashboard.ts
- `packages/review-broker-core/src/dashboard.js.map` — sourcemap for JS mirror
- `packages/review-broker-core/src/index.ts` — added dashboard.js re-export
- `packages/review-broker-core/src/index.js` — updated JS mirror with dashboard re-export
- `packages/review-broker-core/test/dashboard-contracts.test.ts` — 14 contract tests for dashboard schemas
- `packages/review-broker-server/src/http/dashboard-server.ts` — broker-owned HTTP server with static asset serving and SSE
- `packages/review-broker-server/src/http/dashboard-routes.ts` — overview snapshot projection and SSE notification forwarding
- `packages/review-broker-server/test/http-dashboard-routes.test.ts` — 8 route-level tests exercising live broker state
- `.gsd/milestones/M004/slices/S01/S01-PLAN.md` — added failure-path verification step per pre-flight fix
