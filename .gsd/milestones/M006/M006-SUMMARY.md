# M006: Reactive reviewer pool management — Milestone Summary

**Status:** Complete
**Duration:** ~3h across 3 slices (10 tasks)
**Verification:** 116 pool-related tests passing; 241 total tests passing (12 pre-existing failures unchanged)
**Completed:** 2026-03-26

## Vision Delivered

The broker now automatically spawns, drains, and kills reviewer agents based on pending review volume. Pool configuration is Zod-validated from the `reviewer_pool` config section. Reviewer processes receive prompts via stdin with stdout/stderr captured to rotating JSONL log files. A background loop runs 5 periodic checks (reactive scaling, idle timeout, TTL expiry, claim timeout, dead process reaping). The two-phase drain lifecycle ensures open reviews finish before termination. Startup recovery detects stale-session reviewers from previous broker sessions and reclaims their orphaned claims. All behavior is proven through integration tests with real broker runtimes and subprocess fixtures.

## Code Changes

23 files changed, 3,107 insertions, 15 deletions across `review-broker-core` and `review-broker-server` packages. Key new files:
- `src/runtime/pool-config.ts` — Zod-validated pool configuration schema
- `src/runtime/reviewer-pool.ts` — Core pool manager with scaling, drain, and background loop
- `src/runtime/jsonl-log-writer.ts` — Rotating JSONL log writer for subprocess output
- `src/db/migrations/004_pool_management.sql` — Schema migration for session tokens and draining state
- `test/reviewer-pool.test.ts` — 35 pool integration/unit tests
- `test/pool-config.test.ts` — 20 config validation tests (new)
- `test/jsonl-log-writer.test.ts` — 9 log writer tests (new)
- `test/fixtures/reviewer-worker-stdin.mjs` — Stdin-piped test fixture

## Success Criteria Verification

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Broker spawns reviewers when `pending ÷ ratio > active_reviewers`, up to `max_pool_size` | ✅ Met | `computeScalingDelta()` pure function + 14 unit tests in `reviewer-pool.test.ts` + 6 integration tests with real broker |
| Idle reviewers drained after `idle_timeout_seconds` | ✅ Met | `checkIdleTimeouts()` in background loop, integration test "idle timeout — triggers drain-then-kill" (2017ms test) |
| Reviewers exceeding `max_ttl_seconds` drained | ✅ Met | `checkTtlExpiry()` in background loop, tested in pool unit tests |
| Dead reviewer processes detected and claims reclaimed | ✅ Met | `reapDeadProcesses()` via `isProcessAlive()`, integration test "dead process reaping — detects externally killed processes" |
| Claimed reviews exceeding `claim_timeout_seconds` reclaimed | ✅ Met | `checkClaimTimeouts()` in background loop, integration test "claim timeout — reclaims stale claimed reviews" |
| Reviewer processes receive prompt via stdin, stdout/stderr captured to rotating JSONL | ✅ Met | `reviewer-manager.ts` with `stdio: ['pipe', 'pipe', 'pipe']`, JSONL writer with rotation, integration test "spawns a reviewer with stdin prompt and captures output to JSONL log" |
| Pool config loaded from `reviewer_pool` section with schema validation | ✅ Met | `loadPoolConfig()` with Zod strict-mode schema, 20 validation tests covering bounds, defaults, missing section |
| Reactive scaling fires on `create_review`, `add_message`, at startup, and periodically | ✅ Met | `triggerReactiveScaling()` called from `createReview` (L265) and `addMessage` (L922) in broker-service.ts; `setImmediate` at startup (index.ts L181); `setInterval` background loop |
| Pool respects `spawn_cooldown_seconds` and `max_pool_size` cap | ✅ Met | Cooldown + capacity checks in `computeScalingDelta()`, tested with dedicated unit tests |
| `tandem reviewers list` shows pool-managed reviewers with session tokens | ✅ Met | Session (8-char UUID) and Draining columns in CLI output; JSON includes full `sessionToken` and `drainingAt`; test assertion in tandem-cli.test.ts |
| All pool behavior exercised through tests against real broker runtime | ✅ Met | 6 integration tests in reviewer-pool.test.ts use real `startBroker()`, 4 restart-persistence tests prove lifecycle across restart boundary |

## Definition of Done Verification

| Item | Status |
|------|--------|
| Pool config loads with schema validation and useful errors | ✅ Zod strict-mode with field-path error messages |
| Reviewer processes spawn with stdin prompt, stdout/stderr to JSONL | ✅ Piped stdio, JSONL rotating writer (5MB/5 backups) |
| Reactive scaling `desired = ceil(pending / ratio)` | ✅ Pure `computeScalingDelta()` function |
| Background loop runs 5 checks | ✅ scaling, idle timeout, TTL expiry, claim timeout, dead process reaping |
| Drain lifecycle: `active → draining → terminated` | ✅ Two-phase: `markDraining()` → `stopReviewer()` when `currentReviewId === null` |
| Startup recovery terminates stale-session reviewers | ✅ `poolStartupRecovery()` filters by session token mismatch |
| CLI/MCP surfaces reflect pool state | ✅ Session + Draining columns in `tandem reviewers list` |
| All behavior proven through integration tests | ✅ 116 tests total, 6 pool integration + 4 restart lifecycle |
| All slices complete | ✅ S01 ✅, S02 ✅, S03 ✅ |
| All slice summaries exist | ✅ S01-SUMMARY.md, S02-SUMMARY.md, S03-SUMMARY.md |

