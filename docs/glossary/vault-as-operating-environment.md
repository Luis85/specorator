---
term: "Vault as the agentic operating environment"
aliases: ["vault-first", "vault as operating environment"]
category: governance
status: stable
version: "v1 and v2.0"
related:
  - h-acd.md
  - mcp-server.md
  - artifact.md
  - traceability-chain.md
  - workflow-state.md
issues:
  - "#164"
  - "#165"
last_updated: 2026-05-05
---

# Vault as the agentic operating environment

One of the four H-ACD principles. The Obsidian vault is not a storage location for agent outputs — it is the primary workspace where all agents operate. Agents read from the vault to understand context, write to it to produce results, and navigate its knowledge graph to discover relationships. Every agent capability is implemented through Obsidian's own data model.

This principle distinguishes Specorator from tools that happen to run inside Obsidian. Specorator is *of* Obsidian: agents use wikilinks as their relationship graph, frontmatter as their structured database, Canvas as their visual workspace, and Bases as their query layer.

## The four Obsidian data surfaces

| Surface | How agents use it |
|---|---|
| **Markdown** | Native read/write; headings, callouts, tasks, code fences, embeds |
| **Frontmatter** | First-class structured data; field updates are non-destructive and schema-aware |
| **Wikilinks** | Graph relationships; every artifact-to-artifact connection is a proper `[[wikilink]]`, not a file path |
| **Canvas** | Visual workspace; agents can read canvas structure and propose new cards and connections |
| **Bases** | Structured query layer; agents query and update frontmatter properties that Bases reflects |

## The mechanism

Specorator implements a native **MCP server** running inside the plugin with full access to Obsidian's internal APIs. All agent-to-vault interactions go through this server — never through ad-hoc file paths or system prompt injection. Claude CLI connects to the MCP server as a client; `agentonomous` agents connect to the same server in v2.0.

See [mcp-server.md](./mcp-server.md) for the full tool surface.

## Why this matters

Because agents interact with the vault through Obsidian's own data model, every agent output:

- Is a valid Obsidian note that works without the plugin installed
- Enters the knowledge graph as first-class content with backlinks
- Is queryable by Bases without special configuration
- Respects the vault's existing structure and conventions

The vault grows richer with every agent interaction — not as a side effect, but as a design requirement.
