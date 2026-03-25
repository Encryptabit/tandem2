# S03 Research — Blocked-review policy and gate continuity

**Date:** 2026-03-21
**Status:** Ready for planning

## Summary

S03 primarily advances **R008**, **R009**, and **R010**.

The review integration already has the right seams, but the continuity/policy layer is still missing:

- `review.gate.on_blocked` exists in schema, docs, and tests, but is **not consumed by runtime control flow**.
- `auto-loop.ts` currently **hard-pauses on every blocked or error review outcome**, so autonomous runs never honor the documented `auto-loop` default.
- `AutoSession.reviewGateState` exists and is inspectable, but it is **in-memory only**.
- `pauseAuto()` persists `paused-session.json`, but it does **not** persist `reviewGateState`, `reviewId`, or the reviewed unit identity.
- `runReviewGate()` always starts from **submit-first** behavior; it does not reuse an existing `reviewId`, so pending/blocked resumes are vulnerable to **duplicate submission**.
- `readReviewStatus()` depends on a live `ReviewGateState` or an explicit review ID. After restart, `/gsd review-status` currently falls back to `review_state_missing`.
- Pending broker statuses are already normalized as `submitted`/`waiting`, but `runReviewGate()` polls once and then collapses non-final states into a generic error instead of preserving a durable waiting review.

This slice is therefore not about inventing new review plumbing. It is about making the existing seams behave correctly when review blocks, waits, fails, pauses, or resumes.

## Recommendation

1. **Keep blocked-policy behavior in `review/gate.ts`, not in `auto-loop.ts`.**
   - `auto-loop.ts` should consume a gate result and enact it.
   - Policy resolution should live with the gate seam that already knows the review preferences and normalized broker state.

2. **Persist the existing `AutoSession.reviewGateState` shape inside the existing `runtime/paused-session.json` flow.**
   - Do not invent a separate `review-status.json` or second cache.
   - Reuse the same state model for auto-mode, resume, and manual status inspection.

3. **Add a continuity-first gate path before new submission.**
   - If the session already has a matching `reviewGateState` with `reviewId` for the same unit, refresh broker status instead of calling `submitReview()` again.
   - Only submit a new review when there is no active/inspectable review context for that unit.

4. **Make blocked behavior explicitly mode-aware.**
   - `auto-loop`: keep the same unit in focus and feed reviewer feedback back into the next attempt.
   - `intervene`: pause visibly and preserve the current review context for `/gsd review-status`.
   - Broker-unavailable / broker-error: always pause visibly with sanitized error state.

5. **Add a persisted-state fallback for `/gsd review-status`.**
   - If in-memory auto state is absent after restart, load the persisted paused review state and reuse the same `ReviewGateState` contract.
   - This keeps manual status and automatic gating converged on one state model.

6. **Keep verification focused.**
   - Follow the S02 tandem guidance: prefer targeted helpers/static assertions over dragging broad runtime trees into narrow tests.
   - The risk is real finalize behavior and continuity semantics, not massive runtime assembly.

## Implementation Landscape

### Core files

- `../../../../gsd-2/src/resources/extensions/gsd/review/gate.ts`
  - The correct seam for S03.
  - Today it does: resolve prefs → submit → maybe one status poll → allow/block/error.
  - Missing: no blocked-policy branching, no continuity/re-entry path, no reuse of existing `session.reviewGateState`.

- `../../../../gsd-2/src/resources/extensions/gsd/auto-loop.ts`
  - Real finalize seam.
  - Calls `runReviewGate()` after verification and before `postUnitPostVerification()`.
  - Today it hardcodes pause + break on `block` and `error`, which means the policy is effectively still embedded here.

- `../../../../gsd-2/src/resources/extensions/gsd/auto/session.ts`
  - Owns `reviewGateState`.
  - Good existing continuity surface.
  - `reset()` and `toJSON()` already know about it.

- `../../../../gsd-2/src/resources/extensions/gsd/auto.ts`
  - `getAutoReviewGateState()` exposes a defensive copy for command consumers.
  - `pauseAuto()` writes `runtime/paused-session.json`.
  - Resume bootstrap restores milestone/worktree/step mode only; it does not restore review state.

- `../../../../gsd-2/src/resources/extensions/gsd/review/runtime.ts`
  - Shared submit/status seam for auto and manual flows.
  - `readReviewStatus()` already refreshes broker state when it has a `reviewId`.
  - If it has no live state and no explicit review ID, it returns `review_state_missing`.

