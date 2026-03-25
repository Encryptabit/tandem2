# M003: Runtime hardening and continuity

**Vision:** Make the standalone broker trustworthy under reviewer exits, stale claims, stale sessions, and broker restart by preserving the recognizable review/reviewer lifecycle, auto-recovering only the cases that are clearly safe, surfacing ambiguous cases explicitly, and giving operators continuity-focused CLI/status commands over the same durable SQLite state.

## Success Criteria

- A real reviewer subprocess can exit while owning work and the broker leaves no review stranded in claimed/stale limbo.
- Timed-out claims and dead-reviewer ownership are recovered conservatively: safe `claimed` work is reclaimed automatically, while ambiguous open attachments are detached and explained instead of being silently advanced.
- A broker restart over one durable SQLite database sweeps stale reviewer/session ownership before new work begins and leaves an inspectable recovery summary.
- Operators can inspect current ownership, recent recovery actions, and any action-required cases through broker CLI/status surfaces without reading raw SQLite or waiting for dashboard work.
- Final acceptance is proven with real reviewer subprocess exits and broker restart against durable state, not only simulated fixtures or in-memory tests.

## Key Risks / Unknowns

- **Recovery semantics drift:** if reclaim vs detach rules or `claim_generation` fencing are wrong, M003 could create new limbo states while trying to remove old ones.
- **Startup ordering:** if stale-session cleanup runs after normal assignment/spawn work begins, restart can compound ambiguity instead of clearing it.
- **Evidence drift:** recovery that is only visible in logs will not satisfy R010 or the milestone’s operator-trust goal.
- **Execution substrate gap:** this planning worktree still shows documents rather than the M001/M002 TypeScript runtime packages, so execution may need to reconstitute the already-decided broker shape in-repo without expanding M003 into a redesign.

## Decomposition Rationale

This roadmap groups the work around the real continuity seams the operator must trust, not around internal layers. The highest-risk behavior is the live recovery contract itself: what happens when a claim times out or a reviewer process dies while it owns work. That is why S01 ships the risky path first as a real broker capability, including durable recovery evidence and inspectable status/timeline output, instead of hiding the semantics inside a foundation-only slice.

S02 then hardens the other half of the milestone promise: restart continuity. Startup sweep behavior is only trustworthy if the broker performs stale-session and stale-reviewer cleanup before it begins new work, and if operators can see what the restart changed. That slice therefore combines startup recovery ordering with the narrow continuity commands and status surfaces the user explicitly asked for.

S03 is an explicit integration closer because this milestone crosses multiple runtime boundaries: live reviewer subprocesses, the broker runtime, SQLite durability, and operator-facing CLI/status surfaces. The milestone is not done when the code compiles or when unit tests pass; it is done when the assembled runtime survives real failure and restart paths without leaving reviews in limbo.

## Proof Strategy

- **Dead-reviewer / stale-claim risk** → retire in **S01** by shipping real reclaim/detach behavior with durable recovery reasons and proving it against live reviewer-process exit plus claim-timeout scenarios.
- **Restart-ordering risk** → retire in **S02** by running stale-reviewer termination and stale-session ownership sweep before new work starts, with startup-visible summary and continuity command coverage.
- **Cross-boundary trust risk** → retire in **S03** by proving the assembled broker across real subprocess exit, broker restart, SQLite persistence, and CLI/status inspection on one durable database.

## Verification Classes

- **Contract verification:** state-transition tests for reclaim/detach rules, `claim_generation` fencing, recovery-reason vocabulary, and continuity command payloads.
- **Runtime integration verification:** real broker process, real reviewer subprocesses, durable SQLite file, and actual subprocess termination/restart scenarios.
- **Operational verification:** startup sweep ordering, stale ownership cleanup, visible action-required cases, and recovery summaries that match persisted state.
- **UAT / operator verification:** broker CLI/status surfaces can explain who owns work, what was reclaimed or detached, why recovery happened, and whether operator intervention is still needed.

## Milestone Definition of Done

