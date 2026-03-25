# S01: Reviewer-exit and stale-claim recovery

**Goal:** Reconstitute the minimal standalone broker runtime in this worktree and harden it so timed-out claims, dead reviewers, and stale startup ownership recover conservatively without leaving reviews stranded in claimed/stale limbo.
**Demo:** A real reviewer subprocess can own work, exit, and leave the broker on one durable SQLite database with the review either reclaimed or detached safely, while broker status/timeline/once surfaces explain what happened and why.

## Requirement Focus

This slice primarily owns **R012**. It also directly strengthens **R003**, **R005**, and **R010**.

## Decomposition Rationale

The current M003 worktree still contains planning documents only, so this slice cannot be planned as a tiny patch over an existing runtime. The first task therefore rebuilds the smallest possible pnpm/TypeScript/Vitest substrate plus the shared continuity contract that later recovery code can depend on. That keeps the slice executable in this repo without reopening the broader M001 architecture.

After the shared contract exists, the next risk is durable state semantics. Recovery behavior is only trustworthy if `claim_generation`, `claimed_at`, reviewer/session ownership, and machine-readable recovery reasons are persisted transactionally before live subprocess handling begins, so the SQLite layer comes second.

The highest-risk behavior sits in the middle: real reviewer exit, timed-out claims, and startup stale-session sweep. That work is isolated into its own task so executors can focus on conservative reclaim-vs-detach rules, real child-process proof, and startup ordering without also carrying CLI/status concerns.

The final task closes the operator-trust loop with thin runtime-owned inspection surfaces and a real end-to-end proof. That keeps the slice broker-first and continuity-focused while leaving broader continuity commands and milestone-wide restart closure to S02 and S03.

## Must-Haves

- A minimal pnpm/TypeScript/Vitest workspace exists in this worktree, with shared continuity enums, schemas, and audit vocabulary in `packages/review-broker-core`, because the repo currently has no implementation and this slice is non-trivial.
- `packages/review-broker-server` persists reviews, reviewers, claim/session ownership, `claim_generation`, `claimed_at`, and durable recovery/audit evidence in SQLite so reclaim and detach behavior is restart-safe, directly strengthening R003 while delivering R012.
- Broker-owned reviewer supervision detects timed-out claims, dead reviewers, and stale startup ownership; it auto-reclaims only clearly safe `claimed` work and detaches ambiguous open attachments with explicit action-required evidence instead of silently forcing them forward, directly delivering R012 and strengthening R005.
- Broker status/timeline/once inspection surfaces show recovery outcome, reason, timestamps, and action-required state without raw SQLite inspection, directly strengthening R010.

## Proof Level

- This slice proves: integration
- Real runtime required: yes
- Human/UAT required: no

## Verification

- `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M003 exec vitest run packages/review-broker-core/test/continuity-contracts.test.ts packages/review-broker-server/test/sqlite-bootstrap.test.ts packages/review-broker-server/test/recovery-transitions.test.ts`
- `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M003 exec vitest run packages/review-broker-server/test/claim-timeout-recovery.test.ts packages/review-broker-server/test/reviewer-exit-recovery.test.ts packages/review-broker-server/test/startup-sweep.test.ts packages/review-broker-server/test/recovery-status-surfaces.test.ts`
- `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M003 exec vitest run packages/review-broker-server/test/end-to-end-continuity-proof.test.ts`
- `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M003 broker:continuity`
- `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M003 --filter review-broker-server exec tsx src/cli/start-broker.ts --db-path ./.tmp/m003-s01-inspect.sqlite --once`

## Observability / Diagnostics

- Runtime signals: durable `review.reclaimed`, `review.detached`, `review.transition_rejected`, and `reviewer.offline` audit rows plus structured `startupRecovery` summary data.
- Inspection surfaces: `getReviewStatus`, `getReviewTimeline`, `inspectBrokerRuntime()`, `packages/review-broker-server/src/cli/start-broker.ts --once`, and SQLite `audit_events` / `reviews` / `reviewers` rows.
- Failure visibility: recovery reason, action-required flag, `claim_generation`, reviewer/session IDs, timestamps, and startup sweep counts remain inspectable after timeout, exit, or restart.
- Redaction constraints: diagnostics must not emit raw patch bodies, secrets, or full child-process argv; prefer review IDs, reviewer IDs, statuses, basenames, timestamps, and error codes.

