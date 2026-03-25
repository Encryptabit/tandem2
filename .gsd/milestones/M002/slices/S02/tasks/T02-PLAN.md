---
estimated_steps: 4
estimated_files: 5
skills_used:
  - gsd
  - create-gsd-extension
  - debug-like-expert
  - test
  - review
  - lint
---

# T02: Add `/gsd review-status` and reuse live gate state

**Slice:** S02 — Manual review trigger and status surfaces
**Milestone:** M002

## Description

Expose the same live review state model that auto-mode already records instead of inventing a second cache for commands. This task adds `/gsd review-status`, bridges command code to `AutoSession.reviewGateState`, and proves that manual status reads and broker lookups use the same normalized vocabulary as the auto gate.

## Steps

1. Export a minimal accessor from `/home/cari/repos/gsd-2/src/resources/extensions/gsd/auto.ts` over the existing `AutoSession.reviewGateState` model so command code can inspect live gate state without mutating `AutoSession` internals directly.
2. Extend `/home/cari/repos/gsd-2/src/resources/extensions/gsd/review/runtime.ts` with status helpers that can read the current live gate state, resolve an explicit unit or review target, and query broker status through the same normalized adapter/client path used by `/gsd review`.
3. Update `/home/cari/repos/gsd-2/src/resources/extensions/gsd/commands/handlers/review.ts` to implement `/gsd review-status`, showing unit ID, review ID, normalized status/decision, summary, and sanitized broker/client errors.
4. Add `/home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/review-status-command.test.ts` and extend `/home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/auto-review-gate.test.ts` so the command path proves convergence with live gate state instead of a second command-local model.

## Must-Haves

- [ ] `AutoSession.reviewGateState` remains the single inspectable in-memory review-state model for both auto-mode and manual status surfaces.
- [ ] `/gsd review-status` uses the shared normalized review contract for status, decision, summary, and error display.
- [ ] Broker-unavailable or missing-review conditions are explicit in command output and tests, not silent fallthroughs.

## Verification

- `node --import /home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test /home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/review-status-command.test.ts /home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/auto-review-gate.test.ts`
- `rg -n "reviewGateState|review-status|decision|summary|error" /home/cari/repos/gsd-2/src/resources/extensions/gsd/auto.ts /home/cari/repos/gsd-2/src/resources/extensions/gsd/commands/handlers/review.ts /home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/review-status-command.test.ts`

## Observability Impact

- Signals added/changed: manual status output and auto-session access now expose the same unit ID, review ID, phase, normalized status/decision, summary, and sanitized error fields.
- How a future agent inspects this: run `/gsd review-status`, inspect the exported accessor in `/home/cari/repos/gsd-2/src/resources/extensions/gsd/auto.ts`, or rerun `/home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/review-status-command.test.ts`.
- Failure state exposed: stuck review IDs, broker-unavailable responses, and absent live gate state become visible enough to diagnose whether the issue is command targeting, broker connectivity, or workflow state.

## Inputs

- `/home/cari/repos/gsd-2/src/resources/extensions/gsd/review/runtime.ts` — shared manual review runtime created in T01.
- `/home/cari/repos/gsd-2/src/resources/extensions/gsd/commands/handlers/review.ts` — deterministic `/gsd review` command handler from T01.
- `/home/cari/repos/gsd-2/src/resources/extensions/gsd/auto.ts` — private singleton owner of `AutoSession` state.
- `/home/cari/repos/gsd-2/src/resources/extensions/gsd/auto/session.ts` — existing `reviewGateState` data model.
- `/home/cari/repos/gsd-2/src/resources/extensions/gsd/review/gate.ts` — gate behavior whose state model manual status must reuse.

## Expected Output

- `/home/cari/repos/gsd-2/src/resources/extensions/gsd/auto.ts` — exported live review-state accessor over the existing auto session.
- `/home/cari/repos/gsd-2/src/resources/extensions/gsd/review/runtime.ts` — shared status helpers built on the normalized review contract.
- `/home/cari/repos/gsd-2/src/resources/extensions/gsd/commands/handlers/review.ts` — `/gsd review-status` implementation.
- `/home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/auto-review-gate.test.ts` — convergence coverage for manual status vs gate state.
- `/home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/review-status-command.test.ts` — focused tests for `/gsd review-status` behavior.
