---
feature: "Obsidian CLI-backed MCP server"
area: OCM
slug: obsidian-cli-mcp-server
stage: requirements
status: accepted
date: 2026-05-23
---

# Requirements — Obsidian CLI-backed MCP server

Functional requirements use EARS notation (`docs/ears-notation.md`). Each maps 1:1 to a
test (`TEST-OCM-NNN`) at the testing stage.

## Functional requirements

### Port & invocation

- **REQ-OCM-001** — The system shall expose a narrow `ObsidianCliPort` that runs a named
  Obsidian CLI command with string arguments and returns a `Result`.
- **REQ-OCM-002** — When `ObsidianCliPort.runJson` is called, the system shall append
  `format=json` to the arguments and parse the command's stdout as JSON.
- **REQ-OCM-003** — When no CLI binary path is configured, the system shall return a
  `not-configured` error from the port without spawning a process.
- **REQ-OCM-004** — When the spawned CLI process exits non-zero, the system shall return
  a `nonzero-exit` error carrying the exit code and captured stderr. When the process is
  terminated by a signal (exit code `null`), the system shall return a
  `signal-terminated` error and shall never treat the run as successful — so a
  proposal-queued write whose CLI command is killed is not marked completed.
- **REQ-OCM-005** — When the spawned CLI process does not complete within the configured
  timeout, the system shall kill the child and return a `timeout` error.
- **REQ-OCM-006** — When `runJson` receives stdout that is not valid JSON, the system
  shall return an `invalid-json` error rather than throwing.
- **REQ-OCM-007** — The system shall spawn the CLI without a shell (arguments passed as
  an array), so argument values cannot inject shell commands.

### Binary discovery

- **REQ-OCM-008** — The system shall discover the `obsidian` binary on PATH via a
  short-lived child process (`command -v` on POSIX, `where.exe` on Windows) and accept
  only an absolute path from the first non-empty output line.
- **REQ-OCM-009** — When discovery fails (spawn error, empty output, non-absolute path,
  or timeout), the system shall return `null` rather than throwing.

### MCP tool surface

- **REQ-OCM-010** — While the MCP server is running and an `ObsidianCliPort` is
  available, the system shall register CLI-backed read tools (`obsidian_cli_search`,
  `obsidian_cli_read_note`, `obsidian_cli_daily_note`, `obsidian_cli_get_properties`).
- **REQ-OCM-011** — The system shall provide a generic `obsidian_cli_run` tool that
  executes only commands on a read-only allow-list and rejects any other command.
- **REQ-OCM-012** — When a CLI-backed write tool (`obsidian_cli_append_note`) is called,
  the system shall enqueue the write in the `ProposalStore` and return a pending
  proposal receipt; it shall not mutate the vault until the proposal is accepted.
- **REQ-OCM-013** — The system shall never register a tool that invokes the CLI `eval`
  command or any destructive command (`delete`, `move`, `create`, plugin/theme ops).
- **REQ-OCM-014** — When a CLI-backed tool's underlying port call fails, the tool shall
  return a structured error payload (`{ error: { code, message } }`), not crash the
  request.

### Integration & settings

- **REQ-OCM-015** — When no `ObsidianCliPort` is provided to the MCP server, the system
  shall start normally and omit only the CLI tool group.
- **REQ-OCM-016** — The system shall persist a configurable absolute `obsidianCliPath`
  in `PluginSettings`, defaulting to the empty string (auto-detect/unset), and shall
  coerce a missing or non-string stored value to the default.
- **REQ-OCM-017** — The settings tab shall present an "Obsidian CLI path" field with
  autodetect and test affordances, mirroring the existing Claude CLI path field.
- **REQ-OCM-018** — The settings tab shall report MCP-server status, indicating whether
  the CLI is configured and, while the server is running, the loopback connection URL.

## Non-functional requirements

- **NFR-OCM-001** (Security) — CLI-backed write tools must not bypass the human-accept
  proposal boundary. No "trusted tool" exception.
- **NFR-OCM-002** (Security) — The arbitrary-JS `eval` command and destructive commands
  must be unreachable through any registered tool.
- **NFR-OCM-003** (Robustness) — CLI JSON output is treated as an unstable contract;
  parse failures degrade to typed errors, never uncaught exceptions.
- **NFR-OCM-004** (Performance) — CLI discovery and per-command invocation are bounded
  by a timeout (5 s discovery, 15 s invocation default) and never run on a UI hot path.
- **NFR-OCM-005** (Architecture) — Domain and MCP-tool code depend on `ObsidianCliPort`,
  not on `node:child_process`; only the infrastructure adapter imports the spawn API.
- **NFR-OCM-006** (Privacy) — The CLI tool group, like the MCP server itself, is
  opt-in: it is reachable only when the user has enabled the server and configured a CLI.

## Traceability

| Requirement | Spec | Verified by |
|---|---|---|
| REQ-OCM-001..007 | SPEC-OCM-001 §3 | `ObsidianCliAdapter` tests, `MockObsidianCliPort` tests |
| REQ-OCM-008..009 | SPEC-OCM-001 §4 | `ObsidianCliBinaryResolver` tests |
| REQ-OCM-010..014 | SPEC-OCM-001 §5 | `registerObsidianCliTools` tests |
| REQ-OCM-015 | SPEC-OCM-001 §6 | adapter wiring test |
| REQ-OCM-016 | SPEC-OCM-001 §7 | `core-settings` tests |
| REQ-OCM-017..018 | SPEC-OCM-001 §7 | settings-tab review (Obsidian-only surface) |
