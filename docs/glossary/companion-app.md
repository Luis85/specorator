---
term: "Companion app"
aliases: []
category: core
status: draft
version: "v2.0"
related:
  - specorator.md
  - agentic-coworker.md
  - specorator-runtime.md
  - agentonomous.md
  - fleet-dashboard.md
issues:
  - "#23"
  - "#1"
last_updated: 2026-05-05
---

# Companion app

The v2.0 framing of Specorator: a fully orchestrated agentic system that gives the user a team of specialised AI coworkers inside Obsidian, coordinated by `specorator-runtime` and backed by `agentonomous`. **Not available in v1.**

The companion app framing emphasises the relational nature of the v2.0 experience: the user is not operating a tool, they are directing a team. The agents are coworkers with defined roles, not generic AI assistants. The user's job is to maintain direction, review proposals, and make the decisions that only they can make.

## What changes in v2.0

| Capability | v1 | v2.0 companion app |
|---|---|---|
| AI assistance | Conversational (Claude CLI) | Orchestrated multi-agent sessions |
| Stage coverage | All 12 stages, conversationally | All 12 stages, with specialised agents |
| Portfolio view | Per-feature workflow navigator | Fleet dashboard: all features simultaneously |
| Session state | Per-conversation | Persistent across Obsidian restarts |
| Agent transparency | Chat responses | Live session feed + session logs |
| Code execution | Agent can write code | Engineering agent executes and proposes diffs |
| Test execution | Agent can assist | QA agent runs tests, reports in plain language |

## What does not change

The vault remains the source of truth. All outputs are plain Markdown. The user's authority over every stage transition is unconditional. The sidebar UI does not change. The plain-language vocabulary does not change.
