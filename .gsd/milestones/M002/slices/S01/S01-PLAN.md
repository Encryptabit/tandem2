# S01: Broker-backed auto review gate

**Goal:** Add a real broker-backed review-before-progression gate to the bundled `gsd` extension by introducing a dedicated review preference surface, a `gsd-2`-owned adapter over `.gsd` artifacts and unit metadata, and a typed-client-backed finalize seam that only continues when the broker decision allows it.
**Demo:** A real `gsd-2` auto run reaches the post-verification seam, submits the just-completed unit through the standalone broker client via the `gsd-2` adapter, records the active review state, and only falls through to `postUnitPostVerification()` when the normalized broker outcome is allow.

## Decomposition Rationale

This slice owns R008 and R009, with supporting pressure from R006 and R010. The risky part is the real finalize seam in `auto-loop.ts`, but patching it first would hardcode broker payload shaping, decision mapping, and diagnostics into orchestration code. The plan therefore starts by making review configuration and normalized review outcomes explicit, then builds the `gsd-2`-side adapter that resolves `.gsd` artifacts and current-unit metadata into one reusable broker contract, and only then patches the live post-verification path. That ordering keeps the broker boundary honest, gives later manual command work in S02 something reusable, and makes the final task the true workflow gate instead of a side-channel spike.

## Must-Haves

- `gsd-2` gains a dedicated `review` preference block with validated, documented fields for broker transport, gate enablement, and forward-compatible blocked-review handling so the integration is not hardcoded, directly advancing R008 and R009.
- Workflow-specific `.gsd` artifact resolution, unit metadata mapping, and broker submission/status normalization live in `gsd-2` adapter code rather than broker-core code, keeping the typed-client seam deterministic while preserving the host boundary from R006 and R008.
- The real auto finalize path inserts a broker-backed gate after `runPostUnitVerification()` and before `postUnitPostVerification()`, persists visible gate state for the active unit, and only progresses on an allow outcome instead of silently falling through, directly delivering R009 and supporting R010.

## Proof Level

- This slice proves: integration
- Real runtime required: no
- Human/UAT required: no

## Verification

- `node --import /home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test /home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/review-preferences.test.ts /home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/review-adapter.test.ts`
- `node --import /home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test /home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/auto-review-gate.test.ts /home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/auto-loop.test.ts`
- `node --import /home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test /home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/auto-review-gate.test.ts --test-name-pattern "(block|error|diagnostic|status)"`

## Observability / Diagnostics

- Runtime signals: explicit review-gate session state on `AutoSession` plus structured debug-log phases for submit, wait/poll, allow, block, and broker-error outcomes.
- Inspection surfaces: `AutoSession` JSON/session snapshots, focused Node tests in `src/resources/extensions/gsd/tests/review-adapter.test.ts` and `src/resources/extensions/gsd/tests/auto-review-gate.test.ts`, and the existing `auto-loop.test.ts` call-order assertions.
- Failure visibility: active review ID, normalized decision/status, gate phase, and last broker error summary remain inspectable instead of being implicit in a stalled loop.
- Redaction constraints: diagnostics must never log raw diffs, patch bodies, or secrets; surface unit IDs, review IDs, status/decision values, and sanitized error summaries only.

## Integration Closure

- Upstream surfaces consumed: `/home/cari/repos/gsd-2/src/resources/extensions/gsd/auto-loop.ts`, `/home/cari/repos/gsd-2/src/resources/extensions/gsd/auto.ts`, `/home/cari/repos/gsd-2/src/resources/extensions/gsd/auto-post-unit.ts`, `/home/cari/repos/gsd-2/src/resources/extensions/gsd/auto/session.ts`, `/home/cari/repos/gsd-2/src/resources/extensions/gsd/preferences-types.ts`, `/home/cari/repos/gsd-2/src/resources/extensions/gsd/preferences.ts`, `/home/cari/repos/gsd-2/src/resources/extensions/gsd/preferences-validation.ts`, `/home/cari/repos/gsd-2/src/resources/extensions/gsd/files.ts`, and `/home/cari/repos/gsd-2/src/resources/extensions/gsd/paths.ts`.
- New wiring introduced in this slice: a first-class `review` preference/config surface, a reusable `gsd-2` review adapter and gate module, and a post-verification auto-loop call path that routes through the typed-client-backed broker gate before progression.
- What remains before the milestone is truly usable end-to-end: manual `/gsd review` and `/gsd review-status` command surfaces in S02, plus blocked-review policy hardening and durable resume/restart continuity in S03.

## Tasks

