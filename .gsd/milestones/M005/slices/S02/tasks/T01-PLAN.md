---
estimated_steps: 5
estimated_files: 3
skills_used: []
---

# T01: Create config management module and CLI handlers

**Slice:** S02 — Config management and write commands
**Milestone:** M005

## Description

Create a new `config.ts` module for reading/writing the broker config JSON file, then wire `config show` and `config set` handlers into the tandem CLI. This is the only novel code in S02 — everything else follows established patterns. S03 depends on config existing for provider resolution.

The config file lives at `runtime.context.configPath` (resolved to `.gsd/review-broker/config.json` by `path-resolution.ts`). No config file exists today — the path is resolved but never used. The module must handle: file doesn't exist (return `{}`), parent directory doesn't exist (create it), and dot-path key assignment (`reviewer.provider` → `{ reviewer: { provider: "value" } }`).

## Steps

1. **Create `packages/review-broker-server/src/cli/config.ts`** with three exported functions:
   - `readConfig(configPath: string): Record<string, unknown>` — reads and parses the JSON file. If the file doesn't exist, returns `{}`. Uses `readFileSync` + `JSON.parse`.
   - `writeConfig(configPath: string, data: Record<string, unknown>): void` — creates the parent directory with `mkdirSync({ recursive: true })` and writes `JSON.stringify(data, null, 2)` + newline.
   - `setConfigValue(configPath: string, dotKey: string, value: string): Record<string, unknown>` — reads current config, splits `dotKey` on `.`, walks/creates nested objects, sets the leaf value, writes back, returns the updated config.

2. **Add `config` noun to the dispatch router in `tandem.ts`** — New `case 'config':` in the switch with sub-verbs `show` and `set`. Import `readConfig` and `setConfigValue` from `./config.js`.
   - `config show`: Reads config from `runtime.context.configPath`. With `--json`, outputs the full object. Without `--json`, outputs `formatDetail` entries for each top-level key (or "No configuration file found." if empty and file doesn't exist).
   - `config set <key> <value>`: Extracts `key` (verb position) and `value` (first rest arg). Calls `setConfigValue`. Prints confirmation or JSON.
   - Both handlers use `runtime.context.configPath` — they don't need `runtime.service` but still go through normal broker startup to keep the pattern uniform.

3. **Add `SUBCOMMAND_HELP` entries** for `'config show'` and `'config set'`.

4. **Update the root `printUsage()` help text** to list `config show` and `config set` commands.

5. **Write tests:**
   - `packages/review-broker-server/test/config.test.ts` — Unit tests for the config module:
     - `readConfig` on non-existent file returns `{}`
     - `writeConfig` + `readConfig` roundtrip
     - `setConfigValue` with simple key (`provider`) sets top-level
     - `setConfigValue` with dot-path (`reviewer.provider`) creates nested structure
     - `setConfigValue` with deep path (`a.b.c.d`) creates deeply nested structure
     - `setConfigValue` preserves existing keys when adding new ones
   - Add smoke tests to `packages/review-broker-server/test/tandem-cli.test.ts`:
     - `tandem config set reviewer.provider anthropic --db-path <temp>` → exit 0
     - `tandem config show --json --db-path <temp>` → JSON contains `{ reviewer: { provider: "anthropic" } }`
     - `tandem config show --db-path <temp>` (human-readable) → contains "reviewer"

## Must-Haves

- [ ] `readConfig` returns `{}` for non-existent file (no crash)
- [ ] `writeConfig` creates parent directories automatically
- [ ] `setConfigValue` handles dot-path nesting correctly
- [ ] `config show` supports both `--json` and human-readable output
- [ ] `config set` persists changes that survive across invocations
- [ ] All existing 12 CLI tests still pass (no regressions)

## Verification

- `cd packages/review-broker-server && npx vitest run test/config.test.ts` — all config unit tests pass
- `cd packages/review-broker-server && npx vitest run test/tandem-cli.test.ts` — old 12 tests + new config smoke tests pass

## Inputs

- `packages/review-broker-server/src/cli/tandem.ts` — existing CLI entrypoint with dispatch router, arg parsing helpers, and handler pattern to follow
- `packages/review-broker-server/src/cli/format.ts` — existing formatters (`formatJson`, `formatDetail`) to use for config output
- `packages/review-broker-server/src/runtime/app-context.ts` — `AppContext` interface with `configPath: string` field
- `packages/review-broker-server/test/tandem-cli.test.ts` — existing test file with `runTandem()` and `parseJsonOutput()` helpers
- `packages/review-broker-server/test/test-paths.ts` — exports `TANDEM_CLI_PATH`, `TSX_PATH`, `WORKTREE_ROOT`

## Expected Output

- `packages/review-broker-server/src/cli/config.ts` — new config management module with `readConfig`, `writeConfig`, `setConfigValue`
- `packages/review-broker-server/src/cli/tandem.ts` — modified with `config show` and `config set` handlers, updated help text
- `packages/review-broker-server/test/config.test.ts` — new unit test file for config module
- `packages/review-broker-server/test/tandem-cli.test.ts` — modified with config smoke tests

## Observability Impact

- **New inspection surface:** `tandem config show --json` provides machine-readable config state. Agents can verify config persistence by running `config set` then `config show --json` and checking the output.
- **Failure visibility:** Missing `<key>` or `<value>` arguments for `config set` emit an `Error:` message to stderr and set `process.exitCode = 1`. Agents detect this via exit code and stderr pattern matching.
- **No new background processes or async flows** — config read/write is synchronous file I/O.
