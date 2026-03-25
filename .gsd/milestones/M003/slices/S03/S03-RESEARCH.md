# S03 — Research

**Date:** 2026-03-23
**Slice:** S03 — End-to-end crash/restart continuity proof
**Depth:** Targeted research

## Summary

S03 is **not a greenfield runtime slice**. The continuity substrate is already present in code and already proven in separate lanes:
- live reviewer-exit reclaim/detach proof exists in `packages/review-broker-server/test/end-to-end-continuity-proof.test.ts`
- startup sweep / stale-session recovery proof exists in `packages/review-broker-server/test/startup-sweep.test.ts` and `packages/review-broker-server/test/restart-persistence.test.ts`
- focused continuity CLI proof exists in `packages/review-broker-server/test/continuity-cli.test.ts`
- shared runtime continuity snapshot already exists in `packages/review-broker-server/src/runtime/status-service.ts` and is exposed by `BrokerService.inspectRuntimeContinuity()` plus `src/cli/inspect-continuity.ts`

The real S03 gap is **assembled acceptance on one durable SQLite database across both failure modes**:
1. a real reviewer subprocess exits while owning work (`reviewer_exit` path), and then
2. the broker later "crashes" with a live reviewer session still persisted, so restart performs `startup_recovery`, and then
3. supported continuity surfaces show the combined post-restart state without raw DB inspection.

The current `end-to-end-continuity-proof.test.ts` only covers step 1 + graceful reopen + `start-broker --once`. It does **not** simulate a broker crash that leaves stale reviewer/session ownership for startup sweep. That is the missing acceptance seam for S03.

## Requirement focus

This slice should research and prove these active requirements:
- **R012 primary:** no review remains stranded in claimed/stale limbo after reviewer exit or broker restart.
- **R010 support:** operators can inspect recovery state via shipped broker surfaces.
- **R003 support / re-proof:** one durable SQLite file stays coherent across crash/restart.
- **R005 incidental support:** reviewer lifecycle remains broker-owned; do not externalize supervision.

## Recommendation

Treat S03 as a **test-first integration closer**.

### Build/prove first

1. **Encode the missing assembled proof first** in Vitest.
   - Either extend `packages/review-broker-server/test/end-to-end-continuity-proof.test.ts` with a second integrated `it(...)`, or replace the current single test with a broader one that covers both reviewer-exit recovery and crash/restart startup sweep on the same DB.
   - Reuse existing helpers/patterns from:
     - `startup-sweep.test.ts` for crash simulation via `AppContext.close()`
     - `continuity-cli.test.ts` for `inspect-continuity.ts` JSON assertions
     - `restart-persistence.test.ts` for seeded stale-session expectations

2. **Only patch runtime code if the new proof exposes a real gap.**
   - The shared recovery policy already exists in `runStartupRecoverySweep()`, `recoverReviewerAssignments()`, and the repository reclaim/detach transitions.
   - The likely work is acceptance coverage and supported-surface assertions, not new recovery semantics.

3. **Keep operator verification on supported broker surfaces.**
   - Use `getReviewStatus()` / `getReviewTimeline()` / `inspectRuntimeContinuity()` in-process.
   - Use `inspect-continuity.ts` and `start-broker.ts --once` for CLI proof.
   - Do **not** add raw SQLite reads to the acceptance path except for deterministic seed setup if absolutely necessary.

This follows the installed `test` skill’s critical rules: detect the existing framework first, match existing test patterns, read existing tests before writing, and verify with the project’s current dependencies/framework rather than inventing a new harness.

## Skill discovery

### Installed skills already directly relevant
- **`test`** — the repo already follows its guidance well: Vitest, existing integration-style tests, and real subprocess/SQLite proof where the project intentionally uses integration coverage.

### Optional external skills discovered
These are optional only; no install is required for this slice.
- **Vitest:** `npx skills add onmax/nuxt-skills@vitest`
  - Highest install count from `npx skills find "vitest"`.
- **SQLite:** `npx skills add martinholovsky/claude-skills-generator@sqlite-database-expert`
  - Highest install count from `npx skills find "sqlite"`.

## Implementation landscape

### Runtime files already doing the real work

- `packages/review-broker-server/src/runtime/app-context.ts`
  - `close()` is the crash-simulation primitive.
  - Important distinction:
    - `context.close()` closes DB + reviewer manager without graceful reviewer-offline bookkeeping.
    - `shutdown()` is the graceful path used by `startBroker().close()`.

