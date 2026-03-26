---
estimated_steps: 4
estimated_files: 2
skills_used: []
---

# T02: Add all 7 write command handlers with smoke tests

**Slice:** S02 — Config management and write commands
**Milestone:** M005

## Description

Add the 7 write command handlers to `tandem.ts` that wrap existing `BrokerService` methods: `reviews claim`, `reviews reclaim`, `reviews verdict`, `reviews close`, `discussion add`, `proposal accept`, `proposal reject`. Each handler follows the exact same pattern as the S01 read commands: parse flags from the rest args, call one service method, format the response. Then extend the smoke test file with tests for all 7 commands plus error cases.

The handlers need a `--actor <id>` flag on every command (all write service methods require `actorId`). `reviews verdict` additionally needs `--verdict` (validated against `REVIEW_VERDICTS` enum) and `--reason`. `discussion add` needs `--body`. `proposal accept/reject` take an optional `--note`.

Testing requires careful state-machine choreography: the test seed must walk reviews through the right states (pending → in_review → verdicted → etc.) so that each command can be exercised.

## Steps

1. **Add write command handler functions to `tandem.ts`:**
   - Import `REVIEW_VERDICTS` from `review-broker-core` (alongside existing `REVIEW_STATUSES`, `REVIEWER_STATUSES`).
   - Create a `requireFlag(args, flag, commandName)` helper that calls `extractFlagWithEquals` and throws if the value is missing (for `--actor`, `--verdict`, `--reason`, `--body`). This is like `requireId` but for flags.
   - Add handler functions following the exact pattern of existing handlers like `handleReviewsShow`:
     - `handleReviewsClaim(rest, runtime, options)` — `requireId`, `requireFlag('--actor')`, call `service.claimReview({ reviewId, claimantId })`, format response.
     - `handleReviewsReclaim(rest, runtime, options)` — `requireId`, `requireFlag('--actor')`, call `service.reclaimReview({ reviewId, actorId })`, format response.
     - `handleReviewsVerdict(rest, runtime, options)` — `requireId`, `requireFlag('--actor')`, extract + validate `--verdict` against `REVIEW_VERDICTS` (use the `extractStatusFlag` pattern), `requireFlag('--reason')`, call `service.submitVerdict({ reviewId, actorId, verdict, reason })`, format response.
     - `handleReviewsClose(rest, runtime, options)` — `requireId`, `requireFlag('--actor')`, call `service.closeReview({ reviewId, actorId })`, format response.
     - `handleDiscussionAdd(rest, runtime, options)` — `requireId`, `requireFlag('--actor')`, `requireFlag('--body')`, call `service.addMessage({ reviewId, actorId, body })`, format response.
     - `handleProposalAccept(rest, runtime, options)` — `requireId`, `requireFlag('--actor')`, optionally extract `--note`, call `service.acceptCounterPatch({ reviewId, actorId, note })`, format response.
     - `handleProposalReject(rest, runtime, options)` — `requireId`, `requireFlag('--actor')`, optionally extract `--note`, call `service.rejectCounterPatch({ reviewId, actorId, note })`, format response.
   - For human-readable output, each handler uses `formatDetail` with key fields from the response (e.g., outcome, review status, version).

2. **Wire handlers into the dispatch router:**
   - Add `case 'claim':`, `case 'reclaim':`, `case 'verdict':`, `case 'close':` under the `'reviews'` noun switch.
   - Add `case 'add':` under the `'discussion'` noun switch.
   - Add `case 'accept':` and `case 'reject':` under the `'proposal'` noun switch.
   - Update the error messages for unknown sub-verbs to list the new commands.

3. **Add `SUBCOMMAND_HELP` entries and update `printUsage()`:**
   - Add help text for: `'reviews claim'`, `'reviews reclaim'`, `'reviews verdict'`, `'reviews close'`, `'discussion add'`, `'proposal accept'`, `'proposal reject'`.
   - Update the root `printUsage()` function to list all new commands.

