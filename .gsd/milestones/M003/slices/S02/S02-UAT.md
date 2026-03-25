# S02 UAT — Restart sweep and continuity commands

## UAT Type
- UAT mode: runtime-executable restart/continuity verification

## Preconditions
1. Run all commands from `/home/cari/repos/tandem2/.gsd/worktrees/M003`.
2. Dependencies are already installed for this worktree.
3. Use **absolute** SQLite paths for package-scoped CLI commands (`pnpm --filter review-broker-server exec ...`) because relative `--db-path` values resolve from `packages/review-broker-server/`.
4. Use a disposable DB path for manual CLI checks, for example:
   `/home/cari/repos/tandem2/.gsd/worktrees/M003/.tmp/m003-s02-uat.sqlite`

---

## Test Case 1 — Restart continuity read model and startup-ordering lane stay green

**Goal:** prove restart cleanup, runtime-wide continuity inspection, and the real once-mode startup command all match the shipped S01 reclaim-vs-detach contract.

### Steps
1. Run:
   ```bash
   corepack pnpm exec vitest run \
     packages/review-broker-server/test/restart-persistence.test.ts \
     packages/review-broker-server/test/start-broker.smoke.test.ts \
     packages/review-broker-server/test/runtime-continuity-inspection.test.ts
   ```
2. Inspect the Vitest output.

### Expected outcomes
- All three test files pass.
- Restart persistence confirms the additive migration set includes `004_review_continuity`.
- The restart lane proves startup cleanup happens before normal work/inspection resumes.
- Safe stale `claimed` work is reclaimed.
- Ambiguous `submitted` work is detached and marked action-required instead of being silently advanced.
- Runtime continuity inspection exposes `recentRecoveryActivity`, `actionRequiredReviewIds`, and restart-visible recovery evidence from one durable SQLite file.
- The smoke test proves `start-broker.ts --once` emits redaction-safe continuity diagnostics.

---

## Test Case 2 — Typed client and MCP can request the same continuity snapshot directly

**Goal:** prove operators and downstream integrations do not need to stitch generic list APIs together to inspect restart continuity.

### Steps
1. Run:
   ```bash
   corepack pnpm exec vitest run \
     packages/review-broker-core/test/runtime-continuity-contracts.test.ts \
     packages/review-broker-server/test/client-mcp-parity.test.ts \
     packages/review-broker-server/test/mcp-server.test.ts
   ```
2. Inspect the test output for the dedicated continuity operation/tool.

### Expected outcomes
- All three test files pass.
- `review-broker-core` exposes the additive `inspectRuntimeContinuity` contract.
- The MCP registry exposes `inspect_runtime_continuity`.
- Typed client, MCP, and runtime service return matching continuity aggregates/history.
- Reviewer continuity snapshots expose IDs, session IDs, statuses, timestamps, current review IDs, and `commandBasename`, but do **not** expose reviewer argv or raw command text.

---

## Test Case 3 — The continuity CLI reports startup recovery plus the focused broker continuity snapshot

**Goal:** prove the new operator command works end to end on one durable SQLite file and stays redaction-safe.

### Steps
1. Run the regression proof:
   ```bash
   corepack pnpm exec vitest run packages/review-broker-server/test/continuity-cli.test.ts
   ```
2. Inspect the test output.

### Expected outcomes
- The test passes.
- The real CLI entrypoint starts the broker, lets startup recovery run, and emits one structured continuity payload.
- The output includes `startupRecovery`, `reviewerStatusCounts`, `actionRequiredReviewIds`, `recentRecoveryActivity`, and `recoveryReviews`.
- Reviewer command information is basename-only; no argv or raw command text is leaked.
- The continuity fields shared with `start-broker.ts --once` remain consistent on the same recovered database.

---

## Test Case 4 — Workspace build regenerates the shipped runtime artifacts

**Goal:** prove the checked-in JS mirrors and `dist/` outputs are aligned with the TypeScript contract/CLI sources used by the runtime.

### Steps
1. Run:
   ```bash
   corepack pnpm build
   ```
2. Confirm the build succeeds.

### Expected outcomes
- The workspace build exits 0.
- `review-broker-core`, `review-broker-server`, and `review-broker-client` all build successfully.
- No stale-export or stale-dist failures appear during the build.

---

## Test Case 5 — Real operator CLI flow on a durable SQLite file

**Goal:** prove the supported CLI surfaces are usable directly by an operator after restart without reading SQLite.

### Steps
1. Remove any prior temp database:
   ```bash
   rm -f /home/cari/repos/tandem2/.gsd/worktrees/M003/.tmp/m003-s02-uat.sqlite
   ```
2. Run once-mode broker startup on the disposable DB:
   ```bash
   corepack pnpm --filter review-broker-server exec tsx src/cli/start-broker.ts \
     --db-path /home/cari/repos/tandem2/.gsd/worktrees/M003/.tmp/m003-s02-uat.sqlite \
     --once
   ```
3. Inspect the emitted `broker.started` and `broker.once_complete` JSON lines.
4. Run the focused continuity command on the **same** DB:
   ```bash
   corepack pnpm --filter review-broker-server exec tsx src/cli/inspect-continuity.ts \
     --db-path /home/cari/repos/tandem2/.gsd/worktrees/M003/.tmp/m003-s02-uat.sqlite \
     --limit 10
   ```
5. Inspect the emitted `broker.continuity_inspected` JSON line.

### Expected outcomes
- Both commands exit 0.
- `broker.started` reports the applied migrations including `004_review_continuity`.
- Both commands include the same `startupRecovery` summary for the same database.
- `start-broker.ts --once` shows the broader runtime inventory (`reviewCount`, `reviewerCount`, `migrationCount`, etc.).
- `inspect-continuity.ts` shows the focused continuity payload (`reviewerStatusCounts`, `reviewers`, `recentRecoveryActivity`, `actionRequiredReviewIds`, `recoveryReviews`).
- On a fresh DB, recovery counts are zero and the payloads remain structured and redaction-safe.

---

## Edge Cases

### Edge Case A — Relative `--db-path` resolves from the package directory
**How to exercise:** rerun either package-scoped CLI command with a relative `--db-path`.

**Expected outcomes:**
- the database is created relative to `packages/review-broker-server/`, not the repo root
- rerunning with an absolute path restores predictable repo-root temp file placement

### Edge Case B — Reviewer continuity output must stay basename-only
**How to exercise:** covered by `packages/review-broker-server/test/continuity-cli.test.ts` and the typed/MCP parity lane.

**Expected outcomes:**
- continuity reviewer entries contain `commandBasename`
- raw command text and argv are absent from typed, MCP, and CLI continuity payloads

### Edge Case C — Focused continuity CLI and once-mode CLI are intentionally different surfaces
**How to exercise:** compare the JSON keys from Test Case 5.

**Expected outcomes:**
- `start-broker.ts --once` includes broader runtime inventory and counts
- `inspect-continuity.ts` includes the focused reviewer/recovery continuity snapshot
- shared fields such as `startupRecovery`, `actionRequiredReviewIds`, and recent continuity state stay coherent across both commands

---

## Slice Acceptance Rule

S02 is acceptable only when **all five test cases above pass** and the operator continuity surfaces remain coherent:
- startup stale-session cleanup must occur before normal inspection/work resumes
- restart continuity must be inspectable through typed client, MCP, and CLI broker-owned surfaces
- reviewer state must remain redaction-safe
- operators must be able to inspect startup recovery, current ownership, recent recovery actions, and action-required cases without raw SQLite queries