- [x] **T01: Define review preferences and normalized gate contract** `est:1h`
  - Why: The gate cannot be trustworthy if transport, enablement, and broker decision mapping are implied inside `auto-loop.ts`; S01 needs an explicit review config block and one normalized contract for later auto/manual reuse.
  - Files: `/home/cari/repos/gsd-2/src/resources/extensions/gsd/preferences-types.ts`, `/home/cari/repos/gsd-2/src/resources/extensions/gsd/preferences-validation.ts`, `/home/cari/repos/gsd-2/src/resources/extensions/gsd/preferences.ts`, `/home/cari/repos/gsd-2/src/resources/extensions/gsd/templates/preferences.md`, `/home/cari/repos/gsd-2/src/resources/extensions/gsd/docs/preferences-reference.md`, `/home/cari/repos/gsd-2/src/resources/extensions/gsd/review/types.ts`, `/home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/review-preferences.test.ts`
  - Do: Add a dedicated `review` preference block with the minimal S01 transport/gate fields plus forward-compatible blocked-policy knobs from D008; wire validation and merge behavior into the existing preference system; document the new block in the template/reference docs; and define the shared normalized review decision/status types that both the adapter and the gate will use.
  - Verify: `node --import /home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test /home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/review-preferences.test.ts`
  - Done when: `review` is a known validated preference block with documented defaults, and a dedicated test file proves merge/default/validation behavior plus the presence of the normalized review contract types.
- [x] **T02: Build the `gsd-2` review adapter over `.gsd` artifacts and unit metadata** `est:1h15m`
  - Why: R008 is only retired if `.gsd` artifact lookup, unit metadata mapping, and broker payload shaping stay on the `gsd-2` side behind one reusable adapter rather than leaking into broker-core or auto-loop orchestration.
  - Files: `/home/cari/repos/gsd-2/src/resources/extensions/gsd/review/types.ts`, `/home/cari/repos/gsd-2/src/resources/extensions/gsd/review/adapter.ts`, `/home/cari/repos/gsd-2/src/resources/extensions/gsd/review/index.ts`, `/home/cari/repos/gsd-2/src/resources/extensions/gsd/files.ts`, `/home/cari/repos/gsd-2/src/resources/extensions/gsd/paths.ts`, `/home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/review-adapter.test.ts`
  - Do: Implement a `gsd-2` review adapter that resolves the current unit’s milestone/slice/task context and `.gsd` artifacts into the broker submission payload, wraps the direct typed client behind a small runtime-facing interface, and normalizes broker review/status responses into the shared allow/block/error contract without routing through `mcp_call`.
  - Verify: `node --import /home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test /home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/review-adapter.test.ts`
  - Done when: one adapter module can build review submissions and normalize broker responses for an `execute-task` unit using only `gsd-2` context, and focused tests prove payload mapping plus redaction-safe normalization for allow, block, and broker-error cases.
- [x] **T03: Insert the broker gate into the real auto finalize seam and expose gate diagnostics** `est:1h30m`
  - Why: The slice demo is not true until the live post-verification path uses the adapter-backed broker gate and visibly stops or continues the real auto workflow instead of a helper or side-channel approximation.
  - Files: `/home/cari/repos/gsd-2/src/resources/extensions/gsd/auto-loop.ts`, `/home/cari/repos/gsd-2/src/resources/extensions/gsd/auto.ts`, `/home/cari/repos/gsd-2/src/resources/extensions/gsd/auto/session.ts`, `/home/cari/repos/gsd-2/src/resources/extensions/gsd/review/gate.ts`, `/home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/auto-review-gate.test.ts`, `/home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/auto-loop.test.ts`
  - Do: Add a dedicated review-gate call between `runPostUnitVerification()` and `postUnitPostVerification()`, wire it through `auto.ts`/`LoopDeps`, persist active review ID/phase/decision/error diagnostics on `AutoSession`, skip the gate for hook sidecars, and make allow/block/error outcomes explicit so only allow reaches the existing post-verification path.
  - Verify: `node --import /home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test /home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/auto-review-gate.test.ts /home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/auto-loop.test.ts`
  - Done when: the real auto finalize seam calls the broker gate after verification, `postUnitPostVerification()` only runs for allow outcomes, and dedicated tests prove allow, block, and broker-unavailable behavior while keeping gate state inspectable on the session.

## Files Likely Touched

- `/home/cari/repos/gsd-2/src/resources/extensions/gsd/preferences-types.ts`
- `/home/cari/repos/gsd-2/src/resources/extensions/gsd/preferences-validation.ts`
- `/home/cari/repos/gsd-2/src/resources/extensions/gsd/preferences.ts`
- `/home/cari/repos/gsd-2/src/resources/extensions/gsd/templates/preferences.md`
- `/home/cari/repos/gsd-2/src/resources/extensions/gsd/docs/preferences-reference.md`
- `/home/cari/repos/gsd-2/src/resources/extensions/gsd/review/types.ts`
- `/home/cari/repos/gsd-2/src/resources/extensions/gsd/review/adapter.ts`
- `/home/cari/repos/gsd-2/src/resources/extensions/gsd/review/index.ts`
- `/home/cari/repos/gsd-2/src/resources/extensions/gsd/review/gate.ts`
- `/home/cari/repos/gsd-2/src/resources/extensions/gsd/auto-loop.ts`
- `/home/cari/repos/gsd-2/src/resources/extensions/gsd/auto.ts`
- `/home/cari/repos/gsd-2/src/resources/extensions/gsd/auto/session.ts`
- `/home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/review-preferences.test.ts`
- `/home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/review-adapter.test.ts`
- `/home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/auto-review-gate.test.ts`
- `/home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/auto-loop.test.ts`
