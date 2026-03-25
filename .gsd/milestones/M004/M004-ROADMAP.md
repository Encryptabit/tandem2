# M004: Dashboard and operator tooling

**Vision:** Restore a broker-served operator dashboard as a thin browser surface over the real standalone broker, proving mounted delivery, live overview/log visibility, and read-only review inspection against the existing broker state model instead of inventing a second frontend-owned source of truth.

## Success Criteria

- A real running broker serves a browser dashboard from the broker process itself rather than requiring a separate app server or fixture-only frontend.
- Operators can open the dashboard and see live overview state backed by real broker/runtime data, including review counts, reviewer state, and startup-recovery context.
- The dashboard stays aligned with broker truth by using broker-owned snapshot routes for state and SSE only for liveness/re-sync, so reconnects and restarts do not leave the UI drifting.
- Operators can inspect a useful live event/log surface in the browser without immediately falling back to raw CLI or SQLite queries for normal diagnosis.
- Operators can browse reviews read-only from the dashboard, including status, proposal, discussion, and activity context, without turning the UI into a mutating control plane.
- Final acceptance is proven through the real broker-served entrypoint, a real SQLite-backed runtime, and real browser interaction rather than isolated component proof alone.

## Key Risks / Unknowns

- **Mounted delivery gap:** the current worktree has no HTTP listener, no dashboard package, no Astro dependency, and no browser routes, so the first risk is delivery architecture, not UI polish.
- **SSE drift risk:** `VersionedNotificationBus` is runtime-local and non-durable; if the browser treats stream payloads as truth instead of refresh signals, the dashboard can drift after reconnect or restart.
- **Log-scope ambiguity:** reviewer subprocesses are spawned with `stdio: 'ignore'`, so raw reviewer stdout/stderr browsing does not exist today and would be a new runtime subsystem, not just a page.
- **Context/worktree mismatch:** milestone and requirement history reference continuity/status surfaces that are not present in this worktree, so M004 must plan against the seams that actually exist here and only pull forward narrow catch-up work if the assembled dashboard truly needs it.
- **Scope creep into control-plane behavior:** review browsing and operator visibility can easily expand into broad mutating pool management; the milestone should stay inspect-first and thin.

## Decomposition Rationale

This roadmap is grouped around the real operator-facing seams the user must trust, not around frontend layers. The highest-risk question is whether the broker can actually serve and keep live a thin browser surface without reopening prior architecture decisions. That is why S01 ships the risky path first as a real broker-served dashboard with live overview data, instead of hiding the hard part behind package scaffolding or mock pages.

Once that mounted path is proven, the next most important outcome is operational usefulness. Overview alone is not enough if operators still need raw CLI output for first diagnosis, so S02 adds the first redaction-safe live event/log surface over broker-owned structured evidence. That keeps the milestone honest about what “logs” means in the current codebase and avoids pretending raw subprocess logs already exist.

S03 then deepens inspectability by adding the read-only review browser, reusing the existing broker read APIs instead of inventing a dashboard-specific data model. This is a natural later slice because the broker seams already exist; the missing work is browser composition and navigation, not backend redesign.

S04 is an explicit integration closer because this milestone crosses several runtime boundaries: broker HTTP serving, static dashboard assets, SSE liveness, SQLite-backed broker truth, and browser-based operator flows. The milestone is not complete when the pages exist; it is complete when the assembled broker-served dashboard stays coherent through real runtime changes and gives operators a trustworthy entrypoint for normal inspection.

## Proof Strategy

- **Delivery architecture risk** → retire in **S01** by shipping one real broker-owned HTTP surface that mounts the dashboard, serves real overview data, and proves SSE-triggered re-sync against a live broker.
- **Operational usefulness risk** → retire in **S02** by shipping a browser log/event surface over structured broker-owned operator evidence with explicit redaction discipline.
- **Inspectability depth risk** → retire in **S03** by proving the dashboard can browse real review state read-only through existing broker read surfaces.
- **Cross-boundary trust risk** → retire in **S04** by exercising the assembled broker-served dashboard against a real runtime, including reconnect/reload and startup-recovery visibility, through the actual browser entrypoint.

## Verification Classes

- **Contract verification:** route/schema tests for overview snapshots, event feed payloads, review detail payloads, and SSE notification semantics.
- **Runtime integration verification:** real broker runtime, real SQLite file, live state mutations, and broker-owned HTTP/SSE routes exercised together.
- **Browser verification:** broker-served dashboard pages render real data, navigation works, and live updates/reconnect behavior are verified through the browser surface.
- **Operational verification:** startup-recovery context, reviewer state, audit/event visibility, and redaction-safe payloads remain inspectable without raw database reads.
- **UAT / operator verification:** a human can use the dashboard as the first inspection surface for overview, live operator events, and read-only review state in local runtime conditions.

