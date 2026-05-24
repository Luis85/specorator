---
id: ADR-0035
title: Deprecate the in-plugin MCP server and move it to specorator-obsidian-mcp
status: accepted
date: 2026-05-24
deciders:
  - maintainer
consulted: []
informed:
  - dev
supersedes: []
superseded-by: []
tags: [mcp, architecture, plugin]
---

# ADR-0035 — Deprecate the in-plugin MCP server and move it to specorator-obsidian-mcp

## Status

Accepted

## Context

Specorator originally shipped an embedded MCP (Model Context Protocol) server
(`ObsidianMcpServerAdapter`, `src/infrastructure/obsidian/mcp/`) that exposed
Obsidian vault and workflow tools to external AI clients over a loopback HTTP
transport.

Several forces pushed against keeping it embedded:

1. **Bundle size and startup latency.** The MCP subsystem added ~300 LOC of
   infrastructure code and a transitive dependency on the MCP SDK to the main
   plugin bundle, inflating cold-start time for users who never use the MCP
   feature.

2. **Lifecycle coupling.** Starting and stopping the MCP server was wired into
   `PluginCore.init()` / `PluginCore.destroy()`, making the core lifecycle
   dependent on a network-capable service. This created accidental complexity
   and made the lifecycle harder to reason about and test.

3. **Settings sprawl.** `mcpServerEnabled` and `obsidianCliPath` were baked
   into `PluginSettings` and `DEFAULT_SETTINGS`. Every consumer of settings
   (validation, migration, schema tests) had to be aware of them even when the
   user never enabled MCP.

4. **Independent release cadence.** The MCP tool-set evolves faster than the
   core Specorator plugin. Embedding it ties MCP releases to Specorator
   releases, slowing iteration on both.

5. **Separation of concerns.** Obsidian plugins are better composed via
   dependency on a companion plugin rather than via a monolith. The Obsidian
   community plugin API supports this pattern explicitly through
   `CommunityPluginPort.isPluginEnabled()`.

## Decision

We remove all MCP server code from the Specorator plugin and relocate it to a
new, independently published Obsidian plugin: `specorator-obsidian-mcp`.

Specifically, we:

- Delete `src/infrastructure/obsidian/mcp/` (all tool-registration modules).
- Delete `ObsidianMcpServerAdapter`, `ObsidianClaudeCliAdapter`,
  `ObsidianMcpServerPort`, and the infrastructure-level `ProposalStore` that
  served the MCP tool layer.
- Remove `mcpServerEnabled` and `obsidianCliPath` from `PluginSettings` and
  `DEFAULT_SETTINGS`.
- Remove MCP lifecycle calls from `PluginCore` (`startMcpServer`,
  `stopMcpServer`, `_syncMcpRunning`, `getMcpConnectionConfig`).
- Remove the `ObsidianCliPathField` and `McpServerStatus` sections from the
  settings tab.
- Remove `McpIndicator.vue` and `mcpStatusStore`.
- Add an idempotent `stripMcpLegacy()` migration that silently removes any
  `mcpServerEnabled` or `obsidianCliPath` keys still present in a user's
  persisted `data.json`, so existing installs upgrade cleanly with no data loss.

The companion plugin `specorator-obsidian-mcp` is the new home for all MCP
tooling and ships its own `manifest.json`, lifecycle, and settings.

## Considered options

### Option A — Keep MCP embedded, hide behind a flag (status quo)
- Pros: Single install, no coordination between plugins.
- Cons: All the forces described above persist. Feature flag adds complexity
  without removing code.

### Option B — Extract to standalone companion plugin (chosen)
- Pros: Clean separation, independent releases, smaller core bundle, simpler
  `PluginCore` lifecycle.
- Cons: Users must install a second plugin. Inter-plugin communication requires
  a documented API contract.

### Option C — Drop MCP entirely
- Pros: Maximum simplicity.
- Cons: MCP tooling is valuable to a segment of power users. Extraction
  preserves the feature while addressing the architectural concerns.

## Consequences

### Positive

- `PluginCore`, `PluginSettings`, and the settings tab are simpler and easier
  to test in isolation.
- The core plugin bundle is smaller and starts faster.
- `specorator-obsidian-mcp` can ship patches and new tools without gating on a
  Specorator core release.
- `stripMcpLegacy()` ensures no user experiences a broken settings blob after
  upgrading.

### Negative

- Users who relied on the embedded MCP server must install the companion plugin
  separately. This requires a migration notice in the release notes.
- Inter-plugin coordination (detecting whether `specorator-obsidian-mcp` is
  active) requires `CommunityPluginPort.isPluginEnabled()` — a small ongoing
  coupling point.

### Neutral

- The `--mcp-config` argument that was appended to Claude CLI subprocess
  invocations by `ObsidianClaudeCliAdapter` is removed. The companion plugin
  is responsible for passing that argument if needed.
- Existing `data.json` blobs with legacy keys are silently cleaned up on first
  load post-upgrade; no user action required.

## Compliance

- `npm run typecheck` — no references to deleted symbols will compile.
- `npm run test` — `stripMcpLegacy` is covered by `tests/plugin/loadSettings-migrate.test.ts`; the settings-load integration test (`tests/plugin/migration-on-load.test.ts`) asserts the idempotency contract.
- ESLint `no-restricted-imports` — the deleted module paths are implicitly
  unreachable; any accidental re-introduction will surface as a missing-module
  error at type-check time.

## References

- `docs/superpowers/plans/2026-05-24-mcp-plugin-extraction.md` — extraction plan
- `docs/superpowers/specs/2026-05-24-mcp-plugin-extraction-design.md` — design spec
- ADR-008 — Narrow ports (the new companion plugin must define its own ports)
- ADR-010 — Module system (`mcpServerEnabled` was a module-driven toggle; its
  removal reduces the `settingsSchema` field count by one)

---

> **ADR bodies are immutable.** To change a decision, supersede it with a new ADR; only the predecessor's `status` and `superseded-by` pointer fields may be updated.
