# M003 — Research

**Date:** 2026-03-23

## Summary

M003 should be planned as a **continuity-first hardening pass over the broker runtime contract**, not as a redesign of review semantics and not as a dashboard milestone. The strongest code-level finding is that the current `tandem2` worktree still contains planning artifacts only: there is no `packages/review-broker-*` implementation to patch yet. That changes the planning posture. The roadmap planner should treat M003 as work that must reconstitute the proven broker continuity patterns from prior art while keeping the M001/M002 architectural decisions fixed: standalone broker, broker-owned reviewer supervision, SQLite-backed durable state, typed downstream seam, and broker-first acceptance.

The best prior-art starting point is the Python broker in `gsd-tandem`, because it already encodes the narrow recovery policy M003 wants: reclaim timed-out `claimed` work, reclaim stale-session claims on startup, detach non-claimed open work from dead reviewers instead of pretending it is safe to advance, and record each recovery step durably in append-only audit events. That behavior lines up closely with R012, R010, R003, and R005 together. It also matches the user’s discussion choices: keep supervision in the broker, auto-recover safe cases, stay conservative about semantics, and prove continuity with real subprocess exits and broker restart.

The most important planning consequence is slice order. Do **not** start with UI or broad operator tooling, and do **not** start by re-proving the `gsd` gate. Start by locking the continuity data model and recovery semantics in the broker runtime, then layer process supervision, startup sweep/restart behavior, and finally CLI/status evidence plus crash-proof verification. M003 is only convincing if the final proof uses one durable SQLite database, real reviewer subprocess exits, and a broker restart that leaves no review stranded in claimed/stale limbo.

## Recommendation

Take a four-slice broker-first approach:

1. **Continuity state + audit contract first**
   - Port the prior-art continuity primitives before any fancy supervision work: reviewer lifecycle states, append-only recovery audit events, `claim_generation` fencing, `claimed_at`, and explicit recovery reasons.
   - This is the real foundation for R012/R010. Without it, later recovery logic has nowhere trustworthy to persist evidence.

2. **Reviewer supervision + safe reclaim/detach second**
   - Reuse the Python pool shape: broker-owned child-process registry, explicit draining, dead-process detection, reclaim for safe `claimed` rows, detach for non-claimed rows, and finalize draining reviewers only when no open attachments remain.
   - Keep this inside the broker runtime for M003 rather than introducing an external supervisor seam now.

3. **Startup recovery + continuity surfaces third**
   - On startup, terminate stale reviewer rows from prior sessions, sweep stale ownership before any reactive scaling/new work, and surface the results through broker CLI/status commands or equivalent typed-client-visible outputs.
   - The operator surface should answer: what was reclaimed, what was detached, what session became stale, what remains ambiguous, and what needs human action.

4. **Real crash/restart proof last**
   - Finish with live proof against one durable SQLite DB: real reviewer process exit while holding work, real broker restart over existing state, and inspectable recovery evidence through broker surfaces.
   - Keep `gsd` compatibility as a downstream invariant, but do not make M002-style gate re-proof the main acceptance harness.

This approach minimizes risk because it follows existing semantics instead of inventing new ones. The prior-art broker already demonstrates the recovery boundary that matters: reclaim aggressively when ownership is unambiguous, detach when it is not, and never hide the reason recovery happened.

## Implementation Landscape

### Key Files

- `docs/standalone-broker-starting-point.md` — still the canonical package-shape document in this repo. It explicitly keeps audit/event modeling in core and reviewer orchestration in the server runtime, which is the right boundary for M003 continuity work.
- `.gsd/milestones/M002/M002-SUMMARY.md` — handoff constraint, not a new target. M003 should preserve the broker state model and downstream `gsd` review seam rather than reopen gating design.
- `/home/cari/repos/gsd-tandem/tools/gsd-review-broker/src/gsd_review_broker/db.py` — strongest prior art for continuity behavior:
  - schema and WAL startup (`reviews`, `audit_events`, `reviewers`, `claim_generation`, `claimed_at`)
  - `_check_claim_timeouts()` at line 361
  - `_check_dead_processes()` at line 381
  - `_startup_terminate_stale_reviewers()` at line 498
  - `_startup_ownership_sweep()` at line 529
  - `broker_lifespan()` at line 568, which runs startup cleanup before background checks
