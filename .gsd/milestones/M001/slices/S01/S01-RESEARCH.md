# Broker core runtime with durable state — Research

**Date:** 2026-03-21

## Summary

This slice directly owns **R002** and **R003**, and materially advances **R001**. The current repo is greenfield: only `docs/standalone-broker-starting-point.md` exists, so the planner should treat the Python broker in `../gsd-tandem/tools/gsd-review-broker` as the compatibility source. The contract to freeze for S01 is narrower than the full milestone: create/list/claim/status/proposal + persisted review rows + durable SQLite startup/runtime behavior. The highest-value prior art is `models.py`, `state_machine.py`, `db.py`, `tools.py`, `notifications.py`, `diff_utils.py`, and the tests `test_tools.py`, `test_proposals.py`, `test_db_schema.py`, `test_polling.py`, `test_queue_wait.py`, `test_reclaim.py`, and the startup-recovery portions of `test_scaling.py`.

Primary recommendation: start with a shared TypeScript domain package and a standalone broker service package, not transport-first. Keep the Python tool names and state vocabulary intact inside a `BrokerService` interface, wire them to SQLite through explicit migrations, and make the first real proof a restart-safe integration test against a file-backed DB. This follows the prior standalone TS recommendation, preserves parity, and aligns with the loaded `best-practices` and `test` skills: use proven libraries instead of custom protocol/persistence plumbing, and translate real existing test expectations rather than inventing a new contract.

## Recommendation

Implement S01 as two packages:

1. `packages/review-broker-core` — canonical domain types, schemas, and state machine
2. `packages/review-broker-server` — SQLite-backed broker service, startup lifecycle, and entrypoint

Use a shared runtime-validation layer so server methods, later client code, and later MCP tools all consume one schema source. For SQLite, prefer `better-sqlite3` with explicit SQL migrations and WAL PRAGMAs; its transaction helpers and prepared statements map cleanly onto the Python broker’s `BEGIN IMMEDIATE` + single-writer discipline. For future MCP exposure, plan around the official `@modelcontextprotocol/typescript-sdk`, but keep S01 transport-light: this slice should prove the broker runtime and persistence first, then add typed client/MCP adapters in S04.

Match the Python contract where it matters now:

- enums/status vocabulary
- create/list/claim/get-status/get-proposal shapes
- diff validation + affected-files extraction behavior
- queue/status wait semantics via a versioned notification bus
- claim fencing fields (`claim_generation`, `claimed_at`)
- startup DB initialization with WAL + migration pass
- restart recovery tests against a real DB file

## Implementation Landscape

### Key Files

- `/home/cari/repos/gsd-tandem/tools/gsd-review-broker/src/gsd_review_broker/models.py` — compatibility source for S01 enums and audit vocabulary: `ReviewStatus`, `ReviewerStatus`, `Priority`, `CounterPatchStatus`, `Category`, `AuditEventType`.
- `/home/cari/repos/gsd-tandem/tools/gsd-review-broker/src/gsd_review_broker/state_machine.py` — minimal explicit lifecycle rules; S01 needs this logic carried over exactly before adding transport.
- `/home/cari/repos/gsd-tandem/tools/gsd-review-broker/src/gsd_review_broker/db.py` — latest SQLite schema, migration strategy, WAL/busy_timeout/foreign_keys setup, config/db path resolution, startup recovery hooks, and background checks. The important S01 pieces are `SCHEMA_SQL`, `SCHEMA_MIGRATIONS`, `ensure_schema()`, `resolve_db_path()`, `NotificationBus` wiring through `AppContext`, and `broker_lifespan()`.
- `/home/cari/repos/gsd-tandem/tools/gsd-review-broker/src/gsd_review_broker/tools.py` — compatibility source for broker method shapes. For S01, freeze `create_review`, `list_reviews`, `claim_review`, `get_review_status`, `get_proposal`, and `reclaim_review` before broader lifecycle work.
- `/home/cari/repos/gsd-tandem/tools/gsd-review-broker/src/gsd_review_broker/diff_utils.py` — parity source for `git apply --check` diff validation and affected-files extraction. Do not hand-roll diff parsing.
- `/home/cari/repos/gsd-tandem/tools/gsd-review-broker/src/gsd_review_broker/notifications.py` — exact semantics for long-poll queue/status wait; versioned topics prevent missed wakes between poll and notify.
- `/home/cari/repos/gsd-tandem/tools/gsd-review-broker/tests/test_tools.py` — baseline expectations for create/list/claim/status/close flows.
- `/home/cari/repos/gsd-tandem/tools/gsd-review-broker/tests/test_proposals.py` — baseline expectations for description/diff storage, affected-files extraction, diff validation, `get_proposal`, revision behavior, and project-scoped validation cwd.
- `/home/cari/repos/gsd-tandem/tools/gsd-review-broker/tests/test_db_schema.py` — strongest parity source for migration/idempotency expectations and DB path/config resolution behavior.
- `/home/cari/repos/gsd-tandem/tools/gsd-review-broker/tests/test_polling.py` and `/home/cari/repos/gsd-tandem/tools/gsd-review-broker/tests/test_queue_wait.py` — baseline for `wait=true` behavior on status/queue surfaces.
- `/home/cari/repos/gsd-tandem/tools/gsd-review-broker/tests/test_reclaim.py` and startup-focused cases in `/home/cari/repos/gsd-tandem/tools/gsd-review-broker/tests/test_scaling.py` — baseline for `claim_generation`, `claimed_at`, timeout reclaim, stale-session recovery, and restart semantics.

