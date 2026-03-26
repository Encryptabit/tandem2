# S02 — Research

**Date:** 2026-03-25

## Summary

S02 adds two independent pieces to the existing CLI scaffold: (1) config management (`tandem config show`, `tandem config set <key> <value>`), and (2) write commands that wrap existing `BrokerService` methods (`claim`, `close`, `verdict`, `reclaim`, `discussion add`, `proposal accept`, `proposal reject`). 

The write commands are straightforward — each one parses a few flags/args, calls one service method, and formats the response. They follow the exact same handler pattern as the 7 read commands already in `tandem.ts`. The only novelty is config management: no config file is read or written anywhere today. The `configPath` is resolved to `.gsd/review-broker/config.json` by `path-resolution.ts` and stored on `AppContext`, but nothing uses it. S02 must create the config read/write logic, define the config schema, and add the `config show`/`config set` CLI handlers.

Both pieces are low-risk because the patterns are fully established by S01 and the service methods are already typed and tested. Config management is the most novel part, but it's simple JSON file I/O with `fs.readFileSync`/`fs.writeFileSync` and `mkdirSync`.

## Recommendation

Split the work into two independent tracks that merge into the existing `tandem.ts`:

1. **Config management module** — A new `config.ts` file in `packages/review-broker-server/src/cli/` (or `src/runtime/`) that reads/writes the JSON config file at `context.configPath`. Keep the config schema simple — a flat-ish JSON object. `config show` dumps the current file (or reports "no config file"). `config set` does dot-path key assignment (e.g. `reviewer.provider` → `{ reviewer: { provider: "anthropic" } }`). Build config first because S03 depends on it for provider resolution.

2. **Write command handlers** — Add `case` branches to the existing `dispatch()` switch in `tandem.ts` for each write command. Each handler follows the established pattern: parse args → call `service.method()` → format response with `formatDetail()` or `formatJson()`. Add corresponding `SUBCOMMAND_HELP` entries and tests.

## Implementation Landscape

### Key Files

- `packages/review-broker-server/src/cli/tandem.ts` — The CLI entrypoint (693 lines). Write commands add new `case` branches in the `dispatch()` switch under `"reviews"`, `"discussion"`, and `"proposal"` nouns. The `"config"` noun is a new top-level case. Imports need `REVIEW_VERDICTS` from `review-broker-core`.
- `packages/review-broker-server/src/cli/format.ts` — Output formatting (76 lines). No changes needed — `formatDetail()` and `formatJson()` already cover all write command output needs.
- `packages/review-broker-server/src/runtime/path-resolution.ts` — Resolves `configPath` to `.gsd/review-broker/config.json`. Already works, no changes needed.
- `packages/review-broker-server/src/runtime/app-context.ts` — Stores `configPath` and `configPathSource` on the context. Already works, no changes needed.
- `packages/review-broker-core/src/domain.ts` — Exports `REVIEW_VERDICTS` (`['changes_requested', 'approved']`), needed for `--verdict` flag validation.
- `packages/review-broker-core/src/contracts.ts` — Defines request/response schemas for all write operations. Key shapes:
  - `ClaimReviewRequest`: `{ reviewId, claimantId }`
  - `ReclaimReviewRequest`: `{ reviewId, actorId }`
  - `SubmitVerdictRequest`: `{ reviewId, actorId, verdict, reason }`
  - `CloseReviewRequest`: `{ reviewId, actorId }`
  - `AddMessageRequest`: `{ reviewId, actorId, body }`
  - `AcceptCounterPatchRequest`: `{ reviewId, actorId, note? }`
  - `RejectCounterPatchRequest`: `{ reviewId, actorId, note? }`
- `packages/review-broker-server/test/tandem-cli.test.ts` — Existing test file (12 smoke tests). Add write command tests here, extending the existing `seedTestData` setup or adding new seed steps in `beforeAll`.
- `packages/review-broker-server/test/test-paths.ts` — Already exports `TANDEM_CLI_PATH`, `TSX_PATH`, `WORKTREE_ROOT`.

### Write Command → Service Method Mapping

| CLI Command | Service Method | Required Args | Flags |
|---|---|---|---|
| `reviews claim <id>` | `claimReview({ reviewId, claimantId })` | `<id>` | `--actor <id>` (required) |
| `reviews reclaim <id>` | `reclaimReview({ reviewId, actorId })` | `<id>` | `--actor <id>` (required) |
| `reviews verdict <id>` | `submitVerdict({ reviewId, actorId, verdict, reason })` | `<id>` | `--actor`, `--verdict` (approved\|changes_requested), `--reason` (all required) |
| `reviews close <id>` | `closeReview({ reviewId, actorId })` | `<id>` | `--actor <id>` (required) |
| `discussion add <id>` | `addMessage({ reviewId, actorId, body })` | `<id>` | `--actor`, `--body` (both required) |
| `proposal accept <id>` | `acceptCounterPatch({ reviewId, actorId, note? })` | `<id>` | `--actor` (required), `--note` (optional) |
| `proposal reject <id>` | `rejectCounterPatch({ reviewId, actorId, note? })` | `<id>` | `--actor` (required), `--note` (optional) |

