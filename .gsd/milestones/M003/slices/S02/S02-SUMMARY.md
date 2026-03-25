# S02 Summary — Restart sweep and continuity commands

## Outcome

S02 is **slice-complete**.

This closer pass re-ran every slice-level verification command from the plan, confirmed the continuity observability surfaces through real CLI plus typed/MCP paths, updated requirement evidence for the requirements this slice strengthened, and compressed the task work into one restart-continuity record for downstream slices.

## What this slice actually delivered

### 1. One runtime-wide continuity read model for restart questions
S02 finished the missing broker-owned read model that answers “what changed on restart?” without raw SQLite reads:
- cross-review `recentRecoveryActivity` from durable audit history
- current ownership/action-required state and latest recovery snapshots for affected reviews
- reviewer session/status counts in the same continuity view
- `startupRecovery` carried through startup and inspection surfaces

The important outcome is architectural, not just cosmetic: the server now assembles one durable continuity snapshot and reuses it everywhere instead of letting each surface invent its own partial explanation.

### 2. A dedicated continuity inspection operation across broker surfaces
S02 published that runtime snapshot as an additive contract rather than overloading generic list APIs:
- new `inspectRuntimeContinuity` operation in `review-broker-core`
- matching `inspect_runtime_continuity` MCP tool
- `BrokerService.inspectRuntimeContinuity()` implementation in the server runtime
- parity coverage proving typed client, MCP, and runtime service all return the same continuity aggregates and recovery history

This gives downstream integrations one explicit continuity call for restart/ownership diagnostics while keeping older list/status payloads stable.

### 3. Reviewer-state inspection that stays continuity-safe
The new continuity payload includes reviewer state, but S02 deliberately kept it redaction-safe:
- reviewer IDs and session IDs
- current review IDs
- reviewer status/offline timestamps
- `commandBasename` only, not argv or raw command text
- reviewer status counts for quick operator inspection

That matters because the milestone asked for operator visibility, not a new way to leak secret-bearing command lines.

### 4. A thin operator CLI over the same broker-owned snapshot
S02 added the promised continuity-focused CLI instead of creating an ad hoc DB inspector:
- new `packages/review-broker-server/src/cli/inspect-continuity.ts`
- repo/package scripts that expose it cleanly
- `start-broker.ts` help updated to point operators toward the focused continuity command
- both commands run normal broker startup first, so the startup sweep happens before inspection

The command boundary is now intentional:
- `start-broker.ts --once` = broader runtime inventory plus `startupRecovery`
- `inspect-continuity.ts` = focused continuity snapshot plus `startupRecovery`

### 5. Restart/smoke proof aligned to the shipped S01 continuity contract
S02 refreshed the restart lane to the real semantics already established in S01 instead of older expectations:
- additive migration `004_review_continuity`
- stale reviewers marked offline on startup
- safe `claimed` work reclaimed automatically
- ambiguous `submitted`/open work detached conservatively and left action-required
- startup recovery ordering proven before normal inspection/use
- redaction-safe continuity fields emitted through startup/runtime/CLI surfaces

### 6. Synced JS/dist artifacts for contract-driven runtime verification
Because this repo checks in generated JS mirrors and package `dist/`, S02 also regenerated the shipped artifacts after contract/CLI changes. That prevents later `tsx`, MCP, and Vitest runs from validating stale exports or stale command surfaces.

## What patterns this slice established

### One broker-owned continuity snapshot, many surfaces
The winning pattern from S02 is:
1. query durable continuity state once in the repository/runtime layer
2. publish it through additive contracts
3. let typed client, MCP, and CLI reuse that same snapshot

S03 should keep extending this pattern instead of creating special-case restart inspectors.

### Thin CLIs should reuse broker startup and broker services
`inspect-continuity.ts` does not bypass startup recovery and does not query SQLite directly. It starts the broker, lets the normal sweep run, then prints the shared service snapshot. That is now the intended operator pattern.

### Continuity payloads must stay redaction-safe
Reviewer inspection is now part of the continuity story, but the safe projection rule is explicit: session IDs, statuses, current review IDs, and command basenames are okay; argv and raw command text are not.

### Package-scoped verification must account for generated exports and path resolution
Two gotchas are now established and should be preserved:
- after changing `review-broker-core` exports, rebuild checked-in JS mirrors and `dist/` before trusting package-name imports
- when using `pnpm --filter review-broker-server exec ...`, use an **absolute** `--db-path` because relative paths resolve from the package directory