## Milestone Definition of Done

This milestone is complete only when all are true:

- all slice deliverables are complete
- the broker owns the dashboard HTTP listener/mount and remains the single source of truth for overview, events, and review inspection data
- the dashboard is thin: it consumes broker-owned JSON/SSE routes and shared contracts rather than inventing a second state model or routing primary behavior through MCP
- live updates are reconnect-safe because snapshot routes remain truth and SSE is used as liveness/change notification only
- operators can inspect overview, live event/log visibility, and read-only review detail through the browser without the dashboard becoming a broad mutating control plane
- final integrated acceptance is re-proved against a real broker/runtime path, not only fixture-driven rendering or isolated route tests

## Requirement Coverage

- **Primary milestone owner:** R011
- **Directly advances:** R010
- **Strengthens / must preserve:** R002, R003, R005
- **Constrains the browser boundary:** R006, R007
- **Partially advances but does not fully close:** R014
- **Not reopened here:** R001, R004, R008, R009, R012, R013, R015, R016, R017
- **Orphan risks:** the requirement set does not explicitly spell out the broker-mounted HTTP contract, the first log/event contract, or the SSE resync rule, so execution must keep those decisions visible and mechanical rather than leaving them implicit.

### Coverage Summary

| Requirement | M004 disposition | Roadmap owner | Planning note |
|---|---|---|---|
| R002 | strengthened | S01 | Browser/API work must keep using canonical shared TypeScript contracts instead of inventing dashboard-only DTOs. |
| R003 | strengthened | S01, S04 | SQLite-backed broker state remains the source of truth for all dashboard views and final acceptance. |
| R005 | strengthened | S01, S02, S04 | Reviewer state and recovery visibility stay broker-owned and inspectable through dashboard surfaces. |
| R006 | boundary preserved | S01 | The browser gets broker-owned HTTP routes; M004 must not reopen deterministic typed-client decisions by inventing a browser transport rewrite. |
| R007 | boundary preserved | S01 | MCP remains a public integration surface but not the dashboard’s primary runtime path. |
| R010 | mapped | S02 primary, S01/S04 support | The milestone must make broker audit events, reviewer state, and failure signals inspectable in a browser, not just in CLI output. |
| R011 | mapped | S01 primary, S02/S03/S04 support | M004 restores the operator-facing dashboard as a thin broker-backed browser surface and carries forward the Astro baseline unless execution evidence disproves it. |
| R014 | partially advanced | S03 primary, S04 support | M004 should deliver read-only richer review browsing now; broad pool management or mutating controls remain deferred. |

## Slices

- [x] **S01: Broker-mounted dashboard and live overview** `risk:high` `depends:[]`
  > Demo: a real broker process serves a browser dashboard entrypoint where overview cards and reviewer/recovery summary panels render broker-backed state and visibly refresh after real broker mutations.

- [x] **S02: Live operator event/log surface** `risk:medium` `depends:[S01]`
  > Demo: operators can open the dashboard log/event view and watch a live, redaction-safe stream of broker/operator events update from real runtime activity without relying on raw CLI tails.

- [x] **S03: Read-only review browser** `risk:medium` `depends:[S01,S02]`
  > Demo: from the same broker-served dashboard, operators can browse real reviews and inspect one review’s status, proposal, discussion, and activity history without mutating broker state.

- [x] **S04: Integrated operator shell and real-runtime acceptance** `risk:medium` `depends:[S01,S02,S03]`
  > Demo: a real SQLite-backed broker serves one coherent dashboard where overview, live operator events, and read-only review inspection stay aligned through reload/reconnect/startup-recovery scenarios, giving operators a trustworthy first-stop browser surface for normal diagnosis.

## Slice Proof and Verification Notes

### S01

- **Scope:** add the broker-owned HTTP serving substrate, the mounted dashboard package, overview snapshot routes seeded from `inspectBrokerRuntime()` and startup-recovery data, and SSE notification plumbing that wakes the browser to refresh authoritative snapshots.
- **Proof strategy:** ship the hardest architectural seam first as a real user-facing page through the actual broker process, not as standalone API proof or a fixture-rendered dashboard.
- **Verification classes:** route/schema tests for overview payloads and SSE topic/version behavior; runtime smoke/integration runs with a live broker and state mutation; browser verification showing the mounted dashboard updates after real broker changes.
- **Requirement coverage:** R011 primary; strengthens R002, R003, R005; preserves R006 and R007 boundaries.

### S02

- **Scope:** define the first broker-owned operator event/log contract, expose list/stream routes for it, and render a dashboard view that supports live follow, filtering/search, and redaction-safe visibility over structured broker/operator events.
- **Proof strategy:** make the dashboard operationally useful before adding deeper review browsing, because overview without a trustworthy event/log surface still forces operators back to raw files or CLI.
- **Verification classes:** repository/route tests for global event ordering and filtering, SSE/live-follow tests, and browser verification that new runtime events appear in the operator log view without page reload.
- **Requirement coverage:** R010 primary; supports R011 and strengthens R005.