- `../../../../gsd-2/src/resources/extensions/gsd/commands/handlers/review.ts`
  - Manual `/gsd review-status` consumer.
  - Natural place to consume persisted paused review state when the in-memory singleton is empty.

- `../../../../gsd-2/src/resources/extensions/gsd/review/adapter.ts`
  - Already normalizes broker pending states (`queued`, `pending`, `claimed`, `in_progress`, `reviewing`) into `submitted` / `waiting`.
  - `sanitizeReviewError()` already provides the redaction-safe visibility contract S03 should keep using.

- `../../../../gsd-2/src/resources/extensions/gsd/preferences.ts`
- `../../../../gsd-2/src/resources/extensions/gsd/preferences-types.ts`
- `../../../../gsd-2/src/resources/extensions/gsd/preferences-validation.ts`
  - `on_blocked` contract already exists and is documented.
  - No schema expansion appears necessary unless S03 decides to add a new user-visible knob.

### Existing tests to extend

- `../../../../gsd-2/src/resources/extensions/gsd/tests/review-preferences.test.ts`
  - Already proves `mode-default` resolves to `auto-loop` for auto and `intervene` for human.
  - Good baseline; probably no major additions needed.

- `../../../../gsd-2/src/resources/extensions/gsd/tests/auto-review-gate.test.ts`
  - Best gate-level seam.
  - Current coverage: allow/block/error + manual status reuse.
  - Missing: pending continuity, existing review reuse, persisted-state restore behavior.

- `../../../../gsd-2/src/resources/extensions/gsd/tests/auto-loop.test.ts`
  - Best workflow-control seam.
  - Current coverage only proves ordering: verification → review gate → post-verification.
  - Missing: `auto-loop` vs `intervene`, broker-error pause behavior, no fallthrough into `postUnitPostVerification()`.

- `../../../../gsd-2/src/resources/extensions/gsd/tests/review-status-command.test.ts`
  - Already captures the current continuity hole: no live state => explicit `review_state_missing`.
  - Good before/after proof for persisted fallback.

- New focused continuity test
  - Likely needed for `paused-session.json` write/read of `reviewGateState`.
  - Prefer a tiny helper or source-level assertion if importing all of `auto.ts` gets expensive again.

## Key Findings

### 1. `on_blocked` is currently dead runtime config

`rg -n "on_blocked" ../../../../gsd-2/src/resources/extensions/gsd` shows runtime references only in preference parsing/validation/docs/tests plus `resolveReviewPreferences()`. There is no runtime consumer in gate or loop behavior.

Implication for planner:
- S03 is where documented policy finally becomes real behavior.

### 2. Auto finalize currently hard-pauses on block and error

In `auto-loop.ts`, the finalize path does:
- notify warning/error
- `pauseAuto(ctx, pi)`
- `return { action: "break", reason: "review-blocked" | "review-error" }`

Implication for planner:
- The milestone’s “auto-loop by default for auto-mode” behavior is not implemented yet.
- `auto-loop.ts` should stop hardcoding policy once `review/gate.ts` can return a policy-resolved workflow outcome.

### 3. `ReviewGateState` exists, but only as in-memory visibility

`AutoSession.reviewGateState` is set by `review/gate.ts` and exposed via `getAutoReviewGateState()`.

`rg -n "reviewGateState|getAutoReviewGateState"` shows it is only used by:
- `review/gate.ts` to write state
- `auto.ts` to expose read-only access
- `commands/handlers/review.ts` to read it for `/gsd review-status`

Implication for planner:
- This is the right single state model.
- S03 should persist/reload it, not replace it.

### 4. Pause metadata drops review context entirely

`pauseAuto()` currently writes `paused-session.json` with:
- `milestoneId`
- `worktreePath`
- `originalBasePath`
- `stepMode`
- `pausedAt`
- `sessionFile`

It does **not** write:
- `reviewGateState`
- `reviewId`
- `unitType`
- `unitId`

Implication for planner:
- Restart/resume cannot preserve active review context today.
- Extending the existing pause metadata is the least invasive continuity seam.

### 5. Resume bootstrap cannot reconstruct review continuity

`startAuto()`’s paused-session restore path only restores milestone/worktree/step-mode state. It does not restore any review state.

Implication for planner:
- After `/exit` or restart, the auto singleton loses the inspectable review context.
- Manual status and resumed gating need a persisted-state fallback.

### 6. Pending reviews are normalized correctly, then discarded incorrectly

