# M001: Standalone broker parity

**Gathered:** 2026-03-21
**Status:** Ready for planning

## Project Description

Build `tandem2` as a standalone TypeScript broker on Pi SDK concepts, not as logic embedded inside a `gsd-2` fork. This milestone is the broker-first rewrite: preserve the current Python broker's lifecycle semantics, SQLite-backed durable state, reviewer lifecycle surface, and public contract while moving the system onto shared TypeScript types and a typed client package.

## Why This Milestone

The host boundary is already decided. The broker needs to exist as its own TypeScript product before it is worth doing deeper `gsd-2` workflow integration, dashboard restoration, or runtime hardening work. Replacing the broker runtime first keeps the rewrite compatibility-focused instead of turning it into a redesign. It also proves the one thing the whole project depends on: that the current tandem review contract can live as a standalone TS runtime without being collapsed into a `gsd-2` fork.

## User-Visible Outcome

### When this milestone is complete, the user can:

- start a standalone TypeScript broker locally and drive the preserved review contract against durable SQLite-backed state
- create, claim, review, close, inspect, and manage reviews and reviewer lifecycle operations through the new broker surfaces without depending on the old Python broker

### Entry point / environment

- Entry point: standalone broker service plus typed client and MCP-accessible broker surface
- Environment: local dev
- Live dependencies involved: SQLite database, reviewer subprocess/runtime management, MCP transport

## Completion Class

- Contract complete means: parity-oriented tests and artifact checks prove the preserved review and reviewer operations exist with real implementation and shared types
- Integration complete means: the standalone broker, SQLite persistence, reviewer lifecycle handling, typed client, and MCP surface work together against the same runtime state
- Operational complete means: restart-safe persistence, schema migration handling, and visible reviewer/process failure handling work in a real local lifecycle

## Final Integrated Acceptance

To call this milestone complete, we must prove:

- a local standalone broker can be started, exercised through its intended entrypoints, and queried through the typed client against durable state
- preserved review lifecycle operations work end-to-end, including review creation, claim, verdict flow, proposal/discussion access, and close/requeue paths
- reviewer lifecycle operations work in the assembled system, including spawn/list/kill visibility and recovery-oriented state handling under local runtime conditions

## Risks and Unknowns

- Behavior parity drift — the rewrite could accidentally simplify or reinterpret hard-won broker semantics if the contract is not frozen carefully enough
- Reviewer lifecycle complexity — reviewer spawn/reclaim/kill behavior is part of the real broker contract, not incidental plumbing
- Over-generalization too early — adapter-friendly architecture could drift into redesigned semantics if the compatibility bar is not kept explicit
- Multi-surface assembly risk — server, SQLite state, reviewer lifecycle, typed client, and MCP exposure can all work separately and still fail when assembled

## Existing Codebase / Prior Art

- `docs/standalone-broker-starting-point.md` — current intent statement for `tandem2` and the accepted v1 scope boundary
- `../gsd-tandem/tools/gsd-review-broker/src/gsd_review_broker/tools.py` — current review and reviewer lifecycle contract surface
- `../gsd-tandem/tools/gsd-review-broker/src/gsd_review_broker/db.py` — current SQLite schema, migrations, startup recovery, and continuity logic
- `../gsd-tandem/tools/gsd-review-broker/src/gsd_review_broker/pool.py` — current reviewer process orchestration and lifecycle behavior
- `../gsd-tandem/tools/gsd-review-broker/src/gsd_review_broker/models.py` — existing domain enums and model vocabulary
- `../gsd-tandem/tools/gsd-review-broker/src/gsd_review_broker/state_machine.py` — current explicit review lifecycle transition rules
- `../gsd-tandem/tools/gsd-review-broker/dashboard` — existing Astro-based dashboard that captures prior operator UI decisions, deferred beyond M001
- `../gsd-tandem/review-broker-ts-standalone.md` — prior standalone TypeScript broker recommendation aligned with the current direction
- `../gsd-tandem/docs/gsd2-broker-integration-findings.md` — current `gsd-2` integration constraints and why M001 should remain broker-first

> See `.gsd/DECISIONS.md` for all architectural and pattern decisions — it is an append-only register; read it during planning, append to it during execution.

## Relevant Requirements

- R001 — establishes the standalone broker runtime as the first real product boundary
- R002 — introduces the shared typed review domain that later packages will consume
- R003 — proves durable SQLite-backed broker state in the new runtime
- R004 — preserves the current review lifecycle contract first
- R005 — preserves reviewer lifecycle management as part of the broker, not a later add-on
- R006 — provides the typed client that later `gsd-2` integration will depend on
- R007 — preserves MCP as a public integration surface
- R010 — carries audit trail and failure visibility into the rewrite rather than dropping them

## Scope

### In Scope

- standalone TS broker/runtime package shape
- shared TypeScript domain types and validation
- SQLite persistence and migration handling
- preserved review lifecycle contract surface
- preserved reviewer lifecycle surface
- typed client package
- MCP exposure for the broker
- end-to-end parity proof for the assembled standalone system

### Out of Scope / Non-Goals

- embedding broker logic inside a `gsd-2` fork
- `gsd-2` review-before-progression gating work
- review-before-commit pipeline refactor
- dashboard restoration or operator UI completion
- broad harness redesign beyond what parity and adapter seams require

## Technical Constraints

- Compatibility is more important than redesign in the first iteration.
- The broker should preserve the current Python contract first, then evolve deliberately.
- SQLite is the first persistence target and should retain migration/restart discipline.
- MCP remains supported, but deterministic integration must prefer a direct typed client.
- The rewrite should stay adapter-based instead of hardcoding `gsd-2` file-layout assumptions into the core.

## Integration Points

- Python broker prior art — compatibility source for runtime contract and lifecycle behavior
- SQLite — durable state, migrations, and restart continuity
- reviewer subprocess/runtime management — reviewer lifecycle operations and recovery behavior
- MCP transport — public broker surface for manual/tool/LLM access
- future `gsd-2` integration — downstream typed-client consumer, intentionally deferred to M002

## Open Questions

- How much of the existing reviewer orchestration internals needs literal parity versus contract-compatible replacement? — M001 requires the surface and behavior class, but some internal implementation details may still evolve
- What is the cleanest package and transport split for server/client/core without recreating unnecessary coupling? — use parity and shared types as the main guardrail
- Which parity tests should freeze the Python contract before implementation begins? — this is the first planning pressure point for the milestone
