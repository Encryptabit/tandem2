# tandem

A code-review broker for AI-assisted workflows. tandem owns the full review lifecycle — creation, claiming, proposals, threaded discussion, verdicts, and counter-patches — with durable SQLite-backed state, supervised reviewer processes, an operator dashboard, an MCP server, a typed TypeScript client, and a gsd-2 extension that gates autonomous unit progression on broker review.

Published on npm as **`@carithecoder/tandem`** (CLI bins: `tandem`, `tandem-broker`, `tandem-mcp`).

## What it does

tandem coordinates code reviews between **proposers** (typically AI agents submitting unit work) and **reviewers** (AI workers or humans evaluating that work). The broker is the single source of truth: it owns the review queue, supervises reviewer processes, persists every transition to SQLite, and exposes that state through five integration surfaces:

1. **`tandem` CLI** — full read/write access to broker state from a shell.
2. **`tandem-mcp` MCP server** — the same operations exposed over MCP stdio for LLM agents.
3. **`tandem-broker` long-running broker process** — used when you want a serve-mode broker without the CLI wrapper.
4. **In-process / typed client** (`review-broker-client`) — deterministic programmatic access, no MCP routing.
5. **Operator dashboard** (`tandem dashboard`) — Astro-built read-only UI served straight out of the broker process.

A separate **gsd-2 extension** (`review-broker-extension`) wires the broker into the `before_next_dispatch` hook so that completed units are submitted for review automatically and unit progression is paused or retried based on the verdict.

**Review lifecycle:** `pending → claimed → submitted → approved | changes_requested → closed`

Reviews carry a unified diff proposal, a threaded discussion, an audit/activity feed, structured verdicts, and a counter-patch flow (proposer can replace the proposal diff while waiting for the next verdict; reviewer can accept or reject).

**Reviewer supervision.** The broker spawns, tracks, and recovers reviewer processes. On reviewer exit or crash, claimed reviews are reclaimed when safe and detached when ambiguous. On startup, stale sessions left over from a prior crashed broker are swept before normal operations resume. When `reviewer_pool` config is present, a pool manager scales reviewer workers up/down within configured limits and reactively respawns terminated workers.

## Packages

```
packages/
  review-broker-core/         npm: @carithecoder/review-broker-core
                              Domain types, Zod contracts, state machine, operation registry, dashboard contracts
  review-broker-server/       npm: @carithecoder/tandem
                              Broker runtime + SQLite persistence + reviewer manager + pool + MCP server + HTTP/dashboard layer
                              Publishes the bins: tandem, tandem-broker, tandem-mcp
  review-broker-client/       npm: @carithecoder/review-broker-client
                              Typed TypeScript client + in-process client helper
  review-broker-dashboard/    private — Astro-built operator dashboard (static dist served by the broker)
  review-broker-extension/    npm: @carithecoder/review-broker-extension
                              gsd-2 extension that gates auto-mode unit progression behind broker reviews
                              Publishes the bin: tandem-review-install
```

### Runtime dependencies

The broker imports the agent runtime from upstream pi-mono — `@mariozechner/pi-agent-core` and `@mariozechner/pi-ai`. These are real npm packages and resolve through standard `node_modules`; no symlinks or vendored copies are required.

## Requirements

- Node.js 22+
- pnpm 10+ (managed via corepack)

## Quick start

```bash
# Install dependencies and build everything
corepack pnpm install
corepack pnpm build

# One-shot: open the DB, run migrations, dump state, exit
corepack pnpm broker:smoke

# Long-running broker (serve mode, no dashboard, no MCP)
corepack pnpm broker:start

# Long-running broker with the operator dashboard
corepack pnpm broker:dashboard
# → broker.dashboard_ready event prints the URL (default http://127.0.0.1:7331)

# MCP server on stdio (for LLM agents that speak MCP)
corepack pnpm broker:mcp

# Drive the broker from a shell
corepack pnpm tandem -- status
corepack pnpm tandem -- reviews list --status pending
```

