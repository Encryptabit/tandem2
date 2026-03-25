---
estimated_steps: 5
estimated_files: 4
skills_used:
  - gsd
  - test
  - review
  - best-practices
  - debug-like-expert
---

# T03: Prove auto/manual convergence and persist runtime evidence

**Slice:** S04 — Real-runtime integrated proof
**Milestone:** M002

## Description

Close S04 with one assembled proof path that drives the real finalize seam, manual review submit/status handlers, and pause/restart continuity against the spawned broker fixture from T02. The proof must demonstrate that manual and automatic flows converge on one broker-backed review lineage, that blocked/wait/error visibility remains inspectable, and that the run leaves behind durable evidence under a deterministic temp root for later inspection.

## Steps

1. Add `src/resources/extensions/gsd/tests/review-real-runtime.test.ts` to exercise `finalizeReviewForUnit()`, manual review submit/status handlers, and `pauseAuto()` / `startAuto()` against the spawned broker transport.
2. Update `src/resources/extensions/gsd/tests/auto-loop.test.ts` and/or `src/resources/extensions/gsd/tests/review-pause-state.test.ts` only where needed to lock the new integrated continuity expectations without weakening existing in-process regression coverage.
3. Create `src/resources/extensions/gsd/tests/scripts/review-real-runtime-proof.ts` to run the assembled flow end-to-end and emit durable proof artifacts under `.tmp-review-runtime-proof/`.
4. Make the proof assert same-review reuse vs duplicate submission, blocked/wait/error visibility, paused-session persistence, and broker-row durability instead of relying on human inference from logs.
5. Keep the evidence redaction-safe: store IDs/status/summary metadata and paused-session envelopes, but do not persist raw diff or secret-bearing payload content.

## Must-Haves

- [ ] The integrated proof uses the spawned broker transport from T02 instead of object-literal mock transports.
- [ ] Auto finalize, manual review submit, and manual review status converge on one broker-backed review lineage that remains visible after pause/restart.
- [ ] The proof script leaves deterministic, inspectable evidence under `.tmp-review-runtime-proof/`.

## Verification

- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test ./src/resources/extensions/gsd/tests/review-real-runtime.test.ts`
- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types ./src/resources/extensions/gsd/tests/scripts/review-real-runtime-proof.ts && test -f .tmp-review-runtime-proof/proof-summary.json`

## Observability Impact

- Signals added/changed: integrated proof now records broker-backed review IDs, status/decision transitions, paused-session metadata, and finalize-path history in durable artifacts.
- How a future agent inspects this: run `src/resources/extensions/gsd/tests/review-real-runtime.test.ts`, inspect `.tmp-review-runtime-proof/proof-summary.json`, and inspect the paused-session and SQLite files written by `src/resources/extensions/gsd/tests/scripts/review-real-runtime-proof.ts`.
- Failure state exposed: duplicate-review submission, lost paused continuity, incorrect blocked-policy handling, and broker/process failures become mechanically asserted and artifact-visible.

## Inputs

- `src/resources/extensions/gsd/auto-loop.ts` — real finalize seam that must be exercised against the fixture transport
- `src/resources/extensions/gsd/auto.ts` — live/paused session persistence and restart behavior
- `src/resources/extensions/gsd/review/pause-state.ts` — persisted paused-review envelope contract
- `src/resources/extensions/gsd/review/runtime.ts` — shared manual submit/status runtime seam from T01
- `src/resources/extensions/gsd/commands/handlers/review.ts` — manual review/status handlers from T01
- `src/resources/extensions/gsd/tests/review-broker-transport.ts` — spawned fixture transport helper from T02
- `src/resources/extensions/gsd/tests/fixtures/review-broker-fixture.mjs` — broker process fixture from T02

## Expected Output

- `src/resources/extensions/gsd/tests/review-real-runtime.test.ts` — integrated auto/manual convergence proof against the spawned broker process
- `src/resources/extensions/gsd/tests/scripts/review-real-runtime-proof.ts` — deterministic proof runner that emits durable evidence artifacts
- `src/resources/extensions/gsd/tests/auto-loop.test.ts` — updated regression coverage for integrated finalize expectations where needed
- `src/resources/extensions/gsd/tests/review-pause-state.test.ts` — updated continuity coverage where needed
