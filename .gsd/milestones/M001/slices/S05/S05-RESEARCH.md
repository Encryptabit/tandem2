# S05 Research — End-to-end standalone parity proof

## Summary
S05 is **targeted/light research**, not a greenfield design problem. The standalone broker, typed client, MCP surface, restart recovery, and smoke diagnostics already exist and already have slice-level proof. The remaining gap is an **additive final acceptance proof** that crosses the seams those earlier tests kept separate:

- standalone runtime startup/shutdown
- durable SQLite state across restart
- typed client usage
- real stdio MCP usage
- reviewer lifecycle + recovery
- redaction-safe operational inspection (`start-broker.ts --once` / `inspectBrokerRuntime()`)

The safest S05 path is **test-first and mostly test-only**. Do **not** start by refactoring runtime code or deduplicating all test helpers.

## Requirement focus
Primary S05 ownership:
- **R001** — prove the broker works as a real standalone TypeScript runtime under assembled local conditions

S05 should re-prove these previously delivered capabilities together, not in isolation:
- **R003** — durable SQLite state survives restart
- **R004** — review lifecycle parity still holds in the assembled system
- **R005** — reviewer lifecycle stays broker-owned in the assembled system
- **R006** — typed client still works against the real assembled runtime shape
- **R007** — MCP remains a public working surface
- **R010** — audit/reviewer/failure inspection remains visible through supported diagnostics

Secondary evidence:
- **R012** advances if the final proof includes startup recovery / stale reviewer reclaim across restart

## Skill-informed implementation rules
Relevant rules from loaded skills that matter here:
- **`test` skill**: match the project’s existing Vitest style and helper patterns; verify new proof by actually running the targeted suites; do not invent a new testing stack.
- **`review` skill**: read full relevant files, not just diffs or summaries; this matters because S05 is about how existing proof files compose.
- **`debug-like-expert` skill**: verify, don’t assume. Restart-safe proof must come from real reopen/restart behavior, not from reasoning about persistence.

Most UI/web skills are not relevant to this slice.

## Implementation landscape

### Runtime / composition files
- `packages/review-broker-server/src/index.ts`
  - Main composition seam.
  - Exports `startBroker()`, `inspectBrokerRuntime()`, startup-recovery snapshot logic, and the runtime close/wait API.
  - This is the core assembled-runtime surface S05 should keep exercising.
- `packages/review-broker-server/src/runtime/app-context.ts`
  - Creates the durable app context: SQLite handle, repositories, notification bus, reviewer manager.
  - Important distinction: `shutdown()` is graceful; `close()` is lower-level and can leave restart-recovery evidence when used intentionally in tests.
- `packages/review-broker-server/src/runtime/path-resolution.ts`
  - Resolves workspace root, DB path, and config path.
  - Important for S05 because filtered pnpm commands change cwd behavior; absolute temp DB paths are safest.

### External surfaces
- `packages/review-broker-client/src/client.ts`
  - Registry-driven typed client over a generic transport.
- `packages/review-broker-client/src/in-process.ts`
  - **Only shipped transport today**: in-process wrapper over `BrokerService` / `startBroker()`.
  - Key S05 constraint: there is no HTTP/socket/out-of-process typed transport to a separately running broker.
- `packages/review-broker-core/src/operations.ts`
  - Canonical operation registry for both typed client and MCP.
- `packages/review-broker-server/src/mcp/server.ts`
  - Registers one MCP tool per core operation.
- `packages/review-broker-server/src/mcp/tool-dispatch.ts`
  - Parses MCP inputs via shared schemas, dispatches to `BrokerService`, returns `structuredContent`, logs redacted failures.
- `packages/review-broker-server/src/cli/start-mcp.ts`
  - Real stdio MCP entrypoint; startup and failure diagnostics go to **stderr** only.
- `packages/review-broker-server/src/cli/start-broker.ts`
  - Real standalone broker CLI; `--once` emits structured startup/runtime inspection JSON.

### Existing proof files S05 should build on
- `packages/review-broker-client/test/in-process-client.test.ts`
  - Typed-client proof for review/reviewer flows and in-process wait semantics.
- `packages/review-broker-server/test/mcp-server.test.ts`
  - Real stdio MCP transport proof using `StdioClientTransport`.
- `packages/review-broker-server/test/client-mcp-parity.test.ts`
  - Shared-runtime parity proof across typed client + MCP using `InMemoryTransport`.
  - Important: this proves one-service parity, but **not restart-safe assembled parity**.