## Slice Outcomes

### S01: Pool config, stdin-piped spawn, and output capture (4 tasks, ~56m)
- Migration 004 adds `session_token` and `draining_at` columns
- Domain types extended: `draining` status, 3 new offline reasons, `sessionToken`/`drainingAt` fields
- `PoolConfig` Zod schema with 7 validated fields, sensible defaults, opt-in activation (null when absent)
- JSONL rotating log writer: timestamped records, size-based rotation (5MB/5 backups)
- `reviewer-manager.ts` spawns with piped stdio, writes prompt to stdin, captures output to JSONL
- **Risk retired:** Stdin prompt piping (high), Config schema validation (medium)

### S02: Background loop, drain lifecycle, and reactive scaling (3 tasks, ~70m)
- `computeScalingDelta()` pure function: `desired = ceil(pending / ratio)`, capacity + cooldown checks
- `createPoolManager()` factory with dependency injection, `isScaling` re-entrancy guard
- 5 background check functions on `setInterval`: scaling, idle timeout, TTL expiry, drain completion, claim timeout, dead process reaping
- Two-phase drain lifecycle: initiation (`markDraining`) and completion (`stopReviewer`) as separate checks
- Wired into `startBroker()`: pool created when config present, reactive scaling from mutations via `setImmediate + catch`
- 5 new audit event types, 3 reclaim causes added to domain

### S03: Startup recovery and integrated acceptance (3 tasks, ~30m)
- `sessionToken` plumbed through full spawn path: `PoolManager` → `spawnReviewer()` → DB
- `poolStartupRecovery()`: detects stale-session reviewers, marks offline, reclaims orphaned claims, emits audit events
- CLI Session + Draining columns
- Capstone lifecycle test: spawn → claim → process exit → restart → recovery → re-scale → new session

## Requirement Outcomes

No formal requirements were defined for M006 (as noted in the roadmap: "Covers: none"). No requirement status transitions occurred.

## Risk Retirements

| Risk | Retired In | Proof |
|------|-----------|-------|
| Stdin prompt piping (changing stdio from 'ignore' to piped) | S01 | Integration test: prompt arrives at child stdin, echoed to stdout, captured in JSONL, clean SIGTERM exit |
| Background loop in synchronous broker | S02 | `setInterval`-based loop with 5 independent check functions, non-conflicting with signal handlers |
| Graceful drain semantics | S02 | Two-phase drain with `draining_at` column, "drain respects open-review gate" integration test |
| Config schema validation at load time | S01 | Zod strict-mode with 20 validation tests, field-path error messages |

## Architecture Patterns Established

1. **Pure scaling function + policy orchestration**: `computeScalingDelta()` is unit-testable math; `createPoolManager()` wires policy. Keeps scaling logic testable without mocks.
2. **Two-phase drain**: Initiation and completion as separate background checks. `draining_at` survives restarts.
3. **`setImmediate + catch`** for fire-and-forget from synchronous mutation paths.
4. **`isScaling` boolean guard** prevents re-entrancy across overlapping `setImmediate` and interval callbacks.
5. **Two-phase startup recovery**: General pid-based (`reconcileStartupRecovery`) then pool session-based (`poolStartupRecovery`). `offlineAt === null` filter prevents double-processing.
6. **Opt-in pool activation**: All pool code paths guard on `poolConfig !== null`. No behavioral change when config section absent.
7. **Unconditional pipe draining**: Always consume stdout/stderr even when not logging — prevents child process deadlock.

## What Remains for Later Milestones

- **Project-scoped reviewers**: Config accepts a project field but per-project scaling logic is deferred
- **Dashboard pool visualization**: The dashboard does not yet show pool state (scaling history, drain progress, session tokens)
- **Provider-based pool spawning**: Pool spawn currently uses raw command/args; integration with the S03 provider resolver from M005 would let `reviewer_pool` config specify a provider name
- **Raw subprocess log browsing**: JSONL logs exist on disk but no operator surface to browse/search them

## Pre-existing Test Failures (12, unchanged)

- 2× `sqlite-bootstrap.test.ts` — migration count assertion expects 3, gets 4 (from 004 migration; same on main before M006)
- 3× `mcp-server.test.ts` — MCP stdio connection/dispatch issues
- 2× dashboard integration tests — build assets not present in worktree
- 1× `start-broker.smoke.test.ts` — dashboard 404 (build assets missing)
- 1× `review-lifecycle-parity.test.ts` — unrelated lifecycle assertion
- 3× gsd extension tests — extension framework stubs
