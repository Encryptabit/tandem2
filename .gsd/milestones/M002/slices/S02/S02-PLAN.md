# S02: Manual review trigger and status surfaces

**Goal:** Add first-class manual `/gsd review` and `/gsd review-status` commands inside `gsd-2` that submit and inspect broker reviews through the same adapter, typed client, and normalized review-state contract already introduced for the auto gate.
**Demo:** From inside `gsd-2`, a human can trigger review for an explicit or current unit, then run a status command that shows the active review ID plus normalized status/decision visibility from the same broker-backed state model used by auto-mode.

## Decomposition Rationale

This slice does not need a large new architecture; it needs to prevent manual and automatic review flows from drifting apart. The highest risk is adding visible commands that quietly bypass the S01 adapter, invent a second review-state store, or hardcode a different broker-client path. The plan therefore starts by shipping a real `/gsd review` command on top of one shared review runtime seam, then adds `/gsd review-status` by reusing `AutoSession.reviewGateState` instead of creating a parallel cache, and only then closes the loop with help/completion surfaces and regression proof. That ordering keeps each task user-visible while still retiring the real integration risk for R006 and R008.

## Requirement Focus

- Supports **R006** by keeping manual review trigger/status on the direct typed-client seam rather than any LLM-mediated or command-local broker path.
- Supports **R008** by reusing `gsd-2` review adapter/runtime code for unit resolution, artifact mapping, and normalized broker status handling.
- Supports **R009** by ensuring manual review surfaces observe the same review-before-progression state model the auto gate already uses.
- Advances **R010** visibility expectations inside `gsd-2`, while full blocked-review/broker-failure hardening remains planned for S03 and S04.

## Must-Haves

- `/gsd review` submits an explicit or current unit through the same `gsd-2` adapter and direct typed-client seam the auto gate uses, directly advancing R006 and R008 while keeping manual triggering aligned with the review-before-progression workflow from R009.
- `/gsd review-status` reports review ID, targeted unit, normalized status/decision, and sanitized broker/client failures using the same review-state vocabulary the auto gate uses, preventing manual/automatic drift and making status visibility concrete inside `gsd-2`.
- Command catalog, help text, and completions expose `review` and `review-status` as first-class `/gsd` operations, and live in-memory review visibility is read from `AutoSession.reviewGateState` rather than a second command-local store.

## Proof Level

- This slice proves: integration
- Real runtime required: no
- Human/UAT required: no

## Verification

- `node --import /home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test /home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/review-runtime.test.ts /home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/review-command.test.ts /home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/auto-review-gate.test.ts`
- `node --import /home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test /home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/review-status-command.test.ts /home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/review-command-discoverability.test.ts`

## Observability / Diagnostics

- Runtime signals: normalized manual submit/status results plus the existing `AutoSession.reviewGateState` fields for unit ID, review ID, phase, status, decision, summary, and sanitized broker error.
- Inspection surfaces: `/gsd review-status`, `AutoSession` accessors exported from `auto.ts`, and focused tests in `review-runtime.test.ts`, `review-status-command.test.ts`, and `auto-review-gate.test.ts`.
- Failure visibility: broker-unavailable, missing-target, and blocked/completed review states remain visible as explicit command output or session state instead of silent no-ops.
- Redaction constraints: manual status surfaces must expose IDs, normalized decision/status values, and sanitized summaries only — never raw diff artifacts, task content, or secrets.

## Integration Closure

- Upstream surfaces consumed: `/home/cari/repos/gsd-2/src/resources/extensions/gsd/review/adapter.ts`, `/home/cari/repos/gsd-2/src/resources/extensions/gsd/review/gate.ts`, `/home/cari/repos/gsd-2/src/resources/extensions/gsd/review/types.ts`, `/home/cari/repos/gsd-2/src/resources/extensions/gsd/auto.ts`, `/home/cari/repos/gsd-2/src/resources/extensions/gsd/auto/session.ts`, `/home/cari/repos/gsd-2/src/resources/extensions/gsd/state.ts`, `/home/cari/repos/gsd-2/src/resources/extensions/gsd/commands/handlers/ops.ts`, `/home/cari/repos/gsd-2/src/resources/extensions/gsd/commands/catalog.ts`, and `/home/cari/repos/gsd-2/src/resources/extensions/gsd/commands/handlers/core.ts`.
- New wiring introduced in this slice: a shared review runtime/client seam for manual command work, deterministic `/gsd review` and `/gsd review-status` handlers, and command-surface access to the same live review state model the auto gate already records.
- What remains before the milestone is truly usable end-to-end: S03 still has to harden blocked-review policy, broker-failure pause behavior, and restart/resume continuity; S04 still has to prove the assembled flow against a real standalone broker process.

## Tasks

