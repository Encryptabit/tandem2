---
estimated_steps: 4
estimated_files: 6
skills_used:
  - gsd
  - create-gsd-extension
  - test
  - review
  - lint
---

# T01: Ship `/gsd review` on the shared review runtime seam

**Slice:** S02 — Manual review trigger and status surfaces
**Milestone:** M002

## Description

Create the shared runtime seam S02 needs while still landing a real user-facing command. This task adds the reusable review runtime/client path, routes `/gsd review` through a dedicated deterministic handler, and makes the auto gate consume the same seam so manual and automatic submission logic cannot drift.

## Steps

1. Add `/home/cari/repos/gsd-2/src/resources/extensions/gsd/review/runtime.ts` to create the real review client from resolved `review` preferences, normalize explicit vs current unit targeting, and wrap review submission/status calls around `buildReviewSubmission()` and the existing normalization helpers in `review/adapter.ts`.
2. Add `/home/cari/repos/gsd-2/src/resources/extensions/gsd/commands/handlers/review.ts` with a deterministic `/gsd review` handler, and keep `/home/cari/repos/gsd-2/src/resources/extensions/gsd/commands/handlers/ops.ts` as thin routing only.
3. Update `/home/cari/repos/gsd-2/src/resources/extensions/gsd/review/gate.ts` to consume the shared runtime/client seam instead of a separate unavailable-client default path, so both manual and automatic submission use one broker integration contract.
4. Add `/home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/review-runtime.test.ts` and `/home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/review-command.test.ts` covering explicit/implicit target resolution, adapter reuse, and clear broker-unavailable errors.

## Must-Haves

- [ ] `/gsd review` uses the shared adapter and typed client path rather than duplicating `.gsd` artifact resolution or broker normalization inside a command handler.
- [ ] Explicit unit IDs and default-to-current-unit behavior both resolve through one targeting helper so manual commands follow the same unit identity rules as auto-mode.
- [ ] The auto review gate consumes the same runtime/client seam, eliminating separate manual vs automatic submission behavior.

## Verification

- `node --import /home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test /home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/review-runtime.test.ts /home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/review-command.test.ts`
- `rg -n "handleReview|buildReviewSubmission|createReview\(|getReviewStatus\(" /home/cari/repos/gsd-2/src/resources/extensions/gsd/commands/handlers/review.ts /home/cari/repos/gsd-2/src/resources/extensions/gsd/review/runtime.ts /home/cari/repos/gsd-2/src/resources/extensions/gsd/review/gate.ts`

## Observability Impact

- Signals added/changed: manual review submission now produces normalized review IDs, unit IDs, and sanitized broker-error summaries through the same runtime seam used by the gate.
- How a future agent inspects this: rerun `/home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/review-runtime.test.ts` or call `/gsd review <unit>` and inspect the normalized output path in `/home/cari/repos/gsd-2/src/resources/extensions/gsd/commands/handlers/review.ts`.
- Failure state exposed: unavailable-client, missing-target, and submission normalization failures become explicit command errors instead of hidden fallback behavior.

## Inputs

- `/home/cari/repos/gsd-2/src/resources/extensions/gsd/review/adapter.ts` — approved `gsd-2` adapter for `.gsd` artifacts, unit metadata, and normalized broker responses.
- `/home/cari/repos/gsd-2/src/resources/extensions/gsd/review/gate.ts` — current auto-gate implementation that still owns a separate client-creation fallback.
- `/home/cari/repos/gsd-2/src/resources/extensions/gsd/commands/handlers/ops.ts` — existing operational command router where manual review commands will be dispatched.
- `/home/cari/repos/gsd-2/src/resources/extensions/gsd/state.ts` — current active milestone/slice/task lookup for implicit unit targeting.
- `/home/cari/repos/gsd-2/src/resources/extensions/gsd/auto-dispatch.ts` — canonical execute-task unit ID shape.
- `/home/cari/repos/gsd-2/src/resources/extensions/gsd/commands-maintenance.ts` — prior-art normalization for explicit unit arguments.

## Expected Output

- `/home/cari/repos/gsd-2/src/resources/extensions/gsd/review/runtime.ts` — shared review runtime for client creation, target resolution, and submit/status helpers.
- `/home/cari/repos/gsd-2/src/resources/extensions/gsd/review/gate.ts` — auto gate updated to consume the shared runtime/client seam.
- `/home/cari/repos/gsd-2/src/resources/extensions/gsd/commands/handlers/review.ts` — dedicated manual review command handler.
- `/home/cari/repos/gsd-2/src/resources/extensions/gsd/commands/handlers/ops.ts` — thin routing to the new review handler.
- `/home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/review-runtime.test.ts` — focused tests for shared runtime behavior.
- `/home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/review-command.test.ts` — focused tests for `/gsd review` behavior.