## Integration Closure

- Upstream surfaces consumed: `docs/standalone-broker-starting-point.md`, `.gsd/PROJECT.md`, `.gsd/milestones/M003/M003-CONTEXT.md`, and the package boundary already implied by prior milestones (`packages/review-broker-core` feeding `packages/review-broker-server`).
- New wiring introduced in this slice: root workspace/test scripts, SQLite startup/recovery composition in `packages/review-broker-server/src/index.ts`, broker-owned reviewer supervision, and runtime-owned continuity inspection via status/timeline/CLI once output.
- What remains before the milestone is truly usable end-to-end: S02 still needs broader startup-summary and continuity command coverage, and S03 still needs the final crash/restart proof across the assembled runtime.

## Tasks

- [x] **T01: Reconstitute the workspace and shared continuity contract** `est:1h`
  - Why: This worktree has no broker implementation yet, so S01 must first create the minimal workspace, test harness, and shared continuity vocabulary that every later recovery task depends on.
  - Files: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `packages/review-broker-core/package.json`, `packages/review-broker-core/src/domain.ts`, `packages/review-broker-core/src/contracts.ts`, `packages/review-broker-core/src/index.ts`, `packages/review-broker-core/test/continuity-contracts.test.ts`
  - Do: Set up pnpm + TypeScript + Vitest, create `review-broker-core` as the shared continuity package, and freeze statuses, recovery reasons, audit event names, and status/timeline payloads so later tasks import one canonical contract instead of inventing local strings.
  - Verify: `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M003 exec vitest run packages/review-broker-core/test/continuity-contracts.test.ts`
  - Done when: the repo has a runnable workspace and test framework, and the shared continuity contract covers reclaim, detach, action-required, reviewer-offline, and timeline vocabulary from one exported package.
- [x] **T02: Persist continuity state and transactional recovery primitives** `est:1h15m`
  - Why: Conservative recovery is only trustworthy if SQLite persists ownership and recovery evidence transactionally before live reviewer exit handling begins.
  - Files: `packages/review-broker-server/package.json`, `packages/review-broker-server/src/db/migrations/001_init.sql`, `packages/review-broker-server/src/db/open-database.ts`, `packages/review-broker-server/src/db/reviews-repository.ts`, `packages/review-broker-server/src/db/reviewers-repository.ts`, `packages/review-broker-server/src/db/audit-repository.ts`, `packages/review-broker-server/test/sqlite-bootstrap.test.ts`, `packages/review-broker-server/test/recovery-transitions.test.ts`
  - Do: Create the server package, add SQLite bootstrap/migration code with WAL-safe settings, persist review/reviewer/audit tables including `claim_generation`, `claimed_at`, session ownership, and action-required fields, and add repository operations that reclaim or detach work while writing machine-readable recovery evidence in the same transaction.
  - Verify: `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M003 exec vitest run packages/review-broker-server/test/sqlite-bootstrap.test.ts packages/review-broker-server/test/recovery-transitions.test.ts`
  - Done when: reopening the same DB preserves continuity rows, transactional recovery helpers bump/fence `claim_generation`, and tests prove safe reclaim vs detach semantics are persisted durably.
