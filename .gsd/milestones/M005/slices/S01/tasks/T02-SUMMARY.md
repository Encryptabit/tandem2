---
id: T02
parent: S01
milestone: M005
provides:
  - reviews list command with --status filtering and --limit
  - reviews show command with full ReviewSummary detail view
  - proposal show command with ReviewProposal detail view (truncated diff)
  - discussion show command with message table
  - activity command with activity feed table and --limit
  - reviewers list command with --status filtering and --limit
  - per-subcommand --help text for all 7 commands
  - --status validation against domain enums (REVIEW_STATUSES, REVIEWER_STATUSES)
  - missing <id> argument detection with clear error messages
  - BrokerServiceError handling (REVIEW_NOT_FOUND → stderr + exit 1)
key_files:
  - packages/review-broker-server/src/cli/tandem.ts
key_decisions:
  - dispatch() made async to await BrokerService methods (all return Promises)
  - activity command treats verb position as <id> since it has no verb — pushes verb back into rest args
  - extractFlag/extractFlagWithEquals/extractStatusFlag/extractLimitFlag helper functions for DRY subcommand arg parsing
  - IdRequiredError class for distinguishing missing-ID from other errors in catch block
patterns_established:
  - Subcommand arg helpers (extractFlag, extractStatusFlag, extractLimitFlag, requireId) — reusable for S02 write commands
  - SUBCOMMAND_HELP record for per-subcommand help text lookup
  - printSubcommandHelp(noun, verb) resolves help text from compound key
  - truncate() helper for human-readable output of long fields (diff, message body)
observability_surfaces:
  - tandem reviews list --json — programmatic inspection of all reviews with optional status/limit filtering
  - tandem reviews show <id> --json — full ReviewSummary for a specific review
  - tandem proposal show <id> --json — ReviewProposal with diff and affected files
  - tandem discussion show <id> --json — all discussion messages for a review
  - tandem activity <id> --json — audit activity feed with optional limit
  - tandem reviewers list --json — all reviewers with optional status/limit filtering
  - Invalid --status → stderr error with valid values listed
  - Missing <id> → stderr error naming the command
  - REVIEW_NOT_FOUND → stderr error with review ID
duration: 15m
verification_result: passed
completed_at: 2026-03-25
blocker_discovered: false
---

# T02: Add all read-only subcommands

**Add 6 read-only CLI commands (reviews list/show, proposal show, discussion show, activity, reviewers list) with --json output, --status validation, --limit support, per-subcommand --help, and graceful error handling for missing IDs and unknown reviews**

## What Happened

Added 6 async command handlers to the `tandem` CLI router: `handleReviewsList`, `handleReviewsShow`, `handleProposalShow`, `handleDiscussionShow`, `handleActivity`, `handleReviewersList`. Each handler follows the T01 scaffold pattern: parse subcommand-specific args → call one `BrokerService` method → format output (table for lists, detail for single entities) → write to stdout. Made `dispatch()` async to await the service methods (all return Promises).

Created reusable subcommand arg parsing helpers: `extractFlag` (--flag value), `extractFlagWithEquals` (--flag=value), `extractStatusFlag` (validates against domain enum arrays), `extractLimitFlag` (validates positive integer), `extractPositionalId`, and `requireId` (throws `IdRequiredError` if missing). Added a `SUBCOMMAND_HELP` record mapping compound keys like `"reviews list"` to per-subcommand usage text, with a `printSubcommandHelp(noun, verb)` resolver.

The `activity` command uses a special pattern: since it takes `<id>` in the verb position (`tandem activity <id>`), the router pushes verb back into rest args before calling the handler. `BrokerServiceError` with code `REVIEW_NOT_FOUND` is caught in the main try/catch and printed as a clean stderr message with exit code 1. Invalid `--status` values are validated before the service call, producing a helpful error listing valid values.

## Verification

All 4 task-level checks pass:
1. `reviews list --json` exits 0 with `{"reviews":[],"version":0}` shape
2. `reviews show nonexistent` exits 1 with `Error: Review nonexistent was not found.`
3. `reviewers list --json` exits 0 with `{"reviewers":[],"version":0}` shape
4. `reviews list --help` exits 0 with subcommand usage text

