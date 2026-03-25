---
id: M004
provides:
  - Broker-owned HTTP listener mounting an Astro dashboard from the broker process itself
  - Three dashboard pages (overview, events, reviews) served at the broker URL
  - Five broker-owned API routes — GET /api/overview, GET /api/events, GET /api/events/feed, GET /api/reviews, GET /api/reviews/:id
  - Shared Zod dashboard transport contracts in review-broker-core (OverviewSnapshot, SSE payloads, EventFeedResponse, ReviewListResponse, ReviewDetailResponse)
  - SSE notification bridge forwarding topic/version changes as re-fetch signals (not durable state)
  - Redaction-safe operator event feed with cursor pagination, type filtering, and SSE-driven live follow
  - Read-only review browser with list/detail views, status filtering, proposal/discussion/activity inspection, and activity metadata redaction
  - CLI --dashboard mode with --dashboard-port/--dashboard-host flags and structured broker.dashboard_ready event
  - Cross-surface acceptance test suite proving overview/events/reviews coherence through reload, reconnect, and startup recovery
  - 67 passing tests across 5 suites (27 contract, 20 route, 12 integration, 6 acceptance, 2 smoke)
key_decisions:
  - D019/D021: SSE carries only topic + version; browser must re-fetch snapshot routes for authoritative state
  - D020: Dashboard served from broker process itself, not a separate app server
  - D022: Structured operator event feed first, raw subprocess logs deferred (stdio ignored on reviewers)
  - D023: Fully client-rendered (no Astro SSR) since all content depends on runtime-fetched state
  - D024: Client-side types inlined as minimal subset rather than importing review-broker-core at build time
  - D025: Event feed uses limit+1 hasMore probe instead of separate count query
  - D026: Full metadata stripping on event/activity projections — only summary string forwarded
  - D027: Client-side group filtering for events since backend only supports exact eventType matching
  - D028: BrokerService as explicit DashboardRouteDependencies field, not reached through AppContext
patterns_established:
  - DashboardRouteHandler decouples route logic from HTTP server for unit testing without HTTP
  - Projection helpers (projectOverviewSnapshot, projectOperatorEvent, projectDashboardActivityEntry) map internal state to redaction-safe dashboard contracts
  - SSE-triggered re-fetch — EventSource listens for change events, each triggers full snapshot re-fetch, badge reflects connection health
  - Same Astro static shell + client-rendering pattern across all three pages
  - Belt-and-suspenders redaction testing — stringify response, assert absence of both dangerous values and key names
  - Shared test-paths.ts exports (CLI_PATH, TSX_PATH, DASHBOARD_DIST_PATH) eliminate ad-hoc path construction
  - Sequential describe blocks in integration tests to prevent HTTP server + SQLite lifecycle races
observability_surfaces:
  - GET /api/overview — full OverviewSnapshot JSON with review/reviewer counts, startup recovery, latest activity, snapshot version
  - GET /api/events — SSE stream with heartbeat on connect and change events on broker mutations
  - GET /api/events/feed — paginated, filterable, redaction-safe operator event list
  - GET /api/reviews — review list with optional status/limit params
  - GET /api/reviews/:id — composite detail with status, proposal, discussion, and redacted activity
  - Connection status badge on all pages (loading/connected/reconnecting/error)
  - Last refresh timestamp in dashboard header
  - broker.dashboard_ready structured event on stdout with url, port, and dashboardDistPath
requirement_outcomes:
  - id: R011
    from_status: active
    to_status: validated
    proof: Operator dashboard restored as thin Astro client over broker state. Three pages (overview, events, reviews) served from broker-owned HTTP listener. Five API routes backed by real broker runtime data. SSE live updates with snapshot-is-truth re-sync model. 67 tests across 5 suites plus live browser verification confirm the dashboard is thin, broker-truth-aligned, and operationally useful.
  - id: R002
    from_status: active
    to_status: active
    proof: Strengthened — all dashboard transport contracts (OverviewSnapshot, EventFeedResponse, ReviewListResponse, ReviewDetailResponse, DashboardReviewActivityEntry) are shared Zod schemas in review-broker-core reusing canonical domain vocabulary. 27 contract tests enforce schema shapes end-to-end.
  - id: R005
    from_status: active
    to_status: active
    proof: Strengthened — reviewer state visible in dashboard overview (idle/assigned/offline counts, commandBasename), startup recovery context in overview panel, reviewer lifecycle events in redaction-safe event feed.
  - id: R014
    from_status: active
    to_status: active
    proof: Partially advanced — read-only review browsing with list/detail, status filtering, proposal/discussion/activity. Pool management and mutating controls remain deferred.
