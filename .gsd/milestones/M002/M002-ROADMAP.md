# M002: GSD2 integration and review gating

**Vision:** Make the standalone broker matter inside real `gsd-2` usage by wiring broker-backed review into the bundled `gsd` extension through the direct typed-client seam, shipping a real review-before-progression gate, and exposing manual review/status surfaces from inside `gsd-2` without collapsing the broker back into the host.

## Success Criteria

- A real `gsd-2` auto-mode run submits the just-completed unit to the standalone broker after verification and before post-verification progression.
- An approved broker decision allows the same auto run to continue into the existing post-verification path instead of stalling or re-dispatching the wrong work.
- A blocking broker decision does not silently fall through: auto-mode follows its configured blocked-review policy and human-driven runs surface an intervention path by default.
- A human can run review-trigger and review-status commands from inside `gsd-2` and see the same broker review state the automatic gate uses.
- Broker connection problems, blocked reviews, and resume/restart state are visible enough inside `gsd-2` that the workflow does not drift or hide why it stopped.

## Key Risks / Unknowns

- The riskiest seam is still the real finalize path in `auto-loop.ts`; the gate has to stop or continue the actual workflow, not a side-channel approximation.
- `gsd-2` needs a consumer-side adapter for `.gsd` artifact resolution and unit metadata mapping; if that logic leaks into broker packages, M002 will undo the host-boundary win from M001.
- Blocked-review policy is mode-sensitive. If the first implementation hardcodes one response, it will either frustrate auto-mode or human-driven usage.
- Gate state has to survive pause/resume/restart cleanly enough to prevent duplicate submissions or “why did it keep going?” ambiguity.
- Manual commands and auto-mode can easily drift if they build broker payloads or decision mapping separately.

## Decomposition Rationale

The roadmap groups work around the real user-facing seams instead of around internal layers. The highest-risk behavior is the automatic review gate in the bundled `gsd` extension, so the first slice ships that risky path as a real capability rather than delaying it behind foundation-only work. That slice still includes the minimum adapter and preference surface required to make the gate honest, because a gate without explicit transport and policy configuration would only prove a hardcoded spike.

Manual review commands come next because they are less risky than the finalize seam but still user-visible, and they force the adapter, typed client, and broker-state mapping to be reusable instead of auto-loop-specific. After that, the roadmap isolates the policy and failure-visibility hardening work that turns a basic gate into something trustworthy under blocked reviews, restarts, and broker failures. The final slice is an explicit assembled-runtime proof because this milestone crosses real runtime boundaries: `gsd-2`, the separate broker process, SQLite state, and human/manual command surfaces.

## Proof Strategy

- Finalize seam risk → retire in S01 by inserting the broker-backed gate into the real `auto-loop.ts` finalize path, with adapter-backed payload mapping and a dedicated review preference block.
- Manual/automatic drift risk → retire in S02 by making `/gsd` manual review commands call the same adapter and decision/status normalization used by the gate.
- Policy and continuity risk → retire in S03 by proving blocked-review defaults, durable gate state, and connection-failure visibility in the actual `gsd-2` runtime flow.
- Cross-runtime integration risk → retire in S04 by running `gsd-2` against a separate broker process and proving auto and manual flows converge on one broker state model in real local conditions.

## Verification Classes

- Contract verification: adapter/unit-metadata mapping tests, preference validation tests, command-handler tests, and review decision normalization tests.
- Workflow integration verification: `gsd-2` auto-loop tests around finalize/gate control flow, retry/pause behavior, and persisted review state handling.
- Cross-runtime verification: real standalone broker process, real broker SQLite state, typed-client connection, and real `gsd-2` command/auto entrypoints exercised together.
- Operational verification: restart/resume behavior, blocked-review visibility, and broker-unavailable handling produce explicit workflow state instead of silent continuation.
- UAT / human verification: a human-driven `gsd-2` session can manually trigger review and inspect status/decision visibility from inside the product surface.

## Milestone Definition of Done

This milestone is complete only when all are true:

- all slice deliverables are complete
- `gsd-2` talks to the standalone broker through the direct typed-client seam for deterministic review behavior
- the bundled `gsd` extension owns a real review-before-progression gate in the live finalize path
- manual review trigger/status commands work inside `gsd-2` against the same broker state the gate uses
- blocked-review and broker-failure outcomes are visible and policy-driven rather than implicit or hardcoded
- final integrated acceptance is re-proved against a separate broker process in real local runtime conditions

## Requirement Coverage

- Covers: R006, R008, R009, R010
- Leaves for later by existing owner: R011, R012
- Already validated or retired by M001: R001, R002, R003, R004, R005, R007
- Deferred separately: R013, R014
- Orphan risks: none

### Coverage Summary

| Requirement | M002 disposition | Primary owner | Supporting slices | Planning note |
|---|---|---|---|---|
| R006 | mapped | M001/S04 | M002/S01, M002/S02 | M002 consumes the typed client as the deterministic seam rather than redefining transport. |
| R008 | mapped | M002/S01 | M002/S02, M002/S03 | The adapter boundary lands first so workflow-specific `.gsd` knowledge stays on the `gsd-2` side. |
| R009 | mapped | M002/S01 | M002/S03, M002/S04 | The first shipped gate is review-before-progression in the real auto finalize path. |
| R010 | mapped | M001/S03 | M002/S03, M002/S04 | M001 validated broker visibility; M002 extends that visibility into the integrated workflow gate and command surfaces. |
| R011 | out of milestone scope | M004/S01 | M004/S02 | Dashboard work remains later and is not required for M002 completion. |
| R012 | out of milestone scope | M003/S01 | M003/S02, M001/S03 | M002 needs durable gate continuity, but full reviewer/process continuity remains a later milestone. |