- `/home/cari/repos/gsd-tandem/tools/gsd-review-broker/src/gsd_review_broker/pool.py` — prior art for broker-owned reviewer lifecycle:
  - `spawn_reviewer()` at line 416
  - `drain_reviewer()` at line 610
  - `mark_dead_process_draining()` at line 664
  - `_terminate_reviewer()` at line 722
- `/home/cari/repos/gsd-tandem/tools/gsd-review-broker/src/gsd_review_broker/tools.py` — prior art for continuity-safe state transitions and operator-visible surfaces:
  - `claim_review()` at line 521 uses reservation checks plus `claim_generation`
  - `_maybe_finalize_draining_reviewer()` at line 1000 ensures draining reviewers only terminate after open attachments clear
  - `reclaim_review()` at line 1071 increments `claim_generation` and records recovery reason
  - `list_reviewers()` at line 1260
  - `get_review_status()` at line 1473
  - `get_audit_log()` at line 1898
  - `get_review_stats()` at line 1969
  - `get_review_timeline()` at line 2153
- `/home/cari/repos/gsd-tandem/tools/gsd-review-broker/src/gsd_review_broker/audit.py` — `record_event()` at line 10 shows the right transactional pattern: audit rows are written inside the same DB transaction as the state change.
- `/home/cari/repos/gsd-tandem/tools/gsd-review-broker/src/gsd_review_broker/models.py` — defines the continuity-relevant enums already worth preserving (`ReviewStatus`, `ReviewerStatus`, and `AuditEventType.REVIEW_RECLAIMED`).
- `/home/cari/repos/gsd-tandem/tools/gsd-review-broker/src/gsd_review_broker/server.py` — `stateless_http=True` at lines 216-217 is a useful restart-continuity detail worth preserving so broker restarts do not depend on sticky transport sessions.

### Build Order

1. **Continuity schema and event taxonomy**
   - Recreate the durable broker tables and continuity columns first: reviewer rows, claim metadata, and append-only recovery events.
   - Decide the minimum recovery event taxonomy up front so later slices do not emit ad hoc strings.
   - This unblocks every downstream slice because reclaim/detach/startup sweep all depend on durable evidence.

2. **Claim fencing and reviewer-exit semantics**
   - Rebuild `claim_review`/`reclaim_review` semantics with `claim_generation` fencing first, then dead-process handling.
   - Prove the exact no-limbo rule: safe `claimed` work returns to `pending`; non-claimed attached work is detached and explained, not silently advanced.
   - This is the highest-risk slice because subtle mistakes here create the stranded-state failures M003 exists to eliminate.

3. **Startup sweep before normal runtime work**
   - Port startup stale-reviewer termination and stale-session ownership reclaim before enabling any reactive scaling or queue consumption.
   - The broker must start in a coherent state before it starts new reviewer work.

4. **Continuity-focused CLI/status surfaces**
   - Recreate or adapt the prior-art status/timeline/audit surfaces so recovery is inspectable without dashboard work.
   - Add only the narrow commands that materially help continuity: reviewer/session status, recovery history, and review-level recovery explanation.

5. **Crash/restart proof harness**
   - End with an integration harness that exercises real subprocess exits and broker restart over the same SQLite file.
   - Save inspectable artifacts that make planner/validation work easy later: DB snapshots, broker outputs, recovery timelines, and reviewer status before/after restart.

### Verification Approach

- **Reviewer-exit proof**
  - Start the broker with pool mode enabled.
  - Create a real review, let a real reviewer subprocess claim it, terminate that subprocess, and verify:
    - the review is reclaimed to `pending` if it was still `claimed`, or detached with durable evidence if it was attached in another open state
    - `claim_generation` changes when reclaim occurs
    - audit/timeline surfaces explain the recovery reason
- **Broker-restart proof**
  - Leave stale reviewer/session ownership in the durable DB, restart the broker on the same database, and verify:
    - stale reviewer rows move out of active ownership
    - stale claimed reviews are reclaimed before new work begins
    - restart does not depend on sticky HTTP/session behavior
