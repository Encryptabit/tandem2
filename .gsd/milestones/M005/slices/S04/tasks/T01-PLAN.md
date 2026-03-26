---
estimated_steps: 5
estimated_files: 1
skills_used:
  - test
---

# T01: Add counter-patch happy paths, shared-state proof, and parity completeness test

**Slice:** S04 — Integrated acceptance and parity proof
**Milestone:** M005

## Description

Extend `tandem-cli.test.ts` with the final acceptance tests that prove full MCP ↔ CLI parity. This adds: (1) `proposal accept` happy-path via CLI against a review with `counterPatchStatus: 'pending'`, (2) `proposal reject` happy-path against a separately-seeded review, (3) an explicit cross-surface shared-state assertion proving CLI and BrokerService share the same SQLite database, and (4) a parity completeness test mapping every MCP tool name to a corresponding CLI test. No production code changes — all work is test additions to the existing file.

## Steps

1. **Extend `beforeAll` seed with counter-patch lifecycle reviews.** Add two new reviews (`reviewId3`, `reviewId4`) that go through the full counter-patch setup: `service.createReview({ authorId: 'test-author', ... })` → `service.claimReview({ claimantId: 'cli-tester' })` → `service.submitVerdict({ actorId: 'cli-tester', verdict: 'changes_requested', reason: '...' })` → `service.addMessage({ actorId: 'test-author', body: '...' })`. The critical detail: the `actorId` in `addMessage` **must** match the review's `authorId` (i.e. `'test-author'`) — this triggers the proposer-requeue flow and sets `counterPatchStatus: 'pending'`. Using any other actorId produces a simple message without a counter-patch. Each review needs its own ID because `accept` and `reject` are terminal — once one is called, the status can't change. Reference the pattern in `packages/review-broker-server/test/review-verdicts.test.ts` (lines 115-200) for the canonical counter-patch seeding sequence.

2. **Add `proposal accept` happy-path test.** In a new `describe('proposal accept (counter-patch)')` block, run: `runTandem(['proposal', 'accept', reviewId3, '--actor', 'cli-tester', '--json', '--db-path', dbPath])`. Assert: exit code 0, JSON output contains a `review` object with `counterPatchStatus: 'accepted'`, and the `reviewId` matches `reviewId3`. Place this test **after** the existing write commands but **before** the `reviewers kill` tests (since kill is destructive and placed last).

3. **Add `proposal reject` happy-path test.** In the same or adjacent describe block: `runTandem(['proposal', 'reject', reviewId4, '--actor', 'cli-tester', '--json', '--db-path', dbPath])`. Assert: exit code 0, JSON output contains a `review` object with `counterPatchStatus: 'rejected'`, and the `reviewId` matches `reviewId4`.

4. **Add cross-surface shared-state assertion.** In a new `describe('cross-surface shared state')` block, run `runTandem(['reviews', 'show', reviewId, '--json', '--db-path', dbPath])`. Parse the JSON output, then assert that `output.review.reviewId === reviewId` and `output.review.title === 'Test review for CLI smoke tests'`. This makes the implicit shared-DB assumption explicit — the BrokerService wrote the data in `beforeAll`, and the CLI subprocess reads it from the same SQLite file.

5. **Add MCP parity completeness test.** Import `BROKER_OPERATION_MCP_TOOL_NAMES` from `@anthropic/review-broker-core/operations` (or its package entrypoint). Define a `const MCP_TOOL_TO_CLI_COMMAND: Record<string, string>` mapping object that maps each of the 16 MCP tool names to its CLI subcommand string (e.g., `'create_review' → 'reviews create'`, `'list_reviews' → 'reviews list'`, etc.). Write a test that iterates `BROKER_OPERATION_MCP_TOOL_NAMES` and asserts every name exists as a key in the mapping. This is a static completeness check — if a new MCP tool is added without updating the mapping, this test fails. The 16 MCP tools are: `create_review`, `list_reviews`, `spawn_reviewer`, `list_reviewers`, `kill_reviewer`, `claim_review`, `get_review_status`, `get_proposal`, `reclaim_review`, `submit_verdict`, `close_review`, `add_message`, `get_discussion`, `get_activity_feed`, `accept_counter_patch`, `reject_counter_patch`.

## Must-Haves

- [ ] `beforeAll` seeds `reviewId3` and `reviewId4` through complete counter-patch lifecycle (counterPatchStatus = 'pending')
- [ ] `proposal accept` test asserts exit 0 + JSON `counterPatchStatus: 'accepted'` on `reviewId3`
- [ ] `proposal reject` test asserts exit 0 + JSON `counterPatchStatus: 'rejected'` on `reviewId4`
- [ ] Cross-surface test writes via BrokerService, reads via CLI, asserts `reviewId` and `title` match
- [ ] Parity test maps all 16 `BROKER_OPERATION_MCP_TOOL_NAMES` to CLI commands
- [ ] All existing 40 tests still pass (no regressions)

## Verification

- `npx vitest run packages/review-broker-server/test/tandem-cli.test.ts` — all tests pass (44+ total)
- `npx vitest run packages/review-broker-server/test/config.test.ts` — 16 config tests still pass

## Inputs

- `packages/review-broker-server/test/tandem-cli.test.ts` — existing test file with 40 tests, `beforeAll` seed block, `runTandem` helper, `parseJsonOutput` helper
- `packages/review-broker-server/test/test-paths.ts` — `TANDEM_CLI_PATH`, `TSX_PATH`, `WORKTREE_ROOT` constants
- `packages/review-broker-server/test/review-verdicts.test.ts` — reference for counter-patch seeding pattern (lines 115-200: create → claim → verdict(changes_requested) → addMessage(actorId=authorId))
- `packages/review-broker-core/src/operations.ts` — `BROKER_OPERATION_MCP_TOOL_NAMES` export (16 MCP tool names)

## Expected Output

- `packages/review-broker-server/test/tandem-cli.test.ts` — extended with 4+ new tests: proposal accept happy path, proposal reject happy path, cross-surface shared-state assertion, MCP parity completeness check
