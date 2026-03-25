# M002 — Research

**Date:** 2026-03-21

## Summary

M002 should be treated as a thin cross-repo integration milestone, not a broker redesign. M001 already proved the standalone broker, typed client, and MCP surface; the shortest path now is to consume those existing seams from `gsd-2` with a small explicit integration layer and to patch the bundled `gsd` extension only at the real progression-control seam. The most important code-level finding is still the same as the context predicted: `gsd-2` auto-mode commits in `postUnitPreVerification()` before the verification gate runs, so v1 should implement **review-before-progression**, not review-before-commit.

The natural `gsd-2` gate seam is the finalize path in `src/resources/extensions/gsd/auto-loop.ts`: pre-verification work runs, then `runPostUnitVerification()`, then post-verification progression. That means M002 can insert broker review after verification and before `postUnitPostVerification()` without refactoring the existing commit flow. Existing control-flow patterns already support sentinels like `continue`, `retry`, `pause`, and `break`, so the new review gate should mirror those mechanics instead of inventing a parallel orchestration path.

The second key finding is that M002 has two distinct integration surfaces and they should stay separate in design: **deterministic auto gating** and **human/manual review operations**. Deterministic gating should call the M001 typed client directly and keep broker status/policy handling inside runtime-owned TS code. Human/manual operations should land as first-class `/gsd` commands that talk to the same broker state, not as LLM-mediated `mcp_call` flows and not as load-order-dependent external extension hooks.

## Recommendation

Build M002 in four layers, in this order:

1. **Adapter + preference layer first**: add a dedicated review integration module in `gsd-2` that resolves `.gsd` artifacts, unit metadata, and broker payload mapping behind one adapter boundary, and add an explicit `review` preference block rather than overloading verification settings.
2. **Manual command surface second**: add `/gsd review` and `/gsd review-status` style commands that use the typed client against the same broker/runtime state the automatic gate will use.
3. **Auto gate third**: patch `auto-loop.ts` so review happens after verification and before post-verification progression, with mode-aware blocked-review policy (`auto` defaults to auto-loop; human-driven defaults to intervention unless opted in).
4. **Real-runtime proof last**: verify with a separate broker process, real broker SQLite state, and real `gsd-2` auto-mode/manual flows.

This approach minimizes risk because it reuses existing patterns instead of fighting them: `auto-loop.ts` already owns progression control, `commands/dispatcher.ts` already owns user-visible `/gsd` entrypoints, `preferences-types.ts` plus `preferences-validation.ts` already define the config extension path, and M001 already established the deterministic broker client contract. The milestone should avoid adding a generic extension coordination framework, avoid MCP as the primary gate path, and avoid trying to solve pre-commit review now.

## Implementation Landscape

### Key Files

