---
verdict: needs-attention
remediation_round: 0
---

# Milestone Validation: M004

## Success Criteria Checklist

- [x] **A real running broker serves a browser dashboard from the broker process itself** — S01 delivered broker-owned HTTP listener with Astro static mount, `--dashboard` CLI flag, and `broker:dashboard` script. S04 acceptance tests (6 cases) and browser verification confirm the broker serves all three pages. Evidence: S01-SUMMARY (dashboard-server.ts, start-broker.ts), S04-SUMMARY (acceptance test + browser verification).

- [x] **Operators can see live overview state backed by real broker/runtime data** — S01 shipped GET /api/overview projecting `inspectBrokerRuntime()` into OverviewSnapshot with review counts, reviewer state, startup-recovery context, and latest activity. S04 browser verification confirmed overview cards rendering 2 reviews, 1 reviewer, CONNECTED badge, and startup recovery section. Evidence: S01-SUMMARY (overview-client.ts, dashboard-routes.ts), S04-SUMMARY browser verification.

- [x] **Dashboard stays aligned with broker truth via snapshot routes + SSE liveness** — S01 key decision: "SSE carries only topic + version; browser must re-fetch the overview snapshot route for authoritative state." Client re-fetches full snapshot on every change event. S04 acceptance test "parallel re-fetch after mutations proves reload consistency" confirms coherence. Evidence: S01-SUMMARY key_decisions, S04-SUMMARY acceptance test description.

- [x] **Operators can inspect a useful live event/log surface in the browser** — S02 delivered `/events` page with OperatorEventEntry/EventFeedResponse Zod contracts, `listGlobal()` on AuditRepository, redaction-safe `projectOperatorEvent()`, live follow via SSE, client-side group filtering, and cursor pagination. 29 tests covering contracts (7), routes (6), and integration (2). S04 browser verification showed 3 audit events with filter controls and LIVE indicator. Evidence: S02-SUMMARY, S04-SUMMARY browser verification.

- [x] **Operators can browse reviews read-only** — S03 delivered `/reviews` page and `/api/reviews` + `/api/reviews/:id` routes composing five existing broker service read APIs. Detail view shows status, proposal with diff, discussion thread, and redacted activity timeline. 16 new tests (6 contract, 6 route, 4 integration). S04 browser verification confirmed list view with status badges and detail view with proposal/diff/activity. Evidence: S03-SUMMARY, S04-SUMMARY browser verification.

- [x] **Final acceptance proved through real broker-served entrypoint, real SQLite, and real browser interaction** — S04 delivered `dashboard-acceptance.integration.test.ts` with 6 cross-surface tests exercising real `startBroker()` + real SQLite + all API surfaces. Full matrix: 67 tests across 5 suites, zero failures. Browser verification against live `broker:dashboard` confirmed all three pages rendering real data. Evidence: S04-SUMMARY verification table and browser verification notes.

## Slice Delivery Audit

| Slice | Claimed | Delivered | Status |
|-------|---------|-----------|--------|
| S01 | Real broker serves dashboard with overview cards and reviewer/recovery panels that refresh after mutations | Broker-owned HTTP listener + Astro mount + overview snapshot route + SSE bridge + client-side fetch/re-fetch. 30 tests (14 contract, 8 route, 6 integration, 2 smoke). Browser-verified. | pass |
| S02 | Live redaction-safe stream of broker/operator events without raw CLI tails | Event feed contracts + `listGlobal()` + `/api/events/feed` route + events page with live follow, type filtering, pagination. 29 tests. | pass |
| S03 | Browse real reviews: status, proposal, discussion, activity history, without mutating state | Review list/detail Zod contracts + `/api/reviews` and `/api/reviews/:id` routes composing 5 broker read APIs + reviews page with list/detail views, status filtering, SSE refresh. 16 new tests. | pass |
| S04 | Assembled dashboard coherent through reload/reconnect/startup-recovery against real runtime | 6 acceptance tests + flaky test fix + browser verification. Full matrix: 67 tests, 0 failures. All three pages verified in browser. | pass |

## Cross-Slice Integration

No boundary mismatches detected.

- **S01 → S02:** S02 summary confirms consumption of "S01 broker-owned HTTP listener, mounted dashboard, SSE bridge, and shared transport contracts." Event feed route follows the same `DashboardRouteHandler` pattern. SSE subscription reused.
- **S01 → S03:** S03 extends the dashboard with a third page and three-page nav. Routes added through the same `DashboardRouteHandler`/`DashboardRouteDependencies` interface. `BrokerService` added as an explicit dependency field.
- **S02 → S04:** S04 acceptance tests exercise event feed alongside overview and reviews in the same broker instance.
- **S03 → S04:** S04 browser verification confirms reviews list and detail rendering through the full stack. Acceptance test validates review API returns schema-conformant JSON.

## Requirement Coverage

| Requirement | Disposition | Evidence |
|-------------|-------------|----------|
| R011 (primary) | **Validated** | Dashboard restored as thin Astro client over broker state, served from the broker process. Three pages, 5 API routes, SSE liveness. 67 tests + browser proof. |
| R002 | **Validated** | All transport contracts (OverviewSnapshot, SSE payloads, EventFeed, ReviewList/Detail) are shared Zod schemas in review-broker-core. 27 contract tests enforce schema shapes. |
| R005 | **Validated** | Reviewer state (idle/assigned/offline counts, latest reviewer with commandBasename) and startup-recovery context (reclaimed/detached/error counts) visible through overview snapshot and event feed. |
| R010 | **Advanced** | Audit events inspectable through events page with type filtering and live follow. Reviewer state visible through overview. S04 proved through browser. Not fully closed (R010 scope extends beyond M004). |
| R014 | **Advanced** | Read-only review browsing delivered. Mutating controls (pool management) remain deferred per plan. |
| R003 | **Strengthened** | SQLite persistence proved through acceptance tests (seed data, restart, verify recovery counts in dashboard). |
| R006 | **Boundary preserved** | Browser uses broker-owned HTTP JSON routes exclusively. No direct in-process client calls. |
| R007 | **Boundary preserved** | MCP not used as dashboard transport. Dashboard consumes HTTP/SSE only. |

All requirements in the roadmap coverage table are addressed. No unaddressed requirements.

## Documentation Gap

**S04-UAT.md is a doctor-generated placeholder**, not a real UAT script. The file contains generic instructions ("Replace this placeholder with meaningful human checks") rather than the operator verification steps that should mirror the thorough acceptance proof documented in S04-SUMMARY.md.

This is a documentation artifact gap, not a delivery gap. The actual verification is well-documented in S04-SUMMARY (67 tests + detailed browser verification notes), and S04's integration/acceptance test suite serves as durable proof. However, the UAT artifact contract expects a real operator-facing test script.

**Impact:** Low. The verification evidence exists in the summary and test suite. An operator following the S01/S02/S03 UAT patterns has sufficient guidance. The missing UAT does not block milestone completion.

## Verdict Rationale

All six success criteria are met with strong evidence. All four slices delivered their claimed outputs. Cross-slice integration points align. All tracked requirements are addressed at their planned disposition. The full test matrix (67 tests, 5 suites, zero failures) plus live browser verification provides high confidence.

The single gap is the S04-UAT.md placeholder. This is a cosmetic documentation issue — the slice's actual verification is thorough and well-documented in its summary. Marking `needs-attention` rather than `pass` to flag this, but it does not warrant remediation slices.

## Remediation Plan

None required. The S04-UAT placeholder is noted as a documentation gap but does not materially affect the milestone's delivery or verification posture.
