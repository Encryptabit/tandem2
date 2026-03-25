# S02 — Research

**Date:** 2026-03-21

## Summary

This slice is **targeted research**, not deep greenfield work. The main architecture decisions are already made by M002 + S01; S02 is mostly about wiring a first-class manual command surface onto the review seams that now exist in `gsd-2`.

**Requirements focus:**
- **R008** — keep `.gsd` artifact resolution and unit metadata mapping in `gsd-2` adapters, not broker core.
- **R010** — expose visible broker review status / decision surfaces inside `gsd-2`.
- **Supports R006** by forcing commands to use the same deterministic typed-client seam as auto gating.
- **Supports R009** by preventing manual vs automatic review-state drift.

The strongest finding is that **S01 already created the right reusable seams**, but **no real manual surface exists yet**:
- `src/resources/extensions/gsd/review/types.ts` defines the normalized review vocabulary.
- `src/resources/extensions/gsd/review/adapter.ts` owns `.gsd` artifact resolution and broker response normalization.
- `src/resources/extensions/gsd/review/gate.ts` uses those seams in the finalize path and records inspectable gate state on `AutoSession.reviewGateState`.
- `src/resources/extensions/gsd/commands/handlers/ops.ts` is the existing deterministic `/gsd ...` command bucket for operational commands.
- `src/resources/extensions/gsd/commands/catalog.ts` and `src/resources/extensions/gsd/commands/handlers/core.ts` still define discoverability/help, so adding commands only in `ops.ts` would leave them half-shipped.

The second important finding is that **`gsd-2` still has no concrete broker client wiring**. `review/gate.ts` currently falls back to `createUnavailableReviewClient()`. That means S02 should not just bolt on `/gsd review`; it should introduce or extract **one shared review runtime/service seam** for:
- target-unit resolution
- typed-client creation from `review` preferences
- submission/status calls
- normalized status/decision formatting

That shared seam should be used by manual commands first, then reused by the gate so S01/S02 do not diverge.

This matches the milestone research and prior findings from `docs/gsd2-broker-integration-findings.md`: **manual review/status operations should be first-class deterministic TS commands, not LLM-mediated hook dispatch or MCP calls**. That also aligns with the installed `create-gsd-extension` skill guidance: use explicit command handlers, keep stateful logic in runtime-owned TS, and do not hide product behavior behind speculative agent flows.

## Recommendation

Build S02 in **three thin layers**:

1. **Extract a shared manual-review runtime seam under `review/`**
   - Add a small module for review-command operations instead of embedding everything in `commands/handlers/ops.ts`.
   - Responsibilities:
     - resolve the target unit from explicit args or current `deriveState()` output
     - call `buildReviewSubmission()` from `review/adapter.ts`
     - call the real typed client
     - normalize broker replies via existing `normalizeBrokerReviewState()` / `normalizeBrokerReviewOutcome()`
     - format concise human-visible status output
   - This is the main anti-drift seam for S02.

2. **Add first-class `/gsd review` and `/gsd review-status` commands**
   - Route from `commands/handlers/ops.ts` into the new review command module.
   - Keep these as deterministic TS command handlers, per M002 research and the `create-gsd-extension` skill’s command guidance.
   - Do **not** model them as hook units, synthetic LLM tasks, or `mcp_call` wrappers.

3. **Update discoverability surfaces together**
   - `commands/catalog.ts` top-level command list / completions
   - `commands/handlers/core.ts` help text
   - command description strings as needed
   - If legacy bootstrap paths still matter, confirm whether `commands-bootstrap.ts` also needs parallel updates; production registration currently goes through `commands/index.ts`.

Build **manual submit + manual status** first. Richer commands like `review-resume` / `review-config` were mentioned in older notes, but the roadmap only requires trigger + status for S02.

## Implementation Landscape

### Command routing and discoverability

- `src/resources/extensions/gsd/commands/index.ts`
  - Registers `/gsd` and delegates to `commands/dispatcher.ts`.
  - No special review logic needed here beyond existing command registration.