## Slices

- [x] **S01: Broker-backed auto review gate** `risk:high` `depends:[]`
  > Demo: a real `gsd-2` auto run reaches the review gate after verification, submits through the typed client, and only progresses when the broker decision allows it.
  > Closer status: implementation advanced in `gsd-2`, but required slice verification is still blocked by the current test/runtime harness from this tandem worktree context; do not treat this slice as complete yet.

- [x] **S02: Manual review trigger and status surfaces** `risk:medium` `depends:[S01]`
  > Demo: from inside `gsd-2`, a human can run manual review and review-status commands, see the active review id and decision/status visibility, and inspect the same broker state used by auto-mode.

- [x] **S03: Blocked-review policy and gate continuity** `risk:medium` `depends:[S01,S02]`
  > Demo: blocked reviews follow mode-aware defaults, broker failures pause visibly, and resume/restart behavior preserves the active review context instead of duplicating or losing it.

- [x] **S04: Real-runtime integrated proof** `risk:medium` `depends:[S01,S02,S03]`
  > Demo: a separate standalone broker process and a real `gsd-2` session prove that auto gating and manual review/status operations converge on one broker-backed workflow in local runtime conditions.

## Slice Proof and Verification Notes

### S01

- **Scope:** add a dedicated `review` preference block, create the `gsd-2`-side review adapter over `.gsd` artifacts and unit metadata, normalize broker decisions for workflow use, and patch `auto-loop.ts` between verification and `postUnitPostVerification()`.
- **Proof strategy:** prove the risky path first by using the real finalize seam, not a standalone helper or simulated dispatch path.
- **Verification classes:** auto-loop unit tests around gate insertion and control-flow sentinels; preference validation tests for the new `review` block; adapter tests for payload mapping and decision normalization.

### S02

- **Scope:** add first-class `/gsd review` and `/gsd review-status` style commands, update dispatcher/catalog/completions, and reuse the same adapter/client mapping from S01.
- **Proof strategy:** force the manual and automatic surfaces to consume one normalized review contract so payload or status drift becomes mechanically visible.
- **Verification classes:** command-handler tests, command catalog/completion coverage, and local command-path verification against broker-backed review state.

### S03

- **Scope:** add mode-aware blocked-review policy resolution, durable review gate state on `AutoSession`, explicit broker-unavailable handling, and restart/resume continuity for the integrated gate.
- **Proof strategy:** prove the workflow does the right thing when review blocks or infrastructure fails, because silent continuation is the milestone’s highest operational risk after basic gate insertion.
- **Verification classes:** auto-loop tests for auto-loop vs intervention behavior, persistence/recovery tests for active review state, and visibility checks for blocked/failure conditions.

### S04

- **Scope:** run the assembled system through the real entrypoints with a separate broker process, shared SQLite state, manual commands, and auto-mode gate behavior.
- **Proof strategy:** close the milestone with real integrated evidence instead of relying on isolated in-process tests.
- **Verification classes:** cross-runtime integration tests and/or scripted proof runs, plus human-observable command/status confirmation from inside `gsd-2`.

## Boundary Map

### S01 → S02

Produces:
- dedicated `review` preference schema, validation rules, and defaults for broker transport and gate behavior
- one `gsd-2` review adapter that resolves `.gsd` artifacts, current unit metadata, submission payloads, and normalized decision/status shapes
- the real broker-backed auto finalize seam between verification and post-verification progression
- initial review gate session state for the current auto unit

Consumes:
- M001 typed client and canonical broker operation contract
- existing `gsd-2` finalize flow in `auto-loop.ts`, `auto-post-unit.ts`, and `auto-verification.ts`

### S01 → S03

Produces:
- normalized allow/block/error review outcomes inside runtime-owned TypeScript code
- explicit gate-owned session state instead of treating review as an implicit verification side effect
- baseline review submission/status lifecycle that blocked-review policy can build on

Consumes:
- M001 typed client and broker runtime contract
- existing auto-loop pause/retry control-flow patterns

### S02 → S03

Produces:
- first-class manual command entrypoints that read/write the same broker-backed review state as the auto gate
- shared status/decision presentation vocabulary visible from inside `gsd-2`
- command-surface proof that the adapter contract is reusable outside auto-mode

Consumes from S01:
- review adapter, normalized decision/status contract, and review preferences

### S03 → S04

Produces:
- mode-aware blocked-review policy resolution for auto-mode and human-driven sessions
- durable review gate state for pause/resume/restart handling
- explicit broker-failure and blocked-review visibility in integrated workflow state

Consumes from S01:
- finalize seam integration and review adapter

Consumes from S02:
- manual trigger/status command surfaces

## Milestone Final Integrated Acceptance

The milestone closes only when the assembled system proves all of the following in a real local environment:

1. `gsd-2` auto-mode submits review to the standalone broker after verification and before post-verification progression.
2. An allowed broker decision lets the same run continue correctly through the existing finalize path.
3. A blocking broker decision follows the configured response policy: auto-loop by default for auto-mode, human intervention by default for human-driven runs unless overridden.
4. Manual review trigger and review-status commands inside `gsd-2` inspect the same active review state the automatic gate uses.
5. Broker unavailability or blocked state is surfaced clearly enough that the workflow stops or pauses for an explicit reason rather than drifting.