This milestone is complete only when all are true:

- all slice deliverables are complete
- no review remains in unexplained claimed/stale limbo after timed-out claim, reviewer exit, or broker restart
- automatic recovery happens only where ownership is unambiguous; ambiguous cases remain explicit and inspectable rather than being hidden by aggressive auto-healing
- recovery evidence is durable and queryable through broker surfaces, not console-log-only
- broker startup performs stale reviewer/session cleanup before normal assignment/spawn work resumes
- final integrated acceptance is re-proved against one durable SQLite database with live reviewer subprocesses and a real broker restart

## Requirement Coverage

- **Directly covers:** R012
- **Strengthens:** R003, R005, R010
- **Relies on earlier milestone owners remaining intact:** R001, R002, R004, R006, R007, R008, R009
- **Leaves for later by existing owner:** R011, R013, R014
- **Orphan risks:** none, but execution must preserve the standalone broker boundary and may need to recreate the already-planned TS runtime surface in this repo before the continuity work can land

### Coverage Summary

| Requirement | M003 disposition | Roadmap owner | Planning note |
|---|---|---|---|
| R001 | not reopened | none | Standalone broker boundary remains fixed from M001 and should not be revisited here. |
| R002 | not reopened | none | Shared typed contracts remain required substrate, but M003 should consume them rather than redesign them. |
| R003 | strengthened | S01, S02, S03 | Continuity proof depends on durable SQLite reclaim/detach evidence and restart-safe cleanup on one DB. |
| R004 | not reopened | none | Lifecycle semantics should stay recognizable; M003 tightens failure handling rather than redesigning the review flow. |
| R005 | strengthened | S01, S02 | Reviewer supervision stays broker-owned and now has to survive exit/drain/restart paths safely. |
| R006 | not reopened | none | Typed client seam remains intact but is not the primary acceptance harness for this milestone. |
| R007 | not reopened | none | MCP remains public surface but continuity proof is broker-first. |
| R008 | not reopened | none | Adapter work shipped in M002 and should not be pulled back into broker core. |
| R009 | not reopened | none | `gsd` gate compatibility is preserved downstream, but M003 acceptance stays broker-first. |
| R010 | strengthened | S01, S02, S03 | Recovery evidence, reviewer state, startup summary, and action-required visibility become first-class runtime surfaces. |
| R011 | out of milestone scope | none | Dashboard/operator UI work stays in M004; M003 stops at CLI/status and continuity-focused commands. |
| R012 | mapped | S01 primary, S02/S03 support | Safe reclaim/detach, startup stale-session sweep, and live crash/restart continuity are the core of this milestone. |

## Slices

- [x] **S01: Reviewer-exit and stale-claim recovery** `risk:high` `depends:[]`
  > Demo: a real review can be reclaimed from a timed-out claim or dead reviewer without staying in limbo, and broker status/timeline surfaces show whether the broker reclaimed or detached the work and why.

- [x] **S02: Restart sweep and continuity commands** `risk:high` `depends:[S01]`
  > Demo: restarting the broker against a stale SQLite database clears stale reviewer/session ownership before new work begins, and operators can inspect startup recovery summary, current ownership, and action-required cases through broker CLI/status commands.

- [x] **S03: End-to-end crash/restart continuity proof** `risk:medium` `depends:[S01,S02]`
  > Demo: the assembled broker survives real reviewer exits and broker restart on one durable database, and the shipped continuity surfaces verify coherent post-restart state without raw DB inspection.

## Slice Proof and Verification Notes

### S01

- **Scope:** implement or restore the continuity contract for timed-out claims and dead reviewer ownership, including `claimed_at`, `claim_generation` fencing, explicit recovery reasons, reclaim-vs-detach rules, reviewer death detection, and durable audit/timeline/status evidence.
- **Proof strategy:** ship the riskiest user-visible behavior first by making live reviewer exit and stale-claim recovery a real runtime capability, not a follow-up cleanup pass.
- **Verification classes:** contract tests for reclaim/detach transitions and fencing; runtime tests or scripted proof runs that terminate a real reviewer subprocess while it owns work; status/audit assertions proving durable explanation of the recovery path.
- **Requirement coverage:** R012 primary; strengthens R003, R005, R010.

