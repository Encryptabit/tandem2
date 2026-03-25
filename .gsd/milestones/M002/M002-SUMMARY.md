---
id: M002
title: GSD2 integration and review gating
status: complete
verification_verdict: needs-attention
completed_on: 2026-03-21
validated_requirements:
  - R008
  - R009
advanced_requirements: []
requirement_outcomes:
  - id: R008
    from_status: active
    to_status: validated
    proof: "S04 re-proved that manual submit/status and finalizeReviewForUnit() both reuse the gsd-side review/runtime.ts seam while the spawned broker fixture consumes only normalized transport payloads; .tmp-review-runtime-proof/proof-summary.json shows manual and automatic flows converging on one persisted review lineage without leaking .gsd artifact resolution into broker core."
  - id: R009
    from_status: active
    to_status: validated
    proof: "S03 proved allow/block/wait/error control flow in the local finalize seam, and S04 re-proved the real broker-backed gate with allow-path regression coverage plus blocked/wait/error paused-session artifacts and durable broker rows under .tmp-review-runtime-proof/."
---

# M002: GSD2 integration and review gating

## Outcome
M002 is complete, but milestone verification remains **needs-attention** rather than a clean pass. The milestone's functional goals were met: the bundled `gsd` extension now submits review through the direct typed broker seam, gates post-verification progression on broker decisions, exposes manual `/gsd review` and `/gsd review-status` commands over the same runtime-owned state model, and preserves blocked/wait/error visibility through pause and restart. However, the milestone ledger still contains one closure wrinkle: `S01-SUMMARY.md` explicitly says S01 was not slice-complete under its original external `gsd-2` harness, while S03/S04 later restored a local in-worktree substrate and re-proved the integrated behavior there. That mismatch is why closeout is `needs-attention` instead of `pass`.

## What shipped in this milestone
- A dedicated top-level `review` preference block plus consumer-owned review normalization/types on the `gsd` side.
- A real finalize-path review gate in `src/resources/extensions/gsd/review/gate.ts` inserted between verification and `postUnitPostVerification()`.
- Shared runtime-owned submit/status handling in `src/resources/extensions/gsd/review/runtime.ts` reused by auto-mode, `/gsd review`, and `/gsd review-status`.
- A single inspectable `AutoSession.reviewGateState` surface plus `pausedReviewState` persistence for restart/paused-session continuity.
- Mode-aware blocked-review handling (`auto-loop` for auto sessions, `intervene` for human sessions by default) with explicit wait/block/error pause behavior.
- Real-runtime proof infrastructure under `.tmp-review-runtime-proof/` showing cross-process broker interaction, durable SQLite rows, paused-session envelopes, and reused review IDs across auto/manual flows.

## Success criteria verification

### 1. A real `gsd-2` auto-mode run submits the just-completed unit to the standalone broker after verification and before post-verification progression
**Result:** met

**Evidence**
- S01 inserted the review gate between `runPostUnitVerification()` and `postUnitPostVerification()`.
- S03 verified the finalize seam locally and confirmed only review `allow`/`skipped` continue past the gate.
- S04 re-proved the broker-backed finalize behavior against a spawned broker with durable state; `.tmp-review-runtime-proof/proof-summary.json` shows `finalize.action: "pause"` for wait/block/error scenarios and reused review lineage across retries/status checks.

### 2. An approved broker decision allows the same auto run to continue into the existing post-verification path instead of stalling or re-dispatching the wrong work
**Result:** met

**Evidence**
- S04's verification matrix explicitly kept allow-path regression coverage green in `auto-loop.test.ts`.
- `M002-VALIDATION.md` records the allow-path check as satisfied.
- The S03/S04 control-flow contract keeps `allow` and `skipped` as the only outcomes that reach `postUnitPostVerification()`.

### 3. A blocking broker decision does not silently fall through: auto-mode follows its configured blocked-review policy and human-driven runs surface an intervention path by default
**Result:** met

**Evidence**
- S03 proved mode-aware blocked-policy resolution: auto mode defaults to `auto-loop`, human mode defaults to `intervene`, and explicit preferences override the default.
- S03 verified blocked/wait/error branches pause or retry visibly instead of falling through.
- S04's proof artifacts show blocked visibility and error visibility in `.tmp-review-runtime-proof/proof-summary.json`, including `reason: "review-blocked"`, `blockedPolicy: "intervene"`, and sanitized `broker_unavailable` errors.

### 4. A human can run review-trigger and review-status commands from inside `gsd-2` and see the same broker review state the automatic gate uses
**Result:** met

**Evidence**
- S02 delivered first-class `/gsd review` and `/gsd review-status` handlers on top of the shared runtime seam.
- S02 verified live-state reuse through `getAutoReviewGateState()` instead of a second command-local cache.
- S04 re-proved that manual submit/status converge on the same persisted review lineage and `AutoSession.reviewGateState` used by the gate.

### 5. Broker connection problems, blocked reviews, and resume/restart state are visible enough inside `gsd-2` that the workflow does not drift or hide why it stopped
**Result:** met

