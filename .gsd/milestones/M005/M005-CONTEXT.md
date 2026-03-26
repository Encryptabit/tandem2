# M005: Interactive operator CLI

## Origin

The broker currently has three interaction surfaces: a long-running server process (`start-broker.ts`), an MCP server on stdio (`start-mcp.ts`), and a browser dashboard. None of these give operators a direct shell command interface for common tasks like listing reviews, inspecting status, managing configuration, or controlling reviewer providers.

The user wants a CLI that works the way `git` or `gh` does — subcommands you can run from a terminal without starting a server or opening a browser. Something like `tandem reviews list`, `tandem status`, `tandem config set reviewer.provider anthropic`.

## What exists today

- **`start-broker.ts`** — Server process with `--once` (inspect-and-exit), `--dashboard` (serve UI), and default long-running mode. Emits structured JSON events on stdout.
- **`start-mcp.ts`** — MCP stdio server exposing all 16 broker operations as tools.
- **Config path resolution** — `path-resolution.ts` already resolves `configPath` to `.gsd/review-broker/config.json` in the workspace root. But no config file is actually read or written anywhere — the path is resolved and stored on AppContext but unused.
- **BrokerService** — The full operation set (createReview, listReviews, claimReview, submitVerdict, etc.) is available as typed methods on the service object.
- **Default DB** — `~/.local/state/tandem2/review-broker.sqlite` (XDG-compliant).
- **Reviewer spawning** — `spawnReviewer` takes a `command`, `args[]`, and optional `cwd`. There's no concept of a "provider" (like anthropic/openai) — reviewers are raw subprocess commands today.

## Key constraints

- The CLI must share the same database as the MCP server and dashboard. All three surfaces should see the same state.
- The CLI should be a thin layer over BrokerService — not a second implementation of broker logic.
- Config management (providers, default reviewer settings) requires defining what config actually looks like, since the config file doesn't exist yet.
- The CLI binary should be installable and runnable as `tandem` (or similar) from any directory.

## What "provider config" means

Today, spawning a reviewer requires passing an explicit `command` + `args`. A provider abstraction would let operators configure named reviewer backends (e.g. "use Claude via this command template") so that spawning a reviewer doesn't require specifying the full command each time. This is new functionality, not just a CLI wrapper.

## Scope boundaries

- The CLI is an operator tool, not a replacement for MCP or the typed client in automated workflows.
- Provider config is the most novel piece — everything else (review listing, status, dashboard launch) is composition over existing seams.
- The CLI should not become a second control plane. It calls BrokerService methods, same as the dashboard routes.
