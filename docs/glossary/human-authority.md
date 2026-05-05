---
term: "Human authority over outcomes"
aliases: ["human authority"]
category: governance
status: stable
version: "v1 and v2.0"
related:
  - h-acd.md
  - workflow-encapsulation.md
  - hitl.md
  - proposed-output.md
  - accepted-output.md
issues:
  - "#164"
last_updated: 2026-05-05
---

# Human authority over outcomes

One of the four H-ACD principles. The user retains full authority at every stage transition. Agents propose; humans decide. Nothing is written to the vault, advanced to the next stage, or committed without the user's explicit approval.

This is not a safety feature bolted onto an autonomous system — it is the product model. The user is the director; agents are the execution team. The principle holds in v1 (conversational) and v2.0 (orchestrated), and it applies at every level of the governance hierarchy.

## What this means in practice

When an agent generates code, the user sees a plain-language summary of what was built and why — not raw source files — and decides: accept, request changes, or redirect. When tests run, the user sees "7 of 8 passed; here's what needs fixing" — not test output — and decides whether they are ready to ship. The decision is always theirs; the execution was the agent's.

## What this principle forbids

- Autonomous stage advancement (the agent cannot move a feature to the next stage without user approval)
- Unreviewed vault writes (every proposed write is displayed and awaits acceptance before being applied)
- Silent state changes (every governance event is visible and reversible before it is committed)

## Relationship to HITL

Human authority over outcomes is the principle; HITL is the mechanism. Every stage gate is a HITL checkpoint — the agent pauses, the user decides, the pipeline only advances on explicit approval. See [hitl.md](./hitl.md).
