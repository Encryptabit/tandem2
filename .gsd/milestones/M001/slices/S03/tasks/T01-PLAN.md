---
estimated_steps: 4
estimated_files: 7
skills_used:
  - gsd
  - review
  - test
---

# T01: Freeze reviewer lifecycle contracts and audit vocabulary

**Slice:** S03 — Reviewer lifecycle and recovery
**Milestone:** M001

## Description

Define the reviewer lifecycle contract in `review-broker-core` before server work begins. This task gives S03 one canonical vocabulary for reviewer records, spawn/list/kill operations, reviewer-state versions, and reviewer-specific audit events so later runtime, client, and MCP work do not reinvent the surface.

## Steps

1. Extend `packages/review-broker-core/src/domain.ts` and `packages/review-broker-core/src/domain.js` with reviewer lifecycle vocabulary, including reviewer-global audit event types and the shared reviewer record fields S03 needs for status, liveness, launch metadata, and a derived `currentReviewId` view.
2. Add reviewer request/response schemas in `packages/review-broker-core/src/contracts.ts` and `packages/review-broker-core/src/contracts.js` for `spawnReviewer`, `listReviewers`, and `killReviewer`, reusing versioned list semantics where appropriate.
3. Export the reviewer lifecycle surface through `packages/review-broker-core/src/index.ts` and `packages/review-broker-core/src/index.js`, keeping the checked-in runtime `.js` siblings synchronized with the `.ts` source files.
4. Add `packages/review-broker-core/test/reviewer-contracts.test.ts` to freeze the reviewer payload shapes, derived assignment field, and reviewer audit vocabulary expected by the server package.

## Must-Haves

- [ ] Reviewer lifecycle operations have explicit shared schemas and exported types instead of server-local payload definitions.
- [ ] Reviewer assignment remains a shared response field derived from broker state (`currentReviewId` / reviewer status), not a second persisted assignment source of truth.
- [ ] The focused core test fails if later work changes reviewer payloads or reviewer audit event names without updating the shared contract deliberately.

## Verification

- `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 exec vitest run packages/review-broker-core/test/reviewer-contracts.test.ts`
- `corepack pnpm --dir /home/cari/repos/tandem2/.gsd/worktrees/M001 --filter review-broker-core run build`

## Inputs

- `packages/review-broker-core/src/domain.ts` — current shared review/reviewer vocabulary to extend.
- `packages/review-broker-core/src/domain.js` — runtime JS sibling that must stay in sync with the TypeScript source.
- `packages/review-broker-core/src/contracts.ts` — existing zod schema surface that currently stops at review lifecycle operations.
- `packages/review-broker-core/src/contracts.js` — runtime JS schema file used by tests/imports.
- `packages/review-broker-core/src/index.ts` — shared export surface for downstream packages.
- `packages/review-broker-core/src/index.js` — runtime JS export surface.
- `.gsd/milestones/M001/slices/S03/S03-PLAN.md` — slice goal, must-haves, and verification target.

## Expected Output

- `packages/review-broker-core/src/domain.ts` — reviewer lifecycle domain vocabulary and audit event additions.
- `packages/review-broker-core/src/domain.js` — synchronized runtime JS for the reviewer vocabulary.
- `packages/review-broker-core/src/contracts.ts` — reviewer spawn/list/kill schemas and types.
- `packages/review-broker-core/src/contracts.js` — synchronized runtime JS reviewer schemas.
- `packages/review-broker-core/src/index.ts` — exported reviewer contract surface.
- `packages/review-broker-core/src/index.js` — synchronized runtime JS export surface.
- `packages/review-broker-core/test/reviewer-contracts.test.ts` — focused contract proof for reviewer payloads.

## Observability Impact

- Signals added or frozen here: shared reviewer lifecycle schema fields (`status`, `currentReviewId`, launch/exit timestamps, pid/exit metadata), reviewer list versioning/topic names, and reviewer-global `reviewer.*` audit event vocabulary.
- How future agents inspect this task: run `packages/review-broker-core/test/reviewer-contracts.test.ts`, read the exported enums/schemas in `src/domain.ts` and `src/contracts.ts`, and confirm downstream packages import reviewer contracts from `review-broker-core` instead of redefining payloads locally.
- Failure state that becomes visible: contract drift on reviewer payload fields, renamed reviewer audit events, or accidental persistence of reviewer assignment as a second source of truth will fail schema parsing or the focused contract test immediately.