### Proposed new files

- `package.json` — root workspace + scripts for build/test/smoke.
- `pnpm-workspace.yaml` — workspace definition if using pnpm (recommended for a multi-package TS rewrite).
- `tsconfig.base.json` — shared TS compiler settings.
- `packages/review-broker-core/src/domain.ts` — exported enums, affected-file model, and audit event vocabulary.
- `packages/review-broker-core/src/contracts.ts` — shared input/output schemas and TS types for create/list/claim/status/proposal payloads.
- `packages/review-broker-core/src/state-machine.ts` — `validateTransition()` and transition table matching Python.
- `packages/review-broker-core/src/notifications.ts` — versioned `NotificationBus`.
- `packages/review-broker-server/src/db/migrations/001_init.sql` — current latest schema, not the old phase-by-phase history.
- `packages/review-broker-server/src/db/open-database.ts` — open DB, apply PRAGMAs (`journal_mode=WAL`, `busy_timeout`, `synchronous=NORMAL`, `foreign_keys=ON`), run migrations.
- `packages/review-broker-server/src/runtime/app-context.ts` — DB handle, repo root/workspace resolver, notification bus, and later reviewer-pool slot.
- `packages/review-broker-server/src/runtime/broker-service.ts` — core methods: `createReview`, `listReviews`, `claimReview`, `getReviewStatus`, `getProposal`, `reclaimReview`.
- `packages/review-broker-server/src/runtime/diff.ts` — wrapper around `git apply --check` and affected-files extraction using a diff parser.
- `packages/review-broker-server/src/runtime/path-resolution.ts` — DB/config/repo-root/workspace resolution logic, matching the Python env override precedence.
- `packages/review-broker-server/src/cli/start-broker.ts` — real standalone entrypoint that opens DB and keeps runtime alive; transport can stay minimal in S01.
- `packages/review-broker-server/test/*.test.ts` — parity-oriented tests translated from the Python suite.
- `packages/review-broker-server/test/restart-persistence.test.ts` — file-backed restart test proving data survives process reopen.

### Natural seams

1. **Domain core** — enums, schemas, transition table; isolated from persistence and transport.
2. **Persistence/migrations** — SQLite schema + DB bootstrap + repository helpers; can be built once domain types exist.
3. **Broker service methods** — transaction-wrapped create/list/claim/status/proposal/reclaim operations using the repo/persistence layer.
4. **Entrypoint + lifecycle** — repo root/db/config resolution and startup initialization.
5. **Parity tests** — translated Python expectations against the TS service, then a restart-safe file-backed integration test.

### Build Order

1. **Freeze the domain vocabulary first**  
   Port the enums/statuses/audit-event names and the transition table from `models.py` + `state_machine.py`. This unblocks every later file and directly addresses R002.
2. **Stand up SQLite bootstrap with the latest schema, not a redesign**  
   Create the `reviews`, `messages`, `audit_events`, and `reviewers` tables in their current effective shape; enable WAL and migration tracking. This is the core of R003 and makes restart tests meaningful.
3. **Implement the S01 broker service methods against file-backed SQLite**  
   Start with `createReview`, `listReviews`, `claimReview`, `getReviewStatus`, `getProposal`, and `reclaimReview`. These are the smallest contract slice that still proves “standalone broker with durable state.”
4. **Add notification/wait semantics**  
   Port the versioned `NotificationBus` after the CRUD path works. This preserves long-poll semantics without reopening the core design later.
5. **Add runtime/bootstrap and restart proof**  
   Implement DB/config path resolution, repo-root discovery, and a smokeable start command, then prove that a second runtime instance can reopen the same DB and see prior review state.
6. **Translate parity tests before expanding lifecycle scope**  
   Only after the above passes should planning spill into S02/S03 behavior.

### Verification Approach

- **Unit / contract tests**
  - translate the Python expectations from:
    - `tests/test_tools.py`
    - `tests/test_proposals.py`
    - `tests/test_db_schema.py`
    - `tests/test_polling.py`
    - `tests/test_queue_wait.py`
    - `tests/test_reclaim.py`
  - preserve payload keys and error-class behavior where practical.
- **File-backed restart test**
  - start service/runtime against a temp SQLite file
  - create + claim a review
  - stop/reopen runtime against the same file
  - assert the review row, `claim_generation`, `claimed_at`, and audit rows persist.