duration: ~4h
verification_result: passed
completed_at: 2026-03-25
---

# M004: Dashboard and operator tooling

**Restored the operator dashboard as a broker-served thin Astro client with live overview, redaction-safe event feed, and read-only review browsing — three pages and five API routes backed by real broker runtime state, proven by 67 tests and live browser verification against a real SQLite-backed broker.**

## What Happened

M004 retired four risks in sequence: delivery architecture, operational usefulness, inspectability depth, and cross-boundary trust.

**S01 proved the hardest seam first.** The broker process itself now serves a browser dashboard through a new HTTP listener that mounts the Astro static build output and exposes two API routes: `GET /api/overview` (projecting `inspectBrokerRuntime()` into a redaction-safe `OverviewSnapshot` with `commandBasename`) and `GET /api/events` (SSE bridge forwarding `VersionedNotificationBus` topic/version changes). The client-rendered dashboard fetches the snapshot for authoritative state and treats SSE purely as a re-fetch signal — never as durable truth. This snapshot-is-truth model is the foundation everything else builds on. The dashboard renders four panels: overview cards (review/reviewer counts, snapshot version), reviewer state, startup recovery context, and latest activity. Connection health surfaces through a status badge and last-refresh timestamp. CLI `--dashboard` mode, `broker:dashboard` proof script, and `broker.dashboard_ready` structured event completed the delivery path.

**S02 made the dashboard operationally useful.** Before S02, operators could see overview state but still needed raw CLI output for diagnosis. S02 added a broker-owned operator event feed: `OperatorEventEntrySchema` and `EventFeedResponseSchema` as shared Zod contracts, `listGlobal()` on `AuditRepository` with cursor pagination and type filtering, and a projection layer that strips the entire metadata object and exposes only the summary string. The `/events` page renders this feed with SSE-driven live follow, client-side group filtering (All/Review/Reviewer), and load-more pagination. Cross-page navigation linked overview and events pages.

**S03 deepened inspectability with read-only review browsing.** Rather than inventing a dashboard-specific review data model, S03 composed five existing broker service read APIs (`listReviews`, `getReviewStatus`, `getProposal`, `getDiscussion`, `getActivityFeed`) behind two new routes: `GET /api/reviews` (list with status filtering) and `GET /api/reviews/:id` (composite detail). Activity entries strip metadata entirely — only the summary string passes through. The `/reviews` page renders list and detail views with status filter chips, proposal diffs, discussion threads, activity timelines, and browser history routing via pushState/popstate. Belt-and-suspenders redaction tests at both route and integration levels enforce safety.

**S04 closed the milestone as an integration proof.** Six cross-surface acceptance tests exercise all three pages and five API routes together against one SQLite-backed broker runtime: pages serve HTML, API surfaces agree after mutations, SSE delivers change notifications, parallel re-fetch proves reload consistency, startup recovery surfaces through overview and audit events, and error responses return proper 404s. A flaky integration test caused by concurrent describe blocks was fixed with `{ sequential: true }`. Live browser verification confirmed all three pages render real data with working navigation, status badges, and SSE-driven updates.

## Cross-Slice Verification

