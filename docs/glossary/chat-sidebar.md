---
term: "Chat sidebar"
aliases: ["Claude CLI chat sidebar", "chat panel", "conversation sidebar"]
category: ui
status: stable
version: "v1 and v2.0"
related:
  - cockpit.md
  - claude-cli-port.md
  - runtime-port.md
  - intent-first.md
  - h-acd.md
issues:
  - "#161"
  - "#1"
last_updated: 2026-05-05
---

# Chat sidebar

The primary AI collaboration surface in Specorator — always visible alongside the main Obsidian workspace, always context-aware, never requiring the user to configure it. The chat sidebar is the user-facing expression of the H-ACD intent-first principle.

## What makes it context-aware

Five context layers are assembled silently before every message the user sends:

| Layer | Source | What it provides |
|---|---|---|
| 0 | User persona (from onboarding) | Who the user is and their background |
| 1 | Active file (`WorkspacePort` + `MetadataCachePort`) | What the user is looking at right now |
| 2 | Workflow stage (`workflow-state.md`) | Where the feature is in the ADLC |
| 3 | Optional attached notes (user opt-in) | Additional context the user chooses to share |
| 4 | Vault metadata (`MetadataCachePort`) | Knowledge graph connections available to reason about |

The user never configures these layers. They open the sidebar and start talking.

## Plain language everywhere

The sidebar enforces the H-ACD vocabulary contract. Nothing the user sees should require technical knowledge:

- Agents are "your assistant", not "the LLM"
- Stages are plain labels, never slugs
- Artifacts are "notes" or "documents", never "artifacts"
- Action prompts use natural language ("Write this up", "Move on") not technical operations

## v1 vs v2.0

In v1, the sidebar backs onto the `ClaudeCliPort` which spawns the Claude CLI subprocess. In v2.0, it backs onto `RuntimePort` which routes through `specorator-runtime`. The sidebar Vue component does not change between versions — only the port binding.

## Full specification

Issue #161.
