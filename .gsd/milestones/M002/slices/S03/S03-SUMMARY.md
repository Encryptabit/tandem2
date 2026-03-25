# S03 Summary — Blocked-review policy and gate continuity

## Outcome

S03 is **slice-complete**.

This closer pass re-ran the full slice verification matrix and confirmed that the local `gsd` extension substrate now behaves correctly when broker review blocks, waits, fails, pauses, or resumes. The slice also resolved the execution blocker discovered at the start of the work: this tandem worktree did not contain the expected `src/resources/extensions/gsd/...` tree, so S03 first restored a self-contained local substrate and recorded that handoff explicitly before hardening workflow behavior.

## What this slice delivers

### 1. A runnable in-worktree `gsd` extension substrate for S03 execution
- S03 no longer depends on editing an external `gsd-2` checkout from inside this sandbox.
- `src/resources/extensions/gsd/...` now exists locally with the focused runtime/test surface needed for:
  - review gate behavior
  - finalize-loop behavior
  - paused review-state persistence
  - `/gsd review-status` continuity
- `.gsd/milestones/M002/slices/S03/S03-SOURCE-HANDOFF.md` records the provenance, file manifest, and checksums for this reconstructed subtree.
- Future agents can use that manifest as the local baseline instead of reintroducing external absolute paths.

### 2. Mode-aware blocked-review policy resolution stays at the review-gate seam
- `src/resources/extensions/gsd/review/gate.ts` now resolves blocked-review behavior once and returns the workflow action instead of forcing `auto-loop.ts` to reinterpret broker state.
- The gate refreshes an existing same-unit review ID before submitting a new review when the current state is still `pending`, `waiting`, or `blocked`.
- Waiting reviews preserve the active `reviewId` and normalized state on `AutoSession.reviewGateState` instead of collapsing into an opaque error.
- Mode defaults are now explicit and tested:
  - auto mode → `auto-loop`
  - human mode → `intervene`
  - explicit preference still overrides the default

### 3. The real finalize seam now obeys blocked/wait/error outcomes without silent fallthrough
- `src/resources/extensions/gsd/auto-loop.ts` now treats review outcomes as real workflow control-flow:
  - `allow` and `skipped` continue into `postUnitPostVerification()`
  - `block + auto-loop` retries the same unit without pausing and without post-verification fallthrough
  - `block + intervene`, `wait`, and `error` pause visibly and do not progress
- `pendingVerificationRetry` is now reserved for blocked auto-loop retries only.
- Review-driven retries carry truthful reviewer-feedback framing via `formatPendingRetryPrompt()` instead of pretending the retry came from verification failure.
- `AutoSession.history` now records branch-specific finalize events like:
  - `review-blocked:auto-loop:...`
  - `review-blocked:intervene:...`
  - `review-waiting:...`
  - `review-error:...`

### 4. Review continuity survives pause/restart and manual status inspection
- `src/resources/extensions/gsd/review/pause-state.ts` now persists a schema-tagged paused review envelope.
- `src/resources/extensions/gsd/auto.ts` writes the full serialized payload under `pausedReviewState` in `.gsd/runtime/paused-session.json`.
- Resume/bootstrap restores `AutoSession.reviewGateState` from paused-session state.
- `/gsd review-status` falls back to that same paused review-state contract when no live auto session exists.
- Readers remain backward-compatible with older paused files that stored a top-level `reviewGateState` payload.

### 5. Visibility is now part of the slice’s shipped behavior, not just test scaffolding
The slice plan called out explicit operational visibility as part of the deliverable. That visibility now exists in one shared model:
- `AutoSession.reviewGateState` holds phase, unit identity, review ID, normalized status/decision, blocked policy, summary, sanitized error, and timestamp.
- `AutoSession.history` exposes finalize-path branch decisions without requiring broad runtime tracing.
- `.gsd/runtime/paused-session.json` persists sanitized paused review metadata with `schemaVersion` and `savedAt`.
- `/gsd review-status` can inspect live or paused review state through the same normalization path.

## Verification status

### Planned slice verification re-run
The slice plan required these checks to pass:

1. `test -f src/resources/extensions/gsd/auto-loop.ts && test -f src/resources/extensions/gsd/review/gate.ts && test -f src/resources/extensions/gsd/commands/handlers/review.ts && test -f src/resources/extensions/gsd/tests/resolve-ts.mjs && test -f src/resources/extensions/gsd/tests/auto-loop.test.ts`
2. `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test ./src/resources/extensions/gsd/tests/review-preferences.test.ts ./src/resources/extensions/gsd/tests/auto-review-gate.test.ts`
3. `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test ./src/resources/extensions/gsd/tests/auto-loop.test.ts`
4. `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test ./src/resources/extensions/gsd/tests/review-status-command.test.ts ./src/resources/extensions/gsd/tests/review-pause-state.test.ts`

### Actual result in this closer pass
All four planned slice checks passed.

Passing coverage included:
- same-unit review reuse instead of duplicate submission
- mode-aware blocked-policy resolution
- truthful retry prompt framing for reviewer feedback vs verification failures
- blocked auto-loop behavior on the same unit
- visible pause behavior for intervene / wait / broker-error branches
- paused-session review-state persistence with schema metadata
- restart rehydration of `AutoSession.reviewGateState`
- `/gsd review-status` fallback to paused review state

