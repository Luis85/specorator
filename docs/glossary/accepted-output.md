---
term: "Accepted output"
aliases: ["accepted proposal", "accepted artifact"]
category: ui
status: stable
version: "v1 and v2.0"
related:
  - proposed-output.md
  - artifact.md
  - session-log.md
  - human-authority.md
issues:
  - "#164"
  - "#165"
last_updated: 2026-05-05
---

# Accepted output

A proposed output that the user has explicitly reviewed and approved, after which it is written to the vault as a durable Markdown artifact. Acceptance is the moment at which agent work becomes vault content.

## What acceptance does

When the user accepts a proposed output:

1. The MCP server applies the write operation through the appropriate narrow port
2. `workflow-state.md` is updated to reflect the new artifact status
3. The session log records the acceptance with a timestamp and any user note
4. The artifact enters the vault's knowledge graph as a first-class note with wikilinks

## What rejection does

When the user rejects a proposed output:

1. The write is not applied — the vault remains unchanged
2. The agent receives a rejection signal with the user's feedback (if provided)
3. The agent may propose an alternative within the same session
4. The rejection is recorded in the session log

## Partial acceptance

Users can accept a proposed output with modifications: they review the agent's proposal, edit it directly in the preview, and accept the edited version. The session log records both the original proposal and the accepted version with edits noted.

## Why explicit acceptance matters

The acceptance moment is not a formality — it is the governance event. Before acceptance, agent work is provisional. After acceptance, it is the vault's content and the input to subsequent stages. The traceability chain records this boundary precisely.
