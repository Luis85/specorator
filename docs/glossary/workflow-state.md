---
term: "Workflow state"
aliases: ["workflow-state.md", "feature state"]
category: workflow
status: stable
version: "v1 and v2.0"
related:
  - feature.md
  - artifact.md
  - traceability-chain.md
  - workflow-stage.md
  - gate.md
issues:
  - "#165"
  - "#169"
last_updated: 2026-05-05
---

# Workflow state

The current status of a feature as derived from vault Markdown content: which stage it is in, which artifacts are present, which gates have passed, and how it connects to related features and its root issue. Workflow state is read from the vault, not from plugin-private storage.

## The canonical state file

Every feature has a `workflow-state.md` file at `specs/{slug}/workflow-state.md`. This file's YAML frontmatter is the anchor of the feature's traceability chain:

```yaml
---
feature: auth-flow
slug: auth-flow
current_stage: requirements
root_issue: "161"
parent_feature: ""
child_features: []
artifacts:
  idea:         { status: accepted, path: idea.md, session: sessions/idea-session-20260504.md }
  research:     { status: accepted, path: research.md, session: sessions/research-session-20260504.md }
  requirements: { status: proposed, path: requirements.md, session: sessions/requirements-session-20260505.md }
quality_gate_status:
  idea: passed
  research: passed
  requirements: pending
---
```

## Why state lives in the vault

Plugin-private state (Obsidian's `data.json`) is opaque to agents and unavailable in browser mode. Vault-derived state is readable by any agent through `workflow_get_state` and `frontmatter_get`, queryable by Bases, and inspectable by the user as plain Markdown. It is also portable: copying the `specs/` folder moves the full feature state with it.

## Ambiguity note

"State" can mean workflow state (vault-derived feature status) or plugin settings state (stored in Obsidian's `loadData`/`saveData`). Always use "workflow state" for vault-derived feature status and "plugin settings" or "plugin data" for stored configuration.