**Evidence**
- S03 added `pausedReviewState`, restart rehydration, and paused-state `/gsd review-status` fallback.
- S04 preserved those signals in proof artifacts: `.tmp-review-runtime-proof/broker-rows.json`, per-scenario `paused-session.json` files, and deterministic command/status outputs.
- The inspected wait-continuity paused envelope shows `schemaVersion`, `savedAt`, `reviewId`, `status`, `decision`, `blockedPolicy`, and summary persisted without raw diff/patch bodies.

### Criteria not met
None.

## Definition of done verification
- **All slice summaries exist:** verified. `S01-SUMMARY.md` through `S04-SUMMARY.md` are present under `.gsd/milestones/M002/slices/`.
- **All slices are marked `[x]` in the roadmap:** verified from the inlined roadmap context.
- **Cross-slice integration points work correctly:** verified. S02-S04 all reuse `review/runtime.ts`, `review/gate.ts`, `AutoSession.reviewGateState`, and the same paused review-state contract.
- **Milestone definition-of-done is cleanly satisfied:** **not fully verified.** The functional integrated proof is present, but the milestone ledger still contains an unresolved slice-closure mismatch because `S01-SUMMARY.md` says the slice is not complete under its original external-harness proof target. Later slices closed the behavioral gap on the restored local substrate, but the slice ledger itself was never reconciled.

## Closeout evidence inspected
- `.gsd/milestones/M002/slices/S01/S01-SUMMARY.md`
- `.gsd/milestones/M002/slices/S02/S02-SUMMARY.md`
- `.gsd/milestones/M002/slices/S03/S03-SUMMARY.md`
- `.gsd/milestones/M002/slices/S04/S04-SUMMARY.md`
- `.gsd/milestones/M002/M002-VALIDATION.md`
- `.tmp-review-runtime-proof/proof-summary.json`
- `.tmp-review-runtime-proof/broker-rows.json`
- `.tmp-review-runtime-proof/wait-continuity/.gsd/runtime/paused-session.json`

## Requirement status transitions
The following requirement transitions are supported by milestone evidence:

| Requirement | Transition | Proof summary |
| --- | --- | --- |
| R008 | active → validated | S04 proved that `.gsd` artifact resolution, current-unit mapping, and review submit/status normalization remain in `src/resources/extensions/gsd/review/runtime.ts` while the spawned broker consumes only normalized transport payloads. |
| R009 | active → validated | S03 proved real review-before-progression control flow on the local finalize seam, and S04 re-proved it against a spawned broker with allow-path regression coverage plus wait/block/error paused artifacts and durable broker rows. |

No additional status transitions were validated at closeout. R006 and R010 were strengthened by M002 evidence but were already validated before this milestone closeout, while R011 and R012 remain active for later milestones.

## Cross-slice integration verification
No functional cross-slice integration gaps were found.

- **S01 → S02:** manual commands reuse the same normalized review contract instead of inventing separate payload/status logic.
- **S01/S02 → S03:** blocked-policy resolution, pause continuity, and status visibility build on `AutoSession.reviewGateState` rather than a second cache.
- **S02/S03 → S04:** the spawned-broker proof shows auto finalize, manual submit, manual status, paused-session continuity, and durable broker rows all converge on one broker-backed state model.
- **Outstanding wrinkle:** the execution substrate changed mid-milestone from an external `gsd-2` target to a restored local in-worktree substrate. The functional proof is green there, but S01's earlier summary was not reconciled to that new proof basis.

## Requirement coverage result
- **Validated in M002:** R008, R009
- **Strengthened with additional integrated proof but not newly transitioned:** R006, R010
- **Left active for later milestones:** R011, R012
- **Already validated before M002 and still relied upon here:** R006, R010
- **Deferred separately:** R013, R014
- **Out of scope:** R015, R016, R017

## Reusable lessons from the milestone
- Keep review configuration in a dedicated top-level `review` block and keep `.gsd` artifact resolution/decision normalization in the consumer adapter/runtime layer.
- Use `AutoSession.reviewGateState` as the single in-memory review visibility surface and expose it through a narrow accessor instead of a second status cache.
- Persist paused continuity as a schema-tagged `pausedReviewState` envelope so restart and manual status inspection can share one serialized contract.
- For focused tandem strip-types verification, solve missing runtime dependencies with loader shims/static-source assertions rather than redirecting broad package trees into unsupported raw TS sources.
- When proof infrastructure must preserve multiple paused-session states, give each scenario its own project root while sharing one broker database so review-lineage reuse stays inspectable.

## Remaining gaps / next milestone handoff
M002 closes the integrated review-gating milestone behavior, but its closeout verdict remains `needs-attention` until the S01 slice ledger mismatch is explicitly reconciled. M003 should treat the shipped `review/runtime.ts`, `review/gate.ts`, `AutoSession.reviewGateState`, and `pausedReviewState` envelope as locked integration seams and focus on broader runtime hardening/recovery rather than reinventing review-state handling.

## Bottom line
M002 delivered broker-backed review gating inside the `gsd` extension, converged auto and manual review surfaces on one runtime-owned state model, and produced durable cross-process proof against a spawned standalone broker. The milestone's functional acceptance is met, but the closeout record is not a clean pass because S01's original incomplete-harness summary was never reconciled after later slices finished the proof on the restored local substrate.
