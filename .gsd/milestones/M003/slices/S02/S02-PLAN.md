# S02: Restart sweep and continuity commands

**Goal:** Make broker restart continuity inspectable and trustworthy by exposing startup sweep results, current ownership/action-required state, reviewer state, and recent recovery activity through broker-owned continuity commands that reuse S01’s recovery contract.
**Demo:** Restarting the broker against a stale SQLite database clears stale reviewer/session ownership before new work begins, and operators can inspect the startup recovery summary plus current ownership, recent recovery actions, and action-required cases through typed/MCP/CLI continuity surfaces instead of raw SQLite reads.

## Requirement Focus

This slice directly advances the Active requirements it supports in the roadmap: **R003**, **R005**, and **R010**. It also supports already-validated **R012** by making the S01 reclaim/detach contract restart-visible and operator-inspectable instead of redefining recovery policy.

## Decomposition Rationale

S01 already shipped the risky recovery semantics and the startup sweep ordering. The planning risk for S02 is different: the current runtime can clean up stale ownership, but operators still lack one supported continuity surface that answers the whole restart question without stitching together generic list APIs or reading SQLite directly.

The first task therefore fixes the noisy restart/smoke baseline while adding the missing runtime-wide read model for recent recovery activity. That restores signal in the slice lane and gives later tasks one trustworthy snapshot to publish.

Once that read model exists, the next highest-value increment is publishing it through the supported broker contract. A dedicated additive continuity operation is safer than overloading `listReviews` or `listReviewers`, because clients can request restart/ownership diagnostics explicitly and keep the generic list payloads stable.

The final task keeps CLI work thin and broker-first. Rather than inventing an ad hoc DB inspector, it adds a narrow continuity command that starts the broker, runs the existing startup sweep, prints the same typed continuity snapshot, and regenerates the shipped JS/dist artifacts so later slices are not validating stale mirrors.

## Must-Haves

- Runtime-wide continuity inspection must show current ownership, reviewer session, action-required state, and recent recovery activity from durable broker state without introducing a second recovery policy, directly advancing R003 and R010.
- Restart and smoke verification must lock to the shipped S01 contract: additive migration `004_review_continuity`, stale reviewers marked offline on startup, safe `claimed` work reclaimed, and ambiguous submitted/open work detached with explicit action-required evidence.
- Supported broker surfaces must expose the continuity snapshot through a dedicated typed/MCP operation and a thin CLI command, so reviewer supervision and operator inspection remain broker-owned, directly advancing R005 and R010.
- Slice acceptance must prove that startup cleanup occurs before normal work resumes and that the continuity surfaces match persisted state on one SQLite database, directly advancing R003.

## Proof Level

- This slice proves: operational
- Real runtime required: yes
- Human/UAT required: no

## Verification

- `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M003 exec vitest run packages/review-broker-server/test/restart-persistence.test.ts packages/review-broker-server/test/start-broker.smoke.test.ts packages/review-broker-server/test/runtime-continuity-inspection.test.ts`
- `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M003 exec vitest run packages/review-broker-core/test/runtime-continuity-contracts.test.ts packages/review-broker-server/test/client-mcp-parity.test.ts packages/review-broker-server/test/mcp-server.test.ts`
- `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M003 exec vitest run packages/review-broker-server/test/continuity-cli.test.ts`
- `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M003 build`
- `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M003 --filter review-broker-server exec tsx src/cli/start-broker.ts --db-path /home/cari/repos/tandem2/.gsd/worktrees/M003/.tmp/m003-s02-inspect.sqlite --once`
- `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M003 --filter review-broker-server exec tsx src/cli/inspect-continuity.ts --db-path /home/cari/repos/tandem2/.gsd/worktrees/M003/.tmp/m003-s02-inspect.sqlite --limit 10`

## Observability / Diagnostics

- Runtime signals: durable `review.reclaimed`, `review.detached`, `review.transition_rejected`, and `reviewer.offline` audit rows plus startup recovery summary counts and runtime-wide recent continuity entries.
- Inspection surfaces: `packages/review-broker-server/src/runtime/status-service.ts`, the new dedicated continuity broker operation, typed client and MCP tool responses, `packages/review-broker-server/src/cli/start-broker.ts --once`, `packages/review-broker-server/src/cli/inspect-continuity.ts`, and durable SQLite `reviews` / `reviewers` / `audit_events` rows.
- Failure visibility: `actionRequiredReason`, `recoveryReason`, `outcome`, `reviewerSessionId`, `claimGeneration`, timestamps, and startup recovery counts remain inspectable after restart.
- Redaction constraints: continuity commands must stay patch-body-safe and argv-safe; expose review IDs, reviewer IDs, statuses, basenames, counts, reasons, and timestamps instead of raw diffs or secret-bearing command text.

## Integration Closure

- Upstream surfaces consumed: `packages/review-broker-server/src/runtime/broker-service.ts`, `packages/review-broker-server/src/runtime/status-service.ts`, `packages/review-broker-server/src/index.ts`, `packages/review-broker-server/src/db/audit-repository.ts`, and the shared contract in `packages/review-broker-core/src/contracts.ts` / `packages/review-broker-core/src/operations.ts`.
- New wiring introduced in this slice: a runtime-wide continuity history query, a dedicated continuity operation in the broker registry, broker-service exposure for typed client/MCP parity, and a thin CLI wrapper over the same broker-owned snapshot.
- What remains before the milestone is truly usable end-to-end: S03 still needs the final assembled crash/restart proof on one durable database with live reviewer exit plus post-restart continuity inspection.

## Tasks

