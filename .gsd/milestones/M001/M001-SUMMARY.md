---
id: M001
title: Standalone broker parity
status: complete
verification_verdict: pass
completed_on: 2026-03-21
validated_requirements:
  - R001
  - R002
  - R003
  - R004
  - R005
  - R006
  - R007
  - R010
advanced_requirements:
  - R012
requirement_outcomes:
  - id: R001
    from_status: active
    to_status: validated
    proof: "Validated in S05 and re-checked at milestone closeout via `broker:parity`, `broker:smoke`, and the assembled regression pack, proving one durable SQLite database can be exercised through the standalone runtime, typed client, and real stdio MCP without embedding broker logic in `gsd-2`."
  - id: R002
    from_status: active
    to_status: validated
    proof: "Validated in S01 by establishing `packages/review-broker-core` as the canonical shared contract package and re-used in S04 across the typed client and MCP registry without redefining schemas per consumer."
  - id: R003
    from_status: active
    to_status: validated
    proof: "Validated in S01 with SQLite bootstrap/migration/restart tests and re-proved in S05 through restart-safe end-to-end parity against one durable database file."
  - id: R004
    from_status: active
    to_status: validated
    proof: "Validated in S02 through lifecycle parity tests for discussion, verdict, requeue, close, and counter-patch behavior, then re-checked in the milestone regression pack and S05 assembled parity flow."
  - id: R005
    from_status: active
    to_status: validated
    proof: "Validated in S03 through reviewer spawn/list/kill, exit/kill/startup recovery, durable reviewer state, and reviewer-aware CLI inspection; re-confirmed by S05 startup-recovery parity assertions across standalone inspection, MCP, and typed-client reads."
  - id: R006
    from_status: active
    to_status: validated
    proof: "Validated in S04 by shipping `packages/review-broker-client` over the shared operation registry and re-checking the client path in the milestone regression pack and S05 parity flow."
  - id: R007
    from_status: active
    to_status: validated
    proof: "Validated in S04 by shipping the registry-driven stdio MCP server, `.mcp.json` discovery wiring, MCP transport tests, and client/MCP shared-runtime parity proof; re-checked in S05 and the milestone regression pack."
  - id: R010
    from_status: active
    to_status: validated
    proof: "Validated across S03 and S05 by durable audit/reviewer persistence, `inspectBrokerRuntime()`, structured `start-broker.ts --once` JSON, reviewer recovery visibility, redaction-safe MCP stderr diagnostics, and assembled end-to-end parity proof."
---

# M001: Standalone broker parity

## Outcome
M001 is complete and passes verification. The project now has a standalone TypeScript broker runtime with durable SQLite-backed state, canonical shared TypeScript contracts, full review lifecycle parity, broker-owned reviewer lifecycle and recovery, a direct typed client, and a public stdio MCP surface. Final assembled proof shows those surfaces converge on one persisted state model across restart and recovery instead of behaving like isolated subsystems.

## What shipped in this milestone
- `packages/review-broker-core` became the canonical shared contract and operation registry for review and reviewer flows.
- `packages/review-broker-server` now owns the standalone broker runtime, SQLite bootstrap/migrations, lifecycle repositories, reviewer process management, `start-broker.ts`, and `start-mcp.ts`.
- `packages/review-broker-client` now provides the deterministic typed integration seam over the same shared contract.
- Review lifecycle parity now covers create, claim, proposal, discussion, verdict, close, requeue, activity, and counter-patch decisions.
- Reviewer lifecycle parity now covers spawn/list/kill, offline transitions, operator kill, unexpected exit, startup recovery, and reclaim fencing.
- Final assembled parity proof now exercises one absolute SQLite database through typed-client mutations, real stdio MCP reopen/mutations, standalone `--once` inspection, and restart recovery.

## Success criteria verification

### 1. A standalone TypeScript broker can be started locally and exercised without depending on the old Python broker
**Result:** met