## Verification status

All slice-plan verification commands passed in the closer pass:

1. `corepack pnpm exec vitest run packages/review-broker-server/test/restart-persistence.test.ts packages/review-broker-server/test/start-broker.smoke.test.ts packages/review-broker-server/test/runtime-continuity-inspection.test.ts`
2. `corepack pnpm exec vitest run packages/review-broker-core/test/runtime-continuity-contracts.test.ts packages/review-broker-server/test/client-mcp-parity.test.ts packages/review-broker-server/test/mcp-server.test.ts`
3. `corepack pnpm exec vitest run packages/review-broker-server/test/continuity-cli.test.ts`
4. `corepack pnpm build`
5. `corepack pnpm --filter review-broker-server exec tsx src/cli/start-broker.ts --db-path /home/cari/repos/tandem2/.gsd/worktrees/M003/.tmp/m003-s02-inspect.sqlite --once`
6. `corepack pnpm --filter review-broker-server exec tsx src/cli/inspect-continuity.ts --db-path /home/cari/repos/tandem2/.gsd/worktrees/M003/.tmp/m003-s02-inspect.sqlite --limit 10`

Observed closer-pass result:
- all Vitest lanes passed
- workspace build passed
- `start-broker.ts --once` emitted migrations through `004_review_continuity`, `startupRecovery`, and the broader runtime continuity inventory
- `inspect-continuity.ts` emitted the focused continuity snapshot and reused the same `startupRecovery` summary on the same durable SQLite file

## Observability / diagnostics confirmed

The slice plan’s diagnostic surfaces are now real and working:
- `recentRecoveryActivity` is visible from runtime continuity inspection
- `startupRecovery`, `actionRequiredReviewIds`, `latestRecovery`, `recoveryReviews`, and reviewer status counts are exposed through broker-owned inspection surfaces
- typed client and MCP can request runtime continuity directly through the additive broker operation
- the operator CLI can inspect restart continuity without SQLite queries
- reviewer state remains argv-safe/path-safe via `commandBasename`

The fresh-DB closer pass for the real CLI commands showed:
- migrations `001_init`, `002_review_lifecycle_parity`, `003_reviewer_lifecycle`, `004_review_continuity`
- zero recovery/action-required counts on a clean inspection database
- structured JSON output suitable for later S03 crash/restart proof work

## Requirement impact

- **R003:** strengthened with startup-sweep ordering proof, restart-safe continuity inspection over one SQLite file, and durable cross-review recovery visibility
- **R005:** strengthened with broker-owned reviewer-state continuity inspection across typed client, MCP, and CLI surfaces
- **R010:** strengthened with runtime-wide recovery history, startup recovery summary, action-required visibility, and one focused operator continuity command
- **R012:** still supported by this slice, but the reclaim/recover-without-limbo behavior remains the validation proved in S01; S02 extended how that continuity is inspected after restart

## Decisions and gotchas future slices should preserve

1. **Do not create a second restart inspector.** Reuse the dedicated continuity operation and CLI over the shared runtime snapshot.
2. **Keep reviewer continuity output redaction-safe.** Expose `commandBasename`, not argv or full command strings.
3. **Keep `start-broker.ts --once` and `inspect-continuity.ts` distinct.** The former is broader runtime inventory; the latter is the focused continuity/operator surface.
4. **Seed stale restart fixtures directly through repositories or crash-simulated runtime close paths** when you need deterministic stale-session proof.
5. **Rebuild generated JS mirrors and `dist/` artifacts after export/contract changes** or package-name imports can validate stale code.
6. **Use absolute `--db-path` values** for package-scoped CLI proof commands.

## What S03 should know

S03 should treat S02 as the operational continuity substrate, not as unfinished scaffolding:
- startup stale-session cleanup is already proven before inspection begins
- typed client, MCP, `start-broker.ts --once`, and `inspect-continuity.ts` are now the supported continuity inspection surfaces
- restart continuity visibility should keep flowing through these broker-owned commands rather than raw DB reads
- the remaining milestone work is the integrated crash/restart proof on one durable SQLite database with live reviewer exit plus post-restart continuity inspection

In short: S01 established the recovery semantics, and S02 made restart continuity inspectable through supported broker-owned surfaces. S03 now needs to prove the full assembled lifecycle across live exit, broker restart, and post-restart inspection without introducing a new inspection path.
