---
term: "Open question"
aliases: ["OQ", "open questions"]
category: workflow
status: stable
version: "v1 and v2.0"
related:
  - decision-note.md
  - artifact.md
  - workflow-stage.md
issues:
  - "#1"
last_updated: 2026-05-05
---

# Open question (OQ)

A documented uncertainty or unresolved decision point logged during a feature's workflow. Open questions are tracked as Markdown artifacts in the vault, can be resolved collaboratively or escalated to a decision note, and remain visible in the workflow state until resolved.

## Why open questions are first-class

Unresolved decisions left implicit are the most common source of rework in product delivery. Making open questions explicit and trackable — as named vault artifacts with their own workflow state — forces resolution before they become problems downstream. An open question about a requirements assumption that surfaces at the requirements stage is dramatically cheaper to resolve than the same ambiguity discovered at the implementation stage.

## Lifecycle

1. **Logged** — identified during work on a stage; written to the vault as a Markdown note with frontmatter
2. **Assigned** — optionally assigned to a person or role for resolution
3. **Resolved** — answered with a documented resolution; status updated to `resolved`
4. **Escalated** — if the question requires a formal decision, promoted to a decision note

## Relationship to decision notes

An open question becomes a decision note when it requires a formal, documented decision with options considered and rationale recorded. Not all open questions reach this threshold — routine clarifications can be resolved inline.