**Evidence**
- S01 delivered `startBroker()` and `packages/review-broker-server/src/cli/start-broker.ts`.
- Closeout rerun: `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 broker:smoke` passed and emitted `broker.started` / `broker.once_complete` JSON with migrations `001_init`, `002_review_lifecycle_parity`, and `003_reviewer_lifecycle`.
- S05 validated final assembled restart-safe behavior through `broker:parity`.

### 2. Review lifecycle operations preserve the current contract closely enough that parity-oriented tests and end-to-end scenarios pass against the new runtime
**Result:** met

**Evidence**
- S02 validated create → claim → discussion → `changes_requested` → proposer follow-up requeue and create → claim → approved → close, including invalid-transition inspectability.
- Closeout rerun: the regression pack passed `packages/review-broker-server/test/review-lifecycle-parity.test.ts`.
- Closeout rerun: `broker:parity` passed both end-to-end tests, including restart-safe lifecycle parity across typed client, real stdio MCP, typed reopen, and standalone inspection.

### 3. Reviewer lifecycle operations exist in the standalone broker and work under real local runtime conditions
**Result:** met

**Evidence**
- S03 validated broker-owned `spawnReviewer`, `listReviewers`, and `killReviewer`, plus recovery on reviewer exit, operator kill, and startup reconciliation.
- Closeout rerun: the regression pack passed `packages/review-broker-server/test/reviewer-lifecycle.test.ts` and `packages/review-broker-server/test/reviewer-recovery.test.ts`.
- S05 re-proved startup recovery and reviewer visibility in the assembled parity harness.

### 4. Shared TypeScript domain types are used across broker and client package boundaries instead of re-describing schemas per consumer
**Result:** met

**Evidence**
- S01 established `packages/review-broker-core` as the canonical shared type/schema package.
- S04 added `BROKER_OPERATIONS`, a derived typed client, and a registry-driven MCP surface that both consume the same request/response schemas.
- Closeout rerun: the regression pack passed `packages/review-broker-client/test/in-process-client.test.ts`, `packages/review-broker-server/test/client-mcp-parity.test.ts`, and `packages/review-broker-server/test/mcp-server.test.ts`.

### 5. The assembled broker, persistence layer, reviewer lifecycle handling, typed client, and MCP surface work together against one durable runtime state
**Result:** met

**Evidence**
- S04 proved typed-client/MCP shared-state parity and cross-surface wait semantics.
- S05 added the milestone-closing acceptance harness for restart-safe lifecycle parity and startup-recovery parity on one durable SQLite file.
- Closeout rerun: `broker:parity` passed both assembled end-to-end tests, and the regression pack passed 7 files / 18 tests covering typed client, MCP, lifecycle parity, reviewer lifecycle, reviewer recovery, and standalone smoke inspection.

### Criteria not met
None.

## Definition of done verification
- **All slice deliverables complete:** verified. `find .gsd/milestones/M001 -maxdepth 3 -type f` shows S01-S05 summary files present.
- **Shared components wired together:** verified by S04 client/MCP parity proof and S05 assembled parity harness.
- **Real entrypoint exists and is exercised:** verified by live `broker:smoke` rerun through `start-broker.ts --once`.
- **Success criteria re-checked against live behavior:** verified by the closeout reruns listed below.
- **Final integrated acceptance scenarios pass:** verified by live `broker:parity` rerun.

## Live closeout verification performed
1. `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 broker:parity`
   - Result: pass
   - Evidence: `packages/review-broker-server/test/end-to-end-standalone-parity.test.ts` passed 2/2 tests.
2. `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 broker:smoke`
   - Result: pass
   - Evidence: emitted structured `broker.started` and `broker.once_complete` JSON with `migrationCount: 3` and an empty fresh-DB `startupRecovery` snapshot.