- `/home/cari/repos/gsd-2/src/resources/extensions/gsd/auto-loop.ts` — the decisive progression seam. `runFinalizePhase()` already runs `postUnitPreVerification()` → `runPostUnitVerification()` → `postUnitPostVerification()`. Inserting review here gives review-before-progression without disturbing the existing commit order.
- `/home/cari/repos/gsd-2/src/resources/extensions/gsd/auto-post-unit.ts` — proves the v1 constraint. `postUnitPreVerification()` performs auto-commit before verification, so pre-commit gating is a different milestone.
- `/home/cari/repos/gsd-2/src/resources/extensions/gsd/auto-verification.ts` — the closest behavioral model for a review gate. It already turns gate results into `continue` / `retry` / `pause`, persists retry context on `AutoSession`, and pauses visibly for human review.
- `/home/cari/repos/gsd-2/src/resources/extensions/gsd/auto/session.ts` — current auto-mode state container. It has verification retry state but no persisted review gate state yet; M002 likely needs review-specific session fields (active review id, gate status, blocked policy, last decision snapshot).
- `/home/cari/repos/gsd-2/src/resources/extensions/gsd/commands/index.ts` and `/home/cari/repos/gsd-2/src/resources/extensions/gsd/commands/dispatcher.ts` — the command registration/router seam for manual trigger and status commands.
- `/home/cari/repos/gsd-2/src/resources/extensions/gsd/commands/handlers/ops.ts` and `/home/cari/repos/gsd-2/src/resources/extensions/gsd/commands-handlers.ts` — existing pattern for operational commands that run deterministic TS code directly from `/gsd ...` rather than dispatching speculative LLM behavior.
- `/home/cari/repos/gsd-2/src/resources/extensions/gsd/commands/catalog.ts` — must be updated when adding command help/completions; otherwise manual review commands will exist but feel half-integrated.
- `/home/cari/repos/gsd-2/src/resources/extensions/gsd/preferences-types.ts` — needs a new top-level `review` preference block and `KNOWN_PREFERENCE_KEYS` update.
- `/home/cari/repos/gsd-2/src/resources/extensions/gsd/preferences-validation.ts` — enforces shape, unknown-key warnings, and defaults. This is where mode-aware policy and transport config need validation.
- `/home/cari/repos/gsd-2/src/resources/extensions/gsd/templates/preferences.md` and `/home/cari/repos/gsd-2/src/resources/extensions/gsd/docs/preferences-reference.md` — must be updated together with the new preference surface.
- `/home/cari/repos/gsd-2/src/resources/extensions/gsd/paths.ts` and `/home/cari/repos/gsd-2/src/resources/extensions/gsd/files.ts` — the existing `.gsd` artifact resolution and plan/summary parsing helpers. These should be reused inside the M002 adapter layer rather than reimplemented with ad hoc path joins.
- `.gsd/milestones/M001/M001-SUMMARY.md` — milestone-level proof that the standalone broker, typed client, MCP surface, restart-safe runtime, and `broker:parity` entrypoint already exist and should be treated as integration dependencies, not re-opened design questions.
- `.gsd/milestones/M001/slices/S04/S04-SUMMARY.md` — strongest evidence for the intended deterministic seam: `packages/review-broker-core/src/operations.ts` and `packages/review-broker-client` are the anti-drift contract source.
- `.gsd/milestones/M001/slices/S05/S05-SUMMARY.md` — strongest evidence for real-runtime proof strategy: reopen the same durable SQLite DB through supported surfaces and reuse `broker:parity`.
- `/home/cari/repos/gsd-tandem/docs/gsd2-broker-integration-findings.md` — prior-art map of the exact `gsd-2` seams and the reason a thin explicit patch to bundled `gsd` is acceptable in v1.
- `/home/cari/repos/gsd-tandem/get-shit-done/bin/lib/review.cjs` — prior art for review gate recording/assert/override behavior. M002 should not clone it blindly, but it is a strong hint that integrated review needs persisted gate state, not just transient pause behavior.
- `/home/cari/repos/gsd-tandem/get-shit-done/workflows/tandem-review.md` — prior art for the proposer lifecycle and status handling (`approved`, `changes_requested`, comment/discussion reuse, same-chain resubmission).

### Build Order

1. **Prove the adapter boundary first**
   - Add one integration module in `gsd-2` that:
     - resolves current unit metadata from `.gsd` files,
     - converts unit/task context into broker submission payloads,
     - exposes normalized review decisions/status back to `gsd-2`.
   - This should own R008. Do not let `.gsd` path resolution leak into broker packages.

2. **Add the review preference surface before loop changes**
   - Add `review` to `preferences-types.ts`, validation, merge logic, template, and docs.
   - The minimum useful shape should support:
     - enabled/disabled,
     - transport/connection config for the separate broker process,
     - gate enablement,
     - blocked-review behavior policy,
     - auto-loop opt-in/opt-out by workflow mode.
   - Doing this first prevents loop code from hardcoding policy and transport assumptions.

3. **Ship manual commands before auto gating**
   - Add `/gsd review` to submit the current/target unit for review.
   - Add `/gsd review-status` to show status, current verdict/decision visibility, and active review id.
   - This proves the typed-client connection, payload mapping, and broker state visibility without entangling auto-mode control flow yet.

4. **Patch the auto progression gate**
   - Insert broker review after successful verification and before `postUnitPostVerification()` in `auto-loop.ts`.
   - Reuse the verification-style sentinel flow rather than bypassing the loop.
   - Blocked-review handling should branch by mode-aware policy:
     - auto-mode default: loop/fix/resubmit,
     - human-driven default: pause for intervention,
     - explicit preference override can swap either behavior.

5. **Finish with end-to-end runtime proof**
   - Validate against a separate broker process and real SQLite state.
   - Reuse the M001 `broker:parity` mindset instead of inventing a new fake test transport.

### Verification Approach

- **`gsd-2` unit tests**
  - Add tests around the new review policy resolver and gate insertion in `src/resources/extensions/gsd/tests/auto-loop.test.ts`.
  - Add command-handler tests for manual review/status commands.
  - Add preference validation/merge tests covering the new `review` block.

- **Cross-runtime integration proof**
  - Start the standalone broker as a separate process and point `gsd-2` at it through the typed client configuration.
  - Prove that manual commands and automatic gate reads/writes converge on the same broker state.

