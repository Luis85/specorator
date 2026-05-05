---
term: "Oversight mode"
aliases: []
category: governance
status: stable
version: "v2.0"
related:
  - hitl.md
  - hotl.md
  - fleet-dashboard.md
  - h-acd.md
issues:
  - "#164"
  - "#168"
last_updated: 2026-05-05
---

# Oversight mode

The current relationship between the user and an active agent session for a given feature. Specorator surfaces exactly two oversight modes: **HITL** (Human-in-the-Loop) and **HOTL** (Human-on-the-Loop).

The oversight mode for each feature is always visible in the fleet dashboard as a status indicator on the feature row. The user is never uncertain about whether an agent is waiting for them or working autonomously.

## Mode states

| Indicator | Mode | Meaning |
|---|---|---|
| `↩ Waiting for you` | HITL | Agent suspended; user action required to proceed |
| `● Working` | HOTL | Agent executing autonomously; user can interrupt |
| `⏸ Paused` | — | Session manually paused by user; can be resumed |
| `✓ Done` | — | Stage complete; no active session |
| `⚠ Needs attention` | — | Session failed or blocked; user decision required |

## Why oversight mode must be explicit

Most agentic tools do not distinguish between HITL and HOTL — the user cannot tell whether the system is waiting for them or working independently. This creates uncertainty: did the agent stop because it finished, or because it hit a problem, or because it is waiting for input?

Specorator makes the distinction explicit because governance depends on it. A user who does not know the system is in HITL mode may wait indefinitely for progress that will never come. A user who does not know the system is in HOTL mode may feel anxious about unsupervised activity. Clarity about oversight mode is a product requirement, not a nice-to-have.

## Stored in the session log

The oversight mode for each session is recorded in the session log's frontmatter as `oversight-mode: HITL` or `oversight-mode: HOTL`, along with the redirect count. This makes the governance history of each stage queryable from the vault.
