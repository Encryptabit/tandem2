---
estimated_steps: 4
estimated_files: 7
skills_used:
  - gsd
  - create-gsd-extension
  - test
  - review
  - lint
---

# T01: Define review preferences and normalized gate contract

**Slice:** S01 — Broker-backed auto review gate
**Milestone:** M002

## Description

Make broker-backed review a first-class `gsd-2` concept before touching the auto loop. This task adds the dedicated `review` preference block, documents it in the existing preference surfaces, and creates the normalized review decision/status types that later tasks will share.

## Steps

1. Extend `/home/cari/repos/gsd-2/src/resources/extensions/gsd/preferences-types.ts` with a dedicated `review` preference block that covers the minimal S01 transport/gate fields and forward-compatible blocked-policy fields already implied by D008.
2. Update `/home/cari/repos/gsd-2/src/resources/extensions/gsd/preferences-validation.ts` and `/home/cari/repos/gsd-2/src/resources/extensions/gsd/preferences.ts` so the new block is validated, merged, and treated as a known preference without unknown-key warnings.
3. Add the normalized review decision/status contract in `/home/cari/repos/gsd-2/src/resources/extensions/gsd/review/types.ts`; keep it runtime-owned and suitable for both automatic gating and later manual commands.
4. Update `/home/cari/repos/gsd-2/src/resources/extensions/gsd/templates/preferences.md`, `/home/cari/repos/gsd-2/src/resources/extensions/gsd/docs/preferences-reference.md`, and `/home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/review-preferences.test.ts` so the new preference block and contract are documented and mechanically proven.

## Must-Haves

- [ ] `review` is a real top-level preference block, not an ad hoc object hidden inside verification settings or auto-loop code.
- [ ] Validation, merge behavior, and docs cover the same field names and defaults so later tasks can rely on one canonical config surface.
- [ ] `/home/cari/repos/gsd-2/src/resources/extensions/gsd/review/types.ts` defines explicit normalized allow/block/error review outcomes for the gate.

## Verification

- `node --import /home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test /home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/review-preferences.test.ts`
- `rg -n '"review"|review\?:|interface .*Review' /home/cari/repos/gsd-2/src/resources/extensions/gsd/preferences-types.ts /home/cari/repos/gsd-2/src/resources/extensions/gsd/review/types.ts`

## Inputs

- `/home/cari/repos/gsd-2/src/resources/extensions/gsd/preferences-types.ts` — existing preference type definitions and known-key list.
- `/home/cari/repos/gsd-2/src/resources/extensions/gsd/preferences-validation.ts` — current validation patterns for top-level preference blocks.
- `/home/cari/repos/gsd-2/src/resources/extensions/gsd/preferences.ts` — merge/default behavior that must absorb the new `review` block.
- `/home/cari/repos/gsd-2/src/resources/extensions/gsd/templates/preferences.md` — canonical editable preference template.
- `/home/cari/repos/gsd-2/src/resources/extensions/gsd/docs/preferences-reference.md` — user-facing field documentation.

## Expected Output

- `/home/cari/repos/gsd-2/src/resources/extensions/gsd/preferences-types.ts` — review preference types and known-key registration.
- `/home/cari/repos/gsd-2/src/resources/extensions/gsd/preferences-validation.ts` — review validation rules.
- `/home/cari/repos/gsd-2/src/resources/extensions/gsd/preferences.ts` — review merge/default handling.
- `/home/cari/repos/gsd-2/src/resources/extensions/gsd/templates/preferences.md` — template entries for the review block.
- `/home/cari/repos/gsd-2/src/resources/extensions/gsd/docs/preferences-reference.md` — reference docs for review settings.
- `/home/cari/repos/gsd-2/src/resources/extensions/gsd/review/types.ts` — normalized review outcome and status contract.
- `/home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/review-preferences.test.ts` — tests for config and contract coverage.

## Observability Impact

- New inspectable surface: the dedicated `review` preference block and runtime-owned review contract give later adapter/gate code one canonical vocabulary for transport, blocked-policy, decision, and status fields.
- Inspection path for later agents: `preferences-reference.md` documents the stable field names/defaults, and `review-preferences.test.ts` proves validation, merge expectations, and allow/block/error contract coverage.
- Failure visibility added by this task: invalid review configuration now surfaces as explicit validation errors or unknown-key warnings instead of being silently ignored until auto-loop wiring lands.
- Redaction requirement: examples and diagnostics in this task must stay limited to transport metadata, policy values, status/decision enums, and sanitized summaries only — never raw diffs, patch bodies, or secrets.
