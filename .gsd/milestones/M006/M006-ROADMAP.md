# M006: Reactive reviewer pool management

**Vision:** Port the autoscaling, lifecycle management, and process supervision from gsd-tandem's Python broker into tandem2 — so the broker automatically spawns and kills reviewer agents based on pending review volume, enforces idle/TTL limits, captures reviewer output, pipes prompts to stdin, and recovers gracefully from process exits and stale sessions.

## Success Criteria

- The broker automatically spawns reviewer processes when pending reviews exceed `pending ÷ scaling_ratio > active_reviewers`, up to `max_pool_size`.
- Idle reviewers with no open claims are drained after `idle_timeout_seconds`.
- Reviewers exceeding `max_ttl_seconds` are drained even if they were recently active.
- Dead reviewer processes are detected and their claimed reviews reclaimed.
- Claimed reviews exceeding `claim_timeout_seconds` are reclaimed back to pending.
- Reviewer processes receive a prompt via stdin and have stdout/stderr captured to rotating JSONL log files.
- Pool configuration is loaded from the existing config file (`reviewer_pool` section) with validated schema fields.
- Reactive scaling fires on `create_review`, `add_message`, at startup, and periodically on a background interval.
- The pool respects a `spawn_cooldown_seconds` between spawns and a `max_pool_size` cap.
- `tandem reviewers list` shows pool-managed reviewers with session tokens, project scope, and workspace paths.
- All pool behavior is exercised through tests against a real broker runtime.

## Key Risks / Unknowns

- **Stdin prompt piping** — The current `reviewer-manager.ts` spawns with `stdio: 'ignore'`. Switching to piped stdin/stdout/stderr changes the process lifecycle model and requires async stream handling in Node.
- **Background loop in synchronous broker** — The Python broker uses asyncio for its periodic check loop. tandem2's broker is synchronous (no event loop besides signal handlers). The background loop needs a `setInterval`-based approach that doesn't conflict with the existing keep-alive and signal handling.
- **Graceful drain semantics** — The Python broker has a `draining` state where a reviewer finishes open work before being killed. tandem2 currently only has `idle → assigned → offline` states. Adding `draining` requires a schema migration and state machine changes.
- **Config schema validation at load time** — The current config module is schema-free (`Record<string, unknown>`). The pool needs validated numeric fields with min/max bounds. This is the first consumer that requires load-time validation rather than point-of-use checking.

## Proof Strategy

- **Stdin prompt piping** → retire in S01 by proving a reviewer process receives a prompt on stdin, emits output captured to a JSONL log, and exits cleanly.
- **Background loop** → retire in S02 by proving periodic checks run on an interval, detect dead processes, and trigger scaling — all in a test with a real broker runtime.
- **Graceful drain** → retire in S02 by proving a reviewer in `draining` state finishes its claimed review before being terminated.
- **Config schema validation** → retire in S01 by proving invalid pool config (e.g. `max_pool_size: -1`) is rejected at load time with a useful error.

## Verification Classes

- Contract verification: unit tests for pool config schema, scaling ratio math, drain state machine
- Integration verification: real broker runtime with spawned subprocesses, background loop, and scaling triggers
- Operational verification: reviewer process exit detection, stale session cleanup on restart, JSONL log rotation
- UAT / human verification: none — all behavior is machine-verifiable

## Milestone Definition of Done

This milestone is complete only when all are true:

- Pool config loads from `reviewer_pool` section with schema validation and useful errors.
- Reviewer processes spawn with stdin prompt, stdout/stderr capture to rotating JSONL logs.
- Reactive scaling correctly calculates `desired = ceil(pending / ratio)` and spawns/skips accordingly.
- Background periodic loop runs 5 checks: reactive scaling, idle timeout, TTL expiry, claim timeout, dead process reaping.
- Drain lifecycle works: reviewer marked draining → finishes open reviews → terminated.
- Startup recovery terminates stale-session reviewers and runs an immediate scaling pass.
- CLI and MCP surfaces reflect pool state (session tokens, project scope, draining status).
- All pool behavior proven through integration tests against a real broker runtime.

## Requirement Coverage

- Covers: none (no formal requirements defined for this feature yet)
- Partially covers: none
- Leaves for later: project-scoped reviewers (partial — config accepts project field but per-project scaling deferred), dashboard pool visualization
- Orphan risks: none

## Slices

- [ ] **S01: Pool config, stdin-piped spawn, and output capture** `risk:high` `depends:[]`
  > After this: `tandem reviewers spawn --provider codex` spawns a reviewer with stdin prompt piping and stdout/stderr captured to JSONL log files. Pool config loads from `reviewer_pool` section with schema validation. `tandem pool status` shows pool state. Proven through integration test with a real subprocess.

- [ ] **S02: Background loop, drain lifecycle, and reactive scaling** `risk:high` `depends:[S01]`
  > After this: The broker background loop runs 5 periodic checks (scaling, idle timeout, TTL expiry, claim timeout, dead process reaping). `create_review` triggers reactive scaling. Drain state machine works end-to-end. All proven through integration tests with timed subprocess fixtures.

- [ ] **S03: Startup recovery and integrated acceptance** `risk:medium` `depends:[S01,S02]`
  > After this: Broker startup terminates stale-session reviewers, reclaims orphaned claims, and runs an immediate scaling pass. Full pool lifecycle proven across restart boundary: spawn → claim → process exit → restart → recovery → re-scale. CLI/MCP surfaces reflect pool state correctly.

## Boundary Map

### S01 → S02

Produces:
- `PoolConfig` validated schema type with `max_pool_size`, `idle_timeout_seconds`, `max_ttl_seconds`, `claim_timeout_seconds`, `spawn_cooldown_seconds`, `scaling_ratio`, `background_check_interval_seconds`
- `ReviewerPool` class with `spawnReviewer()` that pipes stdin and captures stdout/stderr
- `pool.activeCount`, `pool.activeCountForProject()` accessors
- `drain_reviewer` → S02 implements drain semantics using the pool's process registry
- Schema migration adding `session_token`, `status` enum expansion (`draining`), performance counters to `reviewers` table
- JSONL rotating log writer for reviewer output

Consumes:
- nothing (first slice)

### S02 → S03

Produces:
- Background periodic check loop with 5 check functions
- Reactive scaling function callable from `create_review`, `add_message`, periodic, and startup contexts
- Drain lifecycle: `active → draining → terminated` with open-review gate
- `pool.shutdownAll()` for graceful teardown

Consumes:
- S01's `ReviewerPool`, `PoolConfig`, spawn with stdin/capture, schema migration
- S01's JSONL log writer

### S01 + S02 → S03

Produces:
- Startup stale-session termination
- Startup ownership sweep (reclaim orphaned claims)
- Startup reactive scaling pass
- Full lifecycle integration proof across restart boundary
- CLI/MCP pool state surface updates

Consumes:
- S01's pool config, spawn, capture infrastructure
- S02's background loop, drain lifecycle, scaling logic
