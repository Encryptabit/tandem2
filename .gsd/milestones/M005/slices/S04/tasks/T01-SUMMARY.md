---
id: T01
parent: S04
milestone: M005
provides:
  - counter-patch accept/reject CLI happy-path coverage
  - cross-surface shared-state proof (BrokerService → CLI)
  - MCP ↔ CLI parity completeness guard
key_files:
  - packages/review-broker-server/test/tandem-cli.test.ts
key_decisions:
  - Added a bidirectional parity mapping check (MCP→CLI and CLI→MCP) to catch both missing and stale entries
patterns_established:
  - Counter-patch seeding pattern: create(authorId=A) → claim → verdict(changes_requested) → addMessage(actorId=A) produces counterPatchStatus='pending'
  - Sanity-check assertions in beforeAll to fail fast if upstream seeding contracts change
observability_surfaces:
  - Parity mapping test fails on any MCP tool addition/removal without CLI mapping update
  - beforeAll throws descriptive error if counter-patch seeding doesn't produce expected 'pending' state
duration: 12m
verification_result: passed
completed_at: 2026-03-25
blocker_discovered: false
---

# T01: Add counter-patch happy paths, shared-state proof, and parity completeness test

**Added proposal accept/reject happy paths, cross-surface shared-state proof, and MCP↔CLI parity completeness guard to tandem-cli.test.ts (45 tests, all passing)**

## What Happened

Extended `tandem-cli.test.ts` with five new tests across four describe blocks:

1. **Counter-patch seeding** — Added a loop in `beforeAll` that creates `reviewId3` and `reviewId4` through the full counter-patch lifecycle (create → claim → verdict(changes_requested) → addMessage with actorId matching authorId). Each review reaches `counterPatchStatus: 'pending'`. A runtime assertion in the seeding loop verifies this invariant.

2. **`proposal accept` happy path** — Runs `tandem proposal accept reviewId3 --actor cli-tester --json` and asserts exit 0 with `counterPatchStatus: 'accepted'` in the JSON output.

3. **`proposal reject` happy path** — Runs `tandem proposal reject reviewId4 --actor cli-tester --json` and asserts exit 0 with `counterPatchStatus: 'rejected'` in the JSON output.

4. **Cross-surface shared state** — Reads `reviewId` (seeded by BrokerService in `beforeAll`) back via the CLI subprocess with `tandem reviews show --json`, asserting that `reviewId` and `title` match. This makes the shared-SQLite assumption explicit.

5. **MCP ↔ CLI parity completeness** — Imports `BROKER_OPERATION_MCP_TOOL_NAMES` from `review-broker-core` and checks a static `MCP_TOOL_TO_CLI_COMMAND` mapping in both directions: every MCP tool has a mapping entry, and no stale entries exist. If a new MCP tool is added without wiring to the CLI, this test fails.

## Verification

- `npx vitest run packages/review-broker-server/test/tandem-cli.test.ts` — 45 tests pass (40 existing + 5 new), zero failures
- `npx vitest run packages/review-broker-server/test/config.test.ts` — 16 config tests pass (no regressions)

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `npx vitest run packages/review-broker-server/test/tandem-cli.test.ts` | 0 | ✅ pass | 23.3s |
| 2 | `npx vitest run packages/review-broker-server/test/config.test.ts` | 0 | ✅ pass | 4.3s |

## Diagnostics

- Run `npx vitest run packages/review-broker-server/test/tandem-cli.test.ts -- --reporter=verbose` to see per-test pass/fail with names.
- If counter-patch seeding fails, the `beforeAll` throws with a descriptive error indicating which review didn't reach `counterPatchStatus: 'pending'`.
- If an MCP tool is added without a CLI command mapping, the parity test prints the missing tool name in the assertion message.

## Deviations

- Plan estimated 4 new tests (44+ total); implementation produced 5 tests (45 total) because the parity check was split into two assertions — one verifying every MCP tool has a mapping, and one verifying no stale entries exist. This is strictly additive and strengthens the parity guard.

## Known Issues

None.

## Files Created/Modified

- `packages/review-broker-server/test/tandem-cli.test.ts` — Extended with counter-patch seeding in beforeAll, proposal accept/reject happy paths, cross-surface shared-state test, and MCP↔CLI parity completeness check
- `.gsd/milestones/M005/slices/S04/S04-PLAN.md` — Added Observability/Diagnostics section, added diagnostic verification step, marked T01 done