| Success Criterion | Verification | Evidence |
|---|---|---|
| Real broker serves a browser dashboard from its own process | Smoke test spawns broker with `--dashboard --dashboard-port 0`, waits for `broker.dashboard_ready`, fetches mounted page | 2 smoke tests pass; browser verification confirms page loads from broker URL |
| Overview shows live broker-backed state and refreshes after mutations | Integration tests mutate broker state and verify snapshot version increments; acceptance tests verify cross-surface agreement | 12 integration + 6 acceptance tests pass; browser shows review counts update after mutations |
| SSE is liveness only; snapshot routes are truth | Route test `SSE is a re-sync signal, not a second source of truth` verifies SSE payload contains only topic+version; client re-fetches overview on each change event | 8 route tests pass; acceptance test proves reload consistency through parallel re-fetch |
| Live event/log surface without raw CLI fallback | Event feed route tests verify pagination, filtering, and redaction; integration tests verify events appear after real broker mutations; browser shows live event stream | 6 event feed route tests + 2 event integration tests pass; browser LIVE indicator confirms SSE-driven updates |
| Read-only review browsing from the dashboard | Review route tests verify list/detail/404 responses; integration tests verify real review data; browser shows proposal/discussion/activity detail | 6 review route tests + 4 review integration tests pass; browser renders full detail view |
| Final acceptance through real broker-served browser path against real SQLite | Acceptance suite uses `startBroker()` with real SQLite, creates real reviews/reviewers, exercises all routes | 6 acceptance tests pass with real runtime; browser verification against `broker:dashboard` confirms |

**Full test matrix — 67 tests, zero failures:**

| Suite | File | Tests | Result |
|---|---|---|---|
| Contract | `review-broker-core/test/dashboard-contracts.test.ts` | 27 | ✅ pass |
| Routes | `http-dashboard-routes.test.ts` + `http-event-feed-routes.test.ts` + `http-review-routes.test.ts` | 20 | ✅ pass |
| Integration | `broker-mounted-dashboard.integration.test.ts` | 12 | ✅ pass |
| Acceptance | `dashboard-acceptance.integration.test.ts` | 6 | ✅ pass |
| Smoke | `start-broker.smoke.test.ts` | 2 | ✅ pass |

## Requirement Changes

- **R011**: active → validated — Operator dashboard restored as thin Astro client over broker state. 3 pages, 5 API routes, SSE live updates, shared Zod contracts, 67 tests, and live browser verification prove the dashboard is broker-truth-aligned and operationally useful as a first-stop inspection surface.
- **R002**: active → active (strengthened) — All dashboard transport contracts are shared Zod schemas in review-broker-core reusing canonical vocabulary. 27 contract tests enforce schema shapes.
- **R005**: active → active (strengthened) — Reviewer state and startup recovery context visible through dashboard overview and redaction-safe event feed with commandBasename projection.
- **R014**: active → active (partially advanced) — Read-only review browsing delivered with list/detail, status filtering, proposal/discussion/activity inspection, and activity redaction. Pool management and mutating controls remain deferred.

## Forward Intelligence

### What the next milestone should know
- The dashboard is broker-served and thin — all state comes from five JSON routes; the Astro build is purely static HTML/JS/CSS. Future dashboard work means extending `DashboardRouteHandler` and adding client pages, not building a separate backend.
- `DashboardRouteDependencies` explicitly requires `notificationBus`, `runtime`, and `service` (BrokerService). New routes should follow the same pattern — no reaching through AppContext.
- The SSE bridge polls `VersionedNotificationBus` at 250ms. This is sufficient for local operator use but would need real async waiters for higher-frequency scenarios.
- Client-side types are manually inlined in each `*-client.ts` module rather than imported from review-broker-core. If schema drift becomes a problem, a type generation step could unify them.

### What's fragile
- **SSE polling interval** — 250ms setInterval in the SSE bridge is a pragmatic choice, not an optimized one. High mutation rates could create visible lag between broker state change and dashboard update.
- **Client-side type sync** — Types in overview-client.ts, events-client.ts, and reviews-client.ts are manually kept in sync with the Zod schemas. The 27 contract tests catch schema violations at the API boundary but not client rendering mismatches.
- **No favicon** — Browsers log a 404 for favicon.ico on every page load. Cosmetic only but noisy in development.
- **Fixed proof DB path** — `broker:dashboard` uses `./.tmp/dashboard-proof.sqlite`. Multiple runs accumulate state.
- **Sequential test constraint** — Integration tests use `{ sequential: true }` to avoid HTTP server + SQLite lifecycle races in Vitest. Adding more integration test files may need the same treatment.

