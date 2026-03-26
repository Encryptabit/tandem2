# S04: Integrated acceptance and parity proof

**Goal:** Prove full MCP ↔ CLI parity with happy-path coverage for every command, including the deferred counter-patch operations, plus an explicit cross-surface shared-state assertion.
**Demo:** Every CLI command exercised against a real SQLite-backed broker runtime; `proposal accept` and `proposal reject` happy paths pass; a cross-surface test writes state via BrokerService and reads it back via CLI `--json`; a parity completeness test maps every MCP tool name to a corresponding CLI test.

## Must-Haves

- `proposal accept` happy path exercises CLI against a review with `counterPatchStatus: 'pending'` and asserts the JSON output shows `counterPatchStatus: 'accepted'`
- `proposal reject` happy path exercises CLI against a separate review with `counterPatchStatus: 'pending'` and asserts `counterPatchStatus: 'rejected'`
- Cross-surface shared-state assertion: write a review via `BrokerService`, read it back via `tandem reviews show <id> --json`, assert `reviewId` and `title` match
- Parity completeness: every MCP tool name from `BROKER_OPERATION_MCP_TOOL_NAMES` maps to at least one passing CLI test
- All existing 40 tests continue to pass (no regressions)

## Proof Level

- This slice proves: final-assembly
- Real runtime required: yes (SQLite-backed broker in temp directory)
- Human/UAT required: no

## Verification

- `npx vitest run packages/review-broker-server/test/tandem-cli.test.ts` — all tests pass (existing 40 + new counter-patch happy paths + shared-state + parity check)
- `npx vitest run packages/review-broker-server/test/config.test.ts` — 16 config tests still pass (regression guard)
- `npx vitest run packages/review-broker-server/test/tandem-cli.test.ts -- --reporter=verbose 2>&1 | grep -c '✓'` — diagnostic: verify total passing test count is ≥ 45

## Observability / Diagnostics

- **Runtime signals:** All new tests exercise the CLI subprocess via `spawnSync`, producing structured JSON output with `--json`. Failures surface as non-zero exit codes and stderr messages.
- **Inspection surfaces:** `tandem reviews show <id> --json --db-path <path>` returns the full review state including `counterPatchStatus`, making it trivially inspectable from any surface.
- **Failure visibility:** The counter-patch seeding loop in `beforeAll` includes a runtime assertion that `counterPatchStatus === 'pending'` — if the seeding contract changes upstream, the setup fails fast with a descriptive error instead of producing confusing test failures.
- **Parity guard:** The `MCP_TOOL_TO_CLI_COMMAND` mapping test fails if a new MCP tool is added without a corresponding CLI command, making parity drift immediately visible in CI.
- **Redaction:** No secrets or PII in test data — all actor IDs are synthetic test values.

## Integration Closure

- Upstream surfaces consumed: `packages/review-broker-core/src/operations.ts` (BROKER_OPERATION_MCP_TOOL_NAMES for parity check), `packages/review-broker-server/src/runtime/broker-service.js` (counter-patch seeding), `packages/review-broker-server/src/cli/tandem.ts` (CLI under test)
- New wiring introduced in this slice: none — test-only
- What remains before the milestone is truly usable end-to-end: nothing — this slice closes M005

## Tasks

- [x] **T01: Add counter-patch happy paths, shared-state proof, and parity completeness test** `est:30m`
  - Why: Closes the last testing gaps called out in S02 (deferred proposal accept/reject happy paths) and proves the full MCP ↔ CLI parity that is S04's reason for existing. No production code changes — all work is test additions.
  - Files: `packages/review-broker-server/test/tandem-cli.test.ts`
  - Do: (1) Extend the `beforeAll` seed to create two additional reviews through the counter-patch lifecycle: create(authorId=A) → claim → verdict(changes_requested) → addMessage(actorId=A). Store their IDs as `reviewId3` and `reviewId4`. (2) Add `proposal accept` happy-path test using `reviewId3` — assert JSON output contains `counterPatchStatus: 'accepted'`. (3) Add `proposal reject` happy-path test using `reviewId4` — assert JSON output contains `counterPatchStatus: 'rejected'`. (4) Add cross-surface shared-state test: the `beforeAll` already writes reviews via BrokerService, so add a test that reads `reviewId` back via `runTandem(['reviews', 'show', reviewId, '--json', '--db-path', dbPath])` and asserts the returned `reviewId` and `title` match the seeded values. (5) Add a parity completeness test that imports `BROKER_OPERATION_MCP_TOOL_NAMES` from `review-broker-core` and asserts each tool name has corresponding test coverage by checking a maintained mapping object. Critical constraint: the `actorId` in `addMessage` must equal the review's `authorId` to trigger the proposer-requeue flow and produce `counterPatchStatus: 'pending'`. Using a different actorId produces a simple message without counter-patch.
  - Verify: `npx vitest run packages/review-broker-server/test/tandem-cli.test.ts` — all tests pass including new additions
  - Done when: 44+ tests pass (40 existing + 2 counter-patch happy paths + 1 shared-state + 1 parity check), zero failures

## Files Likely Touched

- `packages/review-broker-server/test/tandem-cli.test.ts`
