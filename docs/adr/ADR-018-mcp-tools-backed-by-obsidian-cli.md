---
id: ADR-018
title: MCP server tools backed by the official Obsidian CLI
status: accepted
date: 2026-05-23
references:
  - src/domain/ports/ObsidianCliPort.ts
  - src/infrastructure/obsidian/ObsidianCliAdapter.ts
  - src/infrastructure/obsidian/ObsidianCliBinaryResolver.ts
  - src/infrastructure/obsidian/mcp/registerObsidianCliTools.ts
  - src/infrastructure/obsidian/ObsidianMcpServerAdapter.ts
  - specs/obsidian-cli-mcp-server/spec.md
supersedes: []
amends: ADR-013
---

# ADR-018 — MCP server tools backed by the official Obsidian CLI

## Context

Obsidian shipped an official command-line interface in 1.12 (Feb 2026): a binary,
bundled with the desktop app, that remote-controls a running vault and exposes 100+
first-party operations (search, read, daily notes, properties, tags, tasks, bookmarks,
bases, …) with `format=json` output, plus an arbitrary-JS `eval` command.

ADR-013 established an in-process MCP server inside the plugin whose tools wrap the
plugin's narrow ports. Those tools re-implement a subset of Obsidian behaviour against
the in-process API. The official CLI offers a broader, maintained surface at low cost,
and the user asked for an MCP server "built upon the Obsidian CLI", manageable from the
settings tab.

## Decision

Add a **CLI-backed tool group** to the existing MCP server. The group's tools shell out
to the official `obsidian` binary through a new narrow `ObsidianCliPort`. This **amends**
ADR-013 (it adds a seventh `register*Tools` group at the same single registration site)
and does not change the transport, lifecycle, or write-governance model.

1. **`ObsidianCliPort` is the seam.** A domain-level narrow port (`run`, `runJson`,
   `available`) wraps CLI invocation. The production `ObsidianCliAdapter` spawns the
   binary **without a shell** (arguments as an array), bounds each call with a timeout,
   and maps spawn/exit/timeout/parse outcomes to a typed `ObsidianCliError`. MCP-tool
   code depends on the port, never on `node:child_process`.

2. **Reads are allow-listed; the only write is proposal-queued.** Dedicated read tools
   cover search/read/daily/properties; a generic `obsidian_cli_run` accepts only
   commands on a read-only allow-list. The single write tool, `obsidian_cli_append_note`,
   goes through the ADR-013 `ProposalStore` — it returns a pending proposal receipt and
   mutates only on human accept. There is no trusted-tool bypass.

3. **`eval` and destructive commands are never exposed.** The CLI's arbitrary-JS `eval`
   and its `delete`/`move`/`create`/plugin/theme commands have no registered tool and
   are excluded from the `obsidian_cli_run` allow-list.

4. **Graceful degradation and opt-in.** The group is registered only when an
   `ObsidianCliPort` is provided *and* a CLI path is configured (`available`). With no
   CLI, the server still runs the in-process groups. The group inherits the MCP server's
   opt-in gate (`mcpServerEnabled`).

5. **Managed from settings.** `PluginSettings` gains `obsidianCliPath`; the settings tab
   exposes an "Obsidian CLI path" field (autodetect + test, mirroring the Claude CLI
   field) and a status readout (CLI-configured + loopback URL when running).

## Rationale

- **Re-use over re-implementation.** The CLI is maintained by Obsidian; wrapping it
  yields a broader surface than hand-written port tools, with first-party correctness.
- **Same governance, one audit site.** Reusing `ProposalStore` and the single
  registration site keeps ADR-013's "every write is a human-accepted proposal, every
  tool visible in one place" guarantees intact.
- **Security-first defaults.** Excluding `eval`/destructive commands and allow-listing
  the generic runner keeps the agent capability surface bounded.
- **No new lifecycle.** Riding the existing loopback HTTP server avoids a second
  process and the "who restarts whom" problem ADR-013 already rejected for stdio.

## Consequences

- The plugin can shell out to the `obsidian` binary while the MCP server is running and
  a CLI path is configured. The path is user-supplied (settings) or auto-detected on
  PATH.
- CLI JSON output is treated as an **unstable contract** (the CLI is ~3 months old):
  parse failures surface as `invalid-json` errors, never crashes.
- The CLI tool group requires the desktop app running (a CLI property). This matches the
  plugin's desktop-only deployment.
- Adding a CLI command tool in future means adding it to the allow-list or a dedicated
  registrar entry — the audit story stays in one file, per ADR-013.

## Alternatives considered

- **Standalone stdio MCP process shelling to the CLI.** Rejected for v1 (duplicates
  transport/lifecycle the plugin owns). Tracked as CLAR-OCM-001.
- **Replace in-process tool groups with CLI equivalents.** Rejected: in-process tools
  work without the CLI (older Obsidian / no PATH entry). CLI tools are additive.
- **Expose `obsidian_cli_eval`.** Rejected: arbitrary JS against `app` is an
  unacceptable agent capability.
