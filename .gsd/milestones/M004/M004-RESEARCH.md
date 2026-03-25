# M004 — Research

**Date:** 2026-03-24

## Summary

M004 should be planned as a **broker-mounted operator surface milestone**, not a generic frontend buildout. The main code-level finding is that the current `M004` worktree has **strong broker-side state and inspection primitives**, but it does **not** yet have the delivery substrate the milestone assumes: there is **no HTTP server, no dashboard package, no Astro dependency, no browser-facing JSON API, and no SSE endpoint** anywhere in `packages/review-broker-server`.

That means the highest-risk proof is not visual polish. It is this: **can the broker itself mount and serve a thin browser dashboard, expose a trustworthy snapshot API, and keep it live without creating a second data model?** The planner should prove that first.

There is also one important surprise: the preloaded project context says M003 closeout delivered continuity inspection surfaces such as `inspectRuntimeContinuity()` / `inspect-continuity.ts`, but the current `M004` worktree source tree does **not** contain those files or contracts. In code, `packages/review-broker-server/src` currently has only the `start-broker.ts` and `start-mcp.ts` CLIs, three migrations (`001`-`003`), the runtime/repository files, and the existing broker inspection snapshot in `src/index.ts`. There is **no** `status-service.ts`, no `inspect-continuity.ts`, and no continuity-specific migration beyond `003_reviewer_lifecycle.sql`.

Planning consequence: **do not assume the full M003 operator-surface closeout code is already present in this worktree**. Either:
- plan M004 against the runtime surfaces that actually exist here, or
- explicitly restack one narrow continuity-surface catch-up slice before deeper dashboard work.

The good news is that the existing code already gives M004 several strong reuse points:
- `packages/review-broker-server/src/index.ts` exposes `inspectBrokerRuntime()` and startup-recovery snapshots that are already shaped like overview data.
- `packages/review-broker-server/src/runtime/broker-service.ts` already has broker-owned read APIs for `listReviews`, `listReviewers`, `getReviewStatus`, `getProposal`, `getDiscussion`, and `getActivityFeed`.
- `packages/review-broker-core/src/notifications.ts` provides a runtime-local `VersionedNotificationBus` with wait semantics that can be bridged into SSE.
- `packages/review-broker-server/src/db/audit-repository.ts` already stores append-only audit evidence with summary metadata that can back operator event views.

The best M004 path is therefore **thin broker-owned HTTP delivery + broker-owned JSON/SSE routes first**, then overview/logs, then a read-only review browser.

## Recommendation

Take a **three-slice core plan** with an optional fourth acceptance/polish slice:

1. **Mounted delivery substrate + live overview first**
   - Add the broker-owned HTTP surface that can mount a dashboard package, serve the built client assets, and expose broker-backed JSON/SSE endpoints.
   - Use this slice to prove the biggest architectural decisions: mounted-in-broker delivery, Astro viability, and snapshot/live-update alignment.

2. **Operator events / log viewer second**
   - Build the first useful live operator stream over broker-owned structured events, not over a new browser-owned store.
   - Decide explicitly whether “logs” means structured operator events, redaction-safe broker diagnostics, or raw subprocess stdout/stderr. The current codebase only supports the first two without new capture infrastructure.

3. **Read-only review browser third**
   - Reuse the existing review read surfaces (`listReviews`, `getReviewStatus`, `getProposal`, `getDiscussion`, `getActivityFeed`) to add deeper inspection without adding controls.
   - This is a natural later slice because the data seams already exist; the main missing work is browser routing/composition.

4. **Optional final slice: continuity/operator detail catch-up + integrated browser acceptance**
   - Use only if M003 continuity surfaces really are required for trustworthy operator UX in this worktree, or if final acceptance needs one more broker-owned snapshot route.

## Implementation Landscape

### What exists now

