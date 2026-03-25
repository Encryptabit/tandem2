# M003: Runtime hardening and continuity

**Gathered:** 2026-03-23
**Status:** Ready for planning

## Project Description

`tandem2` is the standalone TypeScript review broker that replaced the old Python-hosted direction with a broker-first runtime, shared typed contracts, durable SQLite state, broker-owned reviewer lifecycle, and a direct typed integration seam for `gsd` review gating.

## Why This Milestone

The broker is functionally there, but it is not trustworthy enough if reviewer exits, stale claims, stale sessions, reclaim paths, or broker restarts can leave reviews stranded or ambiguous. M003 exists to turn reviewer/process failure handling into first-class product behavior now that standalone broker parity and the initial `gsd` integration seam have both been proven.

## User-Visible Outcome

### When this milestone is complete, the user can:

- run the broker through real reviewer-process exits and broker restarts without leaving reviews in claimed/stale limbo
- inspect and drive recovery through broker CLI/status surfaces and continuity-focused commands without needing dashboard work to land first

### Entry point / environment

- Entry point: standalone broker runtime plus broker CLI/status and continuity-focused command surfaces
- Environment: local dev / production-like local runtime with real reviewer subprocesses and durable SQLite state
- Live dependencies involved: SQLite, reviewer subprocesses, existing `gsd` typed-client integration seam as a downstream consumer (not the primary acceptance harness)

## Completion Class

- Contract complete means: current review and reviewer lifecycle semantics remain recognizable, continuity behavior is hardened without broad redesign, and new recovery/status surfaces are inspectable and mechanically testable
- Integration complete means: the broker runtime can recover and continue correctly across real subprocess exits, stale ownership, and broker restart on one durable database, with `gsd` left able to consume the same broker state model afterward
- Operational complete means: reviews do not stay stranded in claimed/stale limbo after crash or restart, recovery outcomes are visible, and operator action is explicit when automatic recovery cannot proceed safely

## Final Integrated Acceptance

To call this milestone complete, we must prove:

- a real reviewer subprocess can exit while owning work, and the broker reclaims or detaches that work safely without leaving unrecoverable limbo on the durable SQLite database
- a broker restart can sweep stale reviewer/session ownership, preserve inspectable recovery evidence, and leave the runtime in a coherent post-restart state
- continuity proof is real crash/restart proof against live subprocesses and durable state, not only simulated tests or in-memory fixtures

## Risks and Unknowns

- auto-recovery can become unsafe if ownership semantics are ambiguous — M003 should recover aggressively when safe, but not by hiding uncertainty
- keeping supervision in the broker preserves momentum, but weak seams could make later evolution harder if the runtime boundary stays muddy
- adding operator commands could drift into dashboard/tooling work if the milestone stops being continuity-first
- no-broad-redesign is the right constraint for now, but current semantics may still expose a narrow failure case that forces targeted changes

## Existing Codebase / Prior Art

- `../gsd-tandem/tools/gsd-review-broker/src/gsd_review_broker/db.py` — prior-art startup recovery, stale reviewer termination, stale-session ownership sweep, claim timeout reclaim, idle/TTL draining, and periodic recovery checks
- `../gsd-tandem/tools/gsd-review-broker/src/gsd_review_broker/pool.py` — prior-art in-process reviewer supervision, drain/terminate behavior, and subprocess registry shape that M003 is likely to preserve rather than externalize
- `../gsd-tandem/tools/gsd-review-broker/src/gsd_review_broker/audit.py` — prior-art durable event recording model that informs inspectable recovery surfaces
- `.gsd/milestones/M001/M001-SUMMARY.md` — proof that standalone broker parity, reviewer lifecycle, typed client, and MCP surface already shipped
- `.gsd/milestones/M002/M002-SUMMARY.md` — proof that `gsd` review-before-progression gating and paused/restart visibility already shipped, so M003 can stay broker-first for acceptance

> See `.gsd/DECISIONS.md` for all architectural and pattern decisions — it is an append-only register; read it during planning, append to it during execution.

## Relevant Requirements

- R012 — this is the primary milestone owner for timed-out claims, reviewer exits, stale sessions, and recovery out of limbo
- R010 — M003 strengthens broker audit and failure visibility around stuck reviews, crashed reviewers, reclaim paths, and restart continuity
- R003 — M003 depends on and further proves durable SQLite-backed restart-safe state under harder lifecycle conditions
- R005 — M003 hardens the broker-owned reviewer lifecycle rather than moving supervision out of the runtime

## Scope

### In Scope

- automatic recovery for safe reviewer-exit, stale-session, and stale-claim cases
- broker-first continuity proof using real reviewer subprocess exits and broker restart against durable SQLite state
- continuity-focused broker CLI/status and command surfaces that materially help inspection and recovery
- preserving or deliberately tightening reclaim/detach behavior from the Python broker where needed to avoid limbo
- durable operator-visible recovery evidence instead of noisy logging-only behavior

### Out of Scope / Non-Goals

- dashboard/operator UI work that belongs in M004
- broad redesign of review or reviewer lifecycle semantics
- making `gsd` re-proof the primary acceptance bar for this milestone
- moving reviewer supervision to a separate external service/process manager in M003
- review-before-commit work or other workflow-gate redesign beyond continuity hardening

## Technical Constraints

- keep reviewer supervision primarily in the broker for this milestone
- stay conservative about lifecycle semantics; only make targeted changes if current behavior fails the continuity proof bar
- optimize for both operator clarity and auto-flow continuity, not one at the expense of the other
- the user wants to discuss the next milestone as well so auto mode can go through all milestones; that sequencing goal should not expand M003 beyond runtime hardening and continuity

## Integration Points

- reviewer subprocesses — M003 must supervise, detect exits, drain/terminate safely, and recover claimed work without limbo
- SQLite broker state — M003 must prove restart-safe ownership cleanup, reclaim behavior, and durable recovery evidence on one real database
- broker CLI/status surfaces — M003 should expose recovery state clearly enough for operators to inspect and act without waiting for dashboard work
- `gsd` typed-client integration seam — M003 should preserve downstream compatibility with the broker state model, but broker continuity proof remains the primary acceptance harness

## Open Questions

- which exact new continuity-focused commands belong in M003 versus later operator tooling — current thinking: include only commands that materially help inspection or recovery, not general management UX
- whether current claim/reclaim semantics already cover all no-limbo cases or need a narrow targeted adjustment — current thinking: start from parity, then tighten only where proof exposes a real hole
- how much durable recovery evidence should be surfaced in command output versus stored for later inspection — current thinking: enough to explain why recovery happened or paused without turning the runtime into a noisy log sink
