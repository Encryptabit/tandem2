# M007 Context: Pi-native reviewer agent

## What This Milestone Is

Port the reviewer from "spawn a subprocess and hope it reviews" to "run an in-process pi-mono agent that calls broker methods directly as tools." The review-broker becomes its own agent harness — same SDK that gsd is built on, but purpose-built for code review.

## Why Pi-Mono, Not GSD or Raw Claude

- **GSD** is a full coding agent with project management, git, filesystem tools, extensions, TUI, etc. A reviewer doesn't need any of that. Using gsd as the reviewer spawns a heavyweight process with 50+ tools when the reviewer only needs 5.
- **Raw `claude --print`** has no tool use. The reviewer needs to call broker operations (claim, read proposal, submit verdict).
- **Pi-mono SDK** (`@gsd/pi-agent-core` + `@gsd/pi-ai`) gives exactly what's needed: an Agent class with a tool execution loop, Anthropic provider with streaming, and nothing else. The reviewer agent registers 5 broker tools and runs a single prompt.

## Key SDK Surfaces

| Package | What It Provides |
|---------|-----------------|
| `@gsd/pi-ai` | `getModel("anthropic", "claude-opus-4-6")`, `streamSimple`, API key from `ANTHROPIC_API_KEY` env |
| `@gsd/pi-agent-core` | `Agent` class, `AgentTool` interface (TypeBox schemas), `agent.prompt()`, event streaming |

## Architecture

```
Pool Manager (M006)
  └── createReviewerAgent(brokerService, config)
        └── new Agent({
              model: getModel("anthropic", config.model),
              tools: [claimReviewTool, getProposalTool, submitVerdictTool, ...],
              systemPrompt: REVIEWER_SYSTEM_PROMPT
            })
        └── agent.prompt("Review the next pending review.")
        └── agent events → JSONL log writer
```

The agent runs in-process as an async task. No child process, no PID, no SIGTERM. Cancellation via `AbortController.abort()`. The pool tracks agent promises instead of process handles.

## What Changes From M006

| M006 (subprocess model) | M007 (in-process agent model) |
|------------------------|------------------------------|
| `spawn(command, args)` | `createReviewerAgent()` + `agent.prompt()` |
| PID-based alive check | Promise-based completion tracking |
| SIGTERM to stop | `AbortController.abort()` |
| stdout/stderr pipe capture | Agent event subscription → JSONL |
| MCP server per reviewer | Direct `BrokerService` method calls |
| Exit code / signal | Promise resolution / rejection |

The M06 subprocess spawn path remains for non-pool reviewers (manual `tandem reviewers spawn --command`). The pool manager gains a parallel path for agent-backed reviewers.

## Config Extension

```json
{
  "reviewer_pool": {
    "max_pool_size": 3,
    "scaling_ratio": 1,
    "model": "claude-opus-4-6",
    "provider": "anthropic",
    ...existing fields...
  }
}
```

When `model` + `provider` are set in pool config, the pool spawns in-process agents. When absent, it falls back to the subprocess spawn path.

## Constraints

- Must not break the existing subprocess spawn path — it's still useful for custom reviewer commands.
- API key comes from `ANTHROPIC_API_KEY` env — no OAuth, no config wizard.
- TypeBox schemas for tool parameters, not Zod (pi-mono convention). The existing Zod schemas in broker-core remain authoritative; the TypeBox schemas are a parallel definition for the agent tool interface.
- The reviewer agent is stateless per review — one prompt, one review, exit. No persistent session.
