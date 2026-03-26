---
estimated_steps: 5
estimated_files: 2
skills_used: []
---

# T01: Implement `reviews create` and `reviewers kill` command handlers with tests

**Slice:** S03 — Create, spawn, kill, and dashboard commands
**Milestone:** M005

## Description

Add two new command handlers to the tandem CLI: `reviews create` (reads a diff from a file and creates a review via `service.createReview()`) and `reviewers kill` (stops a reviewer via `service.killReviewer()`). Both follow the established handler pattern from S01/S02 — parse flags, call service method, format output. Wire them into the `dispatch()` router, add `SUBCOMMAND_HELP` entries, update `printUsage()`, and add comprehensive smoke tests.

## Steps

1. **Add `handleReviewsCreate` handler to `tandem.ts`:**
   - Add `import { readFileSync } from 'node:fs'` and `import path from 'node:path'` at the top of the file.
   - Create `async function handleReviewsCreate(rest, runtime, options)` that:
     - Parses required flags: `--title` (via `requireFlag`), `--description` (via `requireFlag`), `--author` (via `requireFlag`), `--diff-file` (via `requireFlag`).
     - Parses optional flag: `--priority` (via `extractFlagWithEquals`).
     - Resolves the diff file path with `path.resolve(diffFilePath)` (relative to `process.cwd()`).
     - Reads the diff content: `const diff = readFileSync(resolvedPath, 'utf8')`.
     - Calls `await runtime.service.createReview({ title, description, diff, authorId: author, ...(priority ? { priority } : {}) })`.
     - Outputs with `formatJson` (if `--json`) or `formatDetail` showing Review ID, Status, Title, Proposal ID fields.
   - Wrap `readFileSync` in a try/catch that emits a clear error if the file doesn't exist: `Error: Cannot read diff file: "<path>" — file not found.`

2. **Add `handleReviewersKill` handler to `tandem.ts`:**
   - Create `async function handleReviewersKill(rest, runtime, options)` that:
     - Parses the required positional `<id>` via `requireId(args, 'reviewers kill')`.
     - Calls `await runtime.service.killReviewer({ reviewerId: id })`.
     - Outputs with `formatJson` (if `--json`) or `formatDetail` showing Outcome, Reviewer ID, Message fields.

3. **Wire both handlers into `dispatch()` and update help:**
   - In the `'reviews'` switch case, add `case 'create': await handleReviewsCreate(rest, runtime, options); return;`.
   - In the `'reviewers'` switch case, add `case 'spawn':` (placeholder — will be filled in T02) and `case 'kill': await handleReviewersKill(rest, runtime, options); return;`. Update the default error message to list all available subcommands: `list, spawn, kill`.
   - Add `SUBCOMMAND_HELP` entries for `'reviews create'` and `'reviewers kill'`.
   - Update `printUsage()` to list both new commands.

4. **Add smoke tests to `tandem-cli.test.ts`:**
   - **`reviews create` happy path:** `runTandem(['reviews', 'create', '--title', 'CLI Created Review', '--description', 'From CLI test', '--diff-file', path.join(WORKTREE_ROOT, 'packages', 'review-broker-server', 'test', 'fixtures', 'valid-review.diff'), '--author', 'cli-tester', '--json', '--db-path', dbPath])` → parse JSON → verify `review.reviewId` exists and `review.status === 'pending'`.
   - **`reviews create` missing --title:** verify exit code non-zero, stderr contains `Missing required --title`.
   - **`reviews create` nonexistent diff file:** verify exit code non-zero, stderr contains `Cannot read diff file` or similar.
   - **`reviewers kill` happy path:** Use the existing `test-reviewer-1` spawned in `beforeAll`. **Place this test at the END of the describe block** since killing the reviewer is destructive. Verify JSON output has an `outcome` field.
   - **`reviewers kill` missing id:** verify exit code non-zero, stderr contains `Missing required <id>`.
   - **Help test:** verify `tandem --help` now lists `reviews create` and `reviewers kill`.

5. **Run the full test suite** to confirm all existing 27 tests still pass alongside the new tests.

## Must-Haves

- [ ] `handleReviewsCreate` reads diff from `--diff-file` resolved via `path.resolve()`, calls `service.createReview()`, outputs via `formatJson`/`formatDetail`
- [ ] `handleReviewersKill` parses positional `<id>`, calls `service.killReviewer()`, outputs via `formatJson`/`formatDetail`
- [ ] Both commands wired into `dispatch()` switch with correct routing
- [ ] `SUBCOMMAND_HELP` entries for both commands
- [ ] `printUsage()` updated to list both new commands
- [ ] Smoke tests cover happy paths and at least 2 error cases
- [ ] Nonexistent diff file produces a clear error message (not a raw Node.js stack trace)

## Verification

- `cd packages/review-broker-server && npx vitest run test/tandem-cli.test.ts` — all existing 27 tests pass + new tests for `reviews create` and `reviewers kill` pass.
- `reviews create` JSON output contains `review.reviewId` and `review.status`.
- `reviewers kill` JSON output contains `outcome`.
- Error cases produce stderr messages and exit code 1.

## Inputs

- `packages/review-broker-server/src/cli/tandem.ts` — existing CLI with S01/S02 handlers; add new handlers following the same pattern
- `packages/review-broker-server/test/tandem-cli.test.ts` — existing 27 tests with `runTandem` helper, `parseJsonOutput`, and seeded test data (reviews, reviewer, messages)
- `packages/review-broker-server/test/fixtures/valid-review.diff` — existing diff fixture to use for `reviews create` test
- `packages/review-broker-server/src/cli/format.ts` — `formatJson`, `formatDetail` functions (used as-is)

## Expected Output

- `packages/review-broker-server/src/cli/tandem.ts` — modified with `handleReviewsCreate`, `handleReviewersKill`, dispatch routing, SUBCOMMAND_HELP, updated printUsage
- `packages/review-broker-server/test/tandem-cli.test.ts` — modified with ~6 new test cases for create and kill commands

## Observability Impact

- **New signals:** `reviews create` returns `review.reviewId` + `review.status` in JSON output for tracing. `reviewers kill` returns `outcome` (killed | already_offline | not_found) + `reviewer.reviewerId` + optional `message`.
- **Inspection:** Created reviews inspectable via `tandem reviews show <id> --json`. Killed reviewers inspectable via `tandem reviewers list --json` (status reflects kill outcome).
- **Failure visibility:** Missing flags → stderr with flag name and exit code 1. Nonexistent diff file → stderr with resolved path and exit code 1. All errors are structured text, not raw stack traces.
