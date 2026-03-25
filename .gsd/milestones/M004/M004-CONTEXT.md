# M004: Dashboard and operator tooling

**Gathered:** 2026-03-23
**Status:** Ready for planning

## Project Description

`tandem2` already has the standalone TypeScript broker, shared typed contracts, durable SQLite state, broker-owned reviewer lifecycle, and the `gsd` review-gating seam. M004 restores the operator-facing dashboard and tooling as a browser surface over that broker state, using the old Astro dashboard direction as the inherited baseline rather than inventing a new frontend architecture.

## Why This Milestone

Operator visibility matters, but it should trail the broker rewrite rather than drive it. M004 exists because once the broker/runtime contract is stable enough, operators and people watching the review flow need a trustworthy live window into the system. The dashboard should reduce the need to fall back to raw CLI and files for basic diagnosis, without turning the UI into a second source of truth or forcing backend redesign from the frontend backward.

## User-Visible Outcome

### When this milestone is complete, the user can:

- open a broker-served dashboard and see live overview and log visibility for the real running broker instead of relying only on raw CLI/files
- inspect live broker state through overview, logs, and then a read-only review browser without the dashboard becoming a heavy admin app

### Entry point / environment

- Entry point: broker-mounted dashboard served from the broker runtime
- Environment: local dev / production-like local runtime with a real running broker
- Live dependencies involved: broker runtime, SQLite-backed broker state, broker/reviewer logs, SSE event stream

## Completion Class

- Contract complete means: the dashboard remains a thin client over broker state, uses the existing broker truth rather than inventing a dashboard-owned data model, and exposes inspect-first operator surfaces that are mechanically checkable
- Integration complete means: the dashboard renders real broker-backed overview, log, and review-inspection data through the mounted broker surface, with live updates where they matter
- Operational complete means: operators can use the dashboard as a trustworthy operator window for basic diagnosis instead of needing to drop immediately to raw CLI/files for normal inspection

## Final Integrated Acceptance

To call this milestone complete, we must prove:

- a real running broker can serve the mounted dashboard and drive live overview/log visibility through broker-backed data rather than fixture-only rendering
- the dashboard can consume live SSE updates and stay aligned with real broker state instead of drifting into a stale or cosmetic view
- final acceptance is broker-primary, meaning the dashboard must be exercised against a real broker/runtime path and not only by isolated component or page proof

## Risks and Unknowns

- overview/logs could ship but still be too thin if operators still need raw CLI/files for basic diagnosis — that would make the milestone feel like a miss
- SSE can make the UI feel operational, but it also creates a drift risk if the event/update model is weaker than the broker truth underneath
- mounted-in-broker delivery keeps the runtime simple, but it increases pressure to keep the UI thin and avoid accidental backend/UI coupling
- review browser and pool/operator surfaces can sprawl quickly if inspect-first discipline slips into broad admin tooling too early

## Existing Codebase / Prior Art

- `../gsd-tandem/tools/gsd-review-broker/dashboard/src/pages/index.astro` — prior-art Astro shell with overview, logs, and placeholders for reviews and pool tabs
- `../gsd-tandem/tools/gsd-review-broker/dashboard/src/components/OverviewStats.astro` — prior-art stats card layout for review totals, approval rate, average review time, and status breakdown
- `../gsd-tandem/tools/gsd-review-broker/dashboard/src/components/LogViewer.astro` — prior-art log viewer surface with selector, live tail, search, and terminal-style output
- `../gsd-tandem/tools/gsd-review-broker/dashboard/src/scripts/sse.ts` — prior-art EventSource/SSE wiring for live dashboard updates
- `../gsd-tandem/tools/gsd-review-broker/dashboard/src/scripts/overview.ts` — prior-art mounted dashboard overview fetch/live update path
- `.gsd/milestones/M001/M001-SUMMARY.md` — broker parity and inspectable runtime state already shipped, so M004 can stay thin over broker truth
- `.gsd/milestones/M003/M003-CONTEXT.md` — M003 hardens continuity and failure visibility first, which gives M004 a cleaner operational substrate to present

> See `.gsd/DECISIONS.md` for all architectural and pattern decisions — it is an append-only register; read it during planning, append to it during execution.

## Relevant Requirements

- R011 — this is the primary milestone owner for restoring the operator-facing dashboard as a thin client over broker state
- R014 — this milestone can advance richer review browsing and pool management, but not necessarily close the full rich-control vision in the first slice
- R010 — M004 depends on and exposes broker audit, reviewer state, and failure visibility in a browser surface
- R002 — M004 should continue consuming the shared canonical TypeScript domain model instead of re-describing contracts in the UI layer

## Scope

### In Scope

- Astro-based dashboard restoration as the inherited baseline unless implementation evidence breaks that choice
- a first shippable slice centered on live overview and logs
- SSE-backed live updates where they materially improve trust and operator usefulness
- inspect-first operator surfaces over broker state
- a later read-only review browser as the next dashboard priority after overview/logs
- broker-mounted delivery rather than a separate remote web app for this milestone

### Out of Scope / Non-Goals

- turning the dashboard into a second source of truth or a backend-driving control plane
- broad mutating operator controls as the initial dashboard goal
- a heavy admin app with broad pool management as the first milestone outcome
- frontend-only or fixture-only proof standing in for real broker-backed acceptance
- dashboard work that depends on redesigning the broker data model from the UI backward

## Technical Constraints

- keep the dashboard thin over broker state
- keep the dashboard mounted in the broker for this milestone
- prioritize inspect-first visibility before broad operator controls
- make the dashboard feel live through SSE where it matters
- the user wants the next milestone discussed as well so auto mode can go through all milestones; that sequencing goal should not expand M004 into unrelated backend redesign

## Integration Points

- broker runtime — serves the mounted dashboard and remains the source of truth
- broker-backed dashboard routes — provide overview/log/review data to the Astro frontend
- SSE event stream — keeps overview/log surfaces live and operational rather than static
- broker and reviewer logs — power the log viewer and reduce fallback to raw files
- broker state model / shared types — the dashboard consumes this model rather than inventing its own

## Open Questions

- how much review-browser depth should fit in the first read-only review browser slice — current thinking: enough to inspect review state clearly, without broad management actions
- whether narrow safe controls ever belong in M004 after inspect-first visibility lands — current thinking: maybe later in the milestone, but only if they materially help operations and do not make the dashboard a control plane
- how much aggregation should happen in the dashboard versus broker endpoints — current thinking: derived presentation is fine, but the UI should not become its own state system
