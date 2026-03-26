# S04: Integrated acceptance and parity proof — UAT

**Milestone:** M005
**Written:** 2026-03-25

## UAT Type

- UAT mode: live-runtime
- Why this mode is sufficient: Every test exercises the actual `tandem` CLI binary via `spawnSync` against a real SQLite-backed broker runtime in a temp directory. This is the same execution path an operator would use.

## Preconditions

- Node.js ≥ 18 and pnpm installed
- Working directory is the tandem2 monorepo root (or the M005 worktree)
- `pnpm install` has been run (dependencies resolved)
- No running broker processes competing for the test temp directories

## Smoke Test

Run: `npx vitest run packages/review-broker-server/test/tandem-cli.test.ts`
Expected: 45 tests pass, 0 failures, exit code 0.

## Test Cases

### 1. Counter-patch accept happy path

1. The `beforeAll` seeds `reviewId3` through: create(authorId=`test-author-cp`) → claim → verdict(changes_requested) → addMessage(actorId=`test-author-cp`)
2. Run `tandem proposal accept <reviewId3> --actor cli-tester --json --db-path <tmpDb>`
3. **Expected:** Exit code 0, JSON output contains `counterPatchStatus: 'accepted'`

### 2. Counter-patch reject happy path

1. The `beforeAll` seeds `reviewId4` through: create(authorId=`test-author-cp`) → claim → verdict(changes_requested) → addMessage(actorId=`test-author-cp`)
2. Run `tandem proposal reject <reviewId4> --actor cli-tester --json --db-path <tmpDb>`
3. **Expected:** Exit code 0, JSON output contains `counterPatchStatus: 'rejected'`

### 3. Cross-surface shared state (BrokerService → CLI)

1. `beforeAll` writes a review via `BrokerService.createReview(...)` using a known `reviewId` and `title`
2. Run `tandem reviews show <reviewId> --json --db-path <tmpDb>` as a subprocess
3. Parse the JSON output
4. **Expected:** The returned `reviewId` matches the seeded ID; the returned `title` matches the seeded title. This proves the CLI and BrokerService share the same SQLite database.

### 4. MCP → CLI parity completeness

1. Import `BROKER_OPERATION_MCP_TOOL_NAMES` from `review-broker-core`
2. Check that every tool name in the set has a corresponding entry in the `MCP_TOOL_TO_CLI_COMMAND` mapping
3. **Expected:** All MCP tool names are present. If a new MCP tool is added without a CLI command, this test fails with: `MCP tool '<name>' has no CLI command mapping`

### 5. CLI → MCP stale-entry check

1. Collect all keys from `MCP_TOOL_TO_CLI_COMMAND`
2. Compare against the sorted `BROKER_OPERATION_MCP_TOOL_NAMES` set
3. **Expected:** Both lists match exactly. If a mapping entry references a tool that no longer exists, the test fails, preventing stale entries from accumulating.

### 6. Regression guard — all 40 existing tests pass

1. Run the full `tandem-cli.test.ts` suite
2. **Expected:** All 40 pre-existing tests (status, reviews list/show, proposal show, discussion show, activity, reviewers list, config set/show, reviews create/claim/verdict/close/reclaim, discussion add, reviewers spawn/kill, help, error cases) continue to pass

### 7. Config test regression guard

1. Run `npx vitest run packages/review-broker-server/test/config.test.ts`
2. **Expected:** All 16 config tests pass, exit code 0

## Edge Cases

### Counter-patch seeding with wrong actorId

1. If the `addMessage` call uses an `actorId` different from the review's `authorId`, the review does NOT enter the counter-patch flow
2. **Expected:** The `beforeAll` sanity assertion catches this immediately — it throws: `"Expected counterPatchStatus to be 'pending' for reviewId3/4 but got '<actual>'"`

### MCP tool added without CLI mapping

1. Add a new entry to `BROKER_OPERATION_MCP_TOOL_NAMES` in `review-broker-core` without updating the CLI
2. Run the parity test
3. **Expected:** Test fails with a descriptive message naming the missing tool

### MCP tool removed but mapping still present

1. Remove an entry from `BROKER_OPERATION_MCP_TOOL_NAMES` but leave the stale mapping
2. Run the parity test
3. **Expected:** The sorted-equality assertion fails, surfacing the stale entry

## Failure Signals

- Non-zero exit code from any `tandem` CLI subprocess indicates a command-level failure
- stderr output from CLI subprocesses typically contains the error description
- `beforeAll` failure stops all 45 tests and surfaces the seeding problem immediately
- Parity test prints the specific missing or stale tool name in the assertion message

## Not Proven By This UAT

- Interactive terminal formatting (human-readable output is tested via substring matching, not visual inspection)
- Real subprocess reviewer lifecycle (spawn tests use `echo` as a stub command, not a real reviewer process)
- Dashboard build and HTTP serving (dashboard test only verifies `--help` output, not live serving)
- stdin pipe input for `reviews create` or `discussion add` (only `--diff-file` and `--body` flags are tested)
- Performance under high review counts (all tests use ≤4 seeded reviews)

## Notes for Tester

- The counter-patch seeding is the most fragile part of the test setup. If broker semantics around the proposer-requeue flow change, the `beforeAll` will fail fast with a clear message — don't chase downstream test failures, fix the seeding first.
- The parity mapping is a static object in the test file. When adding a new MCP tool, update `MCP_TOOL_TO_CLI_COMMAND` in `tandem-cli.test.ts` *and* write a corresponding test.
- All tests use `--db-path` to point at a temp directory, so they never conflict with any real broker database.
