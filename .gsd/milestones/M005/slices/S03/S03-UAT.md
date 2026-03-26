# S03 UAT: Create, spawn, kill, and dashboard commands

**Preconditions:**
- Working pnpm workspace with `review-broker-server` package built
- SQLite database at a known `--db-path` (or default)
- Config file location known (`REVIEW_BROKER_CONFIG_PATH` set or default path)
- A valid diff file available (e.g. `test/fixtures/valid-review.diff`)
- `node` and `npx` available in PATH

---

## TC-01: reviews create — happy path

**Steps:**
1. Run: `tandem reviews create --diff-file test/fixtures/valid-review.diff --title "Test Review" --description "A test" --author cli-user --json --db-path <path>`
2. Verify exit code is 0
3. Verify JSON output contains `review.reviewId` (non-empty string)
4. Verify JSON output contains `review.status === "pending"`
5. Run: `tandem reviews show <reviewId> --json --db-path <path>`
6. Verify the created review exists with matching title, description, author

**Expected:** Review created successfully, visible via show command.

---

## TC-02: reviews create — with optional priority

**Steps:**
1. Run: `tandem reviews create --diff-file test/fixtures/valid-review.diff --title "Priority Review" --description "Urgent" --author cli-user --priority high --json --db-path <path>`
2. Verify exit code is 0 and JSON output contains `review.reviewId`

**Expected:** Review created with priority parameter accepted.

---

## TC-03: reviews create — missing required flags

**Steps:**
1. Run: `tandem reviews create --diff-file test/fixtures/valid-review.diff --description "No title" --author cli-user --json --db-path <path>`
2. Verify exit code is 1
3. Verify stderr contains `Missing required --title`
4. Run: `tandem reviews create --title "No diff" --description "Missing" --author cli-user --json --db-path <path>`
5. Verify exit code is 1
6. Verify stderr contains `Missing required --diff-file`

**Expected:** Clear error messages identifying the missing flag, exit 1.

---

## TC-04: reviews create — nonexistent diff file

**Steps:**
1. Run: `tandem reviews create --diff-file /tmp/does-not-exist-987654.diff --title "Bad Path" --description "Test" --author cli-user --json --db-path <path>`
2. Verify exit code is 1
3. Verify stderr contains `Cannot read diff file`
4. Verify stderr contains the resolved file path

**Expected:** User-friendly error with the attempted path, not a raw ENOENT stack trace.

---

## TC-05: reviewers kill — happy path

**Steps:**
1. First, spawn a reviewer: `tandem reviewers spawn --command "node" --args "-e,setTimeout(()=>{},60000)" --json --db-path <path>`
2. Note the `reviewer.reviewerId` from output
3. Run: `tandem reviewers kill <reviewerId> --json --db-path <path>`
4. Verify exit code is 0
5. Verify JSON output contains `outcome` field (e.g. `killed` or `already_offline`)
6. Verify JSON output contains `reviewer.reviewerId` matching the spawned ID

**Expected:** Reviewer killed, outcome reported.

---

## TC-06: reviewers kill — missing ID

**Steps:**
1. Run: `tandem reviewers kill --json --db-path <path>`
2. Verify exit code is 1
3. Verify stderr contains `Missing required <id> argument`

**Expected:** Clear error about missing positional argument.

---

## TC-07: reviewers spawn — explicit command mode

**Steps:**
1. Run: `tandem reviewers spawn --command "node" --args "-e,setTimeout(()=>{},5000)" --json --db-path <path>`
2. Verify exit code is 0
3. Verify JSON output contains `reviewer.reviewerId` (non-empty)
4. Verify JSON output contains `reviewer.status` (e.g. `online`)
5. Verify JSON output contains `reviewer.pid` (a number)
6. Cleanup: `tandem reviewers kill <reviewerId> --json --db-path <path>`

**Expected:** Reviewer spawned with command, PID visible.

---

## TC-08: reviewers spawn — provider mode

**Steps:**
1. Configure a provider: `tandem config set reviewer.providers.test-provider.command node --db-path <path>`
2. Configure provider args: `tandem config set reviewer.providers.test-provider.args '[ "-e", "setTimeout(()=>{},5000)" ]' --db-path <path>`
3. Verify config: `tandem config show --json` shows the provider entry
4. Run: `tandem reviewers spawn --provider test-provider --json --db-path <path>`
5. Verify exit code is 0
6. Verify JSON output contains `reviewer.reviewerId` and `reviewer.pid`
7. Cleanup: kill the spawned reviewer

**Expected:** Provider resolved from config, reviewer spawned with the configured command.

---

## TC-09: reviewers spawn — missing both flags

**Steps:**
1. Run: `tandem reviewers spawn --json --db-path <path>`
2. Verify exit code is 1
3. Verify stderr contains `Either --command or --provider is required`

**Expected:** Clear error identifying the two valid modes.

---

## TC-10: reviewers spawn — unknown provider

**Steps:**
1. Run: `tandem reviewers spawn --provider nonexistent-provider --json --db-path <path>`
2. Verify exit code is 1
3. Verify stderr contains `Unknown provider "nonexistent-provider"`

**Expected:** Error names the attempted provider.

---

## TC-11: dashboard — help output

**Steps:**
1. Run: `tandem dashboard --help`
2. Verify exit code is 0
3. Verify stdout contains `--port`
4. Verify stdout contains `--host`

**Expected:** Dashboard help shows available flags.

---

## TC-12: dashboard — listed in top-level help

**Steps:**
1. Run: `tandem --help`
2. Verify stdout contains `dashboard`

**Expected:** Dashboard command discoverable from top-level help.

---

## TC-13: JSON output — all new commands

**Steps:**
1. Verify `reviews create` with `--json` returns valid JSON with `review` key
2. Verify `reviewers spawn --command ... --json` returns valid JSON with `reviewer` key
3. Verify `reviewers kill <id> --json` returns valid JSON with `outcome` key
4. Verify `dashboard --help` (placeholder for `--json` which outputs `url`/`port` at server start)

**Expected:** All new commands support `--json` output consistent with existing S01/S02 commands.

---

## TC-14: resolveProvider — config edge cases

**Steps (unit test level via `npx vitest run test/config.test.ts`):**
1. Verify resolveProvider returns command + args for a valid provider config
2. Verify resolveProvider returns command only when no args configured
3. Verify resolveProvider parses JSON-stringified args array
4. Verify resolveProvider throws for unknown provider name
5. Verify resolveProvider throws when provider is missing command field
6. Verify resolveProvider throws when no providers section exists in config

**Expected:** All 6 resolveProvider unit tests pass.

---

## Automated Verification

All above scenarios are covered by the automated test suite:

```bash
cd packages/review-broker-server
npx vitest run test/tandem-cli.test.ts test/config.test.ts
# Expected: 56 tests passed (40 CLI + 16 config)
```
