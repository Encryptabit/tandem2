# S01 Summary — Broker-backed auto review gate

## Outcome

S01 is **not yet slice-complete**.

This closer pass consolidated the slice, re-ran the planned verification entrypoints, and found that the assembled work is still blocked by the `gsd-2` test/runtime environment from this tandem worktree. The slice has meaningful implementation progress in the external `gsd-2` integration target, but the required slice-level proof did **not** go green, so the roadmap item should remain open.

## What this slice currently delivers

### 1. Dedicated review preference surface
- `gsd-2` now has a first-class top-level `review` preference block instead of hiding broker-gate behavior inside verification settings.
- `resolveReviewPreferences()` resolves sparse config into canonical runtime defaults.
- `mode-default` blocked behavior still resolves to:
  - `auto-loop` for autonomous flows
  - `intervene` for human-driven flows

### 2. Runtime-owned normalized review contract
- `src/resources/extensions/gsd/review/types.ts` now holds explicit normalized review types for:
  - transports
  - blocked policies
  - allow/block/error decisions
  - gate/session state
- The contract keeps workflow normalization on the `gsd-2` side rather than leaking `.gsd` semantics into broker core.

### 3. Consumer-side review adapter seam
- `src/resources/extensions/gsd/review/adapter.ts` now exists and is shaped around `execute-task` units.
- It resolves `.gsd` artifacts and current unit metadata into one submission payload.
- It normalizes broker create/status responses into allow/block/error workflow outcomes with redaction-safe error handling.
- The adapter gathers:
  - milestone roadmap
  - slice plan
  - slice continue state
  - current task plan
  - current task summary
  - prior task summaries in the same slice

### 4. Real finalize-path gate seam
- `src/resources/extensions/gsd/review/gate.ts` now exists.
- `auto-loop.ts` now calls a dedicated review gate after `runPostUnitVerification()` and before `postUnitPostVerification()`.
- Hook sidecars still skip review gating.
- Blocked/error review outcomes now stop progression by pausing instead of silently falling through.

### 5. Session-visible review diagnostics
- `AutoSession` now carries `reviewGateState`.
- The gate records visible phase/state information such as:
  - phase
  - unit type/id
  - review id
  - normalized status/decision
  - sanitized broker error summary
- This establishes the observability surface S03 and S04 are expected to build on.

## Verification status

### Planned slice verification re-run
The slice plan requires all of these to pass:
1. `node --import /home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test /home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/review-preferences.test.ts /home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/review-adapter.test.ts`
2. `node --import /home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test /home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/auto-review-gate.test.ts /home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/auto-loop.test.ts`
3. `node --import /home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test /home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/auto-review-gate.test.ts --test-name-pattern "(block|error|diagnostic|status)"`

### Actual result in this closer pass
Verification is still **failing before assertions complete**.

Observed failures during the closer pass:
- initial failure: missing `yaml` package when importing `preferences.ts`
- after adding a loader shim for `yaml`: missing `@gsd/pi-coding-agent` resolution from the same worktree-driven test path
- after redirecting that package to source: Node strip-types failed on unsupported TS parameter-property syntax inside `packages/pi-coding-agent/src/*`

### What this means
- The slice cannot honestly be marked done yet.
- R008/R009 are **advanced**, but not validated by required slice proof.
- The current blocker is a test/runtime harness problem in `gsd-2` from this tandem worktree context, not just missing prose or unchecked boxes.

## Observability / diagnostics confirmed
The intended observability shape exists in code and is inspectable:
- `AutoSession.reviewGateState`
- dedicated gate phases in `review/gate.ts`
- explicit allow/block/error branches in the finalize seam
- focused test files added for adapter and gate behavior

What is **not** yet confirmed end-to-end is the green test proof for those surfaces.

## Files landed in `gsd-2` during this pass
- `src/resources/extensions/gsd/review/types.ts`
- `src/resources/extensions/gsd/review/adapter.ts`
- `src/resources/extensions/gsd/review/gate.ts`
- `src/resources/extensions/gsd/review/index.ts`
- `src/resources/extensions/gsd/tests/review-adapter.test.ts`
- `src/resources/extensions/gsd/tests/auto-review-gate.test.ts`
- `src/resources/extensions/gsd/tests/yaml-shim.mjs`
- updates in:
  - `preferences.ts`
  - `preferences-validation.ts`
  - `auto-loop.ts`
  - `auto.ts`
  - `auto/session.ts`
  - `tests/auto-loop.test.ts`
  - `tests/dist-redirect.mjs`

## Requirement impact
- **R008**: implementation progress is real because adapter-owned `.gsd` mapping now exists on the consumer side.
- **R009**: implementation progress is real because the real finalize seam now has a broker review gate branch.
- Neither requirement should be moved to validated yet because the planned slice verification matrix is not passing.

## Decisions/patterns this slice establishes
- Keep review configuration in a dedicated top-level `review` block.
- Keep `.gsd` artifact resolution and decision normalization in `gsd-2` adapter code, not broker core.
- Keep the broker-backed workflow gate in a dedicated `review/gate.ts` module instead of embedding broker logic directly into `auto-loop.ts`.
- Store gate visibility on `AutoSession` so later slices can reuse one inspectable state model.

## Resume notes for the next closer/executor
1. **Do not mark S01 done until the slice-plan verification commands pass.**
2. Finish stabilizing the `gsd-2` test loader/runtime path for this worktree-based execution mode.
3. The immediate blocker is the import chain behind `preferences.ts` / `preferences-skills.ts` when `resolve-ts.mjs` is used without a built/install-ready `gsd-2` workspace.
4. Preferred next step: make the test harness resolve external runtime dependencies without redirecting into unsupported TS source that strip-types cannot parse.
5. After the harness issue is fixed, rerun the exact three slice verification commands from the slice plan and only then re-assess roadmap status.

## Downstream guidance
- **S02** should assume the intended shared seam is `review/adapter.ts` + normalized review types, not ad hoc command-local payload mapping.
- **S03** should build on `AutoSession.reviewGateState` rather than inventing a second review-status store.
- **S04** still needs real integrated proof; this slice only establishes the in-product finalize seam and adapter contract once verification is green.