3. `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-server/test/client-mcp-parity.test.ts packages/review-broker-server/test/review-lifecycle-parity.test.ts packages/review-broker-server/test/reviewer-lifecycle.test.ts packages/review-broker-server/test/reviewer-recovery.test.ts packages/review-broker-server/test/start-broker.smoke.test.ts packages/review-broker-client/test/in-process-client.test.ts packages/review-broker-server/test/mcp-server.test.ts`
   - Result: pass
   - Evidence: 7 files passed, 18 tests passed.

## Requirement status transitions
The following milestone-owned transitions are supported by slice evidence and closeout verification:

| Requirement | Transition | Proof summary |
| --- | --- | --- |
| R001 | active → validated | S05 assembled parity proof plus closeout `broker:parity`, `broker:smoke`, and regression reruns prove the standalone broker runtime works independently of `gsd-2`. |
| R002 | active → validated | S01 established shared `review-broker-core` contracts; S04 reused them across client and MCP instead of redefining consumer schemas. |
| R003 | active → validated | S01 proved SQLite bootstrap/migration/restart behavior; S05 re-proved restart-safe persistence in assembled parity. |
| R004 | active → validated | S02 proved lifecycle parity and inspectable failure paths; closeout reruns kept the lifecycle parity suite green. |
| R005 | active → validated | S03 proved broker-owned reviewer lifecycle and recovery; S05 re-confirmed startup-recovery parity and reviewer visibility. |
| R006 | active → validated | S04 shipped the typed client over the shared operation registry and re-proved it in the milestone regression pack and S05 parity. |
| R007 | active → validated | S04 shipped the public stdio MCP surface and proved it against the same runtime contract as the typed client. |
| R010 | active → validated | S03 and S05 proved operator-visible audit/reviewer/failure inspection, including redaction-safe CLI/MCP diagnostics. |

## Cross-slice integration verification
No cross-slice integration gaps were found.

- **S01 → S02/S03:** S02 and S03 extended S01 through additive migrations instead of redefining state or contracts.
- **S02 → S03:** reviewer recovery preserved lifecycle semantics by reclaiming only limbo-prone `claimed` / `submitted` reviews and recording durable rejection evidence on stale races.
- **S02/S03 → S04:** the typed client and MCP surface derive from one shared operation registry and preserve the same lifecycle/reviewer/wait vocabulary.
- **S04 → S05:** final assembled proof re-opened the same durable DB through typed client, real stdio MCP, and standalone inspection without drift.

## Requirement coverage result
- **Validated in M001:** R001, R002, R003, R004, R005, R006, R007, R010
- **Advanced but not closed:** R012
- **Intentionally left for later milestones:** R008, R009, R011, R013, R014
- **Out of scope for M001:** R015, R016, R017

## Reusable lessons from the milestone
- Keep `BROKER_OPERATIONS` as the single source of truth linking broker methods, MCP tool names, and shared request/response schemas.
- Treat reviewer assignment as a derived view over reviewer liveness plus `reviews.claimed_by`, not a second persisted source of truth.
- Fence recovery with `expectedClaimGeneration`, `expectedStatus`, and `expectedClaimedBy`; claim generation alone is not enough once reviewer recovery becomes real.
- Use the standalone `start-broker.ts --once` path as the fastest redaction-safe operational inspection surface.
- For final cross-surface parity proof, reopen the same absolute SQLite file through supported runtimes instead of inventing a new transport.

## Remaining gaps / next milestone handoff
M001 leaves adapter-based `.gsd` / `gsd-2` integration, review-before-progression gating, broader continuity hardening, and the thin operator dashboard to later milestones. M002 should consume the typed client as the deterministic integration seam and reuse `broker:parity` before changing the contract or wiring.

## Bottom line
M001 achieved standalone broker parity. The standalone TypeScript broker, durable SQLite state, lifecycle contract, reviewer recovery, typed client, MCP surface, and redaction-safe inspection are now mechanically proven together rather than only by slice-local artifacts.
