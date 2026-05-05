---
term: "MCP server"
aliases: ["Obsidian MCP server", "ObsidianMcpServer", "native MCP server"]
category: technical
status: draft
version: "v1 and v2.0"
related:
  - vault-as-operating-environment.md
  - narrow-port.md
  - claude-cli-port.md
  - runtime-port.md
  - artifact.md
issues:
  - "#165"
  - "#161"
  - "#163"
last_updated: 2026-05-05
---

# MCP server

The native Obsidian MCP (Model Context Protocol) server that Specorator runs inside the plugin process, with full access to Obsidian's internal APIs. It is the mechanism through which all agents — Claude CLI in v1, `agentonomous` agents in v2.0 — interact with the vault.

The MCP server exposes a structured tool surface: vault read/write, frontmatter manipulation, wikilink graph traversal, Canvas operations, Bases queries, and Specorator-specific workflow tools. Claude CLI connects to it as an MCP client; all vault operations go through these tools rather than through ad-hoc file system access.

## Why native

Running the MCP server inside the plugin (not as a separate process or REST intermediary) gives it full access to Obsidian's internal APIs: `MetadataCache`, `Canvas`, `Bases`, `WorkspaceLeaf`, and the complete `App` and `Vault` object graph. This is the difference between an MCP server that knows about Obsidian and one that *is* Obsidian.

## Tool catalogue (summary)

- **Vault tools** — `vault_read_note`, `vault_write_note`, `vault_append_to_note`, `vault_search`, `vault_list_folder`
- **Frontmatter tools** — `frontmatter_get`, `frontmatter_set_field`, `frontmatter_set_many`
- **Graph tools** — `links_get_outgoing`, `links_get_backlinks`, `links_resolve`, `graph_traverse`
- **Canvas tools** — `canvas_read`, `canvas_add_text_node`, `canvas_add_file_node`, `canvas_add_edge`
- **Bases tools** — `bases_query`, `bases_get_record`, `bases_update_record`
- **Workflow tools** — `workflow_get_state`, `workflow_list_features`, `workflow_propose_advance`, `workflow_get_quality_gates`

Write tools go through the accept/reject flow — no vault write is applied without user approval.

## Accept/reject flow

When an agent calls a write tool, the MCP server queues the operation as a **pending proposal** and returns a receipt. The chat sidebar displays the proposal for user review. On acceptance, the write is applied through the appropriate narrow port. On rejection, the agent receives a rejection signal and may propose an alternative.

## Full specification

Issue #165.
