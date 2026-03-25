# M002: GSD2 integration and review gating

**Gathered:** 2026-03-21
**Status:** Ready for planning

## Project Description

This milestone is the thin, explicit `gsd-2` integration layer for the standalone broker proved in M001. The broker remains standalone as a separate broker process. `gsd-2` consumes it through a deterministic direct typed-client path, with a thin explicit patch to the bundled `gsd` extension where hard workflow gating needs it.

## Why This Milestone

M001 proved the broker can stand on its own, but that does not yet make it useful enough inside the real `gsd-2` workflow. M002 exists to make the standalone broker matter in practice by wiring it into the workflow that actually runs the work.

The accepted v1 tradeoff remains the same: preserve post-commit review semantics and implement review-before-progression first, not review-before-commit. That gives a meaningful gate without forcing an immediate refactor of the current finalize pipeline.

## User-Visible Outcome

### When this milestone is complete, the user can:

- run work through `gsd-2` and have a real review-before-progression gate that uses the standalone broker instead of an imagined future integration
- manually trigger review and see review status / decision visibility from inside `gsd-2`

### Entry point / environment

- Entry point: the bundled `gsd` extension inside `gsd-2`, including the auto pipeline and manual review/status commands
- Environment: local dev, real `gsd-2` auto-mode and human-driven runs
- Live dependencies involved: standalone broker process, typed client connection, broker SQLite state, reviewer subprocess/runtime behavior

## Completion Class

- Contract complete means: `gsd-2` has a real typed-client integration surface for broker-backed review trigger/status/gate behavior, with a preference/config surface for gate behavior rather than hardcoded one-off logic
- Integration complete means: the bundled `gsd` extension can talk to the separate broker process, manual review trigger/status flows work from inside `gsd-2`, and review-before-progression actually controls the real auto pipeline
- Operational complete means: the gate works under real local runtime conditions with the separate broker process running, and blocked reviews leave the workflow in the intended next state instead of drifting or silently continuing

## Final Integrated Acceptance

To call this milestone complete, we must prove:

- a real `gsd-2` auto-mode run submits work to the standalone broker, waits at the review-before-progression gate, and then continues correctly when the broker result allows progression
- a real `gsd-2` run that receives a blocking review follows the configured response policy: auto-loop by default when auto mode is on, and human intervention by default for a human-driven task unless auto-loop is explicitly opted into
- a human-driven `gsd-2` session can manually trigger review and inspect review status / decision visibility from inside `gsd-2` against the same broker state used by the automatic gate

## Risks and Unknowns

- exact typed-client transport shape between `gsd-2` and the separate broker process — this determines how much startup, connection, and failure handling lands in the extension layer
- exact patch points in the bundled `gsd` extension — hard review gating is owned by the real workflow engine, so the wrong seam will create a fragile integration
- preference/config shape for blocked-review behavior — the milestone needs configurable auto-loop vs human intervention behavior, not a single hardcoded response
- coordination-hook pressure — the first version is allowed to use a thin explicit patch, but we should avoid making future tandem integration depend on brittle lifecycle interception

## Existing Codebase / Prior Art

- `../gsd-tandem/docs/gsd2-broker-integration-findings.md` — prior findings on the `gsd-2` patch points, why review-before-progression is the first realistic gate, and why the deterministic path should use a direct typed client instead of MCP
- `../gsd-2/src/resources/extensions/gsd/auto-loop.ts` — likely gate/control-flow touch point for auto progression behavior
- `../gsd-2/src/resources/extensions/gsd/auto-post-unit.ts` — current post-unit pipeline behavior, including the current post-commit structure that makes review-before-progression the v1 fit
- `../gsd-2/src/resources/extensions/gsd/auto-verification.ts` — likely verification/gate coordination surface
- `../gsd-2/src/resources/extensions/gsd/commands/index.ts` — likely manual command entrypoint for review trigger and status surfaces
- `../gsd-2/src/resources/extensions/gsd/commands/dispatcher.ts` — command routing surface for manual review/status integration
- `../gsd-2/src/resources/extensions/gsd/preferences-types.ts` — likely home for the first review-gating preference schema
- `.gsd/milestones/M001/M001-SUMMARY.md` — the verified source of truth for what the standalone broker, typed client, and MCP surface already provide

> See `.gsd/DECISIONS.md` for all architectural and pattern decisions — it is an append-only register; read it during planning, append to it during execution.

## Relevant Requirements

- R006 — M002 uses the direct typed TypeScript client as the deterministic integration seam inside `gsd-2`
- R008 — M002 is where workflow-specific `.gsd` artifact resolution and unit metadata mapping must live behind adapters instead of leaking into broker core
- R009 — M002 delivers the first real review-before-progression gate while preserving the accepted post-commit review flow in v1
- R010 — M002 should preserve clear blocked-review and failure visibility inside the integrated workflow, even though the requirement itself was already advanced by M001

## Scope

### In Scope

- thin explicit `gsd-2` integration with the standalone broker as a separate broker process
- direct typed-client usage for deterministic gate behavior
- review-before-progression in the real `gsd-2` auto pipeline
- manual review trigger and status / decision visibility from inside `gsd-2`
- a preference/config surface for blocked-review behavior, including auto-loop vs human intervention defaults
- thin explicit patching of the bundled `gsd` extension where hard gating needs it

### Out of Scope / Non-Goals

- hosting broker logic inside a `gsd-2` fork or in-process as the new product boundary
- using MCP as the primary deterministic gate path
- refactoring the pipeline to force review-before-commit in v1
- over-generalizing into a broad extension-coordination framework before the first working gate exists
- dashboard work beyond whatever visibility is needed inside `gsd-2` command/status surfaces

## Technical Constraints

- The broker stays standalone; `gsd-2` is a consumer, not the host boundary.
- The first integrated gate is review-before-progression, not review-before-commit.
- Deterministic gate behavior should call a direct typed client, not rely on LLM-mediated `mcp_call` behavior.
- A thin explicit patch to the bundled `gsd` extension is acceptable for hard gating in v1.
- The milestone should optimize for your real workflow first rather than broad product generalization.
- Blocked-review behavior must be configurable: auto mode can default to auto-loop, while human-driven tasks can default to human intervention with auto-loop opt-in.

## Integration Points

- standalone broker process — the runtime `gsd-2` must talk to for review submission, status, and gate decisions
- `packages/review-broker-client` / typed-client seam from M001 — the deterministic broker integration path this milestone should consume
- bundled `gsd` extension in `../gsd-2/src/resources/extensions/gsd/` — where gate insertion, commands, and preferences will likely be patched
- `gsd-2` auto pipeline — the real progression control point that must stop or continue based on broker review outcome
- manual command surfaces in `gsd-2` — where trigger and status / decision visibility should land for human-driven runs

## Open Questions

- What is the smallest reliable typed-client transport/connection model between `gsd-2` and the separate broker process? — Current thinking: keep it explicit and boring; do not collapse the host boundary just to simplify the first patch.
- Which exact bundled-`gsd` seams should own review-before-progression? — Current thinking: patch the real auto-loop / post-unit / verification path directly instead of relying on load-order hacks or a pure out-of-tree extension.
- How explicit should the preference model be in v1? — Current thinking: the milestone must at least support mode-aware defaults plus opt-in/opt-out control for auto-loop vs human intervention.
- Should M002 add explicit extension coordination hooks now or only patch the current flow? — Current thinking: ship the thin explicit patch first, but leave room to reduce future patching pressure if the seams prove too brittle during planning or execution.