In addition to the planned verification matrix, this closer pass also ran focused observability probes that confirmed:
- blocked auto-loop writes review state plus retry context without pausing
- paused review metadata lands in `pausedReviewState` inside `runtime/paused-session.json`
- `handleReviewStatus()` can render paused review continuity from disk

## Observability / diagnostics confirmed

The slice plan’s explicit observability surfaces were confirmed in the closer pass:

- **`AutoSession.reviewGateState`**
  - retains `reviewId`, `status`, `decision`, `blockedPolicy`, `summary`, and sanitized error details
  - remains the shared review-state contract for gate, pause/resume, and manual status
- **`AutoSession.history`**
  - clearly distinguishes auto-loop vs intervene vs wait vs error finalize outcomes
  - is narrow enough for focused assertions and future debugging
- **`pendingVerificationRetry`**
  - is only populated for blocked auto-loop retries
  - carries reviewer feedback and review ID for truthful retry prompts
- **`.gsd/runtime/paused-session.json`**
  - now carries `pausedReviewState.schemaVersion`, `savedAt`, and sanitized review metadata
  - does not persist raw diff or patch bodies
- **`/gsd review-status`**
  - can inspect paused state after session loss
  - refreshes through shared runtime status lookup when a paused/live `reviewId` is pending

## Files landed in the local S03 substrate

### New or materially expanded workflow/runtime surfaces
- `src/resources/extensions/gsd/preferences.ts`
- `src/resources/extensions/gsd/review/types.ts`
- `src/resources/extensions/gsd/review/runtime.ts`
- `src/resources/extensions/gsd/review/gate.ts`
- `src/resources/extensions/gsd/review/pause-state.ts`
- `src/resources/extensions/gsd/auto/session.ts`
- `src/resources/extensions/gsd/auto-verification.ts`
- `src/resources/extensions/gsd/auto.ts`
- `src/resources/extensions/gsd/auto-loop.ts`
- `src/resources/extensions/gsd/commands/handlers/review.ts`

### Focused verification surfaces
- `src/resources/extensions/gsd/tests/resolve-ts.mjs`
- `src/resources/extensions/gsd/tests/review-preferences.test.ts`
- `src/resources/extensions/gsd/tests/auto-review-gate.test.ts`
- `src/resources/extensions/gsd/tests/auto-loop.test.ts`
- `src/resources/extensions/gsd/tests/review-status-command.test.ts`
- `src/resources/extensions/gsd/tests/review-pause-state.test.ts`
- `.gsd/milestones/M002/slices/S03/S03-SOURCE-HANDOFF.md`

## Requirement impact

This slice materially advanced the milestone’s mapped requirements:

- **R008**: reinforced the `gsd-2`-side ownership boundary by keeping blocked-policy resolution, paused-session serialization, and manual status continuity in the local extension/runtime seam rather than leaking workflow semantics into broker core.
- **R009**: local verification now proves policy-aware review-before-progression control flow with no silent continuation on blocked/wait/error outcomes.
- **R010**: local verification now proves blocked, waiting, error, and paused-review state remain inspectable through shared workflow surfaces.

`R009` and `R010` were updated in `.gsd/REQUIREMENTS.md` to reflect the local S03 proof while keeping both requirements **active**. No requirement was moved to validated yet because S04 still has to re-prove the assembled behavior against the real standalone broker and real `gsd-2` runtime.

## Decisions and patterns this slice establishes

- **D014**: treat the restored local `src/resources/extensions/gsd` subtree plus `S03-SOURCE-HANDOFF.md` manifest as the authoritative S03 execution substrate inside this sandbox.
- **D015**: use explicit finalize hooks plus `AutoSession.history` for non-allow review outcomes, while reserving retry payloads for blocked auto-loop retries only.
- **D016**: persist paused review continuity under a `pausedReviewState` envelope with schema/version metadata, while remaining backward-compatible with legacy top-level `reviewGateState` payloads.
- **P001**: use `AutoSession.history` as the narrow finalize-path signal and keep `pendingVerificationRetry` reserved for blocked retryable reviews.
- **P002**: store paused review continuity as a schema-tagged envelope, but keep readers tolerant of older serialized shapes.
- **L004 / L005** remain important for future work in this tandem environment:
  - verify target source files exist before starting implementation
  - if the subtree is reconstructed locally, use the handoff manifest instead of reintroducing external absolute paths

## Downstream guidance for S04

### Real-runtime proof is still required
S03 proves the policy/continuity behavior on the restored in-worktree substrate, but S04 still must re-prove the same behavior against:
- a real standalone broker process
- real broker state
- real `gsd-2` entrypoints
- the shared manual and automatic review surfaces together

### Keep one review-state model
Do not add a second continuity or status cache in S04. Reuse:
- `ReviewGateState`
- `AutoSession.reviewGateState`
- `readReviewStatus()`
- `pausedReviewState` in `runtime/paused-session.json`

### Preserve the current control-flow contract
S04 should treat these as locked behavioral expectations unless real runtime evidence forces a change:
- blocked auto-mode default → `auto-loop`
- blocked human-mode default → `intervene`
- only `allow` / `skipped` reach post-verification progression
- `wait` / `error` / blocked-intervene pause visibly
- pending retry context is only for same-unit blocked auto-loop retries

### Use the source-handoff manifest if this worktree remains the execution surface
If follow-on work continues in this tandem worktree instead of a fresh real `gsd-2` checkout, read `.gsd/milestones/M002/slices/S03/S03-SOURCE-HANDOFF.md` first and compare its checksums before modifying the local substrate.
