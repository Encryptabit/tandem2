# S01 UAT — Reviewer-exit and stale-claim recovery

## UAT Type
- UAT mode: runtime-executable broker continuity verification

## Preconditions
1. Run all commands from `/home/cari/repos/tandem2/.gsd/worktrees/M003`.
2. Dependencies are installed (`corepack pnpm install` has already been run for the worktree).
3. The reviewer fixture exists at `packages/review-broker-server/test/fixtures/reviewer-worker.mjs`.
4. Use a disposable temp path for any manual `--db-path` checks. When using `pnpm --filter review-broker-server exec ... --once`, prefer an **absolute** path because relative paths resolve from `packages/review-broker-server/`.

---

## Test Case 1 — Continuity contract and durable recovery primitives are wired

**Goal:** prove the shared continuity contract, additive SQLite migration, and transactional reclaim/detach helpers are present and green before runtime recovery begins.

### Steps
1. Run:
   ```bash
   corepack pnpm exec vitest run \
     packages/review-broker-core/test/continuity-contracts.test.ts \
     packages/review-broker-server/test/sqlite-bootstrap.test.ts \
     packages/review-broker-server/test/recovery-transitions.test.ts
   ```
2. Inspect the Vitest output.

### Expected outcomes
- All three test files pass.
- The continuity contract accepts the shared status/timeline/startup-recovery payload shapes.
- SQLite bootstrap confirms migration `004_review_continuity` is applied.
- Recovery transition tests prove:
  - safe reclaim back to `pending`
  - conservative detach for ambiguous work
  - stale `claim_generation` attempts are rejected durably instead of mutating the wrong row

---

## Test Case 2 — Timed-out claims reclaim safely and are explained through status/timeline surfaces

**Goal:** confirm timed-out safe claims do not remain stuck and the broker explains the reclaim through supported inspection surfaces.

### Steps
1. Run:
   ```bash
   corepack pnpm exec vitest run \
     packages/review-broker-server/test/claim-timeout-recovery.test.ts \
     packages/review-broker-server/test/recovery-status-surfaces.test.ts
   ```
2. Review the assertions in the output or open the test file if deeper inspection is needed.

### Expected outcomes
- The timed-out-claim test passes.
- Recovery status surfaces show a reclaimed review with:
  - `status: pending`
  - `claimedBy: null`
  - incremented `claimGeneration`
  - `latestRecovery.eventType: review.reclaimed`
  - `latestRecovery.reason: claim_timeout`
  - `actionRequired: false`
- The review timeline contains a `review.reclaimed` entry for the same review.
- `inspectBrokerRuntime()` reports the recovered review in `recoveryReviews`.

---

## Test Case 3 — Real reviewer exit reclaims safe work and detaches ambiguous work

**Goal:** prove a real reviewer subprocess exit does not leave owned reviews in limbo and that ambiguous open work stays explicit/action-required.

### Steps
1. Run:
   ```bash
   corepack pnpm exec vitest run \
     packages/review-broker-server/test/reviewer-exit-recovery.test.ts \
     packages/review-broker-server/test/recovery-status-surfaces.test.ts
   ```
2. Confirm the test suite uses the real reviewer fixture and kill path.

### Expected outcomes
- The reviewer-exit tests pass.
- For safe claimed work, reviewer exit produces:
  - `review.reclaimed`
  - `status: pending`
  - cleared ownership
- For opened/submitted work, reviewer exit produces:
  - `review.detached`
  - `status: submitted`
  - preserved reviewer ownership/session evidence
  - `actionRequired: true`
  - `actionRequiredReason: detached_review`
- `getReviewStatus`, `getReviewTimeline`, and `inspectBrokerRuntime()` all agree on the reclaim vs detach outcome.

---

## Test Case 4 — Startup sweep clears stale ownership before normal work resumes

**Goal:** prove stale-session recovery runs on startup and uses the same conservative reclaim/detach semantics.

### Steps
1. Run:
   ```bash
   corepack pnpm exec vitest run packages/review-broker-server/test/startup-sweep.test.ts
   ```
2. Confirm the test simulates a crash-style close and then reopens the same SQLite database.

### Expected outcomes
- The startup-sweep test passes.
- Restarted broker startup performs stale reviewer/session recovery before normal work begins.
- No review is left stranded in `claimed` limbo after reopen.
- Recovery behavior matches the live runtime rules from the previous test cases:
  - safe work reclaimed
  - ambiguous work detached/action-required