- `src/resources/extensions/gsd/commands/dispatcher.ts`
  - Ordered router: core → auto → parallel → workflow → ops.
  - `ops` is already the correct bucket for manual review/status commands.
  - No new dispatcher branch is required if review stays an operational command.

- `src/resources/extensions/gsd/commands/handlers/ops.ts`
  - Current deterministic handler bucket for commands like `doctor`, `logs`, `inspect`, `run-hook`, `knowledge`, `migrate`, etc.
  - Natural place to add:
    - `review`
    - `review-status`
  - Best kept as thin routing only; real review logic should live in a testable helper/module.

- `src/resources/extensions/gsd/commands/catalog.ts`
  - Central source for top-level `/gsd` subcommand discoverability and completions.
  - Must be updated or the new commands will exist but feel broken/invisible.
  - This file also drives `GSD_COMMAND_DESCRIPTION`, so command help drift is easy if omitted.

- `src/resources/extensions/gsd/commands/handlers/core.ts`
  - `showHelp()` contains the visible `/gsd help` command list.
  - Must be updated with review commands; otherwise help and completions diverge.

- `src/resources/extensions/gsd/commands-bootstrap.ts`
  - Appears to duplicate older command catalog/completion logic.
  - Current production registration path uses `registerGSDCommand()` from `commands/index.ts`, not this file.
  - Likely no primary implementation target, but worth a quick consistency check before closing the slice.

### Existing review seam from S01

- `src/resources/extensions/gsd/review/types.ts`
  - Canonical normalized vocabulary:
    - transports
    - blocked policies
    - statuses
    - allow/block/error outcomes
    - `ReviewGateState`
    - `ReviewClient` interface
  - Manual commands should reuse this contract directly.

- `src/resources/extensions/gsd/review/adapter.ts`
  - Already owns the critical consumer-side logic required by **R008**:
    - `resolveReviewUnitContext()`
    - `resolveReviewArtifacts()`
    - `buildReviewSubmission()`
    - `normalizeBrokerReviewState()`
    - `normalizeBrokerReviewOutcome()`
    - `sanitizeReviewError()`
  - Manual commands should **not** reimplement any of this locally.

- `src/resources/extensions/gsd/review/gate.ts`
  - Uses the adapter and normalized types in the live finalize seam.
  - Important gap: it still defaults to `createUnavailableReviewClient()`.
  - S02 should treat real client creation as a **shared runtime seam**, not as manual-command-only wiring.

- `src/resources/extensions/gsd/review/index.ts`
  - Stable barrel export for review functionality.
  - Good place to keep the public review surface coherent if new command/service helpers are added.

### Auto-mode / session state seam

- `src/resources/extensions/gsd/auto/session.ts`
  - `AutoSession.reviewGateState` is already present and included in `toJSON()`.
  - This is the inspectable state model S03 is supposed to extend.

- `src/resources/extensions/gsd/auto.ts`
  - Holds the singleton `AutoSession` instance privately.
  - Today there is **no exported accessor/updater** for `reviewGateState` from command code.
  - If S02 wants manual commands to surface the same in-memory state that auto-mode uses during a live run, it likely needs a minimal exported accessor rather than a second store.

### Unit / ID resolution patterns already in code

- `src/resources/extensions/gsd/state.ts`
  - Canonical source for current `activeMilestone`, `activeSlice`, and `activeTask`.
  - Manual `/gsd review` should probably default to the current active task (`execute-task`) when no explicit target is provided.

- `src/resources/extensions/gsd/auto-dispatch.ts`
  - Confirms the canonical execute-task unit ID shape: `${mid}/${sid}/${tid}`.

- `src/resources/extensions/gsd/commands-maintenance.ts`
  - `handleSkip()` already contains a useful normalization pattern for accepting short IDs vs fully qualified unit IDs.
  - This is good prior art for explicit target parsing in review commands.

## Natural Seams for Planning

1. **Shared review command/service module**
   - Best first task.
   - Keeps broker client creation, unit targeting, submission, and status formatting out of `ops.ts`.
   - Likely lands under `src/resources/extensions/gsd/review/` or as a focused `commands/handlers/review.ts` plus small runtime helper.

