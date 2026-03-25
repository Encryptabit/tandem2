---
estimated_steps: 4
estimated_files: 6
skills_used:
  - gsd
  - create-gsd-extension
  - debug-like-expert
  - test
  - review
---

# T02: Build the `gsd-2` review adapter over `.gsd` artifacts and unit metadata

**Slice:** S01 — Broker-backed auto review gate
**Milestone:** M002

## Description

Create the reusable adapter layer that turns the current `gsd-2` unit context into broker-facing review requests and normalized decision/status responses. This is the R008 boundary: `.gsd` artifact resolution and unit metadata mapping stay on the host side instead of leaking into broker-core.

## Steps

1. Use `/home/cari/repos/gsd-2/src/resources/extensions/gsd/review/types.ts` from T01 to define the adapter input/output contract, keeping the broker transport behind a small runtime-facing client interface rather than `mcp_call`.
2. Implement `/home/cari/repos/gsd-2/src/resources/extensions/gsd/review/adapter.ts` so it resolves the current milestone/slice/task context, relevant `.gsd` artifacts, and submission metadata using existing helpers in `/home/cari/repos/gsd-2/src/resources/extensions/gsd/files.ts` and `/home/cari/repos/gsd-2/src/resources/extensions/gsd/paths.ts`.
3. Add `/home/cari/repos/gsd-2/src/resources/extensions/gsd/review/index.ts` as the stable entrypoint the auto gate and later manual command surfaces can share.
4. Write `/home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/review-adapter.test.ts` to prove payload mapping, normalized allow/block/error handling, and redaction-safe summaries for broker failures.

## Must-Haves

- [ ] The adapter is the only place in S01 that knows how to translate `.gsd` state and unit metadata into broker submission/status payloads.
- [ ] Broker responses are normalized into one allow/block/error contract that later command surfaces can reuse without reimplementing mapping logic.
- [ ] Tests prove that error/diagnostic summaries stay useful without logging raw diffs or patch bodies.

## Verification

- `node --import /home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test /home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/review-adapter.test.ts`
- `rg -n 'normalize|reviewId|allow|block|error' /home/cari/repos/gsd-2/src/resources/extensions/gsd/review/adapter.ts /home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/review-adapter.test.ts`

## Observability Impact

- Signals added/changed: normalized adapter results should carry review ID, review status/decision, and sanitized broker error details.
- How a future agent inspects this: run `/home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/review-adapter.test.ts` and inspect adapter return objects rather than reverse-engineering broker payloads from the auto loop.
- Failure state exposed: broker-unavailable, malformed response, and blocking-decision cases become explicit adapter outcomes instead of generic thrown errors.

## Inputs

- `/home/cari/repos/gsd-2/src/resources/extensions/gsd/review/types.ts` — normalized contract from T01.
- `/home/cari/repos/gsd-2/src/resources/extensions/gsd/files.ts` — artifact loading and summary parsing helpers.
- `/home/cari/repos/gsd-2/src/resources/extensions/gsd/paths.ts` — milestone/slice/task file resolution helpers.
- `/home/cari/repos/gsd-2/src/resources/extensions/gsd/preferences.ts` — access to effective review preferences.

## Expected Output

- `/home/cari/repos/gsd-2/src/resources/extensions/gsd/review/adapter.ts` — host-side adapter for broker submission/status operations.
- `/home/cari/repos/gsd-2/src/resources/extensions/gsd/review/index.ts` — shared entrypoint exports for later auto/manual reuse.
- `/home/cari/repos/gsd-2/src/resources/extensions/gsd/review/types.ts` — finalized adapter-facing contract updates.
- `/home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/review-adapter.test.ts` — focused adapter proof for payload mapping and normalization.
- `/home/cari/repos/gsd-2/src/resources/extensions/gsd/files.ts` — any small helper extraction needed for artifact resolution.
- `/home/cari/repos/gsd-2/src/resources/extensions/gsd/paths.ts` — any path helper additions needed by the adapter.
