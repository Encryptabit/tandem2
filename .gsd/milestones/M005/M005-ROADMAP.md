# M005: Interactive operator CLI

**Vision:** Give operators a direct subcommand-style CLI (`tandem`) for common broker tasks — listing reviews, inspecting status, managing config, spawning reviewers by provider name, and launching the dashboard — without starting a server or opening a browser.

## Success Criteria

- Operators can run `tandem` from any directory inside the workspace and interact with the broker through readable subcommands.
- `tandem reviews list`, `tandem reviews show <id>`, and `tandem status` display broker state in a human-readable terminal format.
- `tandem config` lets operators read and write broker configuration (reviewer provider settings, default parameters) to a persistent config file.
- `tandem reviewer spawn` can resolve a configured provider name into the actual command/args, so operators don't need to remember raw subprocess invocations.
- `tandem dashboard` builds and starts the dashboard from the CLI as a convenience command.
- The CLI shares the same default database as the MCP server and dashboard — all surfaces see the same state.

## Key Risks / Unknowns

- **Config schema design:** No config file exists today. The `configPath` is resolved but never read. Defining what goes in config (providers, defaults, etc.) is new design work.
- **Provider abstraction:** Translating a provider name like "anthropic" into a reviewer spawn command requires a template/registry concept that doesn't exist yet.
- **Binary distribution:** Making `tandem` runnable as a global command (vs. `pnpm exec`) affects packaging but isn't required for the first milestone.
- **Output formatting:** Terminal output needs to be readable without being over-engineered. Tables, colors, and formatting are scope-creep magnets.

## Decomposition Rationale

S01 ships the CLI scaffold and the most immediately useful read-only commands (status, reviews list/show) because those are pure composition over existing BrokerService methods with zero new backend work. This proves the CLI architecture and gives operators something useful immediately.

S02 adds config management — the novel piece that requires defining the config schema, reading/writing the config file, and wiring it into the path resolution system. This unblocks provider-based reviewer spawning.

S03 adds the action commands (reviews create, reviewer spawn with provider resolution, dashboard launch) that depend on config existing. These are the commands that actually change broker state or start processes.

S04 closes the milestone with integrated acceptance — proving the full CLI surface works against a real broker runtime, the config persists and affects behavior, and the CLI/dashboard/MCP surfaces stay coherent.

## Slices

- [ ] **S01: CLI scaffold and read-only commands** `risk:medium` `depends:[]`
  > Demo: operator runs `tandem status` and `tandem reviews list` from the workspace root and sees formatted broker state in the terminal.

- [ ] **S02: Config management and provider registry** `risk:high` `depends:[S01]`
  > Demo: operator runs `tandem config set reviewer.provider anthropic` and `tandem config show` to persist and inspect reviewer provider settings.

- [ ] **S03: Action commands and provider-based spawning** `risk:medium` `depends:[S01,S02]`
  > Demo: operator runs `tandem reviewer spawn --provider anthropic` and a reviewer process starts using the configured provider command template. `tandem dashboard` launches the dashboard.

- [ ] **S04: Integrated acceptance** `risk:low` `depends:[S01,S02,S03]`
  > Demo: full CLI surface exercised against a real broker runtime — status, config, review lifecycle, provider spawning, and dashboard launch all work coherently with the same database.

## Requirement Coverage

| Requirement | M005 disposition |
|---|---|
| R011 | strengthened — CLI provides another operator-facing surface backed by the same broker state |
| R005 | strengthened — reviewer spawning by provider name improves operator ergonomics |
| R014 | partially advanced — CLI review commands complement dashboard browsing |

## Milestone Definition of Done

- The `tandem` CLI is runnable from the workspace and provides subcommands for status, reviews, config, reviewer management, and dashboard launch.
- Config management reads/writes a persistent config file at the resolved config path.
- Provider-based reviewer spawning resolves configured provider templates into real spawn commands.
- The CLI shares the same default database as MCP and dashboard.
- All commands are tested and proven against a real broker runtime.
