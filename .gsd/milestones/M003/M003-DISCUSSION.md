# M003 Discussion Log

## Exchange — 2026-03-24T05:11:08.760Z

### Recovery

When a reviewer exits or a claim goes stale, what should M003 optimize for first?

- **Auto recover (Recommended)** — Reclaim and continue automatically whenever the broker can do so safely.
- **Visible pause** — Prefer stopping visibly for operator review rather than auto-reclaiming aggressively.
- **Hybrid policy** — Auto-recover clear cases but pause on ambiguous ownership or state.

**Selected:** Auto recover (Recommended)

### Boundary

For this milestone, where should reviewer supervision primarily live?

- **In broker (Recommended)** — Keep spawn, liveness, draining, and recovery in the broker runtime for now.
- **Split seam** — Introduce a clearer supervisor seam now, even if the broker still orchestrates through it.
- **External supervisor** — Push reviewer supervision toward a separate service/process manager in M003.

**Selected:** In broker (Recommended)

### Proof bar

What would convince you M003 is actually done?

- **Real crash proof (Recommended)** — Need real subprocess exits, broker restart, and stale-session recovery proven across a durable DB.
- **Mostly test proof** — A strong automated test matrix is enough even if some lifecycle failures are simulated.
- **Ops-first proof** — I care most about inspectable failure surfaces and manual recovery clarity, even over full auto-recovery.

**Selected:** Real crash proof (Recommended)

---
## Exchange — 2026-03-24T05:12:04.535Z

### Surface

What operator-facing surface should M003 include while hardening continuity?

- **CLI only (Recommended)** — Focus on runtime behavior plus inspectable CLI/state surfaces, but no dashboard work yet.
- **CLI plus commands** — Add some new operator commands/status flows now if they materially help recovery work.
- **Include UI** — Include operator UI/dashboard improvements as part of this milestone.

**Selected:** CLI plus commands

### Integration

Where should the final integrated acceptance sit for M003?

- **Broker-first (Recommended)** — The milestone should prove broker continuity directly, then rely on M002’s gate seam as already established.
- **Re-prove through gsd** — The milestone is only done if broker recovery is re-proved through real gsd review-gate flows too.
- **Both, broker primary** — Cover both, but keep broker-level proof as the primary acceptance bar.

**Selected:** Broker-first (Recommended)

### Non-goal

How conservative should M003 be about changing existing review and reviewer lifecycle semantics?

- **No redesign (Recommended)** — Do not redesign lifecycle semantics unless current behavior clearly fails the proof bar.
- **Targeted changes** — Allow targeted semantic changes where continuity needs them, but keep the user-facing contract recognizable.
- **Broader redesign** — Use M003 to rethink reviewer/claim semantics more broadly if that produces a cleaner runtime.

**Selected:** No redesign (Recommended)

---
## Exchange — 2026-03-24T05:12:33.298Z

### Primary user

Who should M003 primarily feel better for?

- **Operator first (Recommended)** — Optimize first for the person running and trusting the broker in local automation workflows.
- **Auto-flow first** — Optimize first for the gsd auto-flow that needs recovery without human babysitting.
- **Both equally** — Treat operator clarity and auto-flow continuity as equally important.

**Selected:** Both equally

### Failure bar

Which failure outcome would most clearly mean M003 was not good enough?

- **No limbo (Recommended)** — A review should never stay stranded in claimed/stale limbo after crash or restart.
- **Always explain** — Operator should always be able to see exactly why recovery stopped, even if some cases still need intervention.
- **Self-heal pool** — Reviewer pool should self-heal aggressively so operator action is rare.

**Selected:** No limbo (Recommended)

---
## Exchange — 2026-03-24T05:13:28.928Z

### Depth Check

Did I capture the depth right?

- **Yes, you got it (Recommended)** — The milestone direction, proof bar, scope, and non-goals match what I meant.
- **Not quite — let me clarify** — Something important is off or missing and needs correction before you write the file.

**Selected:** Yes, you got it (Recommended)
**Notes:** I want to discuss the next milestone as well so auto mode can go through all milestones