### Authoritative diagnostics
- **`GET /api/overview`** — The single most useful endpoint. Returns review/reviewer counts, startup recovery state, latest activity, and snapshot version. If the dashboard looks wrong, fetch this first.
- **`GET /api/events/feed?limit=50`** — Returns the last 50 redaction-safe operator events with timestamps and summaries. For diagnosing what happened and when.
- **`dashboard-contracts.test.ts`** (27 tests) — The contract suite catches schema drift between core Zod schemas and route responses. If a new field is added to the broker but the dashboard breaks, start here.
- **`broker.dashboard_ready`** JSON event on stdout — Machine-parseable startup signal with actual URL, port, and dist path. Used by smoke tests and proof scripts.

### What assumptions changed
- **Astro SSR was not needed** — The plan originally anticipated server-rendered Astro components. In practice, all dashboard content depends on runtime-fetched state, so fully client-rendered pages were simpler and more appropriate. Astro serves only as a static build tool for the shell HTML.
- **Raw subprocess logs don't exist** — The plan mentioned log browsing, but reviewer subprocesses are spawned with `stdio: 'ignore'`. S02 correctly scoped to structured broker audit events rather than pretending raw logs were available.
- **Cross-package type imports were impractical at Astro build time** — Importing review-broker-core types directly into the Astro build would have required build coordination. Inlined client types with contract test enforcement was the pragmatic solution.

## Files Created/Modified

- `packages/review-broker-dashboard/` — new Astro dashboard package (package.json, astro.config.mjs, tsconfig.json)
- `packages/review-broker-dashboard/src/pages/index.astro` — overview page shell
- `packages/review-broker-dashboard/src/pages/events.astro` — events page shell
- `packages/review-broker-dashboard/src/pages/reviews.astro` — reviews page shell
- `packages/review-broker-dashboard/src/components/overview-client.ts` — overview fetch, SSE, rendering
- `packages/review-broker-dashboard/src/components/events-client.ts` — event feed with live follow, filtering, pagination
- `packages/review-broker-dashboard/src/components/reviews-client.ts` — review list/detail with status filtering, history routing
- `packages/review-broker-dashboard/src/styles/dashboard.css` — dark-theme operator UI system
- `packages/review-broker-core/src/dashboard.ts` — shared Zod schemas for all dashboard transport contracts
- `packages/review-broker-core/src/dashboard.js` — checked-in JS mirror
- `packages/review-broker-core/test/dashboard-contracts.test.ts` — 27 contract tests
- `packages/review-broker-server/src/http/dashboard-server.ts` — broker-owned HTTP server with static mount
- `packages/review-broker-server/src/http/dashboard-routes.ts` — overview/event/review route handlers with redaction projections
- `packages/review-broker-server/src/db/audit-repository.ts` — added listGlobal() with cursor pagination
- `packages/review-broker-server/src/cli/start-broker.ts` — added --dashboard/--dashboard-port/--dashboard-host flags
- `packages/review-broker-server/test/http-dashboard-routes.test.ts` — 8 overview/SSE route tests
- `packages/review-broker-server/test/http-event-feed-routes.test.ts` — 6 event feed route tests
- `packages/review-broker-server/test/http-review-routes.test.ts` — 6 review route tests
- `packages/review-broker-server/test/broker-mounted-dashboard.integration.test.ts` — 12 integration tests
- `packages/review-broker-server/test/dashboard-acceptance.integration.test.ts` — 6 cross-surface acceptance tests
- `packages/review-broker-server/test/start-broker.smoke.test.ts` — extended with dashboard mode smoke test
- `packages/review-broker-server/test/test-paths.ts` — shared test path constants
- `packages/review-broker-server/package.json` — added start:dashboard script
- `package.json` — added broker:dashboard script
- `pnpm-lock.yaml` — Astro and dashboard dependency lockfile updates