## The `tandem` CLI

`tandem` is the primary user-facing entrypoint. It opens the broker database, runs the requested operation, and exits. Long-running modes (`tandem dashboard`) keep the process alive until SIGINT/SIGTERM.

```
Usage: tandem <command> [options]

Commands:
  status                       Show broker status summary (counts, status distributions)

  reviews list                 List reviews
  reviews show <id>            Show review details
  reviews create               Create a review from a diff file
  reviews claim <id>           Claim a review for a specific actor
  reviews claim-next           Atomically claim the next pending review
  reviews reclaim <id>         Reclaim a claimed review
  reviews verdict <id>         Submit a verdict (approved | changes_requested)
  reviews close <id>           Close a review

  proposal show <id>           Show the proposal (diff + metadata)
  proposal accept <id>         Accept a counter-patch proposal
  proposal reject <id>         Reject a counter-patch proposal

  discussion show <id>         Show the discussion thread
  discussion add <id>          Add a discussion message (optionally with a replacement diff)

  activity <id>                Show the audit/activity feed

  reviewers list               List tracked reviewers
  reviewers spawn              Spawn a reviewer (--command or --provider)
  reviewers kill <id>          Stop a reviewer process

  dashboard                    Start the broker dashboard HTTP server
  config show                  Show .gsd/review-broker/config.json
  config set <key> <value>     Set a configuration value (dot-path keys)

Global Options:
  --json                       Output results as JSON
  --db-path <path>             Override the SQLite database path
  --cwd <path>                 Resolve workspace-relative paths from this directory
  -h, --help                   Show help (also works on subcommands, e.g. `tandem reviews show -h`)
```

Every write subcommand requires `--actor <id>` so the audit log records who performed the action. Every subcommand supports `--json`, which produces the raw broker response for scripting.

### `tandem dashboard`

```
tandem dashboard [options]

  --port <port>                HTTP port (default: 7331; use 0 for OS-assigned)
  --host <host>                Bind address (default: 127.0.0.1)
  --enable-standalone-pool     Let this dashboard process own reviewer pool scaling immediately
  --db-path <path>             Override DB path; defaults to local extension DB when detected, otherwise global
  --json                       Print { url, port, dashboardDistPath, pool } as JSON
```

When invoked from `tandem`, the dashboard auto-prefers a project-local extension database (see "Database resolution" below) so a single dashboard surfaces review activity from whichever workspace you launched it in.

### `start-broker` (raw, no `tandem` wrapper)

```
start-broker [options]

  --db-path <path>             SQLite database path
  --cwd <path>                 Resolve workspace-relative paths from this directory
  --busy-timeout-ms <ms>       SQLite busy_timeout PRAGMA override
  --once                       Open DB, run migrations, report state, exit
  --dashboard                  Start with the mounted dashboard HTTP server
  --enable-standalone-pool     Allow this dashboard runtime to own reviewer pool scaling
  --dashboard-port <port>      Dashboard port (default: 7331; use 0 for OS-assigned)
  --dashboard-host <host>      Dashboard host (default: 127.0.0.1)
```

The broker emits structured JSON events on stdout (or stderr for failures):

| Event | When |
|---|---|
| `broker.started` | Broker is ready (mode, DB path/source, applied migrations, recovery, pool snapshot) |
| `broker.dashboard_ready` | Dashboard HTTP server is listening (URL, port, pool snapshot) |
| `broker.once_complete` | `--once` mode finished (full runtime snapshot) |
| `broker.stopped` | Broker shut down (shutdown summary) |
| `broker.start_failed` | Startup failed (emitted on stderr) |

`start-mcp` emits the same shape with `mcp.started`, `mcp.transport_error`, `mcp.transport_closed`, `mcp.stopped`, `mcp.start_failed`.

## Repo-level scripts

