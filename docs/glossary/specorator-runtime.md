---
term: "specorator-runtime"
aliases: ["runtime", "the runtime"]
category: ecosystem
status: draft
version: "v2.0"
related:
  - agentonomous.md
  - runtime-port.md
  - companion-app.md
  - session-log.md
  - fleet-dashboard.md
issues:
  - "#23"
last_updated: 2026-05-05
---

# specorator-runtime

The v2.0 orchestration engine that interprets the active workflow definition for a feature, resolves the task graph, invokes the appropriate `agentonomous` agent at each ADLC stage, manages session state, and emits typed events to the Specorator plugin. Published as an npm library consumed by the plugin. **Not implemented in v1.**

## What specorator-runtime does

- **Stage resolution** — determines which agent to invoke based on the current workflow stage
- **Session management** — starts, resumes, pauses, and cancels agent sessions; persists session state across Obsidian restarts
- **Event streaming** — emits typed events (stage progress, proposed outputs, session log entries) to the plugin's event bus for real-time fleet dashboard updates
- **Session log generation** — writes session logs to the vault at `specs/{slug}/sessions/` automatically on session close
- **`RuntimePort` implementation** — satisfies the `ClaudeCliPort`-compatible interface so the sidebar UI requires no changes

## Relationship to the plugin

The plugin subscribes to `specorator-runtime`'s event stream and renders execution state in the chat sidebar and fleet dashboard in real time. `specorator-runtime` is an internal implementation detail; the user never knows it exists.

## v1 status

Not implemented. The v1 `ClaudeCliPort` is the designed upgrade seam that `RuntimePort` (backed by `specorator-runtime`) replaces in v2.0.
