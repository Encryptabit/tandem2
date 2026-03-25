---
estimated_steps: 5
estimated_files: 6
skills_used:
  - gsd
  - create-gsd-extension
  - debug-like-expert
  - test
  - review
  - lint
---

# T03: Insert the broker gate into the real auto finalize seam and expose gate diagnostics

**Slice:** S01 — Broker-backed auto review gate
**Milestone:** M002

## Description

Patch the risky seam the roadmap calls out: the real post-verification path in `auto-loop.ts`. This task wires the typed-client-backed review gate into the live finalize flow, makes gate state explicit on `AutoSession`, and proves that only allow outcomes reach `postUnitPostVerification()`.

## Steps

1. Add `/home/cari/repos/gsd-2/src/resources/extensions/gsd/review/gate.ts` as the dedicated runtime module that consumes the adapter, current unit/session state, and effective review preferences to produce explicit allow/block/error outcomes.
2. Extend `/home/cari/repos/gsd-2/src/resources/extensions/gsd/auto/session.ts` with review-gate state fields that preserve the active review ID, current gate phase, last normalized outcome, and last sanitized broker error for the current unit.
3. Wire the gate into `/home/cari/repos/gsd-2/src/resources/extensions/gsd/auto.ts` and `/home/cari/repos/gsd-2/src/resources/extensions/gsd/auto-loop.ts` so the real finalize path runs review gating after `runPostUnitVerification()` and before `postUnitPostVerification()`, while hook sidecars continue to bypass the gate.
4. Add `/home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/auto-review-gate.test.ts` for allow, block, and broker-unavailable/error behavior, and update `/home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/auto-loop.test.ts` so the call-order proof covers the new gate seam explicitly.
5. Keep diagnostics redaction-safe: emit review IDs, decision/status, and summarized errors only, never raw diff content or patch bodies.

## Must-Haves

- [ ] `auto-loop.ts` calls the new review gate in the live finalize sequence between verification and `postUnitPostVerification()`.
- [ ] `AutoSession` exposes enough gate state that a blocked or failed review is inspectable instead of looking like a silent stall.
- [ ] Tests prove that only allow outcomes reach `postUnitPostVerification()`, while block/error outcomes remain explicit and visible.

## Verification

- `node --import /home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test /home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/auto-review-gate.test.ts /home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/auto-loop.test.ts`
- `rg -n 'review gate|runPostUnitVerification|postUnitPostVerification|reviewId|lastReview' /home/cari/repos/gsd-2/src/resources/extensions/gsd/auto-loop.ts /home/cari/repos/gsd-2/src/resources/extensions/gsd/auto/session.ts /home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/auto-review-gate.test.ts`

## Observability Impact

- Signals added/changed: explicit session-state fields and debug-log phases for review submit, wait/poll, allow, block, and broker-error transitions.
- How a future agent inspects this: inspect `AutoSession` snapshots or rerun `/home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/auto-review-gate.test.ts` to see the exact gate state for each outcome.
- Failure state exposed: the active review ID, gate phase, normalized outcome, and last broker error remain visible when the loop stops or pauses instead of disappearing into generic verification flow.

## Inputs

- `/home/cari/repos/gsd-2/src/resources/extensions/gsd/auto-loop.ts` — current verification → post-verification seam.
- `/home/cari/repos/gsd-2/src/resources/extensions/gsd/auto.ts` — loop dependency wiring and runtime composition.
- `/home/cari/repos/gsd-2/src/resources/extensions/gsd/auto/session.ts` — mutable auto-session state that must now include gate diagnostics.
- `/home/cari/repos/gsd-2/src/resources/extensions/gsd/review/adapter.ts` — shared adapter from T02.
- `/home/cari/repos/gsd-2/src/resources/extensions/gsd/review/index.ts` — stable review exports from T02.
- `/home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/auto-loop.test.ts` — existing finalize-order regression coverage.

## Expected Output

- `/home/cari/repos/gsd-2/src/resources/extensions/gsd/review/gate.ts` — runtime review gate used by the auto loop.
- `/home/cari/repos/gsd-2/src/resources/extensions/gsd/auto/session.ts` — persisted gate diagnostics on session state.
- `/home/cari/repos/gsd-2/src/resources/extensions/gsd/auto.ts` — composed gate dependency wiring.
- `/home/cari/repos/gsd-2/src/resources/extensions/gsd/auto-loop.ts` — live finalize seam patched with the broker gate.
- `/home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/auto-review-gate.test.ts` — focused allow/block/error gate proof.
- `/home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/auto-loop.test.ts` — updated orchestration-order regression checks.
