---
estimated_steps: 5
estimated_files: 4
skills_used: []
---

# T01: Scaffold CLI entrypoint, formatting module, and status command

**Slice:** S01 — CLI scaffold and read-only commands
**Milestone:** M005

## Description

Create the `tandem` CLI entrypoint with the full structural pattern: global arg parsing (`--json`, `--db-path`, `--cwd`, `--help`), subcommand routing, broker lifecycle management, output formatting helpers, and the first command (`status`). This task proves the entire scaffold — every subsequent command just plugs a handler into the router.

The CLI follows the existing `start-broker.ts` pattern: hand-rolled arg parsing, `startBroker()` for broker initialization, structured JSON output. The key difference is that `tandem` is not a long-running server — it opens a broker, runs one command, and exits. Use `handleSignals: false` since the CLI exits immediately.

## Steps

1. **Create `packages/review-broker-server/src/cli/format.ts`** — Output formatting module with:
   - `formatJson(data: unknown): string` — `JSON.stringify(data, null, 2)`
   - `formatTable(headers: string[], rows: string[][]): string` — padded columns using `String.padEnd()`, header row + separator + data rows
   - `formatDetail(entries: Array<[string, string | number | null]>): string` — key-value pairs with aligned labels, e.g. `Review Count:  42`
   - `formatStatusCounts(counts: Record<string, number>): string` — compact status summary for `status` command

2. **Create `packages/review-broker-server/src/cli/tandem.ts`** — Main entrypoint with:
   - `#!/usr/bin/env node` shebang
   - `interface GlobalOptions { json: boolean; dbPath?: string; cwd?: string; help: boolean }` 
   - `parseGlobalArgs(argv: string[]): { options: GlobalOptions; rest: string[] }` — splits global flags from the subcommand portion. Global flags: `--json`, `--db-path <path>`, `--cwd <path>`, `--help`/`-h`
   - Subcommand router: match `rest[0]` to noun (`reviews`, `reviewers`, `status`, etc.), then `rest[1]` to verb (`list`, `show`), pass remaining args to handler
   - `handleStatus(runtime, options)` — calls `inspectBrokerRuntime(runtime.context)`, formats with `formatDetail()` or `formatJson()` depending on `--json`
   - `main()` wrapping function: parse args → if `--help` and no subcommand, print root usage → `startBroker({ handleSignals: false, ...pathOptions })` → dispatch to handler in try/finally with `runtime.close()` → exit
   - `printUsage()` listing all available subcommands
   - Error handling: unknown subcommand → `process.stderr.write(message)`, `process.exitCode = 1`

3. **Add bin entry to `packages/review-broker-server/package.json`** — Add `"tandem": "./dist/cli/tandem.js"` to the existing `"bin"` object.

4. **Add root script to `package.json`** — Add `"tandem": "corepack pnpm --filter review-broker-server exec tsx src/cli/tandem.ts"` to the root `scripts` object. This lets operators run `pnpm tandem status` from the workspace root.

5. **Verify manually** — Run `npx tsx packages/review-broker-server/src/cli/tandem.ts --help` from the workspace root, confirm usage prints. Run `npx tsx packages/review-broker-server/src/cli/tandem.ts status --json --db-path /tmp/test-tandem-t01.sqlite`, confirm JSON output with `reviewCount` field.

## Must-Haves

- [ ] `tandem.ts` entrypoint with global arg parsing, subcommand router, and broker lifecycle (`startBroker`/`close` in `finally`)
- [ ] `format.ts` module with `formatJson()`, `formatTable()`, `formatDetail()` helpers
- [ ] `status` command works in both `--json` and human-readable modes
- [ ] `--help` prints subcommand list; unknown subcommands exit non-zero with error message
- [ ] `"tandem"` bin entry in `packages/review-broker-server/package.json`
- [ ] Broker opened with `handleSignals: false` — the CLI is not a long-running server

## Verification

- `cd /home/cari/repos/tandem2/.gsd/worktrees/M005 && npx tsx packages/review-broker-server/src/cli/tandem.ts --help` exits 0 and prints usage with subcommand list
- `cd /home/cari/repos/tandem2/.gsd/worktrees/M005 && npx tsx packages/review-broker-server/src/cli/tandem.ts status --json --db-path /tmp/test-tandem-t01.sqlite` exits 0 and outputs valid JSON containing `reviewCount`
- `cd /home/cari/repos/tandem2/.gsd/worktrees/M005 && npx tsx packages/review-broker-server/src/cli/tandem.ts status --db-path /tmp/test-tandem-t01.sqlite` exits 0 and outputs human-readable text with labels like "Review Count" or "Reviews"
- `cd /home/cari/repos/tandem2/.gsd/worktrees/M005 && npx tsx packages/review-broker-server/src/cli/tandem.ts bogus 2>&1; echo "exit: $?"` shows error message and exit code 1

## Inputs

- `packages/review-broker-server/src/cli/start-broker.ts` — reference pattern for arg parsing, `emit()`, `printUsage()`, broker lifecycle
- `packages/review-broker-server/src/index.ts` — `startBroker()`, `inspectBrokerRuntime()`, `StartBrokerOptions`, `BrokerRuntimeSnapshot` exports
- `packages/review-broker-server/src/runtime/broker-service.ts` — `BrokerService` interface (read-only methods needed by later commands)
- `packages/review-broker-server/package.json` — existing `bin` entries to extend

## Expected Output

- `packages/review-broker-server/src/cli/tandem.ts` — new CLI entrypoint
- `packages/review-broker-server/src/cli/format.ts` — new output formatting module
- `packages/review-broker-server/package.json` — modified with `tandem` bin entry
- `package.json` — modified with root `tandem` script

## Observability Impact

- **New signals:** `tandem status` exposes the full `BrokerRuntimeSnapshot` as either human-readable or JSON output. This is the first CLI-based diagnostic surface for the broker.
- **Inspection:** Future agents can run `tandem status --json --db-path <path>` to programmatically inspect broker state (review counts, reviewer counts, status distributions) without starting a long-running server.
- **Failure visibility:** Unknown subcommands produce stderr output with a usage hint and exit code 1. Broker startup failures (e.g., invalid db-path) surface as stderr messages with exit code 1. The `--help` flag provides self-documenting command discovery.
- **Exit codes:** 0 = success, 1 = user error (unknown subcommand, missing arg, broker failure).