2. **Command surface wiring**
   - Small, low-risk task.
   - Update `ops.ts`, `catalog.ts`, and `core.ts` together.

3. **Session-state bridge (only if needed for live convergence)**
   - Add a tiny accessor/updater in `auto.ts` so manual commands can inspect or refresh `AutoSession.reviewGateState` instead of inventing another state cache.
   - If omitted, S02 can still query live broker state, but the planner should make an explicit choice here.

4. **Focused tests**
   - Separate from implementation so the harness fragility from S01 stays contained.
   - Match the existing project testing style per the installed `test` skill: narrow tests, mirror existing command registration patterns, and verify behavior with mocked contexts rather than broad end-to-end flows first.

## Constraints and Watchouts

- **Do not duplicate payload mapping.** `review/adapter.ts` is now the approved `gsd-2` boundary for `.gsd` artifact resolution.
- **Do not treat manual review as a hook or sidecar.** The milestone research explicitly prefers deterministic command handlers over synthetic LLM dispatch.
- **Do not add commands without catalog/help updates.** `commands/catalog.ts` + `commands/handlers/core.ts` are both required for a finished command surface.
- **Do not hide the missing client seam.** `createUnavailableReviewClient()` is a real implementation gap; S02 should make that seam reusable, not paper over it in one command.
- **Avoid a second review-state store.** If manual commands need in-memory visibility during a live run, prefer exporting access to the existing `AutoSession.reviewGateState` model.
- **Be cautious with the tandem worktree test harness.** S01 already proved the current `resolve-ts.mjs` path is fragile around external package resolution. Prefer narrow command/service tests first, then broader command registration verification.

## Verification

### Primary proof targets

1. `/gsd review` exists, is discoverable, and submits review for the intended unit.
2. `/gsd review-status` exists, is discoverable, and surfaces review id + normalized status/decision.
3. Manual commands use the same adapter/normalization seam as the auto gate.
4. Broker-client failure surfaces are explicit and user-visible, not silent fallthrough.

### Test classes to add

- **Command handler tests**
  - direct tests for manual review submit/status logic with mocked client responses
  - usage / target-resolution cases
  - error-path visibility cases

- **Catalog/help/completion tests**
  - register `/gsd`, assert `review` and `review-status` appear in completions
  - assert help/description strings mention the new commands

- **Shared seam tests**
  - prove manual command submission calls `buildReviewSubmission()` rather than duplicating artifact reads
  - prove status formatting is based on normalized review state

### Likely verification command shape

After implementation, the most relevant narrow command is:

```bash
node --import /home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test \
  /home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/review-command.test.ts \
  /home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/review-status-command.test.ts \
  /home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/review-preferences.test.ts
```

If the implementation adds a shared review command/service module, add its focused test file to that same command.

### Practical verification expectations

- completions include `review` and `review-status`
- `/gsd help` text mentions both commands
- explicit unit targeting works
- implicit targeting uses current active unit when valid
- status output shows review id + normalized status/decision + summary/error text
- unavailable broker/client path reports a clear user-visible error

## Additional Skill Discovery

The installed skills already cover the main work here (`gsd`, `create-gsd-extension`, `test`, `review`). If the planner later wants extra external skill help for the underlying stack, the most relevant suggestions discovered were:

- `npx skills add wshobson/agents@typescript-advanced-types`
- `npx skills add wshobson/agents@nodejs-backend-patterns`

These are only additive suggestions; they are not required for this slice.

## Resume Notes for Planner

- Treat **shared review client/service extraction** as the first real task. Without it, manual commands will either duplicate logic or cement the current `createUnavailableReviewClient()` gap.
- Keep **command wiring** and **discoverability updates** as a separate small task.
- Decide explicitly whether S02 should also add a tiny **`AutoSession.reviewGateState` accessor** so manual commands can read/update the same in-memory model during live runs.
- Prefer **focused command/service tests** before any broader command-path or runtime proof, because S01 already exposed harness fragility in this tandem worktree context.
