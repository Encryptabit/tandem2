# tandem2

A standalone TypeScript review broker for AI-assisted code review workflows. Manages the full review lifecycle — creation, claiming, proposals, discussion, verdicts, and counter-patches — with durable SQLite-backed state, reviewer process supervision, and a browser-based operator dashboard.

## What it does

tandem2 runs as a long-lived broker process that coordinates code reviews between proposers (typically AI agents submitting work for review) and reviewers (AI or human reviewers evaluating that work). The broker owns the review queue, tracks reviewer lifecycle, persists all state to SQLite, and provides three integration surfaces: a direct typed TypeScript client, a public MCP (Model Context Protocol) server, and an operator dashboard served from the broker process itself.

**Review lifecycle:** pending → claimed → submitted → approved / changes_requested → closed

Reviews support proposals with unified diffs, threaded discussion, activity feeds, verdicts, and counter-patch flows (propose → accept/reject).

**Reviewer supervision:** The broker spawns, tracks, and recovers reviewer processes. When a reviewer exits or crashes, the broker reclaims or detaches its active reviews based on conservative recovery rules. On startup, stale sessions from prior crashes are swept automatically.

## Packages

```
packages/
  review-broker-core/        Shared domain types, Zod contracts, state machine, operation definitions
  review-broker-server/       Broker runtime, SQLite persistence, reviewer manager, MCP server, HTTP/dashboard layer
  review-broker-client/       Direct typed TypeScript client for programmatic integration
  review-broker-dashboard/    Astro-based operator dashboard (static build, served by the broker)
```

## Quick start

```bash
# Install dependencies
corepack pnpm install

# Build all packages
corepack pnpm build

# Start the broker with the dashboard
corepack pnpm broker:dashboard
# → opens at http://127.0.0.1:<port> (port printed on startup)

# Start the broker without dashboard
corepack pnpm broker:start

# Start the MCP server (stdio transport)
corepack pnpm broker:mcp

# Inspect broker state and exit
corepack pnpm broker:smoke
```

## CLI

The broker CLI is `start-broker.ts`. All flags work with both `=` and space-separated syntax.

```
start-broker [options]

Options:
  --db-path <path>          SQLite database path (default: auto-resolved from workspace)
  --cwd <path>              Resolve workspace-relative paths from this directory
  --busy-timeout-ms <ms>    SQLite busy_timeout pragma override
  --once                    Open the database, run migrations, report state, and exit
  --dashboard               Start the broker with the mounted dashboard HTTP server
  --dashboard-port <port>   Dashboard HTTP port (default: 0 = OS-assigned)
  --dashboard-host <host>   Dashboard HTTP bind address (default: 127.0.0.1)
  -h, --help                Show help
```

The broker emits structured JSON events on stdout:

| Event | When |
|---|---|
| `broker.started` | Broker process is ready (includes mode, db path, startup recovery) |
| `broker.dashboard_ready` | Dashboard HTTP server is listening (includes URL and port) |
| `broker.once_complete` | `--once` mode finished (includes full state snapshot) |
| `broker.stopped` | Broker shut down (includes shutdown summary) |
| `broker.start_failed` | Startup failed (emitted on stderr) |

### Repo-level scripts

| Script | What it does |
|---|---|
| `pnpm broker:start` | Start the broker in long-running serve mode |
| `pnpm broker:dashboard` | Build the dashboard, then start the broker with `--dashboard` |
| `pnpm broker:smoke` | One-shot: open DB, migrate, print state, exit |
| `pnpm broker:mcp` | Start the MCP server on stdio |
| `pnpm broker:parity` | Run the end-to-end standalone parity test suite |
| `pnpm broker:test` | Run restart persistence and smoke tests |

## Dashboard

The operator dashboard is a thin Astro-built client served directly from the broker process. It has three pages, each backed by broker-owned JSON API routes. All data comes from the broker's SQLite database — the dashboard never maintains its own state. By default, `tandem dashboard` opens a detected project-local Tandem extension database; if none is present, it opens the global Tandem broker database so one dashboard can show review activity from multiple projects.

**Live updates** use SSE (Server-Sent Events) as a change notification signal. When the broker's state changes in the dashboard process, it pushes a lightweight event (topic + version number) over SSE. The reviews page also periodically refreshes so changes written by other project-local broker processes sharing the same global database appear without a manual reload. Snapshot routes are always authoritative.

### Pages

**Overview** (`/`) — Review and reviewer counts, snapshot version, reviewer state breakdown (idle/assigned/offline), startup recovery summary, and latest activity. Connection status badge shows live connection health.

**Events** (`/events`) — Live operator event feed with reverse-chronological audit events. Supports type filtering (All / Review / Reviewer), cursor-based pagination (load more), and SSE-driven live follow that prepends new events as they arrive. All events are redaction-safe — metadata is stripped, only summary strings are exposed.