#### Broker-side snapshot and inspection primitives
- `packages/review-broker-server/src/index.ts`
  - `startBroker()` composes the runtime.
  - `inspectBrokerRuntime()` already returns overview-shaped counts and “latest” snapshots:
    - `reviewCount`
    - `reviewerCount`
    - `trackedReviewerCount`
    - `reviewerStatusCounts`
    - `messageCount`
    - `auditEventCount`
    - `statusCounts`
    - `counterPatchStatusCounts`
    - `latestReview` / `latestReviewer` / `latestMessage` / `latestAuditEvent`
  - Startup recovery is also exposed through `getStartupRecoverySnapshot()`.

**Planning implication:** overview cards and broker summary panels do **not** need a new frontend-owned aggregation model. The broker already knows how to compute one.

#### Existing read APIs that naturally support a review browser
- `packages/review-broker-server/src/runtime/broker-service.ts`
  - `listReviews()`
  - `listReviewers()`
  - `getReviewStatus()`
  - `getProposal()`
  - `getDiscussion()`
  - `getActivityFeed()`

**Planning implication:** a later read-only review browser is a natural, low-redesign slice. The read contract already exists and is shared through `review-broker-core`.

#### Shared domain and registry contract
- `packages/review-broker-core/src/contracts.ts`
- `packages/review-broker-core/src/operations.ts`
- `packages/review-broker-core/src/domain.ts`

These files keep the broker operation shapes, review/reviewer enums, lifecycle snapshots, and activity entries in one shared TypeScript contract.

**Planning implication:** R002 is already giving M004 the right constraint: browser/API work should reuse these types rather than invent new UI DTOs.

#### Live-change primitive already exists in-process
- `packages/review-broker-core/src/notifications.ts`

The `VersionedNotificationBus` already supports:
- per-topic versions
- `notify(topic)`
- `waitForChange(topic, sinceVersion, { timeoutMs })`

And `broker-service.ts` already uses it for waitable reads on:
- `review-queue`
- `reviewer-state`
- `review-status:<reviewId>`

**Planning implication:** broker-side live updates do not need a brand-new eventing design. M004 can bridge the existing versioned notification model into SSE.

#### Durable audit evidence already exists
- `packages/review-broker-server/src/db/audit-repository.ts`

The audit repository already stores append-only structured events with `summary` metadata for review-level activity.

**Planning implication:** operator-visible event feeds should reuse this durable evidence instead of building ephemeral browser-only logs.

### What is missing now

#### No browser delivery substrate
There is currently:
- no `packages/review-broker-dashboard`
- no Astro config
- no `@astrojs/node` or `astro` dependency
- no HTTP server in `review-broker-server`
- no static asset serving
- no browser-facing routes

`packages/review-broker-server/src/cli/start-broker.ts` in “serve” mode starts the runtime and waits for shutdown, but it does **not** listen on an HTTP port.

**Planning implication:** mounted browser delivery is the first real architectural gap.

#### No browser-safe network transport for the existing client package
- `packages/review-broker-client/src/in-process.ts` starts the broker in-process and wraps the service directly.

That is useful for tests and local integration, but it is **not** a browser transport.

**Planning implication:** do **not** plan M004 around “the dashboard just uses the existing typed client in the browser.” It cannot. The browser needs broker-owned HTTP JSON/SSE routes.

#### No global operator log stream
The current codebase does **not** expose:
- a global audit list API
- a global review timeline API
- a global operator event feed
- any log file tailing endpoint
- any reviewer stdout/stderr capture layer

`packages/review-broker-server/src/runtime/reviewer-manager.ts` spawns reviewer subprocesses with `stdio: 'ignore'`.

That means reviewer stdout/stderr is discarded today.

**Planning implication:** the planner must settle what “logs” means before slicing that work. If the milestone only needs a useful operator event/log view, structured audit + lifecycle/system events are enough. If it truly needs raw reviewer process output, that is a **new runtime subsystem**, not just a dashboard page.

#### No continuity-specific operator read model in this worktree
The current source tree does not include the continuity-specific runtime/CLI files described by the M003 closeout context.