- `packages/review-broker-server/test/restart-persistence.test.ts`
  - Restart-safe review lifecycle persistence and startup recovery proof.
- `packages/review-broker-server/test/start-broker.smoke.test.ts`
  - Real `start-broker.ts --once` smoke proof and startup-recovery diagnostic proof.
- `packages/review-broker-server/test/review-lifecycle-parity.test.ts`
  - Canonical lifecycle parity scenarios.
- `packages/review-broker-server/test/reviewer-lifecycle.test.ts`
- `packages/review-broker-server/test/reviewer-recovery.test.ts`
  - Canonical reviewer lifecycle and recovery proofs.

## What already exists vs. what is still missing

### Already mechanically proven
- typed client works
- MCP stdio surface works
- same-runtime client/MCP parity works
- restart persistence works
- startup recovery works
- smoke CLI diagnostics work

### Still missing for S05
There is **no single acceptance proof** that crosses these boundaries in one slice-level scenario:
1. use one surface,
2. persist to SQLite,
3. stop/restart,
4. use another surface,
5. verify lifecycle/reviewer/audit state stayed aligned,
6. verify standalone inspection surfaces still explain what happened.

That is the actual S05 gap.

## Key constraints and surprises

### 1. The typed client is in-process only
`packages/review-broker-client/src/in-process.ts` is the only runtime helper. There is no remote typed transport.

**Implication:** S05 should not plan a “typed client talks to the same external broker process that MCP talks to” proof unless it first adds a new transport layer, which is out of scope for this slice.

### 2. Wait/version semantics are runtime-local, not persisted
`packages/review-broker-core/src/notifications.ts` provides an in-memory `VersionedNotificationBus`, and `app-context.ts` creates one per runtime.

**Implication:** S05 can honestly prove:
- typed-client wait behavior inside one runtime
- MCP wait behavior inside one runtime
- same-runtime cross-surface waits via the existing `InMemoryTransport` test pattern

But S05 should **not** try to prove cross-process wait continuity across restarts; that state is not durable today.

### 3. Graceful runtime shutdown is not the same as restart-recovery seeding
`startBroker().close()` calls `context.shutdown()`, which gracefully stops tracked reviewers. Existing restart-recovery proofs instead seed stale reviewer rows via lower-level context handling (`createAppContext()` + `context.close()` path), then reopen.

**Implication:** if S05 needs a real startup-recovery scenario, reuse the existing restart/smoke seeding pattern rather than the high-level client helper alone.

### 4. Relative DB paths can land under package directories
Root `broker:smoke` currently resolves `./.tmp/s01-smoke.sqlite` under `packages/review-broker-server/.tmp/` because `pnpm --filter review-broker-server exec ...` runs with package cwd.

**Implication:** for deterministic S05 proof, prefer **absolute temp DB paths** created in the test harness.

### 5. One harness command shape failed in this worktree
Observed during research:
- `./node_modules/.bin/vitest run ...` worked
- `corepack pnpm broker:smoke` worked
- `corepack pnpm exec vitest run ...` failed here with `ERR_PNPM_RECURSIVE_EXEC_NO_PACKAGE`

**Implication:** put final verification commands in forms already known to work in this harness.

## Recommendation

### Recommended scope
Implement S05 as **one new additive end-to-end proof file** under `packages/review-broker-server/test/` plus an optional root script update.

Strong candidate filename:
- `packages/review-broker-server/test/end-to-end-standalone-parity.test.ts`

Why additive is best:
- existing slice proofs already cover subsystem behavior
- S05 needs composition proof, not refactoring
- keeping S05 isolated makes milestone acceptance obvious
- avoids reopening working S01-S04 tests unless a real gap appears

### Recommended scenario structure
Use **sequential phases over one absolute temp SQLite DB**.

#### Scenario A — review lifecycle parity across restart and surfaces
Suggested flow:
1. Start a typed in-process runtime (`startInProcessBrokerClient` or `startBroker` + `createInProcessBrokerClient`) on a temp DB.
2. Drive a parity-oriented lifecycle path via typed client:
   - create
   - claim
   - discussion/submitted
   - changes requested or approved path
