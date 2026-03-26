# S01 UAT: CLI scaffold and read-only commands

## Preconditions

- Working directory: `packages/review-broker-server` (or run from repo root with `npx tsx packages/review-broker-server/src/cli/tandem.ts`)
- No pre-existing database required — the CLI creates one at the given `--db-path`
- For commands that return data, seed a database first (see Test Case 8)

## Test Cases

### TC1: Help output

**Steps:**
1. Run `npx tsx src/cli/tandem.ts --help`

**Expected:**
- Exit code 0
- Stdout lists all 7 commands: `status`, `reviews list`, `reviews show`, `proposal show`, `discussion show`, `activity`, `reviewers list`
- Stdout shows global options: `--json`, `--db-path`, `--cwd`, `--help`

---

### TC2: Status command (JSON mode)

**Steps:**
1. Run `npx tsx src/cli/tandem.ts status --json --db-path /tmp/uat-tandem.sqlite`

**Expected:**
- Exit code 0
- Stdout is valid JSON containing at least: `reviewCount`, `reviewerCount`, `messageCount`, `auditEventCount`, `migrationCount`, `statusCounts`
- `migrationCount` ≥ 3 (base migrations applied)

---

### TC3: Status command (human-readable mode)

**Steps:**
1. Run `npx tsx src/cli/tandem.ts status --db-path /tmp/uat-tandem.sqlite`

**Expected:**
- Exit code 0
- Stdout contains labeled lines: `Reviews:`, `Reviewers:`, `Messages:`, `Audit Events:`, `Migrations:`
- Values are aligned (key-value format, not JSON)

---

### TC4: Unknown subcommand error

**Steps:**
1. Run `npx tsx src/cli/tandem.ts bogus 2>&1`

**Expected:**
- Exit code 1
- Stderr contains "Unknown command: bogus"
- Stderr contains usage hint ("Run `tandem --help`" or similar)

---

### TC5: Missing ID error

**Steps:**
1. Run `npx tsx src/cli/tandem.ts reviews show --db-path /tmp/uat-tandem.sqlite`

**Expected:**
- Exit code 1
- Stderr contains message about missing `<id>` argument

---

### TC6: Reviews list on empty database

**Steps:**
1. Run `npx tsx src/cli/tandem.ts reviews list --json --db-path /tmp/uat-empty-$$.sqlite`

**Expected:**
- Exit code 0
- Stdout is `{"reviews":[],"version":0}` (or equivalent shape with empty array)

---

### TC7: Reviewers list on empty database

**Steps:**
1. Run `npx tsx src/cli/tandem.ts reviewers list --json --db-path /tmp/uat-empty-$$.sqlite`

**Expected:**
- Exit code 0
- Stdout is `{"reviewers":[],"version":0}` (or equivalent shape with empty array)

---

### TC8: Seeded database — full read-only command suite

**Precondition:** Seed a temp database with at least one review, one discussion message, and one reviewer. The smoke tests in `tandem-cli.test.ts` show how to do this via `createAppContext` + `createBrokerService`.

**Steps (all use `--json --db-path <seeded-db>`):**

1. `tandem reviews list --json` → stdout contains `reviews` array with at least 1 entry, each having `id`, `title`, `status`
2. `tandem reviews show <review-id> --json` → stdout contains `review` object with `id` matching the argument
3. `tandem proposal show <review-id> --json` → stdout contains `proposal` object with `diff` field
4. `tandem discussion show <review-id> --json` → stdout contains `messages` array with at least 1 entry, each having `body`, `role`
5. `tandem activity <review-id> --json` → stdout contains `events` array (may be empty if no audit events)
6. `tandem reviewers list --json` → stdout contains `reviewers` array with at least 1 entry, each having `id`, `status`

**Expected:** All 6 commands exit 0 with valid JSON matching the described shapes.

---

### TC9: Status filtering

**Steps:**
1. Run `tandem reviews list --status pending --json --db-path <seeded-db>`
2. Run `tandem reviews list --status bogus_status --db-path <seeded-db>`

**Expected:**
1. Exit 0 — `reviews` array contains only reviews with `status: "pending"` (or empty if none match)
2. Exit 1 — stderr contains "Invalid review status" and lists valid values

---

### TC10: Limit flag

**Steps:**
1. Run `tandem activity <review-id> --limit 1 --json --db-path <seeded-db>`

**Expected:**
- Exit 0
- `events` array has at most 1 entry

---

### TC11: Per-subcommand help

**Steps:**
1. Run `tandem reviews list --help`
2. Run `tandem reviews show --help`

**Expected:**
- Each exits 0
- Each prints subcommand-specific usage text (not the root help)

---

### TC12: Review not found

**Steps:**
1. Run `tandem reviews show nonexistent-id --db-path /tmp/uat-tandem.sqlite`

**Expected:**
- Exit code 1
- Stderr contains "Review nonexistent-id was not found" (or similar REVIEW_NOT_FOUND message)

---

## Automated Verification

All test cases above are covered by the 12 smoke tests in `packages/review-broker-server/test/tandem-cli.test.ts`:

```
npx vitest run packages/review-broker-server/test/tandem-cli.test.ts
```

Expected: 12/12 tests pass.
