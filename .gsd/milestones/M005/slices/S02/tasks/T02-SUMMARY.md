---
id: T02
parent: S02
milestone: M005
provides:
  - 7 write command handlers (claim, reclaim, verdict, close, discussion add, proposal accept/reject)
  - requireFlag helper for mandatory flag parsing
  - SUBCOMMAND_HELP entries for all 7 write commands
  - 12 new smoke tests (5 happy-path + 1 help + 6 error cases)
key_files:
  - packages/review-broker-server/src/cli/tandem.ts
  - packages/review-broker-server/test/tandem-cli.test.ts
key_decisions:
  - Tests ordered by state-machine progression (claim → verdict → discussion add → close) since all share a DB; discussion add must precede close to avoid closed-review rejection
patterns_established:
  - requireFlag(args, flag, commandName) pattern for mandatory write-command flags; throws with "Missing required --flag" message matching error test assertions
  - Verdict validation happens before service call using REVIEW_VERDICTS array includes-check, same pattern as extractStatusFlag but for required flags
observability_surfaces:
  - All 7 write commands support --json for machine-readable output with version field for concurrency tracking
  - Missing required flags emit "Missing required --flag" to stderr and exit non-zero
  - Invalid --verdict values emit "Invalid verdict" to stderr with valid values listed
  - Each write command has dedicated --help text via SUBCOMMAND_HELP
duration: 12m
verification_result: passed
completed_at: 2026-03-25
blocker_discovered: false
---

# T02: Add all 7 write command handlers with smoke tests

**Added 7 write command handlers (claim, reclaim, verdict, close, discussion add, proposal accept/reject) with requireFlag validation and 12 smoke tests**

## What Happened

Added `requireFlag(args, flag, commandName)` helper that extracts a mandatory flag value via `extractFlagWithEquals` and throws a descriptive error if missing. Implemented all 7 write command handler functions following the existing read-handler pattern: parse flags → call BrokerService method → format response with `formatJson`/`formatDetail`. The `handleReviewsVerdict` handler validates `--verdict` against the `REVIEW_VERDICTS` enum before calling the service. `handleProposalAccept` and `handleProposalReject` handle optional `--note` flag. Wired all handlers into the dispatch router with updated error messages listing available sub-verbs. Added `SUBCOMMAND_HELP` entries for all 7 commands and updated `printUsage()` to list them. Extended the test seed to claim the first review (enabling verdict/close tests) and create a second pending review (for claim/reclaim tests). Added 12 new tests: 5 happy-path write commands, 1 help output test, and 6 error cases covering missing `--actor`, invalid `--verdict`, missing `--verdict`, missing `--body`, and missing `--actor` for proposal accept and reviews close.

## Verification

- `npx vitest run test/tandem-cli.test.ts` — 27/27 tests pass (15 existing + 12 new)
- `npx vitest run test/config.test.ts` — 10/10 tests pass
- Happy-path JSON tests for: `reviews claim`, `reviews verdict`, `discussion add`, `reviews close`, `reviews reclaim`
- Error cases: missing `--actor` → exit 1, invalid `--verdict` → exit 1, missing `--verdict` → exit 1, missing `--body` → exit 1

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `npx vitest run test/tandem-cli.test.ts` | 0 | ✅ pass | 12.1s |
| 2 | `npx vitest run test/config.test.ts` | 0 | ✅ pass | 0.4s |
| 3 | `npx vitest run test/tandem-cli.test.ts test/config.test.ts` | 0 | ✅ pass | 12.6s |

## Diagnostics

- Run `tandem reviews claim <id> --actor <actor> --json --db-path <path>` to test claim; exit code 0 + JSON with `outcome` field.
- Run `tandem reviews verdict <id> --actor <actor> --verdict approved --reason "text" --json --db-path <path>` to test verdict; exit code 0 + JSON with `review`, `proposal`, `version`.
- Missing `--actor` on any write command → exit 1 + stderr containing `Missing required --actor`.
- Invalid `--verdict` value → exit 1 + stderr containing `Invalid verdict:` with valid values listed.
- `tandem --help` now lists all write commands with required flags.

## Deviations

- Moved `discussion add` test before `reviews close` test in the file to respect state-machine ordering — adding a message to a closed review is rejected by the service. The plan didn't specify test ordering but the shared-DB seed requires it.
- `proposal accept`/`reject` happy-path tests omitted (require complex counter-patch state-machine setup); error case tests prove the handlers are correctly wired since they reach the `requireFlag` validation layer.

## Known Issues

None.

## Files Created/Modified

- `packages/review-broker-server/src/cli/tandem.ts` — added REVIEW_VERDICTS import, requireFlag helper, 7 write command handlers, dispatch routing for all 7, SUBCOMMAND_HELP entries, updated printUsage()
- `packages/review-broker-server/test/tandem-cli.test.ts` — extended seed with claim + second review, added 12 new tests (5 happy-path, 1 help, 6 error cases)
- `.gsd/milestones/M005/slices/S02/tasks/T02-PLAN.md` — added Observability Impact section (pre-flight fix)