**Planning implication:** if the dashboard overview/logs are expected to show continuity-specific inspection beyond startup recovery and current reviewer state, that work may need to be pulled forward explicitly.

## Astro viability and delivery choice

The inherited architectural decision to treat Astro as the dashboard baseline still looks sound.

Why:
- The dashboard wants mostly read-heavy operator surfaces.
- The milestone explicitly wants a **thin client** over broker state.
- Astro fits “HTML first, selective interactivity where needed” better than introducing a large SPA admin app.

The key technical point from Astro docs is that `@astrojs/node` supports **middleware mode**, which builds:
- `dist/server/entry.mjs` with a `handler`
- `dist/client/` static assets

That mode is meant to be **mounted into an existing Node server**, which matches D005 and the M004 mounted-in-broker constraint much better than Astro standalone mode.

**Planning implication:** if Astro is used, the right shape is:
- broker owns the HTTP listener
- dashboard builds in Astro Node middleware mode
- broker serves static assets and mounts the Astro handler
- dashboard API routes that need live broker context stay broker-owned, not reimplemented in a separate web backend

Do **not** use Astro standalone mode for M004 unless later execution evidence forces it; that would weaken the mounted-in-broker decision.

## Boundary Contracts That Matter

### 1. Browser contract: HTTP JSON + SSE, not direct client or MCP
The dashboard should not use:
- direct in-process client APIs from the browser
- MCP as its primary runtime path

Instead it should use broker-owned HTTP routes that are thin wrappers over runtime/service state.

Why this matters:
- preserves R006/R007 boundaries
- keeps the dashboard operational, not tool-mediated
- avoids inventing a second integration path via MCP for the browser

### 2. Snapshot is truth; SSE is liveness
The existing `VersionedNotificationBus` is runtime-local and resets on restart. That means:
- SSE events are useful as **change notifications**
- SSE is **not** durable truth
- reconnect/resume must refresh from snapshot routes
- browser state should always be re-hydrated from broker snapshots after reconnect or page load

This is the right anti-drift contract for M004.

### 3. Overview aggregation should stay broker-owned
For overview cards and status summaries, prefer broker routes that expose one additive operator snapshot over forcing the browser to fetch multiple collections and invent its own counts.

Why:
- reduces drift risk
- preserves the thin-client boundary
- keeps derived operator semantics in one place

Existing `inspectBrokerRuntime()` is the obvious seed for this contract.

### 4. Log/event contract must be decided explicitly
Current code supports:
- durable structured review/reviewer audit events
- redaction-safe startup/CLI diagnostics

Current code does **not** support:
- raw reviewer stdout/stderr browsing
- tailing broker process logs from runtime memory

So the planner should define one of these as the first log contract:
1. **structured operator events** (lowest risk, already aligned with broker truth)
2. **structured broker diagnostics + audit feed**
3. **raw subprocess logs** (highest risk; new capture/persistence work)

Recommendation: ship **structured operator events first** and treat raw subprocess logs as a later, explicit expansion only if the user actually wants them.

### 5. Read-only review browser can stay thin
A read-only review browser can be built by composing the existing read surfaces instead of inventing a review-dashboard data model.

Natural route set:
- list reviews
- fetch one review’s status/proposal/discussion/activity
- optionally subscribe to review or queue versions via SSE

## What Should Be Proven First

The first proof should be **one real broker runtime serving one mounted browser shell plus one live overview surface over real runtime state**.

Concretely, prove all of this together first:
1. start a real broker runtime
2. mount a dashboard from the broker process
3. fetch a broker-owned overview snapshot route
4. connect to an SSE route backed by the broker notification bus
5. mutate real broker state
6. show the dashboard re-sync from broker state without fixture-only rendering

Why this first:
- it proves the biggest missing architecture seam
- it validates Astro’s mounted fit
- it validates SSE without overcommitting to full event semantics
- it prevents later slices from becoming page-only or mock-only work