- **Smoke entrypoint test**
  - invoke the standalone start script against a temp DB path and assert it initializes DB/migration artifacts without needing the Python broker.
- **Observable DB assertions**
  - verify WAL + foreign_keys PRAGMAs are applied on open
  - verify `ensureSchema` is idempotent
  - verify invalid diff submissions do not create rows
  - verify claiming with a bad diff auto-rejects and records an audit event
- **Concurrency test**
  - two concurrent `claimReview()` calls against one pending review -> exactly one success, one invalid-transition/stale result. This mirrors current write-lock behavior.

## Don't Hand-Roll

| Problem | Existing Solution | Why Use It |
|---------|------------------|------------|
| SQLite transactions, PRAGMAs, prepared statements | `better-sqlite3` | Context7 docs show transaction wrappers, WAL PRAGMA support, and reusable prepared statements that map cleanly to the Python broker’s explicit write-serialization model. |
| MCP server transport (later S04) | `@modelcontextprotocol/typescript-sdk` | Official TS SDK already supports tool registration and Streamable HTTP/stdio transports; this avoids custom protocol code. |
| Unified diff parsing | `parse-diff` | `npm view` confirms it is a maintained unified diff parser; use a library instead of regex parsing affected files. |

## Constraints

- The repo is effectively greenfield today; there is no existing TS runtime to extend. Planner should budget for workspace/bootstrap files before feature code.
- Compatibility matters more than elegance in M001. Python tool names, status strings, queue semantics, and migration behavior are the contract.
- The Python broker relies on a single-writer discipline (`BEGIN IMMEDIATE` under a write lock). The TS rewrite must preserve serialized write behavior even if the transport layer is async.
- DB path/config path precedence is part of the current operational behavior: explicit env var override first, otherwise user-scoped config dir for DB, repo-local `.planning/config.json` for reviewer-pool config.
- `claim_generation` and `claimed_at` are not reviewer-lifecycle niceties; they are core claim fencing/state fields already used by reclaim/startup recovery tests.
- `NotificationBus` versioning is required for correct `wait=true` behavior; a plain event emitter can lose wakeups.

## Common Pitfalls

- **Recreating the early phase-by-phase schema history instead of the latest effective schema** — start S01 from the current effective schema shape, and only keep migration machinery needed for idempotent startup and explicit future upgrades.
- **Letting transport design lead the slice** — S01 should prove broker service behavior and restart-safe SQLite first; transport adapters can stay thin and follow later.
- **Dropping claim fencing from the core path** — `claim_generation` and `claimed_at` are already exercised by reclaim/startup recovery paths; omitting them in S01 creates rework immediately in S03.
- **Reimplementing diff parsing/validation ad hoc** — use `git apply --check` for validation and a library parser for affected files, matching the Python approach.
- **Replacing versioned wait semantics with bare async events** — `wait_for_change(sinceVersion)` semantics are necessary to avoid missed notifications between snapshot/read and wait.

## Open Risks

- The biggest execution risk is over-scoping S01 into full reviewer pool/MCP/client work. The slice only needs the durable core runtime, shared types, and restart-safe broker behavior.
- If the planner chooses an ORM/query-builder with opaque migration semantics, parity with the explicit Python schema/migration behavior may become harder to prove than using explicit SQL.
- Harness cwd mismatch: this resumed session showed the planning files in the target worktree, but `.gsd/DISCUSSION-MANIFEST.json` is missing there despite the recovery log saying it was written. That does not block S01 research, but it is a repo-state discrepancy worth keeping in mind for later workflow automation.

## Skills Discovered

| Technology | Skill | Status |
|------------|-------|--------|
| TypeScript | `wshobson/agents@typescript-advanced-types` | available |
| SQLite | `martinholovsky/claude-skills-generator@sqlite database expert` | available |
| MCP / TypeScript SDK | `modelcontextprotocol/ext-apps@create-mcp-app` | available |
| GSD workflow planning | installed `gsd` skill | installed |
| Testing discipline | installed `test` skill | installed |
| Runtime/web best-practice guardrails | installed `best-practices` skill | installed |

## Sources

- Official better-sqlite3 docs confirm transaction wrappers, prepared statements, and WAL-friendly PRAGMA usage (source: Context7 `/wiselibs/better-sqlite3`).
- Official MCP TS SDK docs confirm `registerTool()` plus Streamable HTTP transport are already available for later adapter work (source: Context7 `/modelcontextprotocol/typescript-sdk`).
- Prior TS architecture note recommends a standalone broker with shared types, separate persistence, and behavior-parity migration rather than embedding broker logic inside `gsd-2` (source: `/home/cari/repos/gsd-tandem/review-broker-ts-standalone.md`).
- Current integration findings explicitly recommend “standalone broker + direct typed client + optional MCP,” and warn not to route deterministic gates through LLM-mediated `mcp_call` (source: `/home/cari/repos/gsd-tandem/docs/gsd2-broker-integration-findings.md`).