- `packages/review-broker-server/src/runtime/reviewer-manager.ts`
  - `close()` removes listeners and kills tracked children, leaving persisted reviewer rows stale for restart recovery.
  - This is why `AppContext.close()` is the right crash simulator for startup-sweep proof.

- `packages/review-broker-server/src/runtime/broker-service.ts`
  - `recoverReviewerAssignments(...)` handles live `reviewer_exit` / `operator_kill` recovery.
  - `recoverTimedOutClaims(...)` handles timeout reclaim.
  - `runStartupRecoverySweep(...)` performs stale reviewer/session recovery before normal work resumes.
  - `inspectRuntimeContinuity(...)` service method already returns the shared continuity snapshot plus redaction-safe reviewer state.

- `packages/review-broker-server/src/runtime/status-service.ts`
  - Defines the shared runtime continuity read model:
    - `recentRecoveryActivity`
    - `latestRecovery`
    - `recoveryReviews`
    - `actionRequiredReviewIds`
  - This is the canonical read model S03 should assert through, not a new ad hoc inspector.

- `packages/review-broker-server/src/cli/inspect-continuity.ts`
  - Thin CLI over `service.inspectRuntimeContinuity()` plus `startupRecovery`.
  - Best CLI surface for continuity-focused operator proof.

- `packages/review-broker-server/src/cli/start-broker.ts`
  - `--once` emits the broader runtime snapshot plus `startupRecovery`.
  - Keep distinct from `inspect-continuity.ts`; S03 should prove both surfaces remain coherent.

### Tests/patterns to copy, not reinvent

- `packages/review-broker-server/test/end-to-end-continuity-proof.test.ts`
  - Current live reviewer-exit proof:
    - spawns a real reviewer subprocess
    - kills it with `SIGKILL`
    - verifies reclaim vs detach
    - reopens on same DB
    - runs `start-broker.ts --once`
  - Gap: restart happens **after** recovery already completed, so `startupRecovery` is empty.

- `packages/review-broker-server/test/startup-sweep.test.ts`
  - Canonical pattern for crash simulation:
    - use `createAppContext(...)` + `createBrokerService(...)`
    - spawn a real reviewer
    - call `crashContext.close()`
    - restart through `startBroker(...)`
  - This is the exact pattern S03 should reuse for the broker-crash half.

- `packages/review-broker-server/test/restart-persistence.test.ts`
  - Shows deterministic stale-session seeding and startup summary assertions.
  - Useful when the integrated proof needs an unaffected review to prove sweep conservatism.

- `packages/review-broker-server/test/continuity-cli.test.ts`
  - Best source for `inspect-continuity.ts` command invocation and JSON assertion shape.

- `packages/review-broker-server/test/recovery-status-surfaces.test.ts`
  - Best source for supported-surface assertions (`getReviewStatus`, `getReviewTimeline`, `inspectBrokerRuntime`).

- `packages/review-broker-server/test/test-paths.ts`
  - Centralizes `WORKTREE_ROOT` and reviewer fixture paths; reuse instead of re-deriving paths.

- `packages/review-broker-server/test/fixtures/reviewer-worker.mjs`
  - Keepalive fixture reviewer process used by all real subprocess tests.

### Shared contracts already present

- `packages/review-broker-core/src/contracts.ts`
  - `RuntimeContinuitySnapshotSchema`
  - `RuntimeContinuityReviewerSchema`
  - `InspectRuntimeContinuityRequestSchema` / `InspectRuntimeContinuityResponseSchema`
  - Startup recovery and continuity vocabularies are already frozen.

- `packages/review-broker-core/src/operations.ts`
  - `inspectRuntimeContinuity` is already in the shared broker operation registry.

### Existing package entrypoints

- root `package.json`
  - `broker:continuity` currently runs:
    - `packages/review-broker-server/test/recovery-status-surfaces.test.ts`
    - `packages/review-broker-server/test/end-to-end-continuity-proof.test.ts`
  - This is already close to an S03 acceptance entrypoint; it may only need the end-to-end test broadened.

- `packages/review-broker-server/package.json`
  - exposes `inspect:continuity`, `start`, `start:once`, `start:mcp`

## Natural seams for task decomposition

### Seam 1 — Integrated proof test
Primary task.
- File: `packages/review-broker-server/test/end-to-end-continuity-proof.test.ts`
- Goal: one durable DB, two continuity causes (`reviewer_exit` and `startup_recovery`), supported-surface verification after restart.
- Likely helper additions:
  - `runInspectContinuity(...)`
  - JSON parsing helpers shared with the current `--once` assertions
  - `createMutableClock(...)` or deterministic timestamp helpers for stable recovery ordering