Additional checks:
- Missing `<id>` for all 4 commands requiring it (reviews show, proposal show, discussion show, activity) → exit 1 with clear error
- Invalid `--status` for reviews list and reviewers list → exit 1 with valid values listed
- `REVIEW_NOT_FOUND` for all show/detail commands → exit 1 with error message
- Human-readable empty results → "No reviews/reviewers found."
- Existing `status` command still works correctly in both modes
- All subcommand `--help` texts print correctly

Slice-level tests (tandem-cli.test.ts) not yet created — that's T03.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `npx tsx packages/review-broker-server/src/cli/tandem.ts reviews list --json --db-path /tmp/test-tandem-t02.sqlite` | 0 | ✅ pass | <1s |
| 2 | `npx tsx packages/review-broker-server/src/cli/tandem.ts reviews show nonexistent --db-path /tmp/test-tandem-t02.sqlite` | 1 | ✅ pass | <1s |
| 3 | `npx tsx packages/review-broker-server/src/cli/tandem.ts reviewers list --json --db-path /tmp/test-tandem-t02.sqlite` | 0 | ✅ pass | <1s |
| 4 | `npx tsx packages/review-broker-server/src/cli/tandem.ts reviews list --help` | 0 | ✅ pass | <1s |
| 5 | `npx tsx packages/review-broker-server/src/cli/tandem.ts reviews show --db-path /tmp/test-tandem-t02.sqlite` | 1 | ✅ pass | <1s |
| 6 | `npx tsx packages/review-broker-server/src/cli/tandem.ts reviews list --status bogus --db-path /tmp/test-tandem-t02.sqlite` | 1 | ✅ pass | <1s |
| 7 | `npx tsx packages/review-broker-server/src/cli/tandem.ts activity nonexistent --db-path /tmp/test-tandem-t02.sqlite` | 1 | ✅ pass | <1s |
| 8 | `npx tsx packages/review-broker-server/src/cli/tandem.ts status --json --db-path /tmp/test-tandem-t02.sqlite` | 0 | ✅ pass | <1s |

## Diagnostics

- `tandem reviews list --json --db-path <path>` — list all reviews as structured JSON (filterable with `--status` and `--limit`)
- `tandem reviews show <id> --json --db-path <path>` — full ReviewSummary for a specific review
- `tandem proposal show <id> --json --db-path <path>` — ReviewProposal with diff and affected files
- `tandem discussion show <id> --json --db-path <path>` — all discussion messages
- `tandem activity <id> --json --db-path <path>` — audit activity feed (limit with `--limit`)
- `tandem reviewers list --json --db-path <path>` — all reviewers (filterable with `--status` and `--limit`)
- Invalid status values produce `Error: Invalid <entity> status: "<value>". Valid values: ...` on stderr
- Missing `<id>` produces `Missing required <id> argument for "<command>".` on stderr
- `REVIEW_NOT_FOUND` produces `Error: Review <id> was not found.` on stderr

## Deviations

- Added `truncate()` helper for human-readable output of long fields (diff body, message body) — not specified in plan but needed for usable terminal output.
- Created reusable arg parsing helpers (`extractFlag`, `extractFlagWithEquals`, `extractStatusFlag`, `extractLimitFlag`, `requireId`) instead of inline parsing per handler — reduces duplication and benefits S02 write commands.
- Added `IdRequiredError` class to distinguish missing-ID errors from BrokerServiceError in the catch block, giving cleaner error messages without the `Error:` prefix.

## Known Issues

None.

## Files Created/Modified

- `packages/review-broker-server/src/cli/tandem.ts` — added 6 async command handlers, subcommand arg parsing helpers, per-subcommand help text, made dispatch() async, added BrokerServiceError/IdRequiredError handling
- `.gsd/milestones/M005/slices/S01/tasks/T02-PLAN.md` — added Observability Impact section (pre-flight fix)