4. **Add smoke tests to `test/tandem-cli.test.ts`:**
   - Extend `beforeAll` seed to set up the state machine for testing:
     - The existing seed creates a `pending` review. After creation, call `service.claimReview()` to transition to `in_review` state (needed to test verdict/close).
     - Create a second review for commands that need independent state (e.g. claim, reclaim).
   - Write tests (using `runTandem()` + `parseJsonOutput()`):
     - `reviews claim <id2> --actor cli-tester --json --db-path <temp>` → exit 0, response has `outcome`
     - `reviews verdict <id1> --actor cli-tester --verdict approved --reason "LGTM" --json --db-path <temp>` → exit 0, response has `review`, `proposal`
     - `reviews close <id1> --actor cli-tester --json --db-path <temp>` → exit 0
     - `discussion add <id1> --actor cli-tester --body "Test message" --json --db-path <temp>` → exit 0, response has `message`
     - `reviews reclaim <id2> --actor cli-tester --json --db-path <temp>` → exit 0 (on already-claimed review)
   - Error case tests:
     - `reviews claim <id> --db-path <temp>` (missing --actor) → exit non-zero, stderr mentions missing
     - `reviews verdict <id> --actor x --verdict bogus --reason "x" --db-path <temp>` → exit non-zero, stderr mentions invalid verdict
     - `reviews verdict <id> --actor x --db-path <temp>` (missing --verdict) → exit non-zero
   - Note: `proposal accept`/`reject` require a review with `counterPatchStatus: 'pending'`, which needs a complex state machine setup (create → claim → verdict changes_requested → submit counter-patch). If the seed can walk through this, test them. If too complex, test that they reach the service (the error from the service proves the handler is wired correctly).

## Must-Haves

- [ ] All 7 write commands wired into `tandem.ts` dispatch
- [ ] Every write command requires `--actor` and fails with clear error if missing
- [ ] `--verdict` validates against `REVIEW_VERDICTS` before calling service
- [ ] Each command has a `SUBCOMMAND_HELP` entry
- [ ] `printUsage()` lists all new commands
- [ ] Smoke tests cover happy path for at least `claim`, `verdict`, `close`, `discussion add`
- [ ] Error case tests for missing required flags
- [ ] All existing 12 CLI tests still pass

## Verification

- `cd packages/review-broker-server && npx vitest run test/tandem-cli.test.ts` — all old tests + new write-command tests pass
- At minimum: `claim`, `verdict`, `close`, `discussion add` have passing JSON-output smoke tests
- Error tests: missing `--actor` → non-zero exit, invalid `--verdict` → non-zero exit

## Inputs

- `packages/review-broker-server/src/cli/tandem.ts` — the CLI after T01 (with config handlers added), containing all arg-parsing helpers, dispatch router, handler pattern
- `packages/review-broker-server/src/cli/format.ts` — `formatJson`, `formatDetail` for output formatting
- `packages/review-broker-core/src/domain.ts` — exports `REVIEW_VERDICTS = ['changes_requested', 'approved']`
- `packages/review-broker-core/src/contracts.ts` — request/response schemas for all 7 write operations: `ClaimReviewRequest` (`reviewId, claimantId`), `ReclaimReviewRequest` (`reviewId, actorId`), `SubmitVerdictRequest` (`reviewId, actorId, verdict, reason`), `CloseReviewRequest` (`reviewId, actorId`), `AddMessageRequest` (`reviewId, actorId, body`), `AcceptCounterPatchRequest` (`reviewId, actorId, note?`), `RejectCounterPatchRequest` (`reviewId, actorId, note?`)
- `packages/review-broker-server/test/tandem-cli.test.ts` — existing test file after T01 (with config tests), `runTandem()` helper, `seedTestData` in `beforeAll`
- `packages/review-broker-server/test/test-paths.ts` — `TANDEM_CLI_PATH`, `TSX_PATH`, `WORKTREE_ROOT`

## Expected Output

- `packages/review-broker-server/src/cli/tandem.ts` — modified with 7 write command handlers, updated dispatch router, updated help entries and usage text
- `packages/review-broker-server/test/tandem-cli.test.ts` — modified with write command smoke tests and error case tests

## Observability Impact

- **Write command stderr diagnostics:** All 7 write commands emit structured errors to stderr on failure (missing `--actor`, invalid `--verdict`, service-level rejection) and exit non-zero. Agents can detect failures by checking exit code and `stderr` content containing `Error:` or `Missing required`.
- **JSON output for automation:** Every write command supports `--json` for machine-readable output. Response schemas include `version` (for optimistic concurrency) and `review` (for post-mutation state inspection).
- **Verdict validation surface:** Invalid `--verdict` values are rejected before calling the service, producing a clear error message listing valid values (`changes_requested`, `approved`). This prevents confusing service-layer errors.
- **Help text discoverability:** `tandem --help` now lists all 7 write commands with their required flags, and each has a dedicated `--help` entry via `SUBCOMMAND_HELP`.