If that proof does not work cleanly, the roadmap planner will want to know early, before spending time on logs or deeper review detail pages.

## Natural Slice Boundaries

### Slice 1 — Mounted dashboard substrate + live overview
**Goal:** prove browser delivery and thin live state.

Likely contents:
- new dashboard package (likely `packages/review-broker-dashboard`)
- broker-owned HTTP server/mount point
- overview snapshot route backed by `inspectBrokerRuntime()` and startup-recovery summary
- SSE route backed by notification versions
- one real browser proof against a started broker

This slice should close the main architecture risk.

### Slice 2 — Operator events / logs
**Goal:** make the dashboard operationally useful.

Likely contents:
- global broker-owned operator event feed route
- live update topic for that feed
- log/event viewer UI
- clear redaction policy carried forward from existing CLI/runtime surfaces

This slice should close the “operators still need raw CLI/files immediately” risk.

### Slice 3 — Read-only review browser
**Goal:** deepen inspectability without broad controls.

Likely contents:
- review list / filters
- review detail page or panel
- proposal / discussion / activity views
- reviewer state linkage where helpful

This slice is naturally thinner risk because most data seams already exist.

### Optional Slice 4 — Continuity/reviewer detail catch-up + final acceptance
Use only if needed for this worktree.

Possible contents:
- expose one missing continuity snapshot the UI genuinely needs
- finalize browser acceptance against a real broker/runtime path
- keep controls read-only unless a later decision explicitly expands scope

## Existing Patterns to Reuse

- **Additive migration discipline** from `packages/review-broker-server/src/db/open-database.ts`
  - if M004 needs new durable operator-event or log tables, add a new migration; do not rewrite `001`-`003`
- **Structured audit metadata with summary strings** from `src/db/audit-repository.ts`
  - better starting point for operator logs than raw process output
- **Versioned wait semantics** from `review-broker-core/src/notifications.ts`
  - perfect bridge for SSE “changed since version” behavior
- **Broker-owned aggregate inspection** from `src/index.ts`
  - reuse rather than rebuilding counts in the browser
- **Redaction-safe reviewer persistence** from `src/runtime/reviewer-manager.ts`
  - preserve sanitized command/arg discipline on any dashboard surface
- **Shared core schemas** from `review-broker-core`
  - keep new operator/dashboard contracts typed and canonical

## Constraints and Risks

### 1. The worktree is behind the continuity story described in context
This is the biggest planning surprise.

Risk:
- dashboard planning may assume continuity-specific operator surfaces that do not actually exist here yet

Response:
- either narrow the first slices to the surfaces that exist now
- or explicitly restack one catch-up slice before deeper dashboard/operator work

### 2. “Logs” can accidentally become a new subsystem
Because reviewer subprocess stdio is ignored today, raw log viewing is not “just UI work.”

Risk:
- slice planning underestimates the runtime work needed

Response:
- make structured operator events the default first interpretation of logs
- treat raw subprocess capture as explicit scope expansion only

### 3. SSE can drift if treated as source of truth
Notification versions are in-memory and runtime-local.

Risk:
- browser tries to reconstruct state solely from event payloads
- restart/reconnect creates stale UI

Response:
- use SSE as a wake-up signal
- always re-fetch snapshot/read routes after change notifications or reconnect

### 4. Browser transport could accidentally reopen architecture decisions
Because the current client package is in-process only, it is easy to accidentally overreact by inventing a new remote typed client or by routing browser work through MCP.

Response:
- do neither for M004
- add broker-owned HTTP routes and keep them thin

### 5. UI scope can sprawl into control-plane work
The milestone context already warns about this.

Response:
- keep first slices inspect-first
- defer broad mutating controls
- treat R014 as later, not as an excuse to expand S01/S02

## Requirement Focus

### Table stakes from active requirements
- **R011** — the main owner; restore a thin broker-backed operator dashboard
- **R002** — keep one canonical TS model; no dashboard-owned contract fork
- **R010** — the dashboard must improve inspectability, not just beautify counts
- **R003** — runtime truth is durable SQLite-backed broker state, not browser cache
- **R005** — reviewer lifecycle remains broker-owned and inspectable