| Script | What it does |
|---|---|
| `pnpm build` | Build every package (`pnpm -r --if-present run build`) |
| `pnpm test` / `pnpm test:run` | Run vitest across the workspace |
| `pnpm broker:start` | Start the broker in serve mode (no dashboard) |
| `pnpm broker:smoke` | One-shot: open DB at `./.tmp/s01-smoke.sqlite`, migrate, print state, exit |
| `pnpm broker:dashboard` | Build the dashboard, then start the broker with `--dashboard` |
| `pnpm broker:mcp` | Start the MCP server on stdio |
| `pnpm broker:parity` | Run the end-to-end standalone parity test suite |
| `pnpm broker:test` | Run restart-persistence and start-broker smoke tests |
| `pnpm tandem -- <args>` | Invoke the `tandem` CLI through pnpm |

## Database & config resolution

### Database path

The broker resolves its SQLite database path with the following precedence (highest first):

1. `--db-path` argument (or `dbPath` option to `startBroker`)
2. `REVIEW_BROKER_DB_PATH` environment variable
3. **Project-local extension DB** (only when `preferLocalExtensionDb` is set — the `tandem dashboard` subcommand does this, the raw `start-broker --dashboard` does not):
   - If `.gsd/extensions/tandem-review.mjs` exists in the resolved workspace, the broker checks `TANDEM_BROKER_DB` and otherwise falls back to `.gsd/review-broker/broker.db`
4. **Global default**: `${XDG_STATE_HOME:-$HOME/.local/state}/tandem/review-broker.sqlite`

### Config path (with global fallback)

The config file (`reviewer.providers.*`, `reviewer_pool`, etc.) is layered:

1. **Workspace primary**: `REVIEW_BROKER_CONFIG_PATH` env override, otherwise `<workspaceRoot>/.gsd/review-broker/config.json`
2. **Global fallback**: `${XDG_CONFIG_HOME:-$HOME/.config}/tandem/config.json`

Reads merge **per top-level section** with workspace winning where present and global filling holes — so a project that sets `reviewer.provider` but omits `reviewer_pool` still sees the global pool defaults. Writes always go to the primary (workspace) path.

**First-run seeding.** The first time you invoke any of `tandem`, `tandem-broker`, or `tandem-mcp` and no global config exists, the broker writes a default to the global config path (with `reviewer.provider: codex`, the bundled `reviewer-worker.mjs` path, and a working `reviewer_pool` block). The seed event is emitted as `broker.global_config_seeded`. After that, the file is yours — re-running CLI commands won't overwrite it.

The "workspace root" is found by walking up from `--cwd` until a directory contains either `.git` or `.gsd`.

## Dashboard

`tandem dashboard` (or `start-broker --dashboard`) serves the Astro-built dashboard out of the broker process. Three pages, all backed by broker-owned JSON routes that read straight from SQLite — the dashboard never holds its own state.

By default, dashboard mode is **view-only**: it does not run startup recovery, does not spawn reviewers, and does not scale the reviewer pool just because `reviewer_pool` config is present. Toggle on the Overview page (or pass `--enable-standalone-pool`) to let this dashboard process own pool scaling.

**Live updates** use SSE as a change-notification signal only. When a topic version increments inside the broker, the SSE bridge pushes `{ topic, version }`; the dashboard then re-fetches the authoritative snapshot. The reviews page also periodically refreshes so changes written by other broker processes sharing the same global database appear without a manual reload. Snapshot routes are always authoritative.

### Pages

- **Overview** (`/`) — review and reviewer counts, snapshot version, reviewer state breakdown (idle/assigned/offline), startup recovery summary, latest activity, pool mode toggle, connection-status badge.
- **Events** (`/events`) — reverse-chronological operator event feed with type filter (All / Review / Reviewer), cursor-based "load more" pagination, and SSE-driven live follow that prepends new events. All events are redaction-safe — only summary strings are projected; metadata, command paths, arguments, and workspace roots never appear in dashboard responses.
- **Reviews** (`/reviews`) — read-only review browser with status filter chips (`pending`, `claimed`, `submitted`, `approved`, `changes_requested`, `closed`). Detail view shows status, the proposal with its unified diff, the discussion thread, and the redacted activity timeline. Browser back/forward via `pushState`.

