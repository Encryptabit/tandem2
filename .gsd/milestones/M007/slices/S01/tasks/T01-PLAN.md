---
estimated_steps: 4
estimated_files: 2
skills_used: []
---

# T01: Wire @gsd/pi-agent-core and @gsd/pi-ai as link dependencies

**Slice:** S01 — Pi-mono integration and reviewer agent tools
**Milestone:** M007

## Description

Add `@gsd/pi-agent-core` and `@gsd/pi-ai` as `link:` dependencies to `review-broker-server/package.json`, pointing to the globally installed gsd-pi monorepo packages. Run `pnpm install` to resolve. Update `tsup.config.ts` to mark both packages as external so they are not bundled. Verify import resolution works.

This is pure dependency wiring — no application code is written. It retires the "pi-mono as a library" and "API key resolution" risks from the roadmap by proving the packages import correctly in this workspace.

## Steps

1. Edit `packages/review-broker-server/package.json` — add to `"dependencies"`:
   ```json
   "@gsd/pi-agent-core": "link:/home/cari/.nvm/versions/node/v22.19.0/lib/node_modules/gsd-pi/packages/pi-agent-core",
   "@gsd/pi-ai": "link:/home/cari/.nvm/versions/node/v22.19.0/lib/node_modules/gsd-pi/packages/pi-ai"
   ```
   These MUST be absolute paths — relative `link:` paths break in git worktrees.

2. Run `pnpm install` from the workspace root (`/home/cari/repos/tandem2/.gsd/worktrees/M007`). Confirm no errors.

3. Edit `packages/review-broker-server/tsup.config.ts` — add `external: ['@gsd/pi-agent-core', '@gsd/pi-ai']` to **both** config entries (the CLI entry and the index entry). These packages must NOT be bundled because:
   - `@gsd/pi-ai` has provider registration side effects (`import "./providers/register-builtins.js"`) that break when bundled
   - They have heavy transitive dependencies (`@anthropic-ai/sdk`, `@sinclair/typebox`, `ajv`) resolved from gsd-pi's own `node_modules`

4. Verify imports resolve:
   ```bash
   cd packages/review-broker-server && node -e "import('@gsd/pi-agent-core').then(m => console.log('Agent:', typeof m.Agent))"
   cd packages/review-broker-server && node -e "import('@gsd/pi-ai').then(m => console.log('Type:', typeof m.Type, 'getModel:', typeof m.getModel))"
   ```

## Must-Haves

- [ ] `@gsd/pi-agent-core` is a `link:` dependency with absolute path to gsd-pi monorepo
- [ ] `@gsd/pi-ai` is a `link:` dependency with absolute path to gsd-pi monorepo
- [ ] `pnpm install` completes without errors
- [ ] Both tsup config entries have `external: ['@gsd/pi-agent-core', '@gsd/pi-ai']`
- [ ] `import('@gsd/pi-agent-core')` resolves and exports `Agent` class
- [ ] `import('@gsd/pi-ai')` resolves and exports `Type`, `getModel`, `StringEnum`

## Verification

- `cd packages/review-broker-server && node -e "import('@gsd/pi-agent-core').then(m => console.log('Agent:', typeof m.Agent))"` prints `Agent: function`
- `cd packages/review-broker-server && node -e "import('@gsd/pi-ai').then(m => console.log('Type:', typeof m.Type, 'getModel:', typeof m.getModel))"` prints `Type: function getModel: function`
- `pnpm install` exit code 0

## Inputs

- `packages/review-broker-server/package.json` — existing package.json to modify
- `packages/review-broker-server/tsup.config.ts` — existing tsup config to modify

## Expected Output

- `packages/review-broker-server/package.json` — updated with `@gsd/pi-agent-core` and `@gsd/pi-ai` link deps
- `packages/review-broker-server/tsup.config.ts` — updated with external declarations for pi packages

## Observability Impact

- **Signals changed:** No new runtime signals — this task is pure dependency wiring. However, `pnpm install` adds 467 transitive packages from gsd-pi, making `pnpm ls @gsd/pi-agent-core @gsd/pi-ai` a diagnostic surface for verifying link resolution.
- **Inspection:** `cd packages/review-broker-server && node -e "import('@gsd/pi-agent-core').then(m => console.log('Agent:', typeof m.Agent))"` confirms the pi-agent-core link is resolvable at runtime. Same pattern for `@gsd/pi-ai`.
- **Failure visibility:** If the link paths break (e.g., gsd-pi is upgraded or moved), `pnpm install` will error with `ERR_PNPM_LINKING_FAILED` and any `import('@gsd/...')` calls will throw `ERR_MODULE_NOT_FOUND`.
