---
term: "Human-on-the-Loop"
aliases: ["HOTL"]
category: governance
status: stable
version: "v2.0"
related:
  - hitl.md
  - oversight-mode.md
  - fleet-dashboard.md
  - h-acd.md
issues:
  - "#164"
  - "#168"
  - "#23"
last_updated: 2026-05-05
---

# Human-on-the-Loop (HOTL)

An oversight mode in which an agent works **autonomously** within its stage scope while the user monitors and can intervene at any time. Unlike HITL, the agent does not pause and wait — it continues executing while the user observes.

HOTL applies within a stage when the agent is doing work the user has authorised: drafting a requirements document, running tests, writing implementation code. The agent is trusted to complete the work within its defined scope; the user reviews the result when it is done.

## In the UI

A feature in HOTL mode shows `● Working` in the fleet dashboard, with a live session feed showing what the agent is doing in plain language. Inline Pause and Redirect controls are always available — the user can intervene at any point without waiting for the agent to finish.

## HOTL invariant

Even in HOTL mode, Specorator maintains the H-ACD principle: no vault write is applied without user review, and no stage advances without explicit user approval. HOTL means the agent works without constant interruption; it does not mean the agent has unchecked authority.

## HITL vs HOTL relationship

The two modes work together across the ADLC:

```
Stage N (agent working on draft)     → HOTL: agent executes, user monitors
Stage N complete (draft ready)       → HITL: agent pauses, user reviews draft
Gate: advance to stage N+1?          → HITL: user decides explicitly
Stage N+1 (agent working on next)    → HOTL: agent executes again
```

A feature alternates between HOTL (execution) and HITL (governance gates) as it moves through the pipeline.

## v1 note

In v1 with the Claude CLI chat sidebar, HOTL is implicit — the user sends a message and the assistant works. The HOTL/HITL distinction becomes explicit in v2.0 when `specorator-runtime` orchestrates autonomous multi-step sessions that can run for minutes without user interaction.