---

## Test Case 5 — End-to-end durable continuity proof survives live reviewer exit and reopen

**Goal:** prove the assembled runtime works on one durable SQLite database and stays inspectable after reopen.

### Steps
1. Run:
   ```bash
   corepack pnpm exec vitest run packages/review-broker-server/test/end-to-end-continuity-proof.test.ts
   ```
2. Inspect the test name and final pass output.

### Expected outcomes
- The end-to-end proof passes.
- One durable SQLite database contains both outcomes after reviewer exit:
  - a safely reclaimed review (`pending`)
  - a conservatively detached review (`submitted`, action-required)
- After reopen, both `getReviewStatus` and `getReviewTimeline` still explain the same outcomes.
- `inspectBrokerRuntime()` reports:
  - `recoveryReviewCount: 2`
  - `actionRequiredReviewIds` containing only the detached review
- Neither review remains in unexplained claimed/stale limbo.

---

## Test Case 6 — Root continuity rerun entrypoint stays green

**Goal:** prove the supported repo-root continuity rerun command remains a valid acceptance surface.

### Steps
1. Run:
   ```bash
   corepack pnpm broker:continuity
   ```
2. Inspect the Vitest output.

### Expected outcomes
- The command exits 0.
- It reruns the supported-surface proof files:
  - `packages/review-broker-server/test/recovery-status-surfaces.test.ts`
  - `packages/review-broker-server/test/end-to-end-continuity-proof.test.ts`
- This remains the shortest root-level proof that continuity inspection surfaces are still coherent.

---

## Test Case 7 — CLI `--once` exposes continuity/startup state without raw SQLite inspection

**Goal:** confirm operators can inspect current runtime continuity state through the supported CLI once surface.

### Steps
1. Choose a disposable absolute DB path, for example:
   `/home/cari/repos/tandem2/.gsd/worktrees/M003/.tmp/m003-s01-uat.sqlite`
2. Run:
   ```bash
   corepack pnpm --filter review-broker-server exec tsx src/cli/start-broker.ts \
     --db-path /home/cari/repos/tandem2/.gsd/worktrees/M003/.tmp/m003-s01-uat.sqlite \
     --once
   ```
3. Inspect the two emitted JSON lines: `broker.started` and `broker.once_complete`.

### Expected outcomes
- The command exits 0.
- `broker.started` includes:
  - applied migrations including `004_review_continuity`
  - `startupRecovery` summary fields
  - resolved `dbPath`
- `broker.once_complete` includes:
  - `recoveryReviewCount`
  - `actionRequiredReviewIds`
  - `latestRecovery`
  - `recoveryReviews`
  - `startupRecovery`
- On a fresh DB, all recovery counts are zero.
- The CLI provides structured inspection without requiring direct SQLite queries.

---

## Edge Cases

### Edge Case A — Stale claim-generation fencing rejects unsafe recovery
**How to exercise:** covered by `packages/review-broker-server/test/recovery-transitions.test.ts`.

**Expected outcomes:**
- stale recovery attempts are rejected transactionally
- a durable `review.transition_rejected` trail exists instead of mutating the wrong claim owner

### Edge Case B — Ambiguous submitted work detaches instead of auto-reclaiming
**How to exercise:** covered by `packages/review-broker-server/test/reviewer-exit-recovery.test.ts`, `startup-sweep.test.ts`, and `end-to-end-continuity-proof.test.ts`.

**Expected outcomes:**
- review remains `submitted`
- `actionRequired: true`
- `actionRequiredReason: detached_review`
- latest recovery surface shows `eventType: review.detached`

### Edge Case C — Package-scoped CLI path resolution can mislead manual checks
**How to exercise:** run `--once` with a relative `--db-path` under `pnpm --filter review-broker-server exec ...`.

**Expected outcomes:**
- the path resolves from `packages/review-broker-server/`, not the repo root
- rerun with an absolute path when you need repo-root temp files or stable cleanup behavior

---

## Slice Acceptance Rule

S01 is acceptable only when **all seven test cases above pass** and the inspection surfaces remain coherent:
- status/timeline/runtime/CLI data must agree on reclaim vs detach outcomes
- no review may remain in unexplained claimed/stale limbo after timeout, reviewer exit, or startup sweep
- ambiguous work must stay explicit/action-required rather than being silently advanced
