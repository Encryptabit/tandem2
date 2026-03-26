# M005: Interactive operator CLI

**Vision:** Ship a `tandem` CLI with full feature parity to the MCP surface — every broker operation available as a terminal subcommand — plus config management, provider-based reviewer spawning, and dashboard launch as operator conveniences.

## Success Criteria

- Every MCP tool has a corresponding CLI subcommand with equivalent functionality.
- Operators can run `tandem` from any directory inside the workspace and get readable terminal output for all broker operations.
- `tandem config` lets operators persist and inspect broker configuration (reviewer provider settings, default parameters).
- `tandem reviewer spawn --provider <name>` resolves a configured provider into the actual subprocess command.
- `tandem dashboard` builds and launches the dashboard as a convenience.
- The CLI shares the same default database as the MCP server and dashboard — all three surfaces see identical state.
- Output is human-readable for interactive use and machine-parseable (via `--json` flag) for scripting.

## Key Risks / Unknowns

- **Config schema design:** No config file exists today. The `configPath` is resolved but never read/written. Defining what goes in config is new design work.
- **Provider abstraction:** Translating a provider name into a reviewer spawn command requires a template/registry concept that doesn't exist yet.
- **Diff input for `reviews create`:** The MCP `create_review` takes a diff string. The CLI needs a practical way to accept diffs (file path, stdin pipe, or interactive).
- **Output formatting:** Needs to be readable without over-engineering. Tables for lists, structured detail for show commands, `--json` for machine consumption.
- **Binary distribution:** Making `tandem` runnable globally affects packaging but isn't required for the first iteration — `pnpm exec tandem` is fine initially.

## MCP ↔ CLI Parity Map

| MCP Tool | CLI Command | Notes |
|---|---|---|
| — | `tandem status` | Maps to `inspectBrokerRuntime`, not an MCP tool |
| `create_review` | `tandem reviews create` | Diff via `--diff-file` or stdin |
| `list_reviews` | `tandem reviews list [--status X]` | |
| `get_review_status` | `tandem reviews show <id>` | |
| `claim_review` | `tandem reviews claim <id>` | |
| `reclaim_review` | `tandem reviews reclaim <id>` | |
| `submit_verdict` | `tandem reviews verdict <id> --verdict approved\|changes_requested` | |
| `close_review` | `tandem reviews close <id>` | |
| `get_proposal` | `tandem proposal show <id>` | |
| `accept_counter_patch` | `tandem proposal accept <id>` | |
| `reject_counter_patch` | `tandem proposal reject <id>` | |
| `get_discussion` | `tandem discussion show <id>` | |
| `add_message` | `tandem discussion add <id>` | Body via `--body` or stdin |
| `get_activity_feed` | `tandem activity <id>` | |
| `spawn_reviewer` | `tandem reviewers spawn` | `--provider <name>` or explicit `--command` |
| `list_reviewers` | `tandem reviewers list [--status X]` | |
| `kill_reviewer` | `tandem reviewers kill <id>` | |
| — | `tandem config show` | New — display current config |
| — | `tandem config set <key> <value>` | New — persist config changes |
| — | `tandem dashboard` | New — build + launch dashboard |

## Decomposition Rationale

S01 ships the CLI entrypoint, subcommand router, output formatting, and all read-only commands. This is the largest slice by command count but lowest risk because every command is pure composition over existing BrokerService methods — no new backend work. Proving the scaffold with reads first means S02/S03 only add incremental commands to a working CLI.

S02 adds config management (the novel backend piece) and the write commands that don't depend on config (claim, close, verdict, add_message, reclaim, counter-patch). This separates the config design risk from the CLI scaffolding risk.

S03 adds the commands that depend on config or external processes: `reviews create` (diff input), `reviewers spawn` (provider resolution), `reviewers kill`, and `dashboard` launch. These are the operationally riskiest commands.

S04 closes with integrated acceptance — full parity proven against a real runtime.

## Slices

- [ ] **S01: CLI scaffold and read-only commands** `risk:medium` `depends:[]`
  > Demo: `tandem status`, `tandem reviews list`, `tandem reviews show <id>`, `tandem proposal show <id>`, `tandem discussion show <id>`, `tandem activity <id>`, `tandem reviewers list` all produce readable terminal output and support `--json`. Entrypoint, subcommand routing, output formatting, and `--help` proven.

- [ ] **S02: Config management and write commands** `risk:high` `depends:[S01]`
  > Demo: `tandem config set reviewer.provider anthropic`, `tandem config show`, `tandem reviews claim <id>`, `tandem reviews verdict <id>`, `tandem reviews close <id>`, `tandem reviews reclaim <id>`, `tandem discussion add <id>`, `tandem proposal accept <id>`, `tandem proposal reject <id>` all work. Config persists to the resolved config path.

- [ ] **S03: Create, spawn, kill, and dashboard commands** `risk:medium` `depends:[S01,S02]`
  > Demo: `tandem reviews create --diff-file patch.diff --title "..." --description "..."` creates a review. `tandem reviewers spawn --provider anthropic` resolves the configured provider template and starts a reviewer. `tandem reviewers kill <id>` stops one. `tandem dashboard` builds and serves the dashboard.

- [ ] **S04: Integrated acceptance and parity proof** `risk:low` `depends:[S01,S02,S03]`
  > Demo: every CLI command exercised against a real SQLite-backed broker runtime, proving full MCP parity and config coherence across CLI/MCP/dashboard surfaces.

## Milestone Definition of Done

- Every MCP tool has a working CLI equivalent producing correct output.
- `--json` flag on all commands enables machine-parseable output.
- Config management reads and writes the broker config file at the resolved path.
- Provider-based reviewer spawning resolves configured templates into real subprocess commands.
- `tandem dashboard` launches the broker-served dashboard.
- The CLI, MCP server, and dashboard all share the same default database.
- Full parity proven through integrated tests against a real broker runtime.