### S03

- **Scope:** add read-only review list/detail browser routes and pages that reuse existing broker read seams such as `listReviews`, `getReviewStatus`, `getProposal`, `getDiscussion`, and `getActivityFeed`, plus lightweight navigation/filtering needed to inspect real reviews.
- **Proof strategy:** deepen inspectability by composing existing broker truth instead of expanding into mutating controls or a dashboard-owned review store.
- **Verification classes:** route/schema tests for list/detail responses, browser verification of review navigation and detail rendering, and checks that activity/proposal/discussion views match the real broker state.
- **Requirement coverage:** R014 primary (read-only portion), supports R011 and R010 while preserving R002.

### S04

- **Scope:** harden the assembled dashboard as one operator shell, close reconnect/reload/startup-recovery visibility gaps, add any narrow broker-owned catch-up snapshot needed for trustworthy operator UX in this worktree, and re-prove the milestone through the real broker-served browser entrypoint.
- **Proof strategy:** close the milestone by proving the assembled runtime and UI together, because this work crosses broker, HTTP, SSE, SQLite, and browser boundaries and must stay trustworthy under real runtime behavior.
- **Verification classes:** real-runtime browser acceptance runs, restart/reconnect checks, startup-recovery visibility checks, and explicit assertions that overview/event/review surfaces remain coherent after live broker changes.
- **Requirement coverage:** closes R011 acceptance, re-proves R010 in the assembled browser surface, and strengthens R003/R005 through integrated operator evidence.

## Boundary Map

### S01 → S02

Produces:
- broker-owned HTTP listener/mount contract for the dashboard
- mounted browser entrypoint and asset-serving path owned by the broker runtime
- authoritative overview snapshot route seeded from existing broker inspection primitives
- SSE notification bridge where topic/version changes tell the browser when to re-fetch broker truth

Consumes:
- `inspectBrokerRuntime()` and startup-recovery snapshot seams already present in `packages/review-broker-server/src/index.ts`
- shared TypeScript contracts from `review-broker-core`
- existing runtime-local `VersionedNotificationBus` semantics

### S01 → S03

Produces:
- browser transport contract for dashboard reads: broker-owned HTTP JSON + SSE, not direct in-process client calls or MCP
- proven mounted dashboard package and routing shell
- reconnect-safe “snapshot is truth, stream is liveness” model for later review-detail pages

Consumes:
- the standalone broker/runtime boundary already fixed by earlier milestones
- existing broker state as the only source of truth

### S02 → S04

Produces:
- global operator event/log contract suitable for live browser inspection
- redaction-safe operator visibility for broker/reviewer/runtime events
- dashboard event surfaces that reduce immediate fallback to CLI/files

Consumes from S01:
- mounted broker HTTP surface and SSE refresh model

### S03 → S04

Produces:
- read-only review list/detail inspection path over broker-owned routes
- review-level composition of status, proposal, discussion, and activity views
- a deeper operator diagnosis surface that stays inspect-first rather than mutating

Consumes from S01:
- mounted dashboard shell and browser transport contract

Consumes from S02:
- shared live-update conventions and operator-navigation shell

### External runtime boundaries proved by S04

- **Broker HTTP boundary:** the broker itself serves the dashboard and broker-owned JSON/SSE routes.
- **SQLite durability boundary:** browser-visible state comes from the same durable broker database used by the runtime.
- **Realtime boundary:** SSE only signals change; snapshot routes re-hydrate truth after live updates, reloads, or reconnects.
- **Reviewer supervision boundary:** reviewer and recovery state remain broker-owned and browser-visible without exposing raw unsafe process internals.
- **Operator UX boundary:** operators can use the browser as the first inspection surface for overview, live events, and review detail instead of immediately dropping to raw files or CLI.

## Milestone Final Integrated Acceptance

M004 closes only when the assembled system proves all of the following in a real local environment:

1. A live broker process serves the mounted dashboard from the broker runtime itself.
2. The overview surface renders real broker-backed counts and latest-state snapshots, then re-syncs after real broker mutations through the broker’s live-update path.
3. The event/log surface shows a useful live, redaction-safe operator feed backed by broker-owned data rather than fixture-only rendering or raw subprocess tails that do not exist.
4. The review browser lets operators inspect real review status, proposal, discussion, and activity data read-only from the same dashboard entrypoint.
5. Reload, reconnect, and startup-recovery scenarios leave the dashboard coherent because snapshot routes remain truth and SSE is used only for liveness.
6. Final acceptance is proven through the real broker-served browser path against a real SQLite-backed broker/runtime, not only through isolated tests or component stories.
