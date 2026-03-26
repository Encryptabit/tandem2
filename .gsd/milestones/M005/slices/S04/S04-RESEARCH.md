# S04 — Research

**Date:** 2026-03-25

## Summary

S04 is an acceptance/parity-proof slice — no new production code, only tests. The existing `tandem-cli.test.ts` already has 40 passing tests covering all 22 CLI subcommands (16 MCP-mapped + 3 CLI-only commands + 3 convenience/help variants). The remaining gap is narrow: **proposal accept/reject happy paths** (deferred from S02 because they require counter-patch state-machine setup) and an explicit **shared-database parity assertion** proving CLI and BrokerService see identical state.

The work is straightforward: extend the existing test file with a counter-patch lifecycle sequence (create → claim → verdict(changes_requested) → addMessage(from author) → proposal accept/reject) and a cross-surface coherence check. The counter-patch seeding pattern is already proven in `review-verdicts.test.ts`. No novel architecture or unknown APIs.

## Recommendation

Add a small number of focused tests to the existing `tandem-cli.test.ts`:

1. **Counter-patch happy paths** — Seed a review through the `changes_requested` → proposer-requeue flow via `BrokerService` in `beforeAll`, then exercise `proposal accept` and `proposal reject` via CLI. This closes the last gap called out in S02's summary.
2. **Cross-surface shared-state assertion** — Write one review via `BrokerService`, read it back via CLI `reviews show --json`. This proves the CLI and programmatic API share the same SQLite database. (The existing tests already use a shared DB, but the assertion is implicit — making it explicit completes the "parity proof" requirement.)
3. **Parity completeness check** — A lightweight test (or comment-level audit) mapping every MCP tool name to its corresponding CLI test, proving no tool is untested.

No production code changes needed. All work is in the test file.

## Implementation Landscape

### Key Files

- `packages/review-broker-server/test/tandem-cli.test.ts` — **The only file that changes.** All new tests go here, extending the existing `beforeAll` seed and adding new `describe` blocks.
- `packages/review-broker-server/test/test-paths.ts` — Already has `TANDEM_CLI_PATH`, `TSX_PATH`, `WORKTREE_ROOT`. No changes needed.
- `packages/review-broker-server/test/review-verdicts.test.ts` — **Reference only.** Contains the canonical counter-patch seeding pattern (lines 115-200): create → claim → verdict(changes_requested) → addMessage(actorId = authorId) → acceptCounterPatch. Copy this flow shape into the CLI test's `beforeAll`.
- `packages/review-broker-core/src/operations.ts` — **Reference only.** Defines the 16 MCP tool names. Can import `BROKER_OPERATION_MCP_TOOL_NAMES` for parity check if desired.

### Build Order

1. **Extend `beforeAll` seed** — Add a third review that goes through the counter-patch lifecycle: create → claim → verdict(changes_requested) → addMessage(from authorId to trigger requeue + counterPatchStatus: pending). Store `reviewId3` for use in counter-patch tests.
2. **Add `proposal accept` happy-path test** — Use `reviewId3` with `--actor` set to a reviewer. Verify JSON output has `counterPatchStatus: 'accepted'`.
3. **Add `proposal reject` happy-path test** — Need a fourth review or re-seed. Since accept mutates the counter-patch status, reject needs its own review at pending counter-patch state. Seed `reviewId4` via the same flow. Verify JSON output has `counterPatchStatus: 'rejected'`.
4. **Add shared-state parity assertion** — Create a review via `BrokerService` in `beforeAll`, read it back via `runTandem(['reviews', 'show', id, '--json', '--db-path', dbPath])`. Assert `reviewId` and `title` match.
5. **Run full test suite** to confirm all 40 existing tests still pass plus new tests.

### Verification Approach

- `npx vitest run packages/review-broker-server/test/tandem-cli.test.ts` — All tests pass (existing 40 + new additions).
- `npx vitest run packages/review-broker-server/test/config.test.ts` — 16 config tests still pass (regression guard).
- Confirm the new `proposal accept`/`proposal reject` tests assert on `counterPatchStatus` in the JSON response.
- Confirm at least one test writes state via `BrokerService` and reads it via CLI (shared-state proof).

## Constraints

- **Test ordering:** The existing test file depends on shared DB state with sequential test execution. New counter-patch tests must be placed **before** any tests that close the reviews they depend on (or use fresh review IDs).
- **Counter-patch prerequisite chain:** Getting `counterPatchStatus: 'pending'` requires: create(authorId=A) → claim → verdict(changes_requested) → addMessage(actorId=A). The `actorId` in `addMessage` must match the review's `authorId` — this triggers the proposer-requeue flow. Using a different actorId produces a simple message, not a counter-patch.
- **BrokerService seeding in beforeAll:** The existing pattern opens an `AppContext` + `BrokerService` in `beforeAll`, seeds data, then closes the context. New seeding for counter-patch reviews must happen in this same block (or a new nested `beforeAll`) to share the temp DB.

## Common Pitfalls

- **Wrong actorId in addMessage** — If the addMessage actorId doesn't match the review's authorId, the service treats it as a reviewer message (no requeue, no counter-patch). The counter-patch flow only triggers when `actorId === review.authorId` (i.e. the proposer is responding).
- **Test ordering with accept then reject** — `acceptCounterPatch` and `rejectCounterPatch` both require `counterPatchStatus: 'pending'`. Once accepted/rejected, the status is terminal for that review. Each operation needs a separately-seeded review.