### Requirements likely missing or underspecified
These are not automatic scope increases; they are planner-facing questions.

- **Mounted HTTP delivery contract is not explicit in requirements.**
  - The milestone context says broker-mounted delivery, but there is no explicit requirement spelling out a browser-served HTTP surface and route ownership.
- **The operator “logs” contract is underspecified.**
  - It does not yet say whether the first milestone needs structured event logs, broker diagnostics, raw subprocess logs, or all three.
- **SSE reconnect/resync semantics are underspecified.**
  - Existing code strongly suggests “snapshot is truth, stream is liveness,” but the requirement text does not make that explicit.
- **Redaction expectations for dashboard payloads are implicit, not explicit.**
  - Existing runtime/CLI work is careful about command/argv safety; the dashboard should inherit that discipline.

### Clearly optional / probably advisory only
- auth/access control for the dashboard in local-dev workflows
- historical analytics/charts beyond current broker truth
- broad reviewer/pool mutation controls
- separate frontend deployment topology

### Clearly out of scope for the first slices
- dashboard as a second source of truth
- browser-first redesign of broker data model
- remote typed client transport redesign
- broad admin/control-plane mutations

## Candidate Requirements

These should be discussed explicitly if the planner wants them to become binding.

1. **Broker-mounted HTTP dashboard contract**
   - The broker must expose a browser-facing HTTP surface that serves the mounted dashboard and broker-owned JSON/SSE routes from the same runtime.

2. **Structured operator event feed contract**
   - The broker must expose a redaction-safe operator event/log feed suitable for live dashboard viewing, even if raw subprocess log tailing is deferred.

3. **SSE resync contract**
   - Dashboard live updates must be additive and reconnect-safe: stream notifications trigger snapshot refresh, and the browser must recover cleanly after restart/disconnect without treating SSE as durable truth.

4. **Read-only review browser minimum**
   - The dashboard should provide at least one read-only review inspection path built from existing broker read surfaces before any mutating pool/reviewer controls are considered.

5. **If raw reviewer stdout/stderr is truly required, make it explicit**
   - The current runtime does not capture it. That should be a deliberate requirement, not an accidental assumption hidden inside “logs.”

## Skills Discovered

### Installed skills already relevant
- `test` — directly useful for the broker-side verification and regression work around mounted delivery and operator routes
- `frontend-design` — useful later for the dashboard UI itself, but secondary to the broker-mounted architecture proof
- `accessibility` — useful once operator surfaces exist in browser form

### Promising external skills (not installed)
- **Astro**
  - `npx skills add astrolicious/agent-skills@astro`
  - Highest-relevance external skill for the mounted dashboard package
- **SQLite**
  - `npx skills add martinholovsky/claude-skills-generator@sqlite-database-expert`
  - Useful if M004 adds durable operator-event/log tables or query-heavy overview routes
- **Vitest**
  - `npx skills add onmax/nuxt-skills@vitest`
  - Useful for package-level browser-route/runtime verification
- **SSE / streaming**
  - `npx skills add dadbodgeoff/drift@sse-streaming`
  - Lower install count than the Astro/SQLite/Vitest options, but directly relevant if the team wants specialized SSE implementation guidance

## Bottom line

The planner should treat M004 as **“mounted broker web surface first, UI pages second.”** The code already contains the broker truth and much of the read-model surface needed for overview and a read-only review browser. What it does **not** contain yet is the browser delivery seam and a clear operator event/log contract.

So the first slice should prove:
- broker-owned HTTP delivery
- Astro mounted viability
- broker-owned overview snapshot route
- SSE live-update bridge over the existing notification bus
- real browser proof against a live broker

After that, the milestone should naturally split into:
- operator events/logs, then
- read-only review inspection,
while staying thin and avoiding control-plane drift.