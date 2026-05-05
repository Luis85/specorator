---
term: "Human-in-the-Loop"
aliases: ["HITL"]
category: governance
status: stable
version: "v1 and v2.0"
related:
  - hotl.md
  - oversight-mode.md
  - gate.md
  - h-acd.md
issues:
  - "#164"
  - "#168"
  - "#23"
last_updated: 2026-05-05
---

# Human-in-the-Loop (HITL)

An oversight mode in which an agent **pauses** and waits for explicit user approval before proceeding. The agent session is suspended; no further action is taken until the user acts.

HITL applies unconditionally at two points in Specorator:

1. **Stage gate transitions** — no feature advances from one ADLC stage to the next without an explicit user decision. This is the primary HITL invariant and cannot be configured away.
2. **Vault write operations** — every proposed write to the vault (a new note, a frontmatter update, a canvas addition) is queued as a pending proposal and displayed for user review before being applied. This applies to all write operations exposed through the MCP tool surface.

## In the UI

A feature in HITL mode shows `↩ Waiting for you` in the fleet dashboard. The inline action (Approve / Request changes / Reject) is prominent. Nothing will progress until the user acts.

## HITL vs HOTL

HITL and HOTL are not opposites — they apply at different scopes:

- **HITL at gates** — the boundary between stages always requires the user's explicit decision
- **HOTL within stages** — the agent can work autonomously within a stage while the user monitors

A feature can be HOTL-mode while the agent is drafting requirements, and then automatically switch to HITL-mode when the draft is ready and the user must decide whether to advance to design. See [hotl.md](./hotl.md) and [oversight-mode.md](./oversight-mode.md).

## Why this matters for non-technical users

HITL is the mechanism that makes H-ACD's "human authority over outcomes" principle concrete. It is not a safety feature for technical users — it is the product model. Non-technical users can confidently let agents work because they know nothing will change without their approval.
