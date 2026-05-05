---
term: "Decision note"
aliases: ["ADR", "Architecture Decision Record"]
category: workflow
status: stable
version: "v1 and v2.0"
related:
  - open-question.md
  - artifact.md
  - traceability-chain.md
issues:
  - "#1"
last_updated: 2026-05-05
---

# Decision note

A structured Markdown record of a decision made during a feature's workflow, documenting the options considered, the rationale, and the outcome. Decision notes are the primary form of Architecture Decision Record (ADR) in the Specorator workflow.

## Structure

A decision note captures:

- **The decision** — what was decided, stated clearly
- **The context** — what situation or open question triggered this decision
- **The options considered** — at least two alternatives with their tradeoffs
- **The rationale** — why this option was chosen over the others
- **The outcome** — consequences, constraints, or follow-on decisions

## Relationship to ADRs

In the plugin codebase, architectural decisions use the ADR format in `docs/adr/`. In the `agentic-workflow` methodology, decision notes serve the same purpose for product and design decisions within a feature's workflow. The formats are closely related but the storage location differs.

## Relationship to open questions

Open questions that require formal documentation are promoted to decision notes. The open question record links to the decision note that resolved it. This creates a traceable chain: uncertainty identified → question documented → decision made → decision noted.

## Agents and decision notes

In v2.0, the architect and PM agents can propose decision notes based on the options they surfaced during design or requirements stages. The user reviews the proposed note, edits for completeness and accuracy, and accepts it as a vault artifact.
