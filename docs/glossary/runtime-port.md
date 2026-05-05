---
term: "RuntimePort"
aliases: ["runtime-port", "RuntimePort interface"]
category: technical
status: draft
version: "v2.0"
related:
  - claude-cli-port.md
  - specorator-runtime.md
  - narrow-port.md
  - chat-sidebar.md
issues:
  - "#23"
  - "#161"
last_updated: 2026-05-05
---

# RuntimePort

The v2.0 replacement for `ClaudeCliPort`. A narrow port interface that routes the chat sidebar's messages through `specorator-runtime` rather than the Claude CLI subprocess, enabling stateful orchestrated multi-agent sessions while keeping the sidebar UI unchanged.

`RuntimePort` satisfies the same interface contract as `ClaudeCliPort` — `isAvailable()` and `sendMessage()` — so the binding swap is a one-line change at the plugin's composition root with no UI impact.

## What changes in v2.0

Behind `RuntimePort`, `specorator-runtime` maintains full session state, routes to the appropriate `agentonomous` agent for the current workflow stage, emits typed events to the fleet dashboard, persists session context across Obsidian restarts, and writes session logs to the vault automatically.

From the sidebar's perspective, nothing changes: it calls `sendMessage()` and receives streaming token chunks. The orchestration complexity is entirely behind the port.

## Not yet implemented

`RuntimePort` is a planned interface. Its specification is derived from the `ClaudeCliPort` contract and the `specorator-runtime` event model. See issue #23 for the v2.0 scope.