3. Stop runtime.
4. Reopen the same DB through the **real stdio MCP surface** (`StdioClientTransport` to `src/cli/start-mcp.ts`).
5. Read back persisted status/proposal/discussion/activity through MCP.
6. Continue/finish the lifecycle through MCP (for example requeue/counter-patch decision or approved close).
7. Stop MCP.
8. Reopen the same DB via typed client again and verify final state + activity feed + proposal snapshot.
9. Optionally run `start-broker.ts --once` against the same DB to assert the operational inspection envelope matches the final persisted state.

This closes the main S05 gap without inventing a new transport.

#### Scenario B — reviewer lifecycle / startup recovery across restart and surfaces
Suggested flow:
1. Seed reviewer-owned work on a temp DB using the existing recovery-safe pattern.
2. Leave stale reviewer state intentionally using the lower-level context path already proven in restart/smoke tests.
3. Reopen via `start-broker.ts --once` and/or real MCP stdio to prove:
   - reviewer row marked offline with `startup_recovery`
   - claimed/submitted review reclaimed to `pending`
   - activity/audit vocabulary remains inspectable
4. Reopen via typed client and verify the same recovered state is visible there too.

This gives R005/R010/R012-style assembled proof.

## Natural seams for planning

### Seam 1 — final proof file only
Most likely sufficient:
- new test file in `packages/review-broker-server/test/`

### Seam 2 — optional script wiring
Only if helpful for milestone acceptance:
- `package.json`
  - add a dedicated script such as `broker:parity` or update `broker:test` to include the S05 proof file

### Seam 3 — minimal production edits only if test exposes a real observability gap
Possible but should be treated as contingency, not the plan:
- `packages/review-broker-server/src/index.ts`
- `packages/review-broker-server/src/cli/start-broker.ts`
- `packages/review-broker-server/src/cli/start-mcp.ts`

The existing surfaces already look sufficient. Avoid production edits unless the final proof can’t express a required acceptance check otherwise.

## What to build first
1. **Write the new S05 acceptance test file first.**
2. Reuse existing harness patterns from:
   - `client-mcp-parity.test.ts`
   - `mcp-server.test.ts`
   - `restart-persistence.test.ts`
   - `start-broker.smoke.test.ts`
3. Only after the acceptance test exists, decide whether a root script is worth adding.
4. Only after the acceptance test fails for a real product reason, touch production runtime code.

## Verification plan

### Baseline commands already observed working during research
- Targeted regression pack:
  - `./node_modules/.bin/vitest run packages/review-broker-server/test/client-mcp-parity.test.ts packages/review-broker-server/test/restart-persistence.test.ts packages/review-broker-server/test/start-broker.smoke.test.ts packages/review-broker-client/test/in-process-client.test.ts packages/review-broker-server/test/mcp-server.test.ts`
  - Result during research: **5 files passed, 12 tests passed**
- Standalone smoke:
  - `corepack pnpm broker:smoke`
  - Result during research: **pass**, emitted `broker.started` and `broker.once_complete` with all 3 migrations

### Recommended S05 verification order
1. `./node_modules/.bin/vitest run packages/review-broker-server/test/end-to-end-standalone-parity.test.ts`
2. `./node_modules/.bin/vitest run packages/review-broker-server/test/client-mcp-parity.test.ts packages/review-broker-server/test/restart-persistence.test.ts packages/review-broker-server/test/start-broker.smoke.test.ts packages/review-broker-client/test/in-process-client.test.ts packages/review-broker-server/test/mcp-server.test.ts`
3. `corepack pnpm broker:smoke`

If a root acceptance script is added, it should wrap the above rather than replace them.

## Avoid these detours
- Do **not** add a new network transport for the typed client in S05.
- Do **not** try to prove persisted cross-process wait versions across restart; current notification design is runtime-local.
- Do **not** start by deduplicating all test helpers into shared utilities.
- Do **not** refactor working S01-S04 proof files unless the new S05 test exposes an actual defect.

## Skill discovery suggestions
No installed skill is directly better than the existing local `test` skill for this slice, but these external skills looked relevant enough to note for later user choice:
- Vitest:
  - `npx skills add onmax/nuxt-skills@vitest` (highest install count from search)
- SQLite:
  - `npx skills add martinholovsky/claude-skills-generator@sqlite-database-expert`

MCP search results were mostly app-construction skills, which are lower relevance for this slice because the MCP server already exists and S05 is about proof, not building a new MCP app.

## Bottom line
S05 should be closed by an **additive acceptance test** that stitches together the already-shipped pieces over one durable SQLite file across sequential restarts. The planner should treat this as a proof-composition task, not a runtime redesign task.
