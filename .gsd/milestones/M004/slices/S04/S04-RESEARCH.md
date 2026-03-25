# S04 Research — Integrated operator shell and real-runtime acceptance

**Date:** 2026-03-25
**Depth:** Light research — well-understood work applying established patterns across existing code.

## Summary

S04 is a pure integration closer. All three prior slices shipped their surfaces with strong test coverage:
- **S01**: 14 contract + 8 route + 6 integration + 2 smoke tests (30 total)
- **S02**: 7 contract + 6 route + 2 integration tests (15 total, cumulative 21+6+8)
- **S03**: 6 contract + 6 route + 4 integration tests (16 total, cumulative 27+12)

The dashboard has three pages (overview, events, reviews), three API route groups, SSE notification bridge, and full redaction projection across all surfaces. Every client module already handles SSE reconnect, connection state badges, and stale-data preservation on fetch failure.

**What S04 must prove that prior slices did not:**

1. **Real browser verification through all three pages** — S03 explicitly deferred browser verification to S04. No prior slice exercised the actual browser rendering of the events or reviews pages against a running broker.
2. **Cross-page coherence** — nav works between all three pages, connection state is consistent, SSE reconnect on each page re-syncs correctly.
3. **Reload/reconnect scenarios** — browser reload re-fetches authoritative snapshot data (not stale SSE state). SSE disconnect → reconnect leaves each page coherent.
4. **Startup-recovery visibility** — the overview page renders startup recovery context from a broker that actually recovered stale state (not just clean startup zeros).
5. **Assembled test suite health** — all existing test suites still pass when run together, including the known-flaky "serves the overview page" integration test.

**What S04 does NOT need to build:**
- No new API routes
- No new Zod schemas
- No new dashboard pages or client modules
- No new rendering logic

The work is: (a) a real-browser acceptance test suite exercising all pages through a live broker, and (b) closing any narrow gaps found during that acceptance pass, such as hardening reconnect behavior or fixing the flaky integration test.

## Recommendation

**Two tasks:**

1. **T01: Integrated real-browser acceptance test suite** — Write a Vitest + real-browser test that spawns a broker with `--dashboard --dashboard-port 0`, opens the dashboard in a real browser (Playwright or the existing browser tools), and asserts:
   - Overview page renders real review counts after mutations
   - Events page renders real audit events with live follow after mutations
   - Reviews page renders review list, detail view navigates correctly, activity is redaction-safe
   - Cross-page nav works (overview → events → reviews → overview)
   - Page reload re-fetches authoritative snapshot (not stale)
   - SSE reconnect after broker pause leaves pages coherent
   - Startup recovery panel shows real recovery data

2. **T02: Final acceptance and milestone closeout** — Run the full test suite (contracts + routes + integration + browser acceptance + smoke), fix any failures or narrow gaps, validate requirements R011/R014/R002/R005/R010/R003, and write summaries.

## Implementation Landscape

### Existing test infrastructure
- `test-paths.ts` exports `CLI_PATH`, `TSX_PATH`, `DASHBOARD_DIST_PATH`, `WORKTREE_ROOT`
- The smoke test in `start-broker.smoke.test.ts` already spawns a real broker with `--dashboard --dashboard-port 0` and parses the `broker.dashboard_ready` event to get the URL — this is the exact pattern needed for browser acceptance
- All integration tests use the `startBroker()` → `createDashboardRoutes()` → `createDashboardServer()` stack with real SQLite and the built dashboard dist

### Browser verification approach
Two viable approaches:
1. **Pi browser tools** — use `browser_navigate`, `browser_find`, `browser_assert`, etc. against the running broker. This is the established M004 pattern (S01 used browser verification this way during implementation). Good for UAT-style verification during task execution.
2. **Playwright test via Vitest** — write a proper `*.browser-acceptance.test.ts` that spawns the broker as a child process, gets the URL from `broker.dashboard_ready`, and uses `fetch` + DOM assertion patterns. This lives in the test suite permanently.

**Recommendation:** Use approach (1) for live UAT during the task, and write a lightweight approach (2) integration test that verifies the assembled HTTP surface coherence (all routes respond, all pages serve, SSE streams, snapshot updates after mutation) without requiring a full browser engine dependency. The existing integration test suite already covers most of what Playwright would add.

### Key files
| File | Role |
|------|------|
| `packages/review-broker-server/test/broker-mounted-dashboard.integration.test.ts` | Primary integration suite — extend with cross-surface coherence tests |
| `packages/review-broker-server/test/start-broker.smoke.test.ts` | CLI entrypoint smoke — extend or add parallel acceptance variant |
| `packages/review-broker-server/src/cli/start-broker.ts` | Broker CLI — no changes expected |
| `packages/review-broker-server/src/http/dashboard-server.ts` | HTTP server — may need minor hardening |
| `packages/review-broker-server/src/http/dashboard-routes.ts` | Route handler — no changes expected |
| `packages/review-broker-dashboard/src/components/*.ts` | Client modules — may need minor reconnect hardening |
| `packages/review-broker-dashboard/src/pages/*.astro` | Page shells — no changes expected |
| `packages/review-broker-core/src/dashboard.ts` | Shared Zod schemas — no changes expected |

### Known issues to resolve
1. **Flaky "serves the overview page" integration test** — S03 noted occasional failures under parallel execution, likely port or dist-path contention. S04 should investigate and fix (probably needs per-test temp dir isolation or test-level serial execution for that specific test).
2. **Dashboard build prerequisite** — all integration and smoke tests depend on `packages/review-broker-dashboard/dist/` existing. The acceptance test should assert or ensure this before running.
3. **No explicit reconnect test exists** — all three client modules handle SSE `onerror` → `reconnecting` state, but no test verifies the browser actually re-syncs after SSE disconnect. The browser verification pass should exercise this.

### What exists vs what's missing

| Surface | Routes tested? | Integration tested? | Browser tested? |
|---------|---------------|-------------------|-----------------|
| Overview page + /api/overview | ✅ 8 route | ✅ 6 integration | ⚠️ Manual only (S01) |
| Events page + /api/events/feed | ✅ 6 route | ✅ 2 integration | ❌ Deferred to S04 |
| Reviews page + /api/reviews | ✅ 6 route | ✅ 4 integration | ❌ Deferred to S04 |
| SSE /api/events stream | ✅ via integration | ✅ 1 integration | ⚠️ Manual only |
| Cross-page nav | ❌ | ❌ | ❌ |
| Reload coherence | ❌ | ❌ | ❌ |
| Startup recovery visibility | ✅ 1 integration | ✅ via smoke | ⚠️ Manual only |

### Requirement coverage for S04

| Requirement | What S04 proves | Status after S04 |
|-------------|----------------|-----------------|
| R011 | Full dashboard acceptance: all three pages render real broker-backed data through the actual browser entrypoint | → validated |
| R014 | Read-only review browsing works end-to-end in the assembled dashboard | Remains active (pool management deferred) but S04 advances it further |
| R002 | All transport contracts are shared Zod schemas validated by 27+ contract tests | → strengthened |
| R005 | Reviewer state and startup recovery visible through dashboard browser surface | → strengthened |
| R010 | Audit events inspectable in browser event feed | → strengthened |
| R003 | SQLite-backed broker state serves all dashboard surfaces | → strengthened |

### Skills
No new technologies. The slice uses established Vitest, Node HTTP, Astro static build, and browser verification patterns. No skill installs needed.
