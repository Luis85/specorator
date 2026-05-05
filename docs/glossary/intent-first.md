---
term: "Intent-first interaction"
aliases: ["intent-first"]
category: governance
status: stable
version: "v1 and v2.0"
related:
  - h-acd.md
  - workflow-encapsulation.md
  - chat-sidebar.md
issues:
  - "#164"
  - "#161"
last_updated: 2026-05-05
---

# Intent-first interaction

One of the four H-ACD principles. The user expresses what they want; the system handles the how. Users never need to think about how to phrase a prompt, what context to provide, which agent to invoke, or what stage they should be at. Specorator assembles and injects the right context automatically.

## In practice

Opening the chat sidebar and typing "help me think through this" is enough. The sidebar already knows the user's persona (from onboarding), the active note (from the workspace), the current workflow stage (from `workflow-state.md`), and the expected next steps (from the ADLC stage definition). The user brings the direction; the system brings the context.

## What this principle forbids

- Requiring the user to select an agent, model, or capability before getting help
- Requiring the user to specify stage context or attach files manually in normal use
- Prompting the user with methodology-specific questions ("What stage are you in?")
- Asking the user to configure context injection or prompt templates

## v1 implementation

In v1, intent-first is implemented through the five-layer context assembly in the Claude CLI chat sidebar: persona (Layer 0), active file (Layer 1), workflow stage (Layer 2), optional attached notes (Layer 3), and vault metadata (Layer 4). The user sees none of this assembly — they just open the sidebar and start talking.

## v2.0 extension

In v2.0, intent-first extends to multi-step agentic sessions: the user approves a stage goal ("let's figure out what to build"), and `specorator-runtime` handles agent selection, context assembly, tool invocation, and session management. The user expresses intent once; the system executes until it has a proposal ready for review.