- **Acceptance behaviors to prove**
  - Real auto-mode run submits review after verification, waits at the gate, and only progresses when the broker result permits it.
  - Blocking review in auto-mode follows the configured policy and does not silently fall through.
  - Human-driven run defaults to intervention on blocked review unless explicit auto-loop is enabled.
  - Manual `/gsd review` and `/gsd review-status` operate on the same review id/state used by the automatic gate.

## Don't Hand-Roll

| Problem | Existing Solution | Why Use It |
|---------|------------------|------------|
| Deterministic broker contract | `packages/review-broker-core/src/operations.ts` + `packages/review-broker-client` from M001 | Prevents DTO drift and preserves the accepted direct typed-client seam from R006/D003. |
| `.gsd` artifact resolution | `src/resources/extensions/gsd/paths.ts` and `files.ts` in `gsd-2` | Keeps workflow-specific layout knowledge in the consumer layer and directly supports R008. |
| Auto-mode gate control flow | `runPostUnitVerification()` + `AutoSession` retry/pause pattern | Matches existing `gsd-2` runtime mechanics instead of introducing a second orchestration model. |
| Manual operational command wiring | `commands/dispatcher.ts` + `commands/handlers/ops.ts` patterns | Keeps review trigger/status as first-class `/gsd` operations with help/completion integration. |

## Constraints

- `gsd-2` currently auto-commits in `postUnitPreVerification()`, so M002 should not attempt pre-commit review without a larger finalize-pipeline refactor.
- Hard workflow gating lives in the bundled `gsd` extension, so a pure out-of-tree extension is still too brittle for v1 gate ownership.
- The standalone broker remains a separate process; M002 is a consumer integration milestone, not a host-boundary reversal.
- Deterministic gating must use the typed client path from M001, not LLM-mediated `mcp_call` behavior.
- Preference changes in `gsd-2` are multi-file by construction: types, validation, merge behavior, templates, docs, and sometimes command/help output all need to land together.
- This milestone is cross-repo in practice: broker/runtime packages live in `tandem2`, while gate/control-flow code lives in `gsd-2`.

## Common Pitfalls

- **Trying to implement review-before-commit in M002** — the existing `postUnitPreVerification()` auto-commit makes this a pipeline-refactor problem, not a thin integration patch.
- **Treating broker review like another verification command** — verification has advisory branches for infra/package-discovery failures; review gating needs its own non-advisory control path so blocked review cannot silently continue.
- **Adding commands without updating command catalog/completions** — `/gsd review` and related status commands will feel broken if `commands/catalog.ts` is not updated with help text and completions.
- **Forgetting persistent gate state** — a simple `pauseAuto()` on blocked review is not enough; resume/restart needs a durable review id / decision record so `gsd-2` does not duplicate submissions or lose blocked context.
- **Letting `.gsd` file layout leak into broker code** — artifact resolution and unit metadata mapping belong in an adapter layer on the `gsd-2` side, per R008.
- **Using hook dispatch patterns for manual review commands by default** — `dispatchHookUnit()` is useful prior art, but manual review trigger/status should usually be deterministic command handlers first, not synthetic LLM task dispatches.

## Candidate Requirements

These are advisory only and should be confirmed during planning rather than silently added to scope.

- **Persistent gate state in `gsd-2`** — the integrated review gate likely needs a durable record of active review id, current decision, and last submission hash/unit so pause/resume and crash recovery are deterministic.
- **Connection failure must block visibly** — if the separate broker process is unavailable or misconfigured, `gsd-2` should pause or fail with explicit visibility rather than treating the review step as advisory.
- **One normalized review decision contract inside `gsd-2`** — raw broker statuses should be mapped once into progression outcomes like allow / block-loop / block-human / error to avoid scattering status logic across commands and loop code.

## Open Risks

- The smallest reliable broker connection model for `gsd-2` still needs to be fixed in code: process launch/attach, health checks, and configuration defaults are not yet proven in the integrated runtime.
- Blocked-review auto-loop semantics may interact awkwardly with existing verification retry semantics if both can set retry-like state on the same unit.
- Manual commands and auto-gate submission can drift if they build payloads separately instead of sharing one adapter/mapping function.
- If review gate state is not durably recorded, restart/resume could resubmit the same unit or lose the reason progression was blocked.

## Skills Discovered

| Technology | Skill | Status |
|------------|-------|--------|
| GSD workflow / milestone orchestration | `gsd` | installed |
| GSD extension development | `create-gsd-extension` | installed |
| SQLite | `martinholovsky/claude-skills-generator@sqlite database expert` | available via `npx skills add martinholovsky/claude-skills-generator@sqlite-database-expert` |
| Vitest | `onmax/nuxt-skills@vitest` | available via `npx skills add onmax/nuxt-skills@vitest` |
