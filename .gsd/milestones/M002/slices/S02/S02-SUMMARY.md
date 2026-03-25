# S02 Summary — Manual review trigger and status surfaces

## Outcome

S02 is **slice-complete**.

This closer pass re-ran the planned slice verification matrix and confirmed that `gsd-2` now exposes first-class manual review commands on top of the same runtime-owned adapter/client/status contract introduced for the auto review gate. Manual review trigger and manual review status no longer depend on separate payload shaping, separate broker vocabulary, or a command-local review cache.

## What this slice delivers

### 1. One shared review runtime seam for manual submit, manual status, and gate reuse
- `src/resources/extensions/gsd/review/runtime.ts` is now the shared seam for:
  - current-vs-explicit unit resolution
  - explicit review-ID targeting
  - broker client creation
  - review submission
  - review status lookup
  - normalized state shaping for UI/runtime consumers
- `review/gate.ts` reuses this same runtime seam instead of keeping its own client/status path.
- Manual and automatic review flows now converge on the same normalized state vocabulary: `idle | submitted | waiting | completed | error` plus `allow | block | error` decisions.

### 2. First-class `/gsd review` command support
- `src/resources/extensions/gsd/commands/handlers/review.ts` now owns a dedicated deterministic `/gsd review` handler.
- `src/resources/extensions/gsd/commands/handlers/ops.ts` routes `review` to that handler instead of hiding the behavior in a generic branch.
- The command supports:
  - the current active unit when no target is provided
  - explicit `execute-task/<unit-id>` targets
  - explicit `plan-slice/<unit-id>` targets
  - explicit `run-uat/<unit-id>` targets
  - shorthand task/slice IDs when current milestone/slice context exists
- Broker-unavailable and target-resolution failures are surfaced explicitly as normalized command output instead of silent no-ops.

### 3. First-class `/gsd review-status` over the same live review state model as auto-mode
- `src/resources/extensions/gsd/auto.ts` now exports `getAutoReviewGateState()` as a read-only accessor over the singleton `AutoSession.reviewGateState`.
- `/gsd review-status` can inspect:
  - the live auto-session review state when one exists
  - the current active unit when no live state exists
  - an explicit unit target
  - an explicit `review/<review-id>` or bare review ID
- Status resolution prefers the live gate state for targeting and then refreshes broker state through the shared runtime status path whenever a review ID is available.
- This keeps manual inspection and automatic gating on one inspectable state model instead of introducing a second command-local cache.

### 4. Discoverability is now part of the shipped surface
- `src/resources/extensions/gsd/commands/catalog.ts` exposes `review` and `review-status` as top-level `/gsd` commands.
- `src/resources/extensions/gsd/commands/handlers/core.ts` includes both commands in `/gsd help` with the real accepted syntax.
- `src/resources/extensions/gsd/commands/handlers/review.ts` exports authoritative syntax/description constants so help/catalog/tests stay aligned.
- `src/resources/extensions/gsd/tests/review-command-discoverability.test.ts` locks command description, completions, and help text to the handler-visible syntax contract.

### 5. Tandem worktree verification is stable again without weakening production imports
- Tandem-only strip-types loader shims now live in:
  - `src/resources/extensions/gsd/tests/dist-redirect.mjs`
  - `src/resources/extensions/gsd/tests/mcp-sdk-shim.mjs`
  - `src/resources/extensions/gsd/tests/pi-package-shim.mjs`
- The production review runtime keeps the real MCP SDK import path.
- Test-harness compatibility is handled in the loader/shim layer instead of degrading the shipped runtime seam.

## Verification status

### Planned slice verification re-run
The slice plan required these commands to pass:

1. `node --import /home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test /home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/review-runtime.test.ts /home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/review-command.test.ts /home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/auto-review-gate.test.ts`
2. `node --import /home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test /home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/review-status-command.test.ts /home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/review-command-discoverability.test.ts`

### Actual result in this closer pass
Both planned slice verification commands passed.

- Verify set 1: **11/11 tests passed**
- Verify set 2: **5/5 tests passed**

The passing matrix covers:
- shared target resolution and submission behavior
- `/gsd review` command output and failure visibility
- gate/session-state reuse
- `/gsd review-status` live-state and broker-backed inspection
- discoverability in catalog/help/completions

## Observability / diagnostics confirmed

The slice plan called out manual status visibility and live review-state inspection as explicit diagnostics surfaces. Those are now present and verified:

- `/gsd review` output shows:
  - targeted unit
  - target source
  - review ID when available
  - normalized status
  - sanitized errors/code/retryability when applicable
- `/gsd review-status` output shows:
  - unit or review target
  - target source (`current`, `live`, `review`, or explicit unit)
  - state source (`live auto session` vs `broker lookup`)
  - live gate phase when available
  - normalized status/decision/summary/error
- `AutoSession.reviewGateState` remains the shared in-memory visibility surface, now exposed read-only through `getAutoReviewGateState()`.
- Focused tests prove:
  - live-state reuse works
  - missing live review state is explicit
  - broker lookup failures are sanitized
  - blocked/allowed review state remains inspectable on the session

## Files landed in `gsd-2`

### New or materially expanded runtime/command surfaces
- `src/resources/extensions/gsd/review/runtime.ts`
- `src/resources/extensions/gsd/commands/handlers/review.ts`
- `src/resources/extensions/gsd/tests/review-runtime.test.ts`
- `src/resources/extensions/gsd/tests/review-command.test.ts`
- `src/resources/extensions/gsd/tests/review-status-command.test.ts`
- `src/resources/extensions/gsd/tests/review-command-discoverability.test.ts`
- `src/resources/extensions/gsd/tests/mcp-sdk-shim.mjs`
- `src/resources/extensions/gsd/tests/pi-package-shim.mjs`

### Updated integration points
- `src/resources/extensions/gsd/review/gate.ts`
- `src/resources/extensions/gsd/auto.ts`
- `src/resources/extensions/gsd/commands/handlers/ops.ts`
- `src/resources/extensions/gsd/commands/catalog.ts`
- `src/resources/extensions/gsd/commands/handlers/core.ts`
- `src/resources/extensions/gsd/tests/auto-review-gate.test.ts`
- `src/resources/extensions/gsd/tests/dist-redirect.mjs`

## Requirement impact

This slice materially advances the milestone coverage described in the roadmap:

- **R006**: manual review commands stay on the direct typed runtime seam rather than any LLM-mediated broker path.
- **R008**: workflow-specific target resolution, `.gsd` artifact/unit mapping, and normalized review-state shaping remain on the `gsd-2` side.
- **R009**: manual status now inspects the same review-before-progression state model the auto gate uses.
- **R010**: review IDs, state transitions, blocked decisions, and sanitized broker failures are visible inside `gsd-2` command surfaces.

No requirement status changes were applied in `.gsd/REQUIREMENTS.md` during this closer pass. S02 proves the manual command surfaces, but milestone-level completion still depends on S03/S04 hardening and on S01’s own slice-level completion state.

## Decisions and patterns this slice establishes

- Keep manual review trigger and manual review status on one shared review runtime module rather than duplicating broker submit/status logic in command handlers.
- Treat `AutoSession.reviewGateState` as the single in-memory review visibility surface and expose it through a narrow accessor rather than creating a second status cache.
- For tandem strip-types verification, prefer targeted loader shims and static-source assertions over dragging broad runtime trees into focused tests.
- Keep `ops.ts` as thin routing and keep command semantics in dedicated handler modules.

## Downstream guidance for S03 and S04

### For S03
- Build blocked-review policy, pause behavior, and restart/resume continuity on top of:
  - `ReviewGateState`
  - `getAutoReviewGateState()`
  - `readReviewStatus()`
- Do not add a second review-state store for continuity work.
- Preserve the existing normalized status/decision vocabulary so manual and auto surfaces remain aligned.

### For S04
- Real-runtime proof should exercise both `/gsd review` and `/gsd review-status` against the same broker-backed state used by the auto gate.
- Reuse the shipped discoverability/help surface as part of manual proof rather than inventing temporary instructions.

### For future tandem test work
- Avoid pulling `commands/context.ts` into narrow command tests when only base-path resolution is needed.
- Avoid importing `core.ts` for focused help-surface tests when static source assertions are enough.
- Keep production MCP imports intact; solve tandem harness issues in the loader/shim layer.