### Seam 2 — Minimal runtime/CLI fixes if the new proof fails
Only if needed.
- Most likely touch points:
  - `packages/review-broker-server/src/runtime/broker-service.ts`
  - `packages/review-broker-server/src/runtime/status-service.ts`
  - `packages/review-broker-server/src/cli/inspect-continuity.ts`
  - `packages/review-broker-server/src/index.ts`
- Expected scope: ordering/aggregation/snapshot consistency, not new recovery semantics.

### Seam 3 — Verification command alignment
Optional / only if acceptance packaging is part of the slice.
- Possible touch points:
  - root `package.json`
  - `packages/review-broker-server/package.json`
- Only adjust scripts if the planner wants a single S03 proof command.

### Seam 4 — Stale parity suite triage
Potentially separate, because it is not required to author the new S03 proof but it is a current landmine.
- File: `packages/review-broker-server/test/end-to-end-standalone-parity.test.ts`
- Current state: stale against M003 continuity changes.
- It still expects:
  - only 3 migrations (`001`–`003`)
  - pre-continuity recovery semantics in its startup-recovery section
- This file currently fails under targeted execution.

## Risks / gotchas the planner should preserve

1. **Use `AppContext.close()` to simulate broker crash.**
   - `startBroker().close()` is graceful shutdown and records reviewer-offline behavior (`operator_kill`), which is the wrong path for startup sweep proof.
   - Copy the `startup-sweep.test.ts` pattern.

2. **Keep recovery-policy assertions aligned with S01/S02 semantics.**
   - `claimed` work → reclaim to `pending`
   - open/`submitted` work → detach + `actionRequired`
   - do not revive older expectations that submitted work is reclaimed automatically.

3. **Use absolute `--db-path` values for package-scoped CLI proof.**
   - Existing tests and milestone gotchas already call this out.

4. **Prefer supported broker surfaces over raw DB reads for acceptance.**
   - Status/timeline/runtime continuity/CLI once/inspect-continuity are the intended inspection path.
   - Raw DB is acceptable only for deterministic seed setup or low-level debugging.

5. **If TS contracts or exported CLI surfaces change, rebuild generated artifacts.**
   - `review-broker-core/src/*.js` mirrors and package `dist/` can go stale.
   - Test-only changes do not require this, but contract/CLI/export changes do.

6. **Do not use `end-to-end-standalone-parity.test.ts` as an implementation oracle without first updating it.**
   - It predates `004_review_continuity` and contains outdated startup-recovery expectations.

## Observed verification state

I ran the currently relevant focused lanes:
- `corepack pnpm exec vitest run packages/review-broker-server/test/end-to-end-continuity-proof.test.ts` ✅
- `corepack pnpm exec vitest run packages/review-broker-server/test/restart-persistence.test.ts packages/review-broker-server/test/continuity-cli.test.ts` ✅

I also ran the older parity suite:
- `corepack pnpm exec vitest run packages/review-broker-server/test/end-to-end-standalone-parity.test.ts` ❌

Current failure mode there is exactly what S03 planning should expect from stale pre-continuity assertions:
- migration count expects `003_reviewer_lifecycle` only, but repo now has `004_review_continuity`
- startup-recovery expectations are from the older recovery contract

## Verification plan for S03 work

### Minimum targeted proof lane
Run after the integrated proof is added/updated:

```bash
corepack pnpm exec vitest run \
  packages/review-broker-server/test/end-to-end-continuity-proof.test.ts \
  packages/review-broker-server/test/startup-sweep.test.ts \
  packages/review-broker-server/test/restart-persistence.test.ts \
  packages/review-broker-server/test/continuity-cli.test.ts
```

### Existing repo-level shortcut
```bash
corepack pnpm broker:continuity
```

### If contracts/exports/CLI payloads change
```bash
corepack pnpm build
```

### If the slice also chooses to repair the stale parity suite
```bash
corepack pnpm exec vitest run packages/review-broker-server/test/end-to-end-standalone-parity.test.ts
```

## Planner handoff

Assume the runtime implementation is largely there. The highest-value first task is to **write the missing assembled crash/restart continuity acceptance test** against the existing broker surfaces. That test should be strong enough to tell the executor whether any runtime code is actually missing.

If the new proof passes with only test changes, S03 is mostly an acceptance/documentation closer. If it fails, the failure should point directly to a narrow fix in continuity aggregation, startup ordering, or CLI parity — not to a redesign.