- **Operator-surface proof**
  - Verify continuity commands/status outputs can show session token, reviewer state, recovery evidence, and current review ownership without reading raw SQLite manually.
- **Minimum observable acceptance**
  - After any exit or restart scenario, there is no review left in unexplained claimed/stale limbo.
  - Every automatic recovery path leaves durable, queryable evidence.
  - Any case the broker cannot safely recover is explicitly visible as operator action required.

## Don't Hand-Roll

| Problem | Existing Solution | Why Use It |
|---------|------------------|------------|
| Recovery evidence | Append-only `audit_events` written in the same transaction as state changes | Prevents “logs say one thing, DB says another” drift and directly supports R010. |
| Stale-claim safety | `claim_generation` fencing in prior-art claim/reclaim flows | Prevents old reviewer/verdict work from applying after a reclaim or restart. |
| Reviewer lifecycle | Broker-owned spawn/drain/terminate registry in `pool.py` | Matches R005 and avoids premature external supervisor design. |
| Restart cleanup ordering | Startup stale-reviewer termination + ownership sweep before reactive scaling | Keeps the runtime coherent before it starts assigning or spawning new work. |

## Constraints

- The current `tandem2` worktree does not contain the expected TypeScript broker implementation yet; M003 planning must account for bootstrap/port work, not just incremental patching.
- Keep reviewer supervision primarily in the broker runtime for this milestone.
- Preserve recognizable lifecycle semantics; only make targeted changes where the continuity proof exposes a real hole.
- M003 acceptance is broker-first. Re-proving the `gsd` gate is optional strengthening evidence, not the main bar.
- Dashboard restoration remains M004 scope; M003 should stop at CLI/status/command surfaces that materially help continuity.

## Common Pitfalls

- **Reclaiming too much on process exit** — prior art only auto-reclaims clearly safe `claimed` work. Non-claimed open reviews should be detached and explained, not silently forced back to `pending`.
- **Running startup scaling before startup cleanup** — if the broker spawns or assigns before stale-session sweep, it can compound ambiguity instead of clearing it.
- **Encoding recovery only in logs** — M003 needs durable audit/state surfaces, not console-only explanations.
- **Dropping claim fencing during the TS port** — reclaim without generation fencing invites stale verdict or stale claimant races after restart.
- **Letting continuity work drift into dashboard scope** — operator visibility matters, but M003 should keep the surface thin and runtime-owned.

## Candidate Requirements

These are advisory additions the planner should consider explicitly rather than silently assuming.

- **Durable recovery reason visibility** — every reclaim, detach, stale-session sweep, and stale-reviewer termination should be queryable through broker surfaces with a machine-readable reason.
- **Claim-generation continuity contract** — stale claims and stale reviewer work should be fenced by a monotonically increasing claim generation, not only by status strings.
- **Startup recovery summary surface** — broker startup should expose how many stale reviewers were terminated and how many reviews were reclaimed so restart behavior is inspectable without raw DB access.

## Open Risks

- Because the TS runtime is not present in this worktree yet, M003 may absorb more “rebuild the missing broker seam” work than the milestone title suggests.
- Porting Python `BEGIN IMMEDIATE` + WAL transaction discipline into the eventual TS SQLite layer is a real correctness risk; continuity bugs will likely be race bugs, not syntax bugs.
- If planner over-optimizes for auto-recovery, it may erase the distinction between safe reclaim and ambiguous detach, which would weaken operator trust.
- If continuity surfaces are added late, validation may have a working recovery engine but poor proofability.

## Skills Discovered

| Technology | Skill | Status |
|------------|-------|--------|
| Node.js backend runtime | `wshobson/agents@nodejs-backend-patterns` | available via `npx skills add wshobson/agents@nodejs-backend-patterns` |
| SQLite | `martinholovsky/claude-skills-generator@sqlite database expert` | available via `npx skills add martinholovsky/claude-skills-generator@sqlite-database-expert` |
| Vitest | `onmax/nuxt-skills@vitest` | available via `npx skills add onmax/nuxt-skills@vitest` |