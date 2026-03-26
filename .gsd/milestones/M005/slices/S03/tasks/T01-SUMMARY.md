---
id: T01
parent: S03
milestone: M005
provides:
  - reviews create command handler with diff-file reading
  - reviewers kill command handler
  - dispatch routing, SUBCOMMAND_HELP, and printUsage entries for both commands
  - 7 new smoke tests (4 create, 2 kill, 1 help)
key_files:
  - packages/review-broker-server/src/cli/tandem.ts
  - packages/review-broker-server/test/tandem-cli.test.ts
key_decisions:
  - Diff file read errors wrapped in a user-friendly message rather than exposing raw ENOENT stack trace
patterns_established:
  - readFileSync + path.resolve for file-based CLI input (reviews create --diff-file)
observability_surfaces:
  - reviews create returns review.reviewId + review.status in JSON for tracing
  - reviewers kill returns outcome (killed|already_offline|not_found) + reviewer.reviewerId
  - Missing flags produce stderr with flag name; nonexistent diff file produces stderr with resolved path; all exit code 1
duration: 12m
verification_result: passed
completed_at: 2026-03-25
blocker_discovered: false
---

# T01: Implement `reviews create` and `reviewers kill` command handlers with tests

**Added `reviews create` (diff-file reading, createReview service call) and `reviewers kill` (positional ID, killReviewer service call) CLI commands with dispatch routing, help entries, and 7 smoke tests.**

## What Happened

Added two new command handlers to `tandem.ts` following the established pattern from S01/S02:

1. **`handleReviewsCreate`** — parses `--title`, `--description`, `--author`, `--diff-file` (required) and `--priority` (optional). Resolves the diff file path via `path.resolve()`, reads it with `readFileSync`, and calls `runtime.service.createReview()`. Wraps file-not-found errors in a clear message instead of exposing a raw stack trace.

2. **`handleReviewersKill`** — parses a positional `<id>` via `requireId()` and calls `runtime.service.killReviewer()`. Outputs outcome, reviewer ID, and message.

Both handlers wired into `dispatch()` switch cases, `SUBCOMMAND_HELP` entries added, `printUsage()` updated. The reviewers default error message now lists `list, spawn, kill` (spawn is a placeholder for T02). Added `node:fs` and `node:path` imports.

7 new tests added: create happy path, missing `--title`, missing `--diff-file`, nonexistent diff file, kill happy path, kill missing `<id>`, help output check. Kill tests placed at end of describe block since killing the test reviewer is destructive.

## Verification

- `npx vitest run test/tandem-cli.test.ts` → 34 tests passed (27 existing + 7 new)
- `npx vitest run test/config.test.ts` → 10 tests passed (unchanged)
- `reviews create` JSON output verified: `review.reviewId` exists, `review.status === 'pending'`
- `reviewers kill` JSON output verified: `outcome` field present
- Error cases verified: missing flags → stderr with flag name + exit code 1; nonexistent diff file → stderr with "Cannot read diff file"

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `npx vitest run test/tandem-cli.test.ts` | 0 | ✅ pass | 17.4s |
| 2 | `npx vitest run test/config.test.ts` | 0 | ✅ pass | 4.0s |

## Diagnostics

- Inspect created reviews: `tandem reviews show <id> --json --db-path <path>`
- Inspect reviewer state after kill: `tandem reviewers list --json --db-path <path>`
- Error shapes: `Error: Cannot read diff file: "<path>" — file not found.` for bad diff paths; `Missing required --title for "reviews create".` for missing flags; `Missing required <id> argument for "reviewers kill".` for missing ID.

## Deviations

None — implementation matched the task plan exactly.

## Known Issues

None.

## Files Created/Modified

- `packages/review-broker-server/src/cli/tandem.ts` — added `handleReviewsCreate`, `handleReviewersKill`, `node:fs`/`node:path` imports, dispatch routing, SUBCOMMAND_HELP entries, updated printUsage
- `packages/review-broker-server/test/tandem-cli.test.ts` — added 7 new test cases for reviews create, reviewers kill, and help output
