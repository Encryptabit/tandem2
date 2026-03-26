# S03: Create, spawn, kill, and dashboard commands — Summary

**Status:** Complete
**Tasks:** 3/3 done (T01, T02, T03)
**Tests:** 56 passing (40 CLI + 16 config) — up from 37 before S03
**Duration:** ~28 minutes across 3 tasks

## What This Slice Delivered

Four new CLI commands completing the MCP parity surface and adding operator convenience features:

1. **`reviews create`** — Reads a diff from `--diff-file <path>` (resolved via `path.resolve()`), accepts `--title`, `--description`, `--author` (required) and `--priority` (optional). Calls `service.createReview()`. Returns `reviewId` + `status` in JSON. User-friendly error wrapping for file-not-found.

2. **`reviewers kill <id>`** — Calls `service.killReviewer()` with a positional ID. Returns `outcome` (killed/already_offline/not_found) + `reviewerId` + `message`.

3. **`reviewers spawn`** — Dual-mode: explicit `--command <cmd>` with optional `--args`/`--cwd`, or `--provider <name>` which resolves a config-stored provider template. Returns `reviewerId`, `status`, `command`, `pid`. `--command` takes precedence if both given.

4. **`dashboard`** — Starts the broker dashboard HTTP server using existing `createDashboardRoutes` + `createDashboardServer` infrastructure. Supports `--port`, `--host`, `--json`. Wraps `runtime.close` for graceful teardown (dispose routes + close server). Blocks via `runtime.waitUntilStopped()` — a long-running command unlike all others.

## New Config Infrastructure

**`resolveProvider(configPath, providerName)`** in `config.ts` — navigates `reviewer.providers.<name>` in the config object, validates the entry has a `command` field, extracts optional `args` (handling both native arrays and JSON-stringified arrays from `setConfigValue`), returns `{ command, args }`. 6 unit tests.

## Test Coverage Added

- **T01:** 7 tests — create happy path (verify `reviewId` + `status === 'pending'`), 3 create error cases (missing title, missing diff-file, nonexistent file), kill happy path, kill missing ID, help listing
- **T02:** 4 CLI tests + 6 config tests — explicit command spawn, provider mode spawn, both error cases (missing flags, unknown provider), resolveProvider unit tests covering all paths
- **T03:** 2 tests — dashboard `--help` output, help listing

## Patterns Established

- **File-based CLI input:** `readFileSync(path.resolve(flagValue))` for `--diff-file` pattern, with user-friendly error wrapping.
- **Provider config:** Stored at `reviewer.providers.<name>.{command, args}` with args as JSON string or native array — both forms parsed transparently by `resolveProvider`.
- **Dual-mode spawn:** `--command` takes precedence over `--provider`; error if neither given.
- **Long-running server command:** `handleDashboard` wraps `runtime.close` for teardown and blocks via `waitUntilStopped()` inside dispatch. Relies on `main()` finally block for signal-triggered cleanup.
- **Top-level command:** Dashboard uses the same dispatch pattern as `activity` — no noun/verb, verb pushed back into rest.

## Key Decisions

- `resolveDashboardDistPath` duplicated from `start-broker.ts` (acceptable for one consumer, avoids changing existing CLI internals).
- `resolveProvider` handles both JSON-stringified args and native arrays transparently (because `setConfigValue` stores strings).
- Dashboard command is top-level (no noun/verb grouping), matching the `activity` command pattern.

## What Remains

**S04** is the final slice — integrated acceptance proving full MCP ↔ CLI parity against a real broker runtime. All commands are now implemented; S04 exercises them end-to-end.

## Observability

- `reviews create` → JSON: `review.reviewId`, `review.status`
- `reviewers spawn` → JSON: `reviewer.reviewerId`, `reviewer.status`, `reviewer.pid`
- `reviewers kill` → JSON: `outcome`, `reviewer.reviewerId`, `message`
- `dashboard` → JSON: `url`, `port`, `dashboardDistPath`
- All error paths: descriptive stderr with flag/path/provider name + exit code 1

## Files Modified

- `packages/review-broker-server/src/cli/tandem.ts` — 4 handlers, dispatch routing, imports, help entries
- `packages/review-broker-server/src/cli/config.ts` — `resolveProvider()` export
- `packages/review-broker-server/test/tandem-cli.test.ts` — 13 new test cases
- `packages/review-broker-server/test/config.test.ts` — 6 new resolveProvider unit tests
