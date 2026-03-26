---
id: S04
parent: M005
milestone: M005
provides:
  - counter-patch accept/reject CLI happy-path coverage
  - cross-surface shared-state proof (BrokerService write → CLI read via shared SQLite)
  - MCP ↔ CLI bidirectional parity completeness guard
  - milestone closure — every M005 success criterion now proven
requires:
  - slice: S01
    provides: CLI scaffold, subcommand router, read-only commands, output formatting
  - slice: S02
    provides: config management, write commands (claim, verdict, close, reclaim, discussion add, proposal accept/reject)
  - slice: S03
    provides: reviews create, reviewers spawn/kill, dashboard command
affects: []
key_files:
  - packages/review-broker-server/test/tandem-cli.test.ts
key_decisions:
  - Added bidirectional parity mapping check (MCP→CLI and CLI→MCP) to catch both missing and stale entries
patterns_established:
  - Counter-patch seeding pattern: create(authorId=A) → claim → verdict(changes_requested) → addMessage(actorId=A) produces counterPatchStatus='pending'
  - Sanity-check assertions in beforeAll to fail fast if upstream seeding contracts change
  - Static MCP_TOOL_TO_CLI_COMMAND mapping as a CI-visible parity guard
observability_surfaces:
  - Parity mapping test fails on any MCP tool addition/removal without CLI mapping update
  - beforeAll throws descriptive error if counter-patch seeding doesn't produce expected 'pending' state
  - All 45 tests exercise the CLI subprocess via spawnSync with structured --json output
drill_down_paths:
  - .gsd/milestones/M005/slices/S04/tasks/T01-SUMMARY.md
duration: 12m
verification_result: passed
completed_at: 2026-03-25
---

# S04: Integrated acceptance and parity proof

**Full MCP ↔ CLI parity proven: 45 tests covering every CLI command against a real SQLite-backed broker runtime, including counter-patch accept/reject happy paths, cross-surface shared-state proof, and a bidirectional parity completeness guard.**

## What Happened

S04 closed M005 by adding five tests to the existing 40-test CLI suite, proving the final gaps identified during S02/S03 execution:

1. **Counter-patch seeding** — Extended the `beforeAll` block to create two additional reviews (`reviewId3`, `reviewId4`) through the full counter-patch lifecycle: `create(authorId=A)` → `claim` → `verdict(changes_requested)` → `addMessage(actorId=A)`. Each review reaches `counterPatchStatus: 'pending'`, verified by a runtime assertion in the seeding loop that fails fast with a descriptive error if the upstream contract changes.

2. **Proposal accept/reject happy paths** — Two new tests exercise `tandem proposal accept` and `tandem proposal reject` against the seeded reviews, asserting exit 0 and correct `counterPatchStatus` transitions (`accepted`/`rejected`) in the JSON output.

3. **Cross-surface shared-state proof** — A test reads back a review seeded by `BrokerService` (the same write path used by MCP and dashboard) through the CLI subprocess (`tandem reviews show --json --db-path`), asserting that `reviewId` and `title` match. This makes the shared-SQLite assumption explicit and verified.

4. **MCP ↔ CLI parity completeness guard** — Imports `BROKER_OPERATION_MCP_TOOL_NAMES` from `review-broker-core` and checks a static `MCP_TOOL_TO_CLI_COMMAND` mapping in both directions: every MCP tool has a mapping entry, and no stale entries exist in the mapping. If a new MCP tool is added without a corresponding CLI command, or a mapping becomes stale, this test fails with a descriptive message.

No production code was changed in this slice — all work was test additions.

## Verification

| # | Command | Result | Details |
|---|---------|--------|---------|
| 1 | `npx vitest run packages/review-broker-server/test/tandem-cli.test.ts` | ✅ 45/45 pass | 22.7s — all existing + new tests pass |
| 2 | `npx vitest run packages/review-broker-server/test/config.test.ts` | ✅ 16/16 pass | 31ms — no regressions |
| 3 | Verbose pass count (`grep -c '✓'`) | ✅ 44 (45 with describe) | Confirms count matches expectation |

## Deviations

Plan estimated 4 new tests (44+ total); implementation produced 5 tests (45 total) because the parity check was split into two assertions — one verifying every MCP tool has a mapping, and one verifying no stale entries exist. This is strictly additive and strengthens the parity guard.

## Known Limitations

None. This slice is test-only and closes all identified testing gaps.

## Follow-ups

None. This slice closes M005 — all success criteria are met.

## Files Created/Modified

- `packages/review-broker-server/test/tandem-cli.test.ts` — Extended with counter-patch seeding in beforeAll, proposal accept/reject happy paths, cross-surface shared-state test, and MCP↔CLI parity completeness check
- `.gsd/milestones/M005/slices/S04/S04-PLAN.md` — Added Observability/Diagnostics section, marked T01 done

## Forward Intelligence

### What the next slice should know
- The `tandem` CLI is feature-complete with full MCP parity. All 16 MCP tools have corresponding CLI commands, all tested with `--json` output. The CLI shares the same SQLite database as the MCP server and dashboard — this is now explicitly proven, not just assumed.
- The counter-patch seeding pattern is non-obvious: the `actorId` in `addMessage` must equal the review's `authorId` to trigger the proposer-requeue flow. Using a different actorId produces a simple message without counter-patch. This is documented in the test and the parity mapping.

### What's fragile
- The `MCP_TOOL_TO_CLI_COMMAND` mapping in the test file is manually maintained — if an MCP tool is renamed (not just added/removed), the test won't catch the rename; it will report one missing and one stale entry separately. This is good enough for now but could be tightened with a naming convention check.
- The counter-patch seeding relies on the exact sequence of broker operations producing `counterPatchStatus: 'pending'`. If the broker changes when counter-patch status transitions, the seeding will fail at the sanity assertion, not at the test assertion — which is the intended behavior.

### Authoritative diagnostics
- `npx vitest run packages/review-broker-server/test/tandem-cli.test.ts -- --reporter=verbose` — the most trustworthy signal for CLI parity and regression detection
- `npx vitest run packages/review-broker-server/test/config.test.ts` — config regression guard
- The parity test's assertion messages name the specific missing or stale tool, making diagnosis immediate

### What assumptions changed
- Plan assumed 44+ tests; actual is 45 because the parity check split into two assertions for stronger coverage. No other assumptions changed — the slice executed exactly as planned.
