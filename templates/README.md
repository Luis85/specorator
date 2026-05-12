---
title: "Templates"
folder: "templates"
description: "Entry point for blank workflow artifacts copied into feature folders."
entry_point: true
---
# Templates

Blank artifacts for each workflow stage. Copy into `specs/<feature>/<artifact>.md` when starting a stage.

| Template | Stage | Output filename |
|---|---|---|
| [`idea-template.md`](idea-template.md) | 1 — Idea | `idea.md` |
| [`research-template.md`](research-template.md) | 2 — Research | `research.md` |
| [`prd-template.md`](prd-template.md) | 3 — Requirements | `requirements.md` |
| [`design-template.md`](design-template.md) | 4 — Design | `design.md` |
| [`arc42-questionnaire-template.md`](arc42-questionnaire-template.md) | 4 — Design (lazy, via `arc42-baseline` skill) | `arc42-questionnaire.md` |
| [`spec-template.md`](spec-template.md) | 5 — Specification | `spec.md` |
| [`tasks-template.md`](tasks-template.md) | 6 — Tasks | `tasks.md` |
| [`implementation-log-template.md`](implementation-log-template.md) | 7 — Implementation | `implementation-log.md` |
| [`test-plan-template.md`](test-plan-template.md) | 8 — Testing (plan) | `test-plan.md` |
| [`test-report-template.md`](test-report-template.md) | 8 — Testing (report) | `test-report.md` |
| [`review-template.md`](review-template.md) | 9 — Review | `review.md` |
| [`release-readiness-guide-template.md`](release-readiness-guide-template.md) | 10 — Release (optional companion) | `release-readiness-guide.md` |
| [`release-notes-template.md`](release-notes-template.md) | 10 — Release | `release-notes.md` |
| [`retrospective-template.md`](retrospective-template.md) | 11 — Learning | `retrospective.md` |
| [`adr-template.md`](adr-template.md) | (any) — Decision | `docs/adr/NNNN-<title>.md` |
| [`traceability-template.md`](traceability-template.md) | 9 — Review | `traceability.md` (RTM) |
| [`workflow-state-template.md`](workflow-state-template.md) | (every stage) | `workflow-state.md` |
| [`checklist-template.md`](checklist-template.md) | (any gate) | `checklists/<name>.md` |
| [`roadmap-state-template.md`](roadmap-state-template.md) | Roadmap Management Track | `roadmap-state.md` |
| [`roadmap-strategy-template.md`](roadmap-strategy-template.md) | Roadmap Management Track | `roadmap-strategy.md` |
| [`roadmap-board-template.md`](roadmap-board-template.md) | Roadmap Management Track | `roadmap-board.md` |
| [`roadmap-delivery-plan-template.md`](roadmap-delivery-plan-template.md) | Roadmap Management Track | `delivery-plan.md` |
| [`roadmap-stakeholder-map-template.md`](roadmap-stakeholder-map-template.md) | Roadmap Management Track | `stakeholder-map.md` |
| [`roadmap-communication-log-template.md`](roadmap-communication-log-template.md) | Roadmap Management Track | `communication-log.md` |
| [`roadmap-decision-log-template.md`](roadmap-decision-log-template.md) | Roadmap Management Track | `decision-log.md` |

## Conventions

- Every artifact starts with **YAML frontmatter** (see [`docs/traceability.md`](../docs/traceability.md)).
- IDs are stable and never reused.
- Use **EARS** for functional requirements (see [`docs/ears-notation.md`](../docs/ears-notation.md)).
- Keep each artifact concise. Walls of text hide defects.
- Mark unknowns as `TBD — owner: <name>` rather than guessing.

## Customising

These templates are deliberately generic. Tailor them to your domain — but record the change in an ADR if you alter the structure of a template (other teams using the kit will inherit your tweaks).