---
## Exchange — 2026-03-24T05:15:20.322Z

### First slice

For M004, what should the first genuinely shippable dashboard slice center on?

- **Overview + logs (Recommended)** — Restore the proven operator shell first, then add deeper browsing and controls later.
- **Add review browser** — Make review inspection first-class in the initial dashboard slice instead of stopping at overview/logs.
- **Add pool controls** — Prioritize operator control of reviewer pool/lifecycle in the first slice.

**Selected:** Overview + logs (Recommended)

### Live data

How live should the first dashboard version feel?

- **SSE live updates (Recommended)** — Keep the existing EventSource direction so the dashboard feels operational, not just static.
- **Refresh on demand** — Prefer simpler fetch-based updates even if the dashboard is less live.
- **Hybrid live model** — Use live updates where they matter and polling/manual refresh elsewhere.

**Selected:** SSE live updates (Recommended)

### Operator power

How much operator control should M004 include, beyond visibility?

- **Inspect first (Recommended)** — Focus on visibility and trust before adding mutating controls.
- **Some safe controls** — Include narrow actions like refresh, retry, or acknowledge when they help operations.
- **Full control surface** — Treat M004 as the place for broad reviewer/pool management actions.

**Selected:** Inspect first (Recommended)

---
## Exchange — 2026-03-24T05:16:34.616Z

### Primary user

Who should M004 primarily feel better for?

- **Operator first (Recommended)** — Optimize for the person running and diagnosing the broker day to day.
- **Both equally** — Optimize equally for operators and people watching review flow inside gsd-driven work.
- **Observer first** — Optimize mainly for stakeholders who need read-only visibility rather than operations.

**Selected:** Both equally

### Proof bar

What would convince you M004 is actually done?

- **Real broker proof (Recommended)** — The dashboard must prove itself against a real broker with real live data, not fixture-only UI rendering.
- **UI proof enough** — Component and page proof is enough if the broker contract is already verified elsewhere.
- **Both, broker primary** — Use both, but keep real broker runs as the main acceptance bar.

**Selected:** Both, broker primary

### Non-goal

How strict should we be about keeping the dashboard thin over broker state?

- **Thin client only (Recommended)** — Do not invent a new data model or let the dashboard become a second source of truth.
- **Derived extras okay** — Allow some dashboard-specific aggregation if it stays derived from broker state.
- **UI can drive backend** — Use M004 to add new broker-side state if the UI needs it.

**Selected:** Thin client only (Recommended)

---
## Exchange — 2026-03-24T05:17:09.937Z

### Deployment

For M004, what deployment shape do you want?

- **Mounted in broker (Recommended)** — Keep the dashboard served with the broker so one runtime owns the operator surface.
- **Separate web app** — Build it as a separate frontend package/app that talks to the broker remotely.
- **Separate code, coupled** — Keep the code separate but still ship it tightly coupled to the broker runtime.

**Selected:** Mounted in broker (Recommended)

### After slice 1

Once the first slice lands, what should the next dashboard priority be?

- **Review browser (Recommended)** — After overview/logs, add a read-only review browser before any mutating controls.
- **Pool tooling** — After overview/logs, add pool visibility and lifecycle controls next.
- **Keep it narrow** — Keep M004 narrow and stop after overview/logs unless a real gap remains.

**Selected:** Review browser (Recommended)

### Biggest miss

What would make M004 feel like a miss even if it technically shipped?

- **Still need CLI (Recommended)** — It would fail if operators still have to fall back to raw files/CLI for basic diagnosis.
- **State drift** — It would fail if the dashboard looks live but can drift from real broker state.
- **Too heavy** — It would fail if it becomes a heavy admin app instead of a trustworthy operator window.

**Selected:** Still need CLI (Recommended)

---
## Exchange — 2026-03-24T05:17:25.714Z

### Depth Check

Did I capture the depth right?

- **Yes, you got it (Recommended)** — The milestone direction, proof bar, deployment shape, and scope match what I meant.
- **Not quite — let me clarify** — Something important is off or missing and needs correction before you write the file.

**Selected:** Yes, you got it (Recommended)

---
