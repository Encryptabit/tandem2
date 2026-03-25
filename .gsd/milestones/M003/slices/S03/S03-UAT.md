# S03 UAT — End-to-end crash/restart continuity proof

## UAT Type
- UAT mode: runtime-executable continuity acceptance and operator-surface verification

## Preconditions
1. Run all commands from `/home/cari/repos/tandem2/.gsd/worktrees/M003`.
2. Dependencies are already installed for this worktree.
3. Use **absolute** SQLite paths for package-scoped CLI commands.
4. Use disposable DB paths under `.tmp/`, for example:
   - `/home/cari/repos/tandem2/.gsd/worktrees/M003/.tmp/m003-s03-uat.sqlite`
   - `/home/cari/repos/tandem2/.gsd/worktrees/M003/.tmp/m003-s03-continuity.sqlite`
5. Do **not** inspect SQLite directly during acceptance; use only the shipped broker tests and CLI/status surfaces.

---

## Test Case 1 — Final assembled continuity proof stays green on one durable database

**Goal:** prove the broker survives a real reviewer exit and a later broker crash/restart on the same SQLite file, with coherent recovery state across runtime and CLI surfaces.

### Steps
1. Run:
   ```bash
   corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M003 exec vitest run \
     packages/review-broker-server/test/end-to-end-continuity-proof.test.ts \
     packages/review-broker-server/test/recovery-status-surfaces.test.ts \
     packages/review-broker-server/test/startup-sweep.test.ts \
     packages/review-broker-server/test/restart-persistence.test.ts \
     packages/review-broker-server/test/continuity-cli.test.ts
   ```
2. Inspect the Vitest output.

### Expected outcomes
- All five test files pass.
- The assembled proof explicitly covers both causes on one DB: `reviewer_exit` first and `startup_recovery` after a crash/restart second.
- Safe `claimed` work is reclaimed automatically.
- Ambiguous `submitted`/open work is detached and left action-required.
- No review remains in claimed/stale limbo after the combined lifecycle.
- The proof validates `getReviewStatus`, `getReviewTimeline`, `inspectRuntimeContinuity`, `inspect-continuity.ts`, and `start-broker.ts --once` against the same durable continuity story.
- Reviewer-facing/operator-facing output remains redaction-safe.

---

## Test Case 2 — The shipped repo continuity command reruns the full acceptance lane

**Goal:** prove future operators/agents can rerun one supported command and get the full S03 continuity proof rather than a partial test subset.

### Steps
1. Run:
   ```bash
   corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M003 broker:continuity
   ```
2. Inspect the command output.

### Expected outcomes
- The command exits 0.
- Root `broker:continuity` delegates to `review-broker-server` package `test:continuity`.
- The package-local script runs the same five-test S03 continuity bundle.
- The end-to-end proof and the focused operator regressions both pass in the same rerunnable lane.

---

## Test Case 3 — Direct once-mode broker startup works on the required absolute SQLite path

**Goal:** prove the shipped `start-broker.ts --once` operator surface works directly on a durable SQLite path and emits structured continuity-safe output.

### Steps
1. Remove any previous temp DB:
   ```bash
   rm -f /home/cari/repos/tandem2/.gsd/worktrees/M003/.tmp/m003-s03-continuity.sqlite
   ```
2. Run:
   ```bash
   corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M003 \
     --filter review-broker-server exec tsx src/cli/start-broker.ts \
     --db-path /home/cari/repos/tandem2/.gsd/worktrees/M003/.tmp/m003-s03-continuity.sqlite \
     --once
   ```
3. Inspect the emitted JSON lines.

### Expected outcomes
- The command exits 0.
- `broker.started` reports the absolute `dbPath` and applied migrations including `004_review_continuity`.
- `broker.once_complete` reports structured counts and continuity fields.
- `latestReviewer` is either `null` or a redaction-safe projection; no raw reviewer argv appears.
- On a fresh DB, counts are zero and output remains valid structured JSON.

---

## Test Case 4 — Focused continuity inspection works directly on the same durable SQLite path

