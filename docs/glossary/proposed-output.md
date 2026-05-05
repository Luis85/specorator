---
term: "Proposed output"
aliases: ["proposal", "agent proposal", "pending proposal"]
category: ui
status: stable
version: "v1 and v2.0"
related:
  - accepted-output.md
  - human-authority.md
  - hitl.md
  - artifact.md
  - mcp-server.md
issues:
  - "#164"
  - "#165"
last_updated: 2026-05-05
---

# Proposed output

An artifact, patch, document, or vault write operation that an agent has generated and queued for user review. Proposed outputs do not become durable vault content until the user explicitly accepts them.

The proposed output mechanism is the technical implementation of H-ACD's human authority principle: agents produce; humans decide. Every agent action that would modify the vault is expressed as a proposed output first.

## How proposals surface

In v1, the chat sidebar displays a **proposal review card** when the agent has generated something for the user to review: a note to create, a frontmatter field to update, a canvas node to add. The card shows what will change, where, and why (the agent's plain-language reasoning). The user accepts, requests changes, or rejects.

In v2.0, proposals can be batched: a multi-step agent session may produce several related proposals (a requirements document + two frontmatter updates + a wikilink) presented as a single batch review.

## Proposal types

| Type | Example | Review format |
|---|---|---|
| Note creation | Create `requirements.md` with draft content | Full document preview |
| Note update | Append a section to `design.md` | Diff view |
| Frontmatter update | Set `review-status: approved` in `spec.md` | Field-level change summary |
| Canvas addition | Add a node to `features.canvas` | Canvas diff card |
| Stage advancement | Advance `auth-flow` from `design` to `spec` | Stage transition confirmation |

## Relationship to MCP write tools

The MCP server intercepts all agent write tool calls, queues them as pending proposals, and returns a receipt to the agent. The agent continues working (in HOTL mode) or pauses (in HITL mode) until the user reviews. See [mcp-server.md](./mcp-server.md).
