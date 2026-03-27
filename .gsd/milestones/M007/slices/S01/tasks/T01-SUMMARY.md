---
id: T01
parent: S01
milestone: M007
provides:
  - "@gsd/pi-agent-core link dependency wired into review-broker-server"
  - "@gsd/pi-ai link dependency wired into review-broker-server"
  - "tsup external declarations preventing pi packages from being bundled"
key_files:
  - packages/review-broker-server/package.json
  - packages/review-broker-server/tsup.config.ts
key_decisions:
  - "Absolute link: paths used for pi packages — relative paths break in git worktrees"
patterns_established:
  - "link: deps to gsd-pi monorepo packages use absolute paths to the globally installed gsd-pi under ~/.nvm"
  - "pi packages must be marked external in tsup to avoid bundling provider side-effects and heavy transitive deps"
observability_surfaces:
  - "node -e import check for @gsd/pi-agent-core and @gsd/pi-ai verifies link resolution"
  - "pnpm ls @gsd/pi-agent-core @gsd/pi-ai shows link status"
duration: 8m
verification_result: passed
completed_at: 2026-03-26
blocker_discovered: false
---

# T01: Wire @gsd/pi-agent-core and @gsd/pi-ai as link dependencies

**Added @gsd/pi-agent-core and @gsd/pi-ai as link: dependencies to review-broker-server with absolute paths, marked both external in tsup, and verified import resolution**

## What Happened

Added both pi-mono packages as `link:` dependencies in `packages/review-broker-server/package.json`, pointing to the globally installed gsd-pi monorepo at `/home/cari/.nvm/versions/node/v22.19.0/lib/node_modules/gsd-pi/packages/`. Ran `pnpm install` which resolved successfully, pulling in 467 transitive packages. Updated both tsup config entries (CLI and index) with `external: ['@gsd/pi-agent-core', '@gsd/pi-ai']` to prevent bundling. Verified all three key exports resolve: `Agent` (function), `Type` (object), `getModel` (function), and `StringEnum` (function).

## Verification

- `pnpm install` exit code 0 — 467 packages added from pi-mono transitive deps
- `import('@gsd/pi-agent-core')` resolves — `Agent: function`
- `import('@gsd/pi-ai')` resolves — `Type: object`, `getModel: function`, `StringEnum: function`
- Both tsup config entries have `external` array including both pi packages
- Slice-level test (`reviewer-agent.test.ts`) does not exist yet (T03 deliverable) — expected

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `pnpm install` | 0 | ✅ pass | 1.8s |
| 2 | `node -e "import('@gsd/pi-agent-core').then(m => console.log('Agent:', typeof m.Agent))"` | 0 | ✅ pass | <1s |
| 3 | `node -e "import('@gsd/pi-ai').then(m => console.log('Type:', typeof m.Type, 'getModel:', typeof m.getModel))"` | 0 | ✅ pass | <1s |
| 4 | `node -e "import('@gsd/pi-ai').then(m => console.log('StringEnum:', typeof m.StringEnum))"` | 0 | ✅ pass | <1s |
| 5 | `pnpm vitest run packages/review-broker-server/test/reviewer-agent.test.ts` | 1 | ⏭️ skip (T03) | <1s |

## Diagnostics

- **Import health:** `cd packages/review-broker-server && node -e "import('@gsd/pi-agent-core').then(m => console.log('OK'))"` — prints OK if link is healthy
- **Link status:** `pnpm ls @gsd/pi-agent-core @gsd/pi-ai` from workspace root shows resolved link targets
- **Failure mode:** If gsd-pi is moved or upgraded, `import()` will throw `ERR_MODULE_NOT_FOUND` and `pnpm install` will fail with `ERR_PNPM_LINKING_FAILED`

## Deviations

- Plan stated `Type: function` but actual runtime type is `Type: object` — this is correct behavior (TypeBox `Type` is a namespace object with methods like `Type.String()`, not a constructor). No code change needed; downstream T02 will use it as an object.

## Known Issues

None.

## Files Created/Modified

- `packages/review-broker-server/package.json` — added `@gsd/pi-agent-core` and `@gsd/pi-ai` as `link:` dependencies with absolute paths
- `packages/review-broker-server/tsup.config.ts` — added `external: ['@gsd/pi-agent-core', '@gsd/pi-ai']` to both config entries
