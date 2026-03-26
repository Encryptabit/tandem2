# M006: Reactive reviewer pool management — Context

## What this milestone is about

tandem2 has a functional review broker with CRUD operations, 4 operator surfaces, and basic reviewer spawn/kill. But it has no intelligence about *when* to spawn or kill reviewers. The gsd-tandem Python broker has a mature pool management system that:

1. Watches pending review volume and auto-spawns reviewers to match demand
2. Kills idle reviewers to save resources
3. Enforces maximum lifetime on reviewers
4. Detects dead processes and reclaims their work
5. Handles graceful drain (finish current work before dying)
6. Pipes a prompt to reviewer stdin and captures their output

This milestone ports that pool management brain into tandem2.

## Reference implementation

The Python broker's pool system lives in 4 files:
- `pool.py` — `ReviewerPool` class, subprocess management, drain lifecycle, output logging
- `config_schema.py` — `SpawnConfig` Pydantic model with validated pool parameters
- `tools.py` — `_reactive_scale_check()` function: `pending ÷ ratio → target → spawn delta`
- `db.py` — 5 periodic check functions, startup recovery, broker lifespan management

Key design patterns to preserve:
- **Scaling ratio**: `desired_reviewers = ceil(pending_reviews / scaling_ratio)`. Default ratio 3.0 means 3 pending reviews → 1 reviewer.
- **Spawn cooldown**: Minimum seconds between spawns to prevent burst-spawning.
- **Drain before kill**: Mark reviewer as `draining`, wait for open reviews to close, then terminate.
- **Dead process reaping**: Check `process.exitCode !== null`, reclaim any `claimed` reviews, mark remaining as detached.
- **Session tokens**: Each broker run gets a unique token. On restart, reviewers from old sessions are terminated.
- **Stdin prompt piping**: The reviewer prompt is written to the process's stdin, then stdin is closed.
- **JSONL log rotation**: Each reviewer's stdout/stderr is captured to `reviewer-{id}.jsonl` with size-based rotation.

## What exists today in tandem2

- `reviewer-manager.ts` — Basic spawn/kill with `child_process.spawn()`, `stdio: 'ignore'`, in-memory process tracking
- `reviewers` table — Has reviewer_id, command, args, pid, started_at, offline_at, offline_reason, exit_code
- Config at `.gsd/review-broker/config.json` — schema-free JSON, read/write via `config.ts`
- CLI commands: `tandem reviewers spawn`, `tandem reviewers kill`, `tandem reviewers list`
- MCP tools: `spawn_reviewer`, `kill_reviewer`, `list_reviewers`

## What needs to change

| Area | Current | Target |
|------|---------|--------|
| Spawn stdio | `'ignore'` | Pipe stdin (prompt), capture stdout/stderr |
| Process supervision | None | Background loop every N seconds |
| Scaling | Manual spawn only | Auto-spawn based on pending/ratio |
| Idle management | None | Kill after idle_timeout_seconds |
| TTL management | None | Kill after max_ttl_seconds |
| Claim timeout | Exists (M003) | Integrate with pool background loop |
| Dead process detection | Exists (M003) | Integrate with pool background loop |
| Drain lifecycle | None | `active → draining → terminated` |
| Config validation | Schema-free | Validated `PoolConfig` with bounds |
| Reviewer state | `idle/assigned/offline` | Add `draining` status |
| Session tracking | None | Session token per broker run |
| Output capture | None | JSONL rotating log files |
| Startup recovery | Exists (M003) | Extend with stale-session termination + scaling pass |

## Constraints

- The existing reviewer-manager.ts API is used by BrokerService, MCP tools, and CLI. Changes must be backward-compatible or all surfaces must be updated.
- The pool must be optional — if no `reviewer_pool` config exists, the broker runs as today.
- The background loop must not interfere with the signal-based shutdown and the keep-alive setInterval added in this session.
- Schema migration must be additive (new columns/tables only) to preserve existing databases.