- [x] **T03: Wire live reviewer-exit, stale-claim, and startup-sweep recovery** `est:1h30m`
  - Why: The slice’s core risk is live recovery behavior, so timed-out claims, dead reviewer ownership, and stale startup sessions need real subprocess and startup-order proof before operator surfaces are added.
  - Files: `packages/review-broker-server/src/runtime/app-context.ts`, `packages/review-broker-server/src/runtime/reviewer-manager.ts`, `packages/review-broker-server/src/runtime/broker-service.ts`, `packages/review-broker-server/src/index.ts`, `packages/review-broker-server/test/fixtures/reviewer-worker.mjs`, `packages/review-broker-server/test/claim-timeout-recovery.test.ts`, `packages/review-broker-server/test/reviewer-exit-recovery.test.ts`, `packages/review-broker-server/test/startup-sweep.test.ts`
  - Do: Add broker-owned reviewer supervision and runtime composition, detect timed-out claims and dead reviewers, run stale-session/stale-reviewer sweep before normal work starts, and use the transactional helpers to reclaim only safe `claimed` reviews while detaching ambiguous open attachments with explicit action-required state.
  - Verify: `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M003 exec vitest run packages/review-broker-server/test/claim-timeout-recovery.test.ts packages/review-broker-server/test/reviewer-exit-recovery.test.ts packages/review-broker-server/test/startup-sweep.test.ts`
  - Done when: a real reviewer fixture exit, a timed-out claim, and a startup stale-session scenario all leave no review stranded in claimed/stale limbo and preserve conservative recovery outcomes in durable state.
- [x] **T04: Expose continuity inspection surfaces and end-to-end proof** `est:1h15m`
  - Why: S01 is only shippable if operators can inspect reclaim vs detach outcomes and the slice proves that behavior through supported broker surfaces rather than raw DB reads.
  - Files: `packages/review-broker-server/src/runtime/status-service.ts`, `packages/review-broker-server/src/runtime/broker-service.ts`, `packages/review-broker-server/src/cli/start-broker.ts`, `packages/review-broker-server/test/recovery-status-surfaces.test.ts`, `packages/review-broker-server/test/end-to-end-continuity-proof.test.ts`, `package.json`, `.gitignore`
  - Do: Add thin runtime-owned status/timeline inspection helpers, surface structured `startupRecovery` and latest recovery evidence through `start-broker.ts --once`, wire a root `broker:continuity` verification entry, and prove against one durable DB that status/timeline/CLI output explain whether work was reclaimed or detached and why.
  - Verify: `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M003 exec vitest run packages/review-broker-server/test/recovery-status-surfaces.test.ts packages/review-broker-server/test/end-to-end-continuity-proof.test.ts && corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M003 --filter review-broker-server exec tsx src/cli/start-broker.ts --db-path ./.tmp/m003-s01-inspect.sqlite --once`
  - Done when: supported broker inspection surfaces show reclaim-vs-detach reasons, action-required cases, and startup recovery summary clearly enough that the slice demo is true without raw SQLite inspection.

## Files Likely Touched

- `package.json`
- `pnpm-workspace.yaml`
- `tsconfig.base.json`
- `packages/review-broker-core/src/domain.ts`
- `packages/review-broker-core/src/contracts.ts`
- `packages/review-broker-core/src/index.ts`
- `packages/review-broker-core/test/continuity-contracts.test.ts`
- `packages/review-broker-server/src/db/migrations/001_init.sql`
- `packages/review-broker-server/src/db/open-database.ts`
- `packages/review-broker-server/src/db/reviews-repository.ts`
- `packages/review-broker-server/src/db/reviewers-repository.ts`
- `packages/review-broker-server/src/db/audit-repository.ts`
- `packages/review-broker-server/src/runtime/app-context.ts`
- `packages/review-broker-server/src/runtime/reviewer-manager.ts`
- `packages/review-broker-server/src/runtime/broker-service.ts`
- `packages/review-broker-server/src/runtime/status-service.ts`
- `packages/review-broker-server/src/index.ts`
- `packages/review-broker-server/src/cli/start-broker.ts`
- `packages/review-broker-server/test/sqlite-bootstrap.test.ts`
- `packages/review-broker-server/test/recovery-transitions.test.ts`
- `packages/review-broker-server/test/claim-timeout-recovery.test.ts`
- `packages/review-broker-server/test/reviewer-exit-recovery.test.ts`
- `packages/review-broker-server/test/startup-sweep.test.ts`
- `packages/review-broker-server/test/recovery-status-surfaces.test.ts`
- `packages/review-broker-server/test/end-to-end-continuity-proof.test.ts`
- `packages/review-broker-server/test/fixtures/reviewer-worker.mjs`
