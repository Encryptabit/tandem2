---
estimated_steps: 5
estimated_files: 1
skills_used: []
---

# T02: Add all read-only subcommands

**Slice:** S01 — CLI scaffold and read-only commands
**Milestone:** M005

## Description

Add the remaining 6 read-only commands to the `tandem` CLI: `reviews list`, `reviews show`, `proposal show`, `discussion show`, `activity`, and `reviewers list`. Each command follows the same pattern established in T01: parse subcommand-specific args → call one `BrokerService` method → format output → exit. No new structural patterns are introduced — this task fills out the command surface by applying the scaffold.

All list commands accept an optional `--status <value>` flag validated against the domain enums from `review-broker-core`. All show/get commands require an `<id>` positional argument and exit non-zero with a clear error if missing. Each command supports `--help`.

## Steps

1. **Add `reviews list [--status X] [--limit N]` handler** — Parse `--status` (validate against `REVIEW_STATUSES` from `review-broker-core/src/domain.ts`) and `--limit` flags. Call `service.listReviews({ status, limit })`. Format `response.reviews` as a table with columns: `ID`, `Title`, `Status`, `Priority`, `Author`, `Created`. In `--json` mode, output the full response object.

2. **Add `reviews show <id>` handler** — Parse the positional `<id>` argument (error if missing). Call `service.getReviewStatus({ reviewId: id })`. Format `response.review` as a detail view with all `ReviewSummary` fields. Handle `BrokerServiceError` with code `REVIEW_NOT_FOUND` — print error and exit non-zero.

3. **Add `proposal show <id>`, `discussion show <id>`, and `activity <id>` handlers** — Same positional-id pattern as `reviews show`:
   - `proposal show <id>` → `service.getProposal({ reviewId: id })` → detail view of `ReviewProposal` fields (title, description, affected files, diff stats — truncate diff in human mode)
   - `discussion show <id>` → `service.getDiscussion({ reviewId: id })` → table of messages with columns: `Message ID`, `Actor`, `Role`, `Created`, plus truncated body
   - `activity <id> [--limit N]` → `service.getActivityFeed({ reviewId: id, limit })` → table of activity entries with columns: `Event ID`, `Type`, `Status Change`, `Actor`, `Created`

4. **Add `reviewers list [--status X] [--limit N]` handler** — Parse `--status` (validate against `REVIEWER_STATUSES`) and `--limit`. Call `service.listReviewers({ status, limit })`. Format `response.reviewers` as a table with columns: `ID`, `Status`, `Current Review`, `Command`, `PID`, `Started`, `Updated`.

5. **Add `--help` text for each new subcommand** — Each handler checks if `--help` is in its args and prints subcommand-specific usage. Update the root `--help` output to list all commands with short descriptions.

## Must-Haves

- [ ] `reviews list [--status X]` formats `ReviewSummary[]` as a table
- [ ] `reviews show <id>` formats a single `ReviewSummary` as key-value detail
- [ ] `proposal show <id>` formats `ReviewProposal` as detail view
- [ ] `discussion show <id>` formats `ReviewDiscussionMessage[]` as a table
- [ ] `activity <id>` formats `ReviewActivityEntry[]` as a table
- [ ] `reviewers list [--status X]` formats `ReviewerRecord[]` as a table
- [ ] All commands support `--json` for full response output
- [ ] Missing `<id>` argument produces a clear error and non-zero exit
- [ ] `--status` values validated against domain enums; invalid values produce an error
- [ ] `BrokerServiceError` with `REVIEW_NOT_FOUND` handled gracefully with error message

## Verification

- `cd /home/cari/repos/tandem2/.gsd/worktrees/M005 && npx tsx packages/review-broker-server/src/cli/tandem.ts reviews list --json --db-path /tmp/test-tandem-t02.sqlite` exits 0 with `{"reviews":[...]}` shape
- `cd /home/cari/repos/tandem2/.gsd/worktrees/M005 && npx tsx packages/review-broker-server/src/cli/tandem.ts reviews show nonexistent --db-path /tmp/test-tandem-t02.sqlite 2>&1; echo "exit: $?"` prints error and exit code 1
- `cd /home/cari/repos/tandem2/.gsd/worktrees/M005 && npx tsx packages/review-broker-server/src/cli/tandem.ts reviewers list --json --db-path /tmp/test-tandem-t02.sqlite` exits 0 with `{"reviewers":[...]}` shape
- `cd /home/cari/repos/tandem2/.gsd/worktrees/M005 && npx tsx packages/review-broker-server/src/cli/tandem.ts reviews list --help` prints subcommand usage

## Inputs

- `packages/review-broker-server/src/cli/tandem.ts` — CLI entrypoint with router and status command from T01
- `packages/review-broker-server/src/cli/format.ts` — output formatting helpers from T01
- `packages/review-broker-server/src/runtime/broker-service.ts` — `BrokerService` interface: `listReviews`, `getReviewStatus`, `getProposal`, `getDiscussion`, `getActivityFeed`, `listReviewers`
- `packages/review-broker-core/src/contracts.ts` — response schemas: `ReviewSummary`, `ReviewerRecord`, `ReviewActivityEntry`, `ReviewDiscussionMessage`, `ReviewProposal`
- `packages/review-broker-core/src/domain.ts` — `REVIEW_STATUSES`, `REVIEWER_STATUSES` for `--status` validation

## Observability Impact

- **New diagnostic commands:** `tandem reviews list --json`, `tandem reviews show <id> --json`, `tandem proposal show <id> --json`, `tandem discussion show <id> --json`, `tandem activity <id> --json`, `tandem reviewers list --json` — each returns structured JSON matching the BrokerService response schemas, usable for programmatic inspection.
- **Failure visibility:** `REVIEW_NOT_FOUND` errors produce `Error: Review <id> was not found.` on stderr + exit code 1. Invalid `--status` values produce `Error: Invalid <entity> status: "<value>". Valid values: ...` on stderr + exit code 1. Missing `<id>` args produce `Missing required <id> argument for "<command>".` on stderr + exit code 1.
- **How to inspect:** Run any command with `--json` to get machine-readable output. Run with `--help` for per-subcommand usage. `tandem reviews list --status pending --json` filters by status. `tandem activity <id> --limit 10 --json` limits results.

## Expected Output

- `packages/review-broker-server/src/cli/tandem.ts` — modified with 6 new command handlers and updated help text