### API routes

All routes are served from the broker process at the dashboard host/port.

| Method | Route | Description |
|---|---|---|
| `GET`  | `/api/overview` | Full overview snapshot (counts, reviewers, recovery, pool, latest activity) |
| `GET`  | `/api/pool` | Current dashboard pool mode (`view_only`, `standalone`, or `unavailable`) |
| `POST` | `/api/pool` | Enable / disable dashboard-owned standalone pool scaling — body: `{ "enabled": boolean }` |
| `GET`  | `/api/events` | SSE stream — heartbeat on connect, `change` events on broker mutations |
| `GET`  | `/api/events/feed` | Paginated event list (`limit`, `before` cursor, `eventType`) |
| `POST` | `/api/events/clear` | Truncate the global audit-event table |
| `GET`  | `/api/reviews` | Review list (`status`, `limit`) |
| `GET`  | `/api/reviews/:id` | Composite review detail (status + proposal + discussion + redacted activity) |
| `POST` | `/api/reviews/clear` | Delete reviews and dependent messages/audit rows |
| `POST` | `/api/reset` | Stop tracked reviewers and clear all persisted broker runtime tables |

## MCP server

`tandem-mcp` (or `pnpm broker:mcp`) exposes the broker's full operation set on stdio transport. Tool names mirror the `BROKER_OPERATIONS` registry in `@carithecoder/review-broker-core`:

| Tool | Description |
|---|---|
| `create_review` | Create a new review from a diff |
| `list_reviews` | List reviews (optional status filter, limit) |
| `claim_review` | Claim a specific pending review |
| `claim_next_pending_review` | Atomically claim the next pending review |
| `reclaim_review` | Reclaim a claimed review |
| `get_review_status` | Read review status + metadata |
| `get_proposal` | Read the proposal (diff, description, affected files) |
| `submit_verdict` | Submit a verdict (approved / changes_requested) |
| `close_review` | Close a review |
| `add_message` | Add a discussion message (optionally with a replacement proposal diff) |
| `get_discussion` | Read the discussion thread |
| `get_activity_feed` | Read the redacted activity feed |
| `accept_counter_patch` | Accept a counter-patch |
| `reject_counter_patch` | Reject a counter-patch |
| `spawn_reviewer` | Spawn a reviewer process |
| `list_reviewers` | List tracked reviewers |
| `kill_reviewer` | Stop a reviewer process |

Request and response shapes are derived from Zod schemas — the MCP server, the typed client, and the CLI all share one source of truth. Schema drift is enforced at runtime; the `dashboard-contracts` test suite catches it at build time.

### Installing `tandem-mcp` in an MCP client

The MCP server is a stdio process. Once the package is on your `PATH` (via `npm install -g @carithecoder/tandem` once published, or `npm link` from `packages/review-broker-server` for local development), point your MCP client at the `tandem-mcp` binary.

