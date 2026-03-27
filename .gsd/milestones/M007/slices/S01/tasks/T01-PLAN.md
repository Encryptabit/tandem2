---
estimated_steps: 1
estimated_files: 2
skills_used: []
---

# T01: Wire @gsd/pi-agent-core and @gsd/pi-ai as link dependencies

Add both packages as link: deps, run pnpm install, mark external in tsup

## Inputs

- None specified.

## Expected Output

- `packages/review-broker-server/package.json`
- `packages/review-broker-server/tsup.config.ts`

## Verification

node -e import check for both packages
