# Tandem2 Standalone Broker Starting Point

Date: 2026-03-21

This repo is intended to become the home of the new broker.

## Core Direction

Build `tandem2` as a standalone TypeScript broker on Pi SDK concepts, not as logic embedded inside a `gsd-2` fork.

The shape to aim for:

- standalone broker/runtime
- shared domain types across server/client/dashboard/tests
- adapter-based integration for workflow-specific context
- explicit but thin `gsd-2` integration for review gating

## Why This Direction Still Looks Right

This combines two lines of thinking that now agree:

- the earlier `review-broker-ts-standalone.md` vision
- the more recent code-level inspection of `gsd-tandem` and `gsd-2`

The stable conclusions are:

- standalone TS broker is the right host boundary
- preserve the broker’s lifecycle semantics first
- use shared types instead of re-describing contracts in each client
- keep dashboard/UI as a thin client over broker state
- keep broker state, audit log, queue state, and reviewer lifecycle as first-class primitives

## Current Broker Contract To Preserve First

The current Python broker in `gsd-tandem` already exposes a review lifecycle that tandem workflows depend on.

Important operations to preserve initially:

- `create_review`
- `claim_review`
- `submit_verdict`
- `close_review`
- `accept_counter_patch`
- `reject_counter_patch`
- `get_review_status`
- `get_proposal`
- `add_message`
- `get_discussion`
- `get_activity_feed`
- `list_reviews`
- `list_reviewers`
- `spawn_reviewer`
- `kill_reviewer`

For the first rewrite iteration, compatibility is more important than redesign.

## Recommended Package Shape

- `packages/review-broker-core`
  - domain types
  - validation
  - state machine
  - queue logic
  - audit/event model
- `packages/review-broker-server`
  - HTTP/MCP server
  - persistence
  - reviewer orchestration
- `packages/review-broker-client`
  - typed SDK for `gsd-2`, dashboard, CLI, tests
- `packages/review-broker-dashboard`
  - UI only
- `packages/review-broker-adapter-gsd`
  - `.gsd` artifact resolution
  - unit metadata mapping
  - integration helpers

## `gsd-2` Integration Findings

`gsd-2` should integrate with the standalone broker, but not host it.

Important constraints:

- `gsd-2` already supports external MCP servers
- MCP is useful as a public integration surface
- MCP is not the best deterministic gate mechanism for internal workflow control
- `gsd-2` should likely use a direct typed client for mechanical review gates
- hard workflow gating currently requires a thin patch to the bundled `gsd` extension

So the intended integration shape is:

- standalone broker server
- direct typed client for `gsd-2` runtime integration
- optional MCP exposure for LLM/manual/tooling access

## Important Runtime Constraint

The current `gsd-2` auto pipeline commits before its verification gate.

That means:

- review before progression is straightforward
- review before commit requires a pipeline refactor

## First Iteration Decision

Keep the current post-commit review flow for the first iteration.

That means:

- the interactive/runtime flow can submit diffs from already-submitted code
- no immediate `gsd-2` pipeline refactor is required
- the first integrated gate is review before progression, not review before commit

Accepted tradeoff for v1:

- rejected review chains will produce follow-up fix commits

This is acceptable for now because it preserves current behavior while avoiding the most invasive integration work up front.

## Migration Priorities

1. Freeze current broker behavior in tests.
2. Extract a written domain spec from the Python broker.
3. Implement shared TS domain types and state machine.
4. Rebuild the broker server with SQLite parity.
5. Add a direct TS client.
6. Integrate with `gsd-2` for manual review flows and then review-before-progression gating.
7. Revisit review-before-commit only after the system is stable.

## Working Summary

The current recommendation is:

- standalone broker: yes
- `gsd-2` fork as broker host: no
- shared client/types: yes
- MCP support: yes
- MCP as primary deterministic gate path: no
- first integrated gating mode: post-commit review before progression
- pre-commit review: later, if worth the refactor