**Goal:** prove the shipped `inspect-continuity.ts` operator surface can inspect continuity state on the same DB without SQLite reads.

### Steps
1. Run:
   ```bash
   corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M003 \
     --filter review-broker-server exec tsx src/cli/inspect-continuity.ts \
     --db-path /home/cari/repos/tandem2/.gsd/worktrees/M003/.tmp/m003-s03-continuity.sqlite \
     --limit 10
   ```
2. Inspect the emitted JSON line.

### Expected outcomes
- The command exits 0.
- Output contains `broker.continuity_inspected`.
- The payload includes `startupRecovery`, `reviewerStatusCounts`, `reviewers`, `actionRequiredReviewIds`, `recentRecoveryActivity`, and `recoveryReviews`.
- On a fresh DB, counts are zero but the continuity shape is still present and structured.
- The command does not require raw SQLite inspection to explain the current restart/continuity state.

---

## Test Case 5 — Focused status/timeline continuity regression stays coherent with the end-to-end proof

**Goal:** prove the narrow status surfaces still match the assembled lifecycle and did not drift while the broader proof was expanded.

### Steps
1. Run:
   ```bash
   corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M003 exec vitest run \
     packages/review-broker-server/test/recovery-status-surfaces.test.ts \
     packages/review-broker-server/test/continuity-cli.test.ts
   ```
2. Inspect the test output.

### Expected outcomes
- Both test files pass.
- `recovery-status-surfaces.test.ts` proves runtime continuity inspection and per-review status/timeline surfaces agree on the durable recovered state.
- `continuity-cli.test.ts` proves the operator CLI story on one absolute durable DB path.
- The CLI regression checks both the assembled reviewer-exit + startup-recovery story and redaction-safe output.

---

## Edge Cases

### Edge Case A — The first restart inspection is non-idempotent; later inspection is idempotent
**How to exercise:** use the continuity CLI regression or assembled end-to-end proof, then compare the first restart inspection against a later `start-broker.ts --once` run on the same DB.

**Expected outcomes:**
- the first restart inspection captures the one real `startupRecovery` pass
- the later once-mode run reports the same durable continuity state idempotently
- the broker does not invent a second recovery pass on the already-recovered DB

### Edge Case B — Operator output must remain argv-safe
**How to exercise:** covered by `packages/review-broker-server/test/continuity-cli.test.ts` and the direct once-mode CLI run.

**Expected outcomes:**
- `latestReviewer` stays basename-safe/lifecycle-safe
- raw reviewer argv and raw command strings are absent from the shipped once-mode CLI output

### Edge Case C — Absolute `--db-path` is required for package-scoped CLI verification
**How to exercise:** rerun either package-scoped CLI command with a relative `--db-path`.

**Expected outcomes:**
- the database resolves relative to `packages/review-broker-server/`, not the repo root
- rerunning with an absolute path restores predictable temp-file placement under repo `.tmp/`

### Edge Case D — Acceptance must stay on broker-owned surfaces
**How to exercise:** review the test and CLI flow above.

**Expected outcomes:**
- proof relies on `getReviewStatus`, `getReviewTimeline`, `inspectRuntimeContinuity`, `inspect-continuity.ts`, and `start-broker.ts --once`
- no raw SQLite query is needed to explain reclaimed work, detached work, action-required reviews, or startup recovery

---

## Slice Acceptance Rule

S03 is acceptable only when **all five test cases above pass** and the following are true:
- one durable SQLite proof covers both live reviewer exit and later broker restart
- no review is left in unexplained claimed/stale limbo after the combined lifecycle
- safe work is reclaimed automatically and ambiguous work is detached/action-required
- the shipped broker runtime and CLI continuity surfaces agree on the recovered state
- the repo-level `broker:continuity` command reruns the final assembled acceptance lane
- operator-facing output remains structured, redaction-safe, and usable without raw DB inspection

## Milestone Closure Note

Passing this UAT closes the M003 crash/restart continuity acceptance gap. Remaining operator/dashboard work belongs to M004 and should build on the continuity surfaces already proven here.