- [x] **T01: Ship `/gsd review` on the shared review runtime seam** `est:1h15m`
  - Why: The first user-visible manual surface should already use the adapter and typed client correctly; otherwise S02 starts by creating the drift it is supposed to remove.
  - Files: `/home/cari/repos/gsd-2/src/resources/extensions/gsd/review/runtime.ts`, `/home/cari/repos/gsd-2/src/resources/extensions/gsd/review/gate.ts`, `/home/cari/repos/gsd-2/src/resources/extensions/gsd/commands/handlers/review.ts`, `/home/cari/repos/gsd-2/src/resources/extensions/gsd/commands/handlers/ops.ts`, `/home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/review-runtime.test.ts`, `/home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/review-command.test.ts`
  - Do: Add one shared review runtime module that creates the real review client from the `review` preference block, resolves explicit or current unit targets, and wraps submission/status calls around the existing adapter; route `/gsd review` through a dedicated deterministic handler module; and update the auto gate to consume the same runtime seam instead of a command-only or unavailable-client path.
  - Verify: `node --import /home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test /home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/review-runtime.test.ts /home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/review-command.test.ts`
  - Done when: `/gsd review` can target the current or explicit unit through the shared adapter/client seam, unavailable-broker errors are explicit, and the gate no longer depends on a separate client-creation path.
- [x] **T02: Add `/gsd review-status` and reuse live gate state** `est:1h15m`
  - Why: The slice demo is not true until humans can inspect the same active review state the auto gate sees, not just trigger a separate review request.
  - Files: `/home/cari/repos/gsd-2/src/resources/extensions/gsd/auto.ts`, `/home/cari/repos/gsd-2/src/resources/extensions/gsd/review/runtime.ts`, `/home/cari/repos/gsd-2/src/resources/extensions/gsd/commands/handlers/review.ts`, `/home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/auto-review-gate.test.ts`, `/home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/review-status-command.test.ts`
  - Do: Export a minimal accessor over `AutoSession.reviewGateState` from `auto.ts`, extend the shared review runtime and command handler with `/gsd review-status`, and make the status path show unit ID, review ID, normalized status/decision, summary, and sanitized errors whether the state comes from the live auto session or a broker status lookup.
  - Verify: `node --import /home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test /home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/review-status-command.test.ts /home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/auto-review-gate.test.ts`
  - Done when: `/gsd review-status` surfaces the live review ID and normalized state vocabulary used by the gate, and focused tests prove there is no second command-local status model.
- [x] **T03: Publish review commands in help/completions and lock discoverability regression** `est:45m`
  - Why: Manual review/status commands are only shipped if users can find them and future changes cannot silently remove them from `/gsd` help or completions.
  - Files: `/home/cari/repos/gsd-2/src/resources/extensions/gsd/commands/catalog.ts`, `/home/cari/repos/gsd-2/src/resources/extensions/gsd/commands/handlers/core.ts`, `/home/cari/repos/gsd-2/src/resources/extensions/gsd/commands/handlers/review.ts`, `/home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/review-command-discoverability.test.ts`
  - Do: Update the command catalog, command description string, and `/gsd help` text for `review` and `review-status`; keep usage text synchronized with the dedicated review handler; and add a discoverability regression test that asserts the commands stay visible and accurately described.
  - Verify: `node --import /home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test /home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/review-command-discoverability.test.ts`
  - Done when: `review` and `review-status` appear in `/gsd` discoverability surfaces with stable syntax and a focused test fails if those surfaces drift.

## Files Likely Touched

- `/home/cari/repos/gsd-2/src/resources/extensions/gsd/review/runtime.ts`
- `/home/cari/repos/gsd-2/src/resources/extensions/gsd/review/gate.ts`
- `/home/cari/repos/gsd-2/src/resources/extensions/gsd/review/adapter.ts`
- `/home/cari/repos/gsd-2/src/resources/extensions/gsd/review/types.ts`
- `/home/cari/repos/gsd-2/src/resources/extensions/gsd/auto.ts`
- `/home/cari/repos/gsd-2/src/resources/extensions/gsd/auto/session.ts`
- `/home/cari/repos/gsd-2/src/resources/extensions/gsd/state.ts`
- `/home/cari/repos/gsd-2/src/resources/extensions/gsd/commands/handlers/review.ts`
- `/home/cari/repos/gsd-2/src/resources/extensions/gsd/commands/handlers/ops.ts`
- `/home/cari/repos/gsd-2/src/resources/extensions/gsd/commands/catalog.ts`
- `/home/cari/repos/gsd-2/src/resources/extensions/gsd/commands/handlers/core.ts`
- `/home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/review-runtime.test.ts`
- `/home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/review-command.test.ts`
- `/home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/review-status-command.test.ts`
- `/home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/review-command-discoverability.test.ts`
- `/home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/auto-review-gate.test.ts`
