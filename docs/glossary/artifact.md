---
term: "Artifact"
aliases: ["workflow artifact", "stage artifact"]
category: workflow
status: stable
version: "v1 and v2.0"
related:
  - workflow-stage.md
  - workflow-state.md
  - proposed-output.md
  - accepted-output.md
  - traceability-chain.md
issues:
  - "#1"
  - "#165"
last_updated: 2026-05-05
---

# Artifact

A plain Markdown file produced or managed through the workflow. Artifacts are stored in the vault at `specs/{feature-slug}/{stage-slug}.md` and remain useful and editable without the plugin installed.

## Types of artifacts

- **Stage artifacts** — the canonical output of a workflow stage (e.g., `requirements.md`, `design.md`, `spec.md`). Created lazily when the user advances to that stage.
- **Session logs** — records of agent session reasoning, stored at `specs/{slug}/sessions/{stage}-session-{timestamp}.md`. See [session-log.md](./session-log.md).
- **The workflow state file** — `workflow-state.md`, the frontmatter anchor of the traceability chain for a feature.

## Artifact properties

- Plain Markdown — no proprietary format, no plugin-private state
- Wikilinked — relationships to related artifacts are expressed as `[[wikilinks]]` that enter Obsidian's knowledge graph
- Frontmatter-tagged — key properties (stage, status, feature slug) are stored as YAML frontmatter for Bases querying
- Overwrite-protected — if an artifact already exists when a stage begins, Specorator skips creation rather than overwriting (REQ-AVS-005)

## User-facing language

Users never see "artifact" in the Specorator UI. The vocabulary mapping is: artifact → note / document / draft. See [workflow-encapsulation.md](./workflow-encapsulation.md) and [chat-sidebar.md](./chat-sidebar.md) for the full vocabulary table.
