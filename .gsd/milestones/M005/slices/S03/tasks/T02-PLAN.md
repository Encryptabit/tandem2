---
estimated_steps: 5
estimated_files: 4
skills_used: []
---

# T02: Implement `reviewers spawn` with provider resolution and tests

**Slice:** S03 — Create, spawn, kill, and dashboard commands
**Milestone:** M005

## Description

Add the `reviewers spawn` command with dual-mode support: explicit `--command <cmd>` with optional `--args`/`--cwd`, or config-based `--provider <name>` which resolves a provider template from the config file. This requires a new `resolveProvider()` function in `config.ts` that reads the config, validates the provider entry, and returns `{ command, args }`. The handler follows the established S01/S02 pattern but adds the provider resolution layer.

## Steps

1. **Add `resolveProvider()` to `packages/review-broker-server/src/cli/config.ts`:**
   - Add a new exported function: `export function resolveProvider(configPath: string, providerName: string): { command: string; args?: string[] }`.
   - Implementation: call `readConfig(configPath)` → navigate to `reviewer.providers.<providerName>` in the config object (checking that `reviewer` is an object, then `reviewer.providers` is an object, then the named provider exists). Validate the provider entry has a `command` key (string). Extract optional `args` key (string array). Return `{ command, args }`.
   - If the provider is not found, throw: `Error: Unknown provider "${providerName}". No provider configured at "reviewer.providers.${providerName}".`
   - If the provider entry is missing `command`, throw: `Error: Provider "${providerName}" is missing required "command" field.`

2. **Add `handleReviewersSpawn` handler to `packages/review-broker-server/src/cli/tandem.ts`:**
   - Import `resolveProvider` from `./config.js`.
   - Create `async function handleReviewersSpawn(rest, runtime, options)` that:
     - Parses `--command` (via `extractFlagWithEquals`), `--provider` (via `extractFlagWithEquals`), `--args` (via `extractFlagWithEquals`), `--cwd` (via `extractFlagWithEquals`).
     - If neither `--command` nor `--provider` is given, throw: `Error: Either --command or --provider is required for "reviewers spawn".`
     - If `--provider` is given (and no `--command`): call `resolveProvider(runtime.context.configPath, provider)` to get `{ command, args }`.
     - If `--command` is given: use it directly. Parse `--args` as comma-separated string into an array if provided.
     - Call `await runtime.service.spawnReviewer({ command, args, cwd })`.
     - Output with `formatJson` (if `--json`) or `formatDetail` showing Reviewer ID, Status, Command, PID fields.

3. **Wire into dispatch and update help:**
   - In the `'reviewers'` switch case (already modified by T01 to include `kill`), add `case 'spawn': await handleReviewersSpawn(rest, runtime, options); return;`.
   - Add `SUBCOMMAND_HELP` entry for `'reviewers spawn'` showing both modes.
   - Update `printUsage()` to list `reviewers spawn`.

4. **Add `resolveProvider` unit tests to `packages/review-broker-server/test/config.test.ts`:**
   - Import `resolveProvider` from the config module.
   - Test: resolves a configured provider with command and args.
   - Test: resolves a configured provider with command only (no args).
   - Test: throws for unknown provider name.
   - Test: throws for provider missing `command` field.

5. **Add CLI smoke tests to `packages/review-broker-server/test/tandem-cli.test.ts`:**
   - **Explicit `--command` spawn:** `runTandem(['reviewers', 'spawn', '--command', process.execPath, '--args', path.join('packages', 'review-broker-server', 'test', 'fixtures', 'reviewer-worker.mjs'), '--json', '--db-path', dbPath])` → verify JSON output has `reviewer.reviewerId` and `reviewer.status`. **Remember to clean up spawned processes** — the reviewer worker must be killed in `afterAll` or the test hangs. Use the `runTandem` helper with `reviewers kill <id>` to clean up, or track the PID for direct kill.
   - **`--provider` spawn:** First seed config with `setConfigValue(configFilePath, 'reviewer.providers.test-provider.command', process.execPath)` and `setConfigValue(configFilePath, 'reviewer.providers.test-provider.args', JSON.stringify([...]))`. Then run `runTandemWithConfig(['reviewers', 'spawn', '--provider', 'test-provider', '--json', '--db-path', dbPath])` → verify reviewer created. **Important:** Provider config stores args as a JSON-stringified array — `resolveProvider` must handle this (parse if string, use directly if array).
   - **Error: no command or provider:** verify exit code non-zero, stderr contains `Either --command or --provider`.
   - **Error: unknown provider:** verify exit code non-zero, stderr contains `Unknown provider`.
   - **Help test:** verify `tandem --help` lists `reviewers spawn`.

## Must-Haves

- [ ] `resolveProvider(configPath, providerName)` reads config, navigates to `reviewer.providers.<name>`, validates `command` field, returns `{ command, args }`
- [ ] `handleReviewersSpawn` supports dual mode: `--command` (explicit) and `--provider` (config lookup)
- [ ] Descriptive errors for: missing both flags, unknown provider, provider without `command`
- [ ] Wired into dispatch with `SUBCOMMAND_HELP` and `printUsage()` updated
- [ ] Unit tests for `resolveProvider` in `config.test.ts`
- [ ] Smoke tests for both spawn modes and error cases

## Verification

- `cd packages/review-broker-server && npx vitest run test/tandem-cli.test.ts test/config.test.ts` — all tests pass including new spawn and resolveProvider tests.
- `resolveProvider` correctly navigates nested config objects and validates required fields.
- Spawned reviewer processes are cleaned up in test teardown (no hanging processes).

## Inputs

- `packages/review-broker-server/src/cli/tandem.ts` — modified by T01 with `reviews create` and `reviewers kill` handlers, dispatch routing updated
- `packages/review-broker-server/src/cli/config.ts` — existing config module with `readConfig`, `writeConfig`, `setConfigValue`
- `packages/review-broker-server/test/tandem-cli.test.ts` — modified by T01 with create/kill tests
- `packages/review-broker-server/test/config.test.ts` — existing 10 config unit tests
- `packages/review-broker-server/test/fixtures/reviewer-worker.mjs` — existing reviewer worker fixture for spawning test reviewers

## Expected Output

- `packages/review-broker-server/src/cli/config.ts` — modified with `resolveProvider()` export
- `packages/review-broker-server/src/cli/tandem.ts` — modified with `handleReviewersSpawn`, dispatch routing, SUBCOMMAND_HELP, updated printUsage
- `packages/review-broker-server/test/config.test.ts` — modified with ~4 new `resolveProvider` unit tests
- `packages/review-broker-server/test/tandem-cli.test.ts` — modified with ~4 new spawn smoke tests
