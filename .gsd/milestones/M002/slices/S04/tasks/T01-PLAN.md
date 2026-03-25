---
estimated_steps: 5
estimated_files: 4
skills_used:
  - gsd
  - create-gsd-extension
  - test
  - review
  - best-practices
  - debug-like-expert
---

# T01: Restore the shared manual review submit seam

**Slice:** S04 — Real-runtime integrated proof
**Milestone:** M002

## Description

Restore the missing manual review submit path inside the local `src/resources/extensions/gsd` subtree so S04 can prove that manual review trigger, manual review status, and auto review gating all operate on one runtime-owned review contract. This task should add the smallest submit-side seam necessary to reuse the existing normalization/state vocabulary without inventing a second status cache or leaking broker semantics into command-local code.

## Steps

1. Extend `src/resources/extensions/gsd/review/runtime.ts` with a submit-side helper that reuses the existing normalized review-state vocabulary and sanitized error handling.
2. Update `src/resources/extensions/gsd/commands/handlers/review.ts` to expose manual review submission behavior beside status handling while keeping broker payload/status interpretation inside the shared runtime module.
3. Add `src/resources/extensions/gsd/tests/review-command.test.ts` for current-unit submission, explicit target submission, shared review ID visibility, and sanitized broker failure output.
4. Update `src/resources/extensions/gsd/tests/review-status-command.test.ts` as needed so status assertions still prove the shared runtime path after manual submit exists.
5. Keep the implementation narrow: no new command-local review cache, no broker branching inside `src/resources/extensions/gsd/auto-loop.ts`, and no duplicate submit/status shaping in handlers.

## Must-Haves

- [ ] Manual review submission and manual review status both reuse shared runtime-owned normalization and sanitized error handling.
- [ ] Command output exposes the same review identity/state vocabulary the auto gate uses rather than a command-specific shape.
- [ ] Focused tests cover current-target submission, explicit-target submission, and failure visibility.

## Verification

- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test ./src/resources/extensions/gsd/tests/review-command.test.ts`
- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test ./src/resources/extensions/gsd/tests/review-status-command.test.ts`

## Observability Impact

- Signals added/changed: manual submit output now emits normalized review ID, status, decision, summary, and sanitized broker error information through the same runtime vocabulary used by status/gate code.
- How a future agent inspects this: run `src/resources/extensions/gsd/tests/review-command.test.ts` and inspect `src/resources/extensions/gsd/commands/handlers/review.ts` output formatting.
- Failure state exposed: missing target resolution, broker submission failure, and shared review-state visibility become explicit in deterministic command output.

## Inputs

- `src/resources/extensions/gsd/review/runtime.ts` — current read-side review normalization and sanitized error helpers
- `src/resources/extensions/gsd/commands/handlers/review.ts` — existing manual review status handler surface
- `src/resources/extensions/gsd/auto.ts` — current live/paused review-state accessor behavior
- `src/resources/extensions/gsd/tests/review-status-command.test.ts` — existing manual status coverage to preserve and extend

## Expected Output

- `src/resources/extensions/gsd/review/runtime.ts` — shared submit/status runtime helpers with normalized output
- `src/resources/extensions/gsd/commands/handlers/review.ts` — manual review submit handler/formatter integrated with status handling
- `src/resources/extensions/gsd/tests/review-command.test.ts` — focused coverage for manual submit behavior and failure visibility
- `src/resources/extensions/gsd/tests/review-status-command.test.ts` — updated status assertions that still prove shared-state convergence
