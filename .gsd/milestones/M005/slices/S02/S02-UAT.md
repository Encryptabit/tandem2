# S02: Config management and write commands — UAT

**Milestone:** M005
**Written:** 2026-03-25

## UAT Type

- UAT mode: artifact-driven
- Why this mode is sufficient: All commands are exercised via CLI subprocess invocations against a real SQLite-backed BrokerService. The 37 passing tests cover config I/O, all 7 write commands, and error cases. No external services or network calls are involved.

## Preconditions

- Working directory: `packages/review-broker-server`
- Dependencies installed: `pnpm install` completed
- No running broker server needed — each CLI invocation opens its own DB via `--db-path`
- A temp directory available for config file isolation

## Smoke Test

Run the full test suite to confirm the slice basically works:

```bash
cd packages/review-broker-server && npx vitest run test/tandem-cli.test.ts test/config.test.ts
```

**Expected:** 37 tests pass (10 config + 27 CLI), exit code 0.

## Test Cases

### 1. Config set and show roundtrip

1. Create a temp directory for config isolation
2. Set env `REVIEW_BROKER_CONFIG_PATH=/tmp/test-config/config.json`
3. Run `tandem config set reviewer.provider anthropic --db-path /tmp/test.db`
4. Run `tandem config show --json --db-path /tmp/test.db`
5. **Expected:** Exit 0, JSON output contains `{ "reviewer": { "provider": "anthropic" } }`

### 2. Config set with deep dot-path nesting

1. Run `tandem config set reviewer.providers.anthropic.model claude-3 --db-path /tmp/test.db`
2. Run `tandem config show --json --db-path /tmp/test.db`
3. **Expected:** JSON output contains `reviewer.providers.anthropic.model` nested correctly, prior `reviewer.provider` key preserved

### 3. Config show human-readable output

1. Run `tandem config show --db-path /tmp/test.db` (without `--json`)
2. **Expected:** Output includes key names in a human-readable format (not raw JSON), shows the configured values

### 4. Reviews claim

1. Create a review via BrokerService (or use test seed)
2. Run `tandem reviews claim <review-id> --actor agent-1 --json --db-path /tmp/test.db`
3. **Expected:** Exit 0, JSON output contains `outcome` field indicating successful claim

### 5. Reviews verdict

1. Ensure a review is in `claimed` status (from test case 4)
2. Run `tandem reviews verdict <review-id> --actor agent-1 --verdict approved --reason "Looks good" --json --db-path /tmp/test.db`
3. **Expected:** Exit 0, JSON output contains `review`, `proposal`, and `version` fields

### 6. Discussion add

1. Run `tandem discussion add <review-id> --actor agent-1 --body "Test comment" --json --db-path /tmp/test.db`
2. **Expected:** Exit 0, JSON output contains the added message with body "Test comment"

### 7. Reviews close

1. Ensure a review has received a verdict (from test case 5)
2. Run `tandem reviews close <review-id> --actor agent-1 --json --db-path /tmp/test.db`
3. **Expected:** Exit 0, JSON output contains the closed review with updated status

### 8. Reviews reclaim

1. Use a second review that is in `claimed` status
2. Run `tandem reviews reclaim <review-id> --actor agent-1 --json --db-path /tmp/test.db`
3. **Expected:** Exit 0, JSON output contains `outcome` field indicating successful reclaim

### 9. Proposal accept and reject (error path)

1. Run `tandem proposal accept <review-id> --json --db-path /tmp/test.db` (without `--actor`)
2. **Expected:** Exit 1, stderr contains "Missing required --actor"
3. Run `tandem proposal reject <review-id> --json --db-path /tmp/test.db` (without `--actor`)
4. **Expected:** Exit 1, stderr contains "Missing required --actor"

## Edge Cases

### Missing --actor flag on write commands

1. Run `tandem reviews claim <id> --json --db-path /tmp/test.db` (no `--actor`)
2. **Expected:** Exit 1, stderr contains `Missing required --actor for "reviews claim"`

### Invalid --verdict value

1. Run `tandem reviews verdict <id> --actor a --verdict banana --json --db-path /tmp/test.db`
2. **Expected:** Exit 1, stderr contains `Invalid verdict: "banana"` and lists valid values (`approved`, `changes_requested`)

### Missing --verdict flag

1. Run `tandem reviews verdict <id> --actor a --json --db-path /tmp/test.db` (no `--verdict`)
2. **Expected:** Exit 1, stderr contains `Missing required --verdict`

### Missing --body flag on discussion add

1. Run `tandem discussion add <id> --actor a --json --db-path /tmp/test.db` (no `--body`)
2. **Expected:** Exit 1, stderr contains `Missing required --body`

### Config set with missing key/value args

1. Run `tandem config set --db-path /tmp/test.db` (no key or value)
2. **Expected:** Exit 1, stderr contains error about missing argument

### Config show on non-existent config file

1. Set `REVIEW_BROKER_CONFIG_PATH` to a path with no config file
2. Run `tandem config show --json --db-path /tmp/test.db`
3. **Expected:** Exit 0, JSON output is `{}`

## Failure Signals

- Any test in `test/config.test.ts` or `test/tandem-cli.test.ts` fails → config I/O or command handler regression
- Write command exits 0 but stderr contains `Error:` → handler swallowed an error incorrectly
- `config set` exits 0 but `config show --json` doesn't reflect the value → write/read path broken
- Write command with `--json` returns output missing `version` field → service method result not forwarded correctly
- Error case returns exit 0 instead of exit 1 → `requireFlag` or verdict validation not throwing

## Not Proven By This UAT

- `proposal accept` and `proposal reject` happy paths — these require a fully seeded counter-patch state machine (create → claim → verdict with changes_requested → counter-patch generation). Deferred to S04 integrated acceptance.
- Config consumption by downstream features — S03 will prove that `readConfig` feeds provider resolution correctly.
- Concurrent config writes — `setConfigValue` does read-modify-write without file locking. Not a concern for single-operator CLI use but would need locking for concurrent access.
- Binary distribution / global `tandem` invocation — using `pnpm exec tandem` or `npx` is acceptable for now.

## Notes for Tester

- All tests share a single SQLite database per test suite run. Test ordering matters for write commands — the state machine progresses through claim → verdict → close in sequence.
- Config tests use `REVIEW_BROKER_CONFIG_PATH` env var for isolation. If running manually, set this to a temp path to avoid writing to the workspace config.
- The `--reason` flag on `reviews verdict` and `--note` flag on `proposal accept/reject` are optional — commands work without them.
- Help output (`tandem --help`) should list all 9 new commands with their required flags.
