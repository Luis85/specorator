---
term: "Session log"
aliases: ["agent session log"]
category: workflow
status: draft
version: "v2.0"
related:
  - traceability-chain.md
  - artifact.md
  - proposed-output.md
  - oversight-mode.md
  - fleet-dashboard.md
issues:
  - "#169"
  - "#23"
last_updated: 2026-05-05
---

# Session log

A plain Markdown vault artifact that records what happened during a single agent session on a feature stage: what context the agent worked from, what decisions it made and why, what it proposed, and what the user accepted, rejected, or redirected. Session logs are stored at `specs/{slug}/sessions/{stage}-session-{timestamp}.md`.

Session logs are the audit trail. They are the mechanism that makes agent reasoning inspectable and the traceability chain complete. Without session logs, the vault contains outputs but not the reasoning that produced them.

## Schema

```yaml
---
feature: auth-flow
stage: requirements
session-id: sess-2026-05-05-1437
agent-role: PM agent
started-at: 2026-05-05T14:37:00Z
completed-at: 2026-05-05T15:02:00Z
outcome: proposal-accepted      # proposal-accepted | proposal-rejected | redirected | abandoned | interrupted
oversight-mode: HOTL            # HITL | HOTL
redirect-count: 0
---
```

The body contains plain-language sections: context loaded, key decisions, proposal reference, and user outcome.

## What session logs enable

- **Auditability** — for any vault artifact, the user can find the session that produced it and understand the reasoning behind it
- **Context continuity** — a new agent session on the same feature reads prior session logs to understand what was tried, accepted, and deferred
- **Fleet dashboard health signals** — redirect-count, outcome, and elapsed time are queryable via `workflow_list_features` and `bases_query`
- **Retrospective input** — session logs for all twelve stages feed into the Stage 12 retrospective; the agent can synthesise the full project decision history from them

## v1 approximation

In v1, after a Claude CLI session proposes an artifact, the chat sidebar shows a session summary card. This summary is stored as a lightweight session log. Full structured session logs with queryable frontmatter are a v2.0 capability when `specorator-runtime` manages sessions.

## Full specification

Issue #169.
