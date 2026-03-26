---
estimated_steps: 4
estimated_files: 2
skills_used:
  - test
---

# T03: Add smoke tests for all CLI commands

**Slice:** S01 — CLI scaffold and read-only commands
**Milestone:** M005

## Description

Create comprehensive smoke tests for the `tandem` CLI following the existing `start-broker.smoke.test.ts` pattern: spawn the real CLI process via `spawnSync`, parse stdout, and assert response shapes. This is the slice's objective verification — it proves all 7 commands work end-to-end through the real CLI entrypoint.

The test file seeds a temp SQLite database with a review (including a message and reviewer) using `createAppContext` + `createBrokerService` directly, then exercises each CLI command against that database. This ensures the CLI produces meaningful output, not just empty lists.

## Steps

1. **Add `TANDEM_CLI_PATH` to `packages/review-broker-server/test/test-paths.ts`** — Add a constant pointing to `path.join(WORKTREE_ROOT, 'packages', 'review-broker-server', 'src', 'cli', 'tandem.ts')`, following the same pattern as `CLI_PATH`.

2. **Create `packages/review-broker-server/test/tandem-cli.test.ts`** with:
   - Import `spawnSync` from `node:child_process`, `mkdtempSync`/`rmSync` from `node:fs`, `os`/`path` from Node
   - Import `createAppContext`, `createBrokerService` from source
   - Import `TANDEM_CLI_PATH`, `TSX_PATH`, `WORKTREE_ROOT` from `./test-paths.js`
   - Import `readFileSync` for reading the `valid-review.diff` fixture
   - `afterEach` cleanup for temp directories (same pattern as the smoke test)
   - `seedTestData(dbPath: string)` helper that creates a broker context, creates a review with `service.createReview()`, adds a message with `service.addMessage()`, spawns a reviewer with `service.spawnReviewer()` (using `process.execPath` + reviewer fixture), then closes the context. Returns `{ reviewId, reviewerId }`.
   - `runTandem(args: string[])` helper wrapping `spawnSync(TSX_PATH, [TANDEM_CLI_PATH, ...args], { cwd: WORKTREE_ROOT, encoding: 'utf8' })`
   - `parseJsonOutput(stdout: string)` helper to parse the JSON output

3. **Write `--json` smoke tests for each command** — One `describe` block per command group:
   - `tandem status --json` → assert output has `reviewCount`, `reviewerCount`, `statusCounts` fields, `reviewCount >= 1`
   - `tandem reviews list --json` → assert `reviews` array with length >= 1, first element has `reviewId`, `title`, `status`
   - `tandem reviews list --status pending --json` → assert filtered results
   - `tandem reviews show <id> --json` → assert `review.reviewId` matches seeded ID
   - `tandem proposal show <id> --json` → assert `proposal.reviewId` matches, has `title`, `description`, `diff`
   - `tandem discussion show <id> --json` → assert `messages` array with length >= 1
   - `tandem activity <id> --json` → assert `activity` array with length >= 1
   - `tandem reviewers list --json` → assert `reviewers` array with length >= 1

4. **Write error case and human-readable tests:**
   - Unknown subcommand (`tandem bogus`) → `status !== 0`, stderr contains error text
   - Missing ID (`tandem reviews show`) → `status !== 0`, stderr contains error text
   - `tandem status` without `--json` → `status === 0`, stdout contains human-readable labels (e.g. "Review Count" or "reviews:" or similar)
   - `tandem --help` → `status === 0`, stdout contains "status" and "reviews" and "reviewers"

## Must-Haves

- [ ] `TANDEM_CLI_PATH` exported from `test-paths.ts`
- [ ] `seedTestData()` creates a review, message, and reviewer in a temp database
- [ ] Every command (`status`, `reviews list`, `reviews show`, `proposal show`, `discussion show`, `activity`, `reviewers list`) has at least one `--json` smoke test
- [ ] Error cases: unknown subcommand and missing ID both exit non-zero
- [ ] Human-readable output test for at least `status`
- [ ] All tests pass via `vitest run test/tandem-cli.test.ts`

## Verification

- `cd /home/cari/repos/tandem2/.gsd/worktrees/M005 && npx vitest run packages/review-broker-server/test/tandem-cli.test.ts` — all tests pass, exit 0

## Inputs

- `packages/review-broker-server/src/cli/tandem.ts` — the completed CLI with all commands from T01+T02
- `packages/review-broker-server/src/cli/format.ts` — formatting module from T01
- `packages/review-broker-server/test/test-paths.ts` — existing test path constants to extend
- `packages/review-broker-server/test/start-broker.smoke.test.ts` — reference pattern for `spawnSync` smoke tests, `seedStaleReviewerState()`, `parseJsonLines()`
- `packages/review-broker-server/test/fixtures/valid-review.diff` — diff fixture for seeding reviews
- `packages/review-broker-server/test/fixtures/reviewer-worker.mjs` — reviewer fixture for spawning

## Expected Output

- `packages/review-broker-server/test/tandem-cli.test.ts` — new smoke test file with all command tests
- `packages/review-broker-server/test/test-paths.ts` — modified with `TANDEM_CLI_PATH` export
