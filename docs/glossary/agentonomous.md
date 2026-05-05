---
term: "agentonomous"
aliases: ["agentonomous library"]
category: ecosystem
status: draft
version: "v2.0"
related:
  - specorator-runtime.md
  - agentic-coworker.md
  - companion-app.md
  - runtime-port.md
issues:
  - "#23"
last_updated: 2026-05-05
---

# agentonomous

The upstream agent orchestration library (`Luis85/agentonomous`) that powers v2.0 agentic coworker interactions. `agentonomous` defines agent roles, their input/output contracts, and the execution model for multi-step agentic sessions. **Not integrated in v1.**

In v1, the plugin is designed to leave clean extension points for `agentonomous` without depending on it. The `ClaudeCliPort` interface is the designed seam; in v2.0 it is replaced by `RuntimePort` which routes through `specorator-runtime` → `agentonomous`.

## Relationship to specorator-runtime

`agentonomous` provides the agent implementations (PM agent, Architect agent, Engineering agent, QA agent, etc.). `specorator-runtime` is the orchestration engine that invokes `agentonomous` agents at the right stage, manages session state, and emits typed events to the plugin. Neither is exposed to the user.

## v1 status

Extension point only. The plugin architecture is designed for `agentonomous` integration without implementing it. No `agentonomous` dependency in v1.