### Config Schema Design

The config file doesn't exist yet. The minimal schema S02 needs to prove:

```json
{
  "reviewer": {
    "provider": "anthropic"
  }
}
```

S03 will extend this with provider templates (command templates, default args). S02 just needs to prove that `config set reviewer.provider anthropic` persists a value and `config show` reads it back. The config module should:
- Read: `JSON.parse(readFileSync(configPath, 'utf8'))` with a fallback to `{}` if the file doesn't exist.
- Write: deep-set the dot-path key, `mkdirSync` the parent directory, `writeFileSync` the JSON.
- The config path comes from `runtime.context.configPath` — already resolved.

### Build Order

1. **Config module first** — Create a `readConfig(configPath)` / `writeConfig(configPath, data)` / `setConfigValue(configPath, dotKey, value)` utility module. This is the only novel code. Test it in isolation (unit test for read/write/set). S03 depends on config existing.
2. **`config show` and `config set` handlers** — Wire into `tandem.ts` dispatch as a new `"config"` noun case. These are the simplest handlers — they don't need `BrokerService`, just `runtime.context.configPath`.
3. **Write command handlers** — Add all 7 write commands to `tandem.ts`. These are independent of config and of each other. Each is ~20-30 lines following the exact read-command pattern.
4. **Tests** — Add smoke tests for config commands and each write command. The test seed needs to create a review in the right state (e.g. claimed, with a counter-patch) to exercise verdict/close/accept/reject.

### Verification Approach

1. **Unit tests for config module** — Read/write/set against a temp file. Verify dot-path nesting, file creation, and read of non-existent file.
2. **CLI smoke tests** — Extend the existing `tandem-cli.test.ts`:
   - `tandem config set reviewer.provider anthropic --db-path <temp>` → exit 0
   - `tandem config show --json --db-path <temp>` → JSON output contains `reviewer.provider: "anthropic"`
   - `tandem reviews claim <id> --actor cli-user --json --db-path <temp>` → exit 0, response has `outcome`
   - `tandem reviews verdict <id> --actor cli-user --verdict approved --reason "LGTM" --json --db-path <temp>` → exit 0
   - `tandem reviews close <id> --actor cli-user --json --db-path <temp>` → exit 0
   - `tandem discussion add <id> --actor cli-user --body "test message" --json --db-path <temp>` → exit 0
   - `tandem proposal accept <id> --actor cli-user --json --db-path <temp>` (needs a review with `counter_patch_status: pending`)
   - Error cases: missing `--actor`, missing `--verdict`, invalid verdict value
3. **Manual check** — `npx vitest run test/tandem-cli.test.ts` passes all old + new tests.

## Constraints

- The `config` commands need `runtime.context.configPath` but do NOT need `runtime.service` — they operate on the filesystem, not the database. However, `startBroker()` is currently the only way to get the `configPath`. The config handlers should still go through the normal broker startup to keep the pattern uniform (the DB open is cheap for SQLite).
- All write service methods require an `actorId` field. The CLI must accept `--actor <id>` on every write command. There is no default actor — it must be explicitly provided.
- `submitVerdict` requires `verdict` from the enum `['changes_requested', 'approved']` and a non-empty `reason` string. These should be validated before calling the service method, following the `extractStatusFlag` pattern.
- `addMessage` requires a non-empty `body`. Same for `submitVerdict`'s `reason`. The Zod schemas enforce `.trim().min(1)`.
- The config file parent directory (`.gsd/review-broker/`) may not exist yet — must `mkdirSync({ recursive: true })` before writing.
- The `--cwd` flag affects `configPath` resolution via `workspaceRoot` detection. Config commands respect this naturally because `startBroker({ cwd })` passes it through to `resolveBrokerPaths`.

## Common Pitfalls

- **Test seed state machine** — To test `verdict` and `close`, the review must be in `in_review` status (claimed). The `beforeAll` seed creates a `pending` review. The test needs to `claimReview()` first, then exercise verdict/close. Order matters — these are state-machine transitions.
- **Counter-patch test setup** — To test `proposal accept`/`reject`, a review needs `counterPatchStatus: 'pending'`. This requires submitting a `changes_requested` verdict first, which transitions the review to a state where a counter-patch can be submitted. The test seed needs to walk the state machine: create → claim → verdict(changes_requested) → (counter-patch would need to be submitted). This may be complex to set up; consider testing accept/reject against the service error case or skipping the counter-patch test if the state machine setup is too involved.
- **`config set` dot-path handling** — Setting `reviewer.provider` needs to create nested objects: `{ reviewer: { provider: "value" } }`. A simple `key.split('.')` + recursive object creation handles this, but edge cases (overwriting a scalar with an object) should be handled gracefully.
