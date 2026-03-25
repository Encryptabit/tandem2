---
estimated_steps: 4
estimated_files: 4
skills_used:
  - gsd
  - create-gsd-extension
  - test
  - review
  - lint
---

# T03: Publish review commands in help/completions and lock discoverability regression

**Slice:** S02 — Manual review trigger and status surfaces
**Milestone:** M002

## Description

Finish the slice by making the new command surfaces discoverable and hard to accidentally remove. This task updates the `/gsd` catalog and help text for `review` and `review-status`, keeps the visible syntax aligned with the handler implementation, and adds a focused regression test for discoverability.

## Steps

1. Update `/home/cari/repos/gsd-2/src/resources/extensions/gsd/commands/catalog.ts` so `review` and `review-status` appear in `GSD_COMMAND_DESCRIPTION`, `TOP_LEVEL_SUBCOMMANDS`, and any required completion surfaces.
2. Update `/home/cari/repos/gsd-2/src/resources/extensions/gsd/commands/handlers/core.ts` so `/gsd help` documents both commands with accurate syntax and intent.
3. Keep usage strings in `/home/cari/repos/gsd-2/src/resources/extensions/gsd/commands/handlers/review.ts` synchronized with the catalog/help copy so the discoverability surface and real handler behavior do not diverge.
4. Add `/home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/review-command-discoverability.test.ts` to assert that help/completions/description surfaces keep both manual review commands visible.

## Must-Haves

- [ ] `review` and `review-status` are first-class `/gsd` commands in catalog, description, and help surfaces.
- [ ] Visible syntax and descriptions match the actual handler behavior closely enough that a human can discover and use the commands without reading source.
- [ ] A focused regression test fails if future changes silently drop the commands from help or completions.

## Verification

- `node --import /home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test /home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/review-command-discoverability.test.ts`
- `rg -n "review-status|/gsd review|/gsd help|GSD_COMMAND_DESCRIPTION" /home/cari/repos/gsd-2/src/resources/extensions/gsd/commands/catalog.ts /home/cari/repos/gsd-2/src/resources/extensions/gsd/commands/handlers/core.ts /home/cari/repos/gsd-2/src/resources/extensions/gsd/commands/handlers/review.ts`

## Inputs

- `/home/cari/repos/gsd-2/src/resources/extensions/gsd/commands/catalog.ts` — command description and completion definitions.
- `/home/cari/repos/gsd-2/src/resources/extensions/gsd/commands/handlers/core.ts` — `/gsd help` text.
- `/home/cari/repos/gsd-2/src/resources/extensions/gsd/commands/handlers/review.ts` — authoritative usage strings and command semantics from T01/T02.

## Expected Output

- `/home/cari/repos/gsd-2/src/resources/extensions/gsd/commands/catalog.ts` — review command catalog/completion entries.
- `/home/cari/repos/gsd-2/src/resources/extensions/gsd/commands/handlers/core.ts` — updated `/gsd help` text for manual review commands.
- `/home/cari/repos/gsd-2/src/resources/extensions/gsd/commands/handlers/review.ts` — synchronized usage strings and handler-visible syntax.
- `/home/cari/repos/gsd-2/src/resources/extensions/gsd/tests/review-command-discoverability.test.ts` — regression proof for command visibility.

## Observability Impact

- Signals changed: `/gsd` catalog/help output and top-level completions now expose `review` and `review-status` with syntax that matches the dedicated handler-visible usage strings.
- Inspection path: a future agent can inspect `commands/catalog.ts`, `commands/handlers/core.ts`, and `commands/handlers/review.ts`, then run `review-command-discoverability.test.ts` to confirm the visible command surface still matches the runtime contract.
- Failure visibility: if either command drops out of descriptions, completions, or `/gsd help`, the focused discoverability regression test fails immediately instead of letting the removal ship silently.
- Redaction constraint: discoverability surfaces describe only command names, accepted target shapes, and review-state intent; they must not surface task content, diff artifacts, or broker secrets.
