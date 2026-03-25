---
estimated_steps: 5
estimated_files: 4
skills_used:
  - gsd
  - create-gsd-extension
  - test
  - best-practices
  - debug-like-expert
---

# T02: Add a spawned broker fixture with typed cross-process transport

**Slice:** S04 — Real-runtime integrated proof
**Milestone:** M002

## Description

Introduce the real runtime boundary S04 needs by adding a spawned broker fixture process and a typed test transport helper that talks to it. The fixture must persist review records into SQLite so the proof can inspect durable broker state without depending on a missing external broker checkout. Keep the existing `ReviewTransport` contract stable so runtime code continues to depend on the same narrow seam.

## Steps

1. Create `src/resources/extensions/gsd/tests/fixtures/review-broker-fixture.mjs` as a spawned broker fixture process that exposes submit/status behavior and writes review rows into a temp SQLite database.
2. Add `src/resources/extensions/gsd/tests/review-broker-transport.ts` to launch/stop the fixture, call its submit/status endpoints, and present the existing `ReviewTransport` shape to tests.
3. Write `src/resources/extensions/gsd/tests/review-broker-runtime.test.ts` to prove cross-process submit/status round-trips and durable SQLite row persistence.
4. Keep runtime production seams unchanged: the fixture/transport helper belongs only in test support and must not leak broker-specific wiring into `src/resources/extensions/gsd/review/gate.ts` or `src/resources/extensions/gsd/auto-loop.ts`.
5. Update `.gitignore` so deterministic temp directories created by the fixture/proof flow stay local and untracked.

## Must-Haves

- [ ] Tests launch a separate broker process rather than using object-literal in-process transports.
- [ ] Review submit/status round-trips preserve the existing `ReviewTransport` contract and prove persisted SQLite state exists after the process boundary is crossed.
- [ ] Temp runtime/proof directories used by the fixture are ignored in `.gitignore`.

## Verification

- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test ./src/resources/extensions/gsd/tests/review-broker-runtime.test.ts`
- `rg -n "tmp-review|review-runtime-proof" .gitignore`

## Observability Impact

- Signals added/changed: broker fixture status transitions and SQLite-backed review rows become inspectable during integration proof runs.
- How a future agent inspects this: run `src/resources/extensions/gsd/tests/review-broker-runtime.test.ts`, inspect fixture logs/test assertions, and inspect the temp SQLite file path emitted by the helper/test.
- Failure state exposed: broker process launch failures, transport call errors, and missing persisted review rows become explicit instead of being hidden behind in-memory doubles.

## Inputs

- `src/resources/extensions/gsd/review/types.ts` — authoritative `ReviewTransport` contract the helper must preserve
- `src/resources/extensions/gsd/review/gate.ts` — existing runtime consumer of `ReviewTransport`
- `src/resources/extensions/gsd/tests/resolve-ts.mjs` — strip-types test harness the new runtime test must reuse
- `.gitignore` — repository ignore rules that must cover deterministic temp proof roots

## Expected Output

- `src/resources/extensions/gsd/tests/fixtures/review-broker-fixture.mjs` — spawned broker fixture process with SQLite-backed state
- `src/resources/extensions/gsd/tests/review-broker-transport.ts` — typed helper for launching and calling the fixture
- `src/resources/extensions/gsd/tests/review-broker-runtime.test.ts` — focused cross-process transport and persistence proof
- `.gitignore` — ignore rules for deterministic temp broker/proof artifacts
