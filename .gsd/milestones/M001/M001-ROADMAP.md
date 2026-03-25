# M001: Standalone broker parity

**Vision:** Rebuild the current tandem broker as a standalone TypeScript runtime with shared types, durable SQLite-backed state, preserved review and reviewer lifecycle semantics, and both typed-client and MCP access surfaces — without embedding broker logic inside a `gsd-2` fork.

## Success Criteria

- A standalone TypeScript broker can be started locally and exercised without depending on the old Python broker.
- Review lifecycle operations preserve the current contract closely enough that parity-oriented tests and end-to-end scenarios pass against the new runtime.
- Reviewer lifecycle operations exist in the standalone broker and work under real local runtime conditions.
- Shared TypeScript domain types are used across broker and client package boundaries instead of re-describing schemas per consumer.
- The assembled broker, persistence layer, reviewer lifecycle handling, typed client, and MCP surface work together against one durable runtime state.

## Key Risks / Unknowns

- Behavior parity drift — the rewrite could simplify or reinterpret current broker semantics and break downstream expectations.
- Reviewer lifecycle complexity — spawn/reclaim/kill behavior may look peripheral but is part of the actual contract and failure story.
- Cross-surface mismatch — shared types, runtime state, typed client, and MCP exposure can drift if not proven together.
- Restart and migration gaps — SQLite state can appear functional until restart, migration, or stale-session recovery paths are exercised.

## Proof Strategy

- Behavior parity drift → retire in S02 by proving preserved lifecycle operations against parity-oriented tests and end-to-end verdict/discussion scenarios.
- Reviewer lifecycle complexity → retire in S03 by proving reviewer spawn/list/kill plus recovery-oriented state handling in a real local runtime.
- Cross-surface mismatch → retire in S04 by proving typed client and MCP interactions operate against the same broker contract and shared domain types.
- Restart and migration gaps → retire in S05 by proving the assembled system survives restart and still passes integrated parity scenarios.

## Verification Classes

- Contract verification: tests, fixture-driven parity checks, artifact checks for shared exports and real implementations
- Integration verification: real local broker process, SQLite persistence, reviewer lifecycle operations, typed client calls, and MCP transport exercised together
- Operational verification: restart-safe persistence, migration handling, and recovery-oriented reviewer/process behavior
- UAT / human verification: none for M001; this milestone should be mechanically provable in local runtime conditions

## Milestone Definition of Done

This milestone is complete only when all are true:

- all slice deliverables are complete
- shared components are actually wired together
- the real entrypoint exists and is exercised
- success criteria are re-checked against live behavior, not just artifacts
- final integrated acceptance scenarios pass

## Requirement Coverage

- Covers: R001, R002, R003, R004, R005, R006, R007, R010
- Partially covers: R012
- Leaves for later: R008, R009, R011, R013, R014
- Orphan risks: none

## Slices

- [x] **S01: Broker core runtime with durable state** `risk:high` `depends:[]`
  > After this: a standalone TS broker can create, claim, inspect, and persist reviews across restarts using shared types and SQLite.

- [x] **S02: Full review lifecycle parity** `risk:high` `depends:[S01]`
  > After this: the standalone broker handles verdicts, proposal retrieval, discussion flow, close/requeue behavior, and counter-patch decisions with contract-level proof.

- [x] **S03: Reviewer lifecycle and recovery** `risk:high` `depends:[S01,S02]`
  > After this: reviewer spawn/list/kill plus reclaim/recovery behavior work in a real local runtime, and failure signals are visible through broker state and audit surfaces.

- [x] **S04: Typed client and MCP exposure** `risk:medium` `depends:[S02,S03]`
  > After this: a TS client and MCP surface can both drive the broker contract without redefining schemas in each caller.

- [x] **S05: End-to-end standalone parity proof** `risk:medium` `depends:[S01,S02,S03,S04]`
  > After this: the assembled standalone system passes parity-oriented end-to-end scenarios across server, persistence, reviewer lifecycle, and client surfaces.

## Boundary Map

### S01 → S02

Produces:
- shared review domain types and enums for review status, reviewer status, category, priority, and audit event vocabulary
- standalone broker create/claim/status/list/proposal state surfaces backed by SQLite
- persisted review, message, and migration model shape for the new runtime
- explicit review state-machine validation in TypeScript

Consumes:
- nothing (first slice)

### S01 → S03

Produces:
- durable broker app context with SQLite access, locking, startup wiring, and restart-safe state loading
- broker-owned persisted state surfaces that reviewer lifecycle and recovery logic can attach to
- audit/event persistence primitives for lifecycle events

Consumes:
- nothing (first slice)

### S02 → S03

Produces:
- full review lifecycle transitions for verdict, close, discussion, requeue, and counter-patch decisions
- persisted message/discussion flow and activity-feed model
- parity tests that define the preserved review contract beyond create/claim basics

Consumes from S01:
- shared review domain types and state-machine primitives
- persisted review/message tables and broker runtime wiring

### S02 → S04

Produces:
- stable broker operation payloads and response shapes for lifecycle tools and client calls
- contract vocabulary for proposal retrieval, discussion access, and activity/status queries

Consumes from S01:
- broker runtime entrypoint and shared types

### S03 → S04

Produces:
- reviewer lifecycle payloads for spawn/list/kill and reviewer-state inspection
- recovery/failure visibility model for crashed or reclaimed reviewer work
- audit/event signals that external clients can observe consistently

Consumes from S01:
- broker runtime and durable state

Consumes from S02:
- stable review lifecycle payloads and activity model

### S04 → S05

Produces:
- typed TS client package that exercises the shared contract directly
- MCP-accessible broker surface that maps onto the same contract vocabulary
- cross-surface tests proving client and MCP calls operate against one broker state model

Consumes from S02:
- stable lifecycle payloads and operation contract

Consumes from S03:
- reviewer lifecycle and audit visibility payloads