- [x] **T01: Extend runtime continuity inspection and refresh restart proof** `est:1h15m`
  - Why: The current S02 lane is noisy for stale reasons, and the missing operator capability is a runtime-wide recent recovery view that can explain restart effects without raw DB reads.
  - Files: `packages/review-broker-server/src/db/audit-repository.ts`, `packages/review-broker-server/src/runtime/status-service.ts`, `packages/review-broker-server/src/index.ts`, `packages/review-broker-server/test/restart-persistence.test.ts`, `packages/review-broker-server/test/start-broker.smoke.test.ts`, `packages/review-broker-server/test/runtime-continuity-inspection.test.ts`
  - Do: Add a cross-review continuity history query and include it in the runtime continuity snapshot, then update the restart/smoke tests to the shipped S01 semantics so they assert `004_review_continuity`, detach-vs-reclaim startup behavior, startup ordering, and the redaction-safe recovery fields now emitted by the runtime.
  - Verify: `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M003 exec vitest run packages/review-broker-server/test/restart-persistence.test.ts packages/review-broker-server/test/start-broker.smoke.test.ts packages/review-broker-server/test/runtime-continuity-inspection.test.ts`
  - Done when: the runtime can answer “what changed on restart?” from one durable snapshot, and the restart/smoke lane passes against the real S01 continuity contract.
- [x] **T02: Publish a dedicated continuity inspection operation across broker surfaces** `est:1h30m`
  - Why: Operators and downstream integrations still cannot request runtime continuity through the supported broker registry, so S02 needs one additive contract instead of forcing clients to stitch generic lists together.
  - Files: `packages/review-broker-core/src/contracts.ts`, `packages/review-broker-core/src/operations.ts`, `packages/review-broker-core/src/index.ts`, `packages/review-broker-core/src/contracts.js`, `packages/review-broker-core/src/operations.js`, `packages/review-broker-core/src/index.js`, `packages/review-broker-core/test/runtime-continuity-contracts.test.ts`, `packages/review-broker-server/src/runtime/broker-service.ts`, `packages/review-broker-server/test/client-mcp-parity.test.ts`, `packages/review-broker-server/test/mcp-server.test.ts`
  - Do: Add additive request/response schemas and one broker operation for runtime continuity inspection, wire `BrokerService` to return the T01 snapshot, regenerate the checked-in core JS mirrors, and extend typed client/MCP tests so both surfaces return the same ownership, action-required, reviewer-state, and recent-recovery payloads.
  - Verify: `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M003 exec vitest run packages/review-broker-core/test/runtime-continuity-contracts.test.ts packages/review-broker-server/test/client-mcp-parity.test.ts packages/review-broker-server/test/mcp-server.test.ts`
  - Done when: a typed client or MCP caller can ask for runtime continuity directly and receive the same broker-owned snapshot the server runtime uses internally.
- [x] **T03: Add the operator continuity CLI and sync shipped artifacts** `est:1h15m`
  - Why: The slice demo is only true when operators can run one thin broker-owned continuity command after restart and the repo ships regenerated JS/dist artifacts instead of stale mirrors.
  - Files: `packages/review-broker-server/src/cli/inspect-continuity.ts`, `packages/review-broker-server/src/cli/start-broker.ts`, `packages/review-broker-server/package.json`, `package.json`, `packages/review-broker-server/test/continuity-cli.test.ts`, `packages/review-broker-core/dist/index.js`, `packages/review-broker-client/dist/index.js`, `packages/review-broker-server/dist/cli/inspect-continuity.js`
  - Do: Add a thin continuity CLI that starts the broker, emits `startupRecovery` plus the dedicated runtime continuity snapshot using an absolute `--db-path`, add repo/package scripts that expose it without bypassing broker startup, and regenerate the shipped `dist/` outputs after the contract changes so future Vitest/tsx runs do not validate stale artifacts.
  - Verify: `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M003 exec vitest run packages/review-broker-server/test/continuity-cli.test.ts && corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M003 build && corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M003 --filter review-broker-server exec tsx src/cli/inspect-continuity.ts --db-path /home/cari/repos/tandem2/.gsd/worktrees/M003/.tmp/m003-s02-inspect.sqlite --limit 10`
  - Done when: repo-root and package-level broker commands can print the continuity snapshot for a durable SQLite file, and the built artifacts match the TypeScript sources.

## Files Likely Touched

- `packages/review-broker-server/src/db/audit-repository.ts`
- `packages/review-broker-server/src/runtime/status-service.ts`
- `packages/review-broker-server/src/runtime/broker-service.ts`
- `packages/review-broker-server/src/index.ts`
- `packages/review-broker-server/src/cli/start-broker.ts`
- `packages/review-broker-server/src/cli/inspect-continuity.ts`
- `packages/review-broker-server/test/restart-persistence.test.ts`
- `packages/review-broker-server/test/start-broker.smoke.test.ts`
- `packages/review-broker-server/test/runtime-continuity-inspection.test.ts`
- `packages/review-broker-server/test/client-mcp-parity.test.ts`
- `packages/review-broker-server/test/mcp-server.test.ts`
- `packages/review-broker-server/test/continuity-cli.test.ts`
- `packages/review-broker-core/src/contracts.ts`
- `packages/review-broker-core/src/operations.ts`
- `packages/review-broker-core/src/index.ts`
- `packages/review-broker-core/src/contracts.js`
- `packages/review-broker-core/src/operations.js`
- `packages/review-broker-core/src/index.js`
- `packages/review-broker-core/test/runtime-continuity-contracts.test.ts`
- `package.json`
- `packages/review-broker-server/package.json`
- `packages/review-broker-core/dist/index.js`
- `packages/review-broker-client/dist/index.js`
- `packages/review-broker-server/dist/cli/inspect-continuity.js`