**Reviews** (`/reviews`) — Read-only review browser. List view with status filter chips (pending, claimed, submitted, approved, changes_requested, closed). Click through to a detail view showing status, proposal with unified diff, discussion thread, and activity timeline. Browser history routing via pushState for native back/forward.

### API routes

All routes are served from the broker process at the dashboard host/port.

| Route | Description |
|---|---|
| `GET /api/overview` | Full overview snapshot (counts, reviewer state, recovery, latest activity) |
| `GET /api/events` | SSE stream — heartbeat on connect, `change` events on broker mutations |
| `GET /api/events/feed` | Paginated event list. Query params: `limit`, `before` (cursor), `eventType` |
| `GET /api/reviews` | Review list. Query params: `status`, `limit` |
| `GET /api/reviews/:id` | Composite review detail (status, proposal, discussion, redacted activity) |

## MCP tools

The MCP server exposes the full broker operation set over stdio transport:

| Tool | Description |
|---|---|
| `create_review` | Create a new review |
| `list_reviews` | List reviews with optional filters |
| `claim_review` | Claim a pending review for a reviewer |
| `reclaim_review` | Reclaim a review after reviewer failure |
| `get_review_status` | Get review status and metadata |
| `get_proposal` | Get the review proposal (diff, description) |
| `submit_verdict` | Submit a verdict (approved / changes_requested) |
| `close_review` | Close a review |
| `add_message` | Add a message to the review discussion |
| `get_discussion` | Get the full discussion thread |
| `get_activity_feed` | Get the review activity feed |
| `accept_counter_patch` | Accept a counter-patch |
| `reject_counter_patch` | Reject a counter-patch |
| `spawn_reviewer` | Spawn a new reviewer process |
| `list_reviewers` | List tracked reviewers with status |
| `kill_reviewer` | Kill a reviewer process |

## Typed client

The `review-broker-client` package provides a direct TypeScript client for programmatic integration. This is the preferred path for deterministic workflow gates — it calls broker operations directly without routing through LLM-mediated MCP.

```typescript
import { createBrokerClient } from 'review-broker-client';

const client = createBrokerClient({ /* transport options */ });
const review = await client.createReview({ title: '...', diff: '...' });
const status = await client.getReviewStatus({ reviewId: review.reviewId });
```

## Shared contracts

All packages share one canonical domain model defined in `review-broker-core`:

- **Domain types** — `ReviewStatus`, `ReviewVerdict`, `ReviewerStatus`, `ReviewPriority`, etc.
- **State machine** — Typed review status transitions with validation
- **Operation definitions** — Zod-validated request/response schemas for all broker operations
- **Dashboard contracts** — `OverviewSnapshot`, `EventFeedResponse`, `ReviewListResponse`, `ReviewDetailResponse`, SSE payload schemas

Contracts are enforced at runtime through Zod parsing. Schema drift between packages is caught by 27 contract tests.

## Testing

```bash
# Run all tests
corepack pnpm test:run

# Run a specific package's tests
corepack pnpm --filter review-broker-core test
corepack pnpm --filter review-broker-server test

# Dashboard-specific test suites
corepack pnpm --filter review-broker-core exec vitest run test/dashboard-contracts.test.ts     # 27 contract tests
corepack pnpm --filter review-broker-server exec vitest run test/http-dashboard-routes.test.ts  # 8 overview/SSE route tests
corepack pnpm --filter review-broker-server exec vitest run test/http-event-feed-routes.test.ts # 6 event feed route tests
corepack pnpm --filter review-broker-server exec vitest run test/http-review-routes.test.ts     # 6 review route tests
corepack pnpm --filter review-broker-server exec vitest run test/broker-mounted-dashboard.integration.test.ts  # 12 integration tests
corepack pnpm --filter review-broker-server exec vitest run test/dashboard-acceptance.integration.test.ts       # 6 acceptance tests
```

## Architecture notes

- **SQLite is the source of truth.** All broker state lives in one SQLite file with explicit migrations and WAL mode.
- **Broker-first, not dashboard-first.** The dashboard is a projection of broker state, not a separate data store. Every dashboard route calls through the broker's own service layer and repositories.
- **SSE is a signal, not a stream.** The SSE bridge tells the dashboard *that* something changed (topic + version). The dashboard then fetches the authoritative snapshot. This makes reconnect and reload safe by design.
- **Redaction by default.** Event feeds and activity timelines strip the entire metadata object. Only the summary string is projected forward. No command paths, arguments, or workspace roots appear in any dashboard response.
- **Reviewer recovery is conservative.** On reviewer exit or crash, the broker reclaims clearly safe claimed reviews and detaches ambiguous open work. On startup, stale sessions are swept before normal operations resume.

## Requirements

- Node.js 22+
- pnpm 10+ (managed via corepack)