### S02

- **Scope:** add startup stale-reviewer termination, stale-session ownership sweep, startup recovery ordering, recovery summary surfaces, and the narrow continuity-focused broker CLI/status commands needed to inspect review ownership, reviewer state, recent recovery events, and operator-action-required conditions.
- **Proof strategy:** make restart behavior observable and trustworthy, because restart cleanup without operator visibility does not satisfy the milestone even if the DB rows eventually look correct.
- **Verification classes:** startup/restart integration runs against a pre-populated SQLite file, command/output checks for startup summary and recovery history, and assertions that cleanup occurs before new assignment/spawn work.
- **Requirement coverage:** supports R012; strengthens R003, R005, R010.

### S03

- **Scope:** close the milestone with an assembled continuity proof that exercises live reviewer exit, broker shutdown/restart, stale-session sweep, and operator-visible recovery inspection on one durable database.
- **Proof strategy:** prove the system through the real runtime boundaries the milestone claims to harden instead of stopping at isolated recovery helpers or purely in-memory tests.
- **Verification classes:** end-to-end local proof run, persisted SQLite evidence, broker CLI/status confirmation, and artifact capture that shows no review stranded in claimed/stale limbo after crash or restart.
- **Requirement coverage:** supports R012 and R010 while re-proving R003 in harder lifecycle conditions.

## Boundary Map

### S01 → S02

Produces:
- continuity-safe review ownership contract for timed-out claims and dead reviewers
- `claim_generation` and claim-timestamp fencing that later restart logic can trust
- durable recovery reason taxonomy recorded in the same state transitions as reclaim/detach actions
- inspectable review/reviewer status and timeline evidence for recovery events

Consumes:
- the standalone broker/runtime boundary and shared typed contract established by M001
- broker-owned reviewer supervision from M001, preserved rather than externalized
- durable SQLite persistence as the system of record

### S02 → S03

Produces:
- startup stale-reviewer termination and stale-session ownership sweep that run before normal work resumes
- continuity-focused CLI/status/command surfaces for startup summary, recovery history, and current ownership inspection
- explicit operator-action-required visibility for cases auto-recovery cannot safely resolve

Consumes from S01:
- reclaim/detach contract, recovery reason taxonomy, and inspectable status/audit surfaces

Consumes:
- durable SQLite state from the prior runtime
- broker startup/lifespan wiring and reviewer pool ownership

### External runtime boundaries proved by S03

- **Reviewer subprocess boundary:** broker-owned reviewers can exit or be terminated while owning work without leaving the review stranded.
- **SQLite durability boundary:** the same on-disk database preserves review ownership, recovery evidence, and post-restart coherence.
- **Broker startup boundary:** restart cleanup happens before new work begins.
- **Operator surface boundary:** broker CLI/status commands expose enough state to inspect recovery without reading raw database files.
- **Downstream compatibility boundary:** the broker state model remains recognizable for later `gsd` consumption, but `gsd` is not the primary acceptance harness for this milestone.

## Milestone Final Integrated Acceptance

M003 closes only when the assembled system proves all of the following in a real local environment:

1. A live reviewer subprocess can claim or own work, exit, and leave the broker in a coherent recoverable state instead of claimed/stale limbo.
2. Safe `claimed` work is reclaimed automatically; ambiguous open work is detached and explicitly explained rather than silently forced forward.
3. A broker restart on the same SQLite database terminates stale reviewer/session ownership and performs the ownership sweep before normal work resumes.
4. Operators can inspect the resulting state through broker CLI/status/command surfaces, including what was reclaimed, what was detached, why recovery happened, and whether any operator action is still required.
5. The final proof is based on real subprocess exits and broker restart against durable state, not only simulated tests or fixture-only evidence.