**Claude Desktop** (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS, `%APPDATA%\Claude\claude_desktop_config.json` on Windows) / **Claude Code** (`.mcp.json` in the project, or `~/.claude.json` for user-level) / **Cursor** (`~/.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "tandem-review": {
      "command": "tandem-mcp",
      "args": []
    }
  }
}
```

This default invocation reads from the global config (`~/.config/tandem/config.json`, auto-seeded on first run) and the global broker DB (`~/.local/state/tandem/review-broker.sqlite`).

To bind the MCP server to a project-scoped broker DB and config:

```json
{
  "mcpServers": {
    "tandem-review": {
      "command": "tandem-mcp",
      "args": [],
      "env": {
        "REVIEW_BROKER_DB_PATH": "/path/to/project/.gsd/review-broker/broker.db",
        "REVIEW_BROKER_CONFIG_PATH": "/path/to/project/.gsd/review-broker/config.json"
      }
    }
  }
}
```

Sanity check: `tandem-mcp` started without args will block on stdin waiting for the MCP handshake — `Ctrl+C` to exit. If it errors out before that, the install isn't reachable.

## Typed client (`@carithecoder/review-broker-client`)

The typed client is the preferred path for deterministic programmatic gates — it calls broker operations directly without going through MCP.

```ts
import { createBrokerClient, startInProcessBrokerClient } from '@carithecoder/review-broker-client';

// In-process: spins up its own broker runtime in the same Node process.
const { client, close } = startInProcessBrokerClient({
  // omit dbPath to use the env/default resolution rules
});

const review = await client.createReview({
  title: 'Fix flaky deserializer',
  description: '…',
  diff: '…unified diff…',
  authorId: 'auto-agent',
  priority: 'normal',
});

const status = await client.getReviewStatus({ reviewId: review.review.reviewId });

await close();
```

For out-of-process scenarios, supply a custom transport to `createBrokerClient({ call })` — the transport just needs to relay `(methodName, request) → response`.

## gsd-2 review gate (`review-broker-extension`)

`review-broker-extension` is a gsd-2 ecosystem extension that hooks `before_next_dispatch` and `before_agent_start` to make tandem reviews part of the auto-mode loop.

Lifecycle:

1. gsd-2 finishes a unit (proposer commits the work as part of the normal auto flow).
2. The hook submits the latest unit diff to the broker as a proposal and waits.
3. On `approved`, gsd-2 progresses to the next unit. The reviewer never commits; gsd already owns proposer commits.
4. On `changes_requested`, the unit is retried with the same review id. Two policies:
   - `intervene` — explicit user-guidance prompt is injected before remediation.
   - `auto-loop` — remediation runs directly from reviewer feedback.
5. Remediation lands as additional proposer commits. The updated proposal diff replaces the stale proposal on the same review id while waiting for the next verdict.

### Install

```bash
# Project install — drops the gate into one project
npx tandem-review-install --cwd .

# Global install — drops the gate into the user-level pi extensions dir,
# so every project that pi loads picks it up automatically.
npx tandem-review-install --global

# Then start gsd-2 auto-mode as usual; the extension hooks in automatically.
```

**Project mode** (default):

- Drops `.gsd/extensions/tandem-review.mjs` (the entrypoint that wires `createTandemReviewExtension` to `createBrokerTransportAdapter`).
- Bootstraps `.gsd/review-broker/config.json` with default `reviewer.providers.codex` and `reviewer_pool` settings.
- Resolves the `reviewer-worker.mjs` path against the installed `@carithecoder/tandem` package so pooled reviewers can be spawned without further configuration.

**Global mode** (`--global`):

- Writes a `tandem-review/` directory under the pi user-extensions root (default `~/.pi/agent/extensions/tandem-review/`; override with `--pi-home <path>` or `$PI_HOME`).
- The directory contains `index.js` (entrypoint), `package.json` (`{ "type": "module" }`), and `extension-manifest.json` so pi's loader can discover and register the extension.
- The `index.js` imports from absolute `file://` URLs that are baked at install time. This means `review-broker-extension` and `review-broker-client` do **not** need to be on the runtime module-resolution path of the projects that load the extension — but they must remain installed at the location resolved when you ran the installer. If you move or reinstall those packages, re-run `tandem-review-install --global --force` to refresh the baked paths.
- No project-local config is bootstrapped; the extension creates `.gsd/review-broker/config.json` at runtime against whichever project loads it.

Both modes accept `--extension-path <path>` to override the install target (a file path in project mode, a directory path in global mode), and `--force` to overwrite an existing entrypoint.

### Environment variables (extension entrypoint)

| Variable | Default | Purpose |
|---|---|---|
| `TANDEM_BROKER_DB` | unset (use global default) | Project-local SQLite database — set to `.gsd/review-broker/broker.db` to opt in |
| `TANDEM_AUTHOR_ID` | `auto-agent` | Author id stamped on submitted proposals |
| `TANDEM_REVIEW_BLOCKED_POLICY` | `auto-loop` | `auto-loop` or `intervene` |
| `TANDEM_REVIEW_WAIT_TIMEOUT_MS` | `600000` (10 min) | How long the gate polls for a verdict before resuming |
| `TANDEM_REVIEW_WAIT_POLL_INTERVAL_MS` | `2000` | Poll interval while waiting |

The gate keeps a paused-state file under `.gsd/review-broker/` so a Claude/agent restart resumes the same review correctly.

## Reviewer pool

When `reviewer_pool` is set in the resolved broker config (workspace primary or global fallback), the broker can manage a pool of reviewer worker processes. The bundled `packages/review-broker-server/scripts/reviewer-worker.mjs` is the default worker — it polls for pending reviews, claims one, runs analysis (via `codex` or `gsd --print`), submits a verdict, and either loops or exits.

Two paths produce the default `reviewer_pool` block:

- **`tandem-review-install`** writes the project-local `.gsd/review-broker/config.json` (see "gsd-2 review gate" above).
- **First CLI run** auto-seeds `~/.config/tandem/config.json` (see "Database & config resolution" above) so global `tandem` invocations work out of the box without a workspace config.

Both seeds use the same default values:

```json
{
  "max_pool_size": 3,
  "scaling_ratio": 1,
  "idle_timeout_seconds": 300,
  "max_ttl_seconds": 3600,
  "claim_timeout_seconds": 1800,
  "spawn_cooldown_seconds": 5,
  "background_check_interval_seconds": 10
}
```

The pool is **not** started automatically by dashboards or MCP servers — those run view-only by default to avoid double-scaling when multiple processes attach to the same database. Long-running brokers and `--enable-standalone-pool` opt in.

## Architecture notes

- **SQLite is the source of truth.** All broker state lives in a single SQLite file with explicit migrations and WAL mode. The dashboard, MCP server, CLI, and typed client all read through the same service layer.
- **Broker-first, not dashboard-first.** Every dashboard route calls the broker's own service and repositories. There is no separate dashboard data store.
- **SSE is a signal, not a stream.** Change events carry only `{ topic, version }`. Authoritative reads always go through snapshot routes — reconnect and reload are safe by construction.
- **Redaction by default.** The event feed and activity timelines drop the entire metadata blob. Only the summary string is exposed; command paths, arguments, and workspace roots never appear in dashboard responses.
- **Reviewer recovery is conservative.** On reviewer exit/crash the broker reclaims unambiguously safe claimed reviews and detaches everything else. Stale-session reviewers from a prior crashed broker are swept on startup before normal operation resumes.
- **One canonical contract.** All packages share Zod schemas exported from `@carithecoder/review-broker-core` (`BROKER_OPERATIONS`, dashboard contracts, state-machine transitions). Drift is caught at runtime by request/response parsing and at build time by the contract test suite.

## Testing

```bash
# Run all tests
corepack pnpm test:run

# Run tests for a single package
corepack pnpm --filter @carithecoder/review-broker-core test
corepack pnpm --filter @carithecoder/tandem test

# Common targeted suites
corepack pnpm --filter @carithecoder/review-broker-core exec vitest run test/dashboard-contracts.test.ts
corepack pnpm --filter @carithecoder/tandem exec vitest run test/http-dashboard-routes.test.ts
corepack pnpm --filter @carithecoder/tandem exec vitest run test/http-event-feed-routes.test.ts
corepack pnpm --filter @carithecoder/tandem exec vitest run test/http-review-routes.test.ts
corepack pnpm --filter @carithecoder/tandem exec vitest run test/broker-mounted-dashboard.integration.test.ts
corepack pnpm --filter @carithecoder/tandem exec vitest run test/dashboard-acceptance.integration.test.ts
corepack pnpm --filter @carithecoder/tandem exec vitest run test/end-to-end-standalone-parity.test.ts
corepack pnpm --filter @carithecoder/tandem exec vitest run test/tandem-cli.test.ts
```