`review/adapter.ts` already maps broker statuses like `queued`, `pending`, `claimed`, and `in_progress` into `submitted` / `waiting`.

But `review/gate.ts` does:
- submit
- if pending → poll once
- if still not allow/block → convert to generic error outcome

Implication for planner:
- Asynchronous broker timing currently looks like failure, not continuity.
- This is the most obvious duplicate-submission trap because the next run has no durable “active review in progress” state.

### 7. Current `/gsd review-status` tests already expose the continuity gap

`review-status-command.test.ts` has an explicit assertion that, without live state, the current unit returns:
- `Status: error`
- `Code: review_state_missing`

Implication for planner:
- This is the cleanest before/after verification target for persisted paused review context.

## Risks / Unknowns

- **What exactly should `auto-loop` do after a blocked review?**
  - The codebase already has `pendingVerificationRetry` prompt injection.
  - Planner should decide whether blocked-review retry reuses that pattern or adds a review-specific retry payload.
  - The important invariant is: same unit stays in focus with reviewer feedback; it must not silently progress.

- **When should persisted review state be cleared?**
  - Too early: status visibility disappears.
  - Too late: resume may stay pinned to stale state.
  - Natural candidates: after a fresh submission replaces the prior `reviewId`, or after an allow outcome completes progression.

- **Do commands need continuity before `/gsd auto` resumes?**
  - If yes, command-path fallback must read persisted paused review metadata directly.
  - If no, restoring only during `startAuto()` is sufficient, but manual inspection after restart remains weaker.

- **Harness cost remains real around `auto.ts`.**
  - Keep S03 tests narrow, per the S02 guidance.
  - A small helper for review pause-metadata serialization may be cheaper than full runtime imports.

## Verification Strategy

### Baseline already confirmed during research

This command passed from the tandem-compatible strip-types harness:

```bash
node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test ./src/resources/extensions/gsd/tests/review-preferences.test.ts ./src/resources/extensions/gsd/tests/review-runtime.test.ts ./src/resources/extensions/gsd/tests/review-status-command.test.ts ./src/resources/extensions/gsd/tests/auto-review-gate.test.ts
```

Observed result during research: **21/21 passing**.

### New/extended proof to add for S03

1. **Gate continuity tests**
   - existing `reviewId` + same unit => refresh status, do not resubmit
   - pending broker state remains inspectable instead of collapsing to a generic error
   - blocked state preserves `reviewId` and unit identity for later inspection

2. **Auto-loop policy tests**
   - blocked + `on_blocked=auto-loop` => no `pauseAuto`, no `postUnitPostVerification`, same unit stays on retry path
   - blocked + `on_blocked=intervene` => `pauseAuto` + preserved state + explicit break
   - broker error => sanitized error + visible pause/break

3. **Pause/resume continuity tests**
   - `paused-session.json` includes serialized `reviewGateState`
   - restore path reloads it into the same state model
   - `/gsd review-status` can use restored persisted state when live singleton is empty

4. **Re-run combined focused matrix**
   - updated `auto-review-gate.test.ts`
   - updated `auto-loop.test.ts`
   - updated `review-status-command.test.ts`
   - new focused pause/resume continuity test if introduced

## Skill Notes

- **`create-gsd-extension`**: keep state in the existing runtime-owned surface rather than inventing ad hoc globals; that aligns directly with extending `AutoSession.reviewGateState` + existing paused-session persistence.
- **`debug-like-expert`**: verify, don’t assume — especially around restart semantics. The code already shows continuity is missing; tests must prove duplicate submission is prevented.
- **`test`**: stay with existing `node:test` + strip-types patterns and keep the verification surface focused.
- **`review`**: the risky code is the real finalize seam and resume path, so changes should be scoped around full-file context in `review/gate.ts`, `auto-loop.ts`, and `auto.ts`.

## Skill Discovery

I checked:

```bash
npx skills find "Model Context Protocol"
```

Prominent results were mostly about creating MCP apps/servers rather than consuming the MCP SDK from an existing TypeScript runtime:
- `modelcontextprotocol/ext-apps@create-mcp-app` — 603 installs
- `modelcontextprotocol/ext-apps@migrate-oai-app` — 186 installs
- `modelcontextprotocol/ext-apps@add-app-to-server` — 176 installs

None looked directly useful for S03’s core work. The installed skills already fit better:
- `gsd`
- `create-gsd-extension`
- `test`
- `debug-like-expert`
- `review`
