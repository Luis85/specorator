---
id: b79e2d65-6464-45fd-9dc2-fc475f1001f8
feature: "Config-driven prototype builder"
area: CDP
slug: config-driven-prototype-builder
current_stage: idea
status: active
last_updated: 2026-05-10
last_agent: pm
createdAt: 2026-05-10T00:00:00+02:00
updatedAt: 2026-05-10T00:00:00+02:00
artifacts:
  idea: complete
  research: pending
  requirements: pending
  design: pending
  spec: pending
  tasks: pending
  implementation-log: pending
  test-plan: pending
  test-report: pending
  review: pending
  release-notes: pending
  retrospective: pending
---

## Stage progress

| Stage | Status | Artifact | Notes |
|---|---|---|---|
| 1 — Idea | complete | `idea.md` | Drafted from Lowdefy concept; brainstorming-skill design doc at `docs/superpowers/specs/2026-05-10-config-driven-prototype-builder-design.md` |
| 2 — Research | pending | — | Resolve open questions in idea (operator surface, hot reload, tab vs pane) |
| 3 — Requirements | pending | — | |
| 4 — Design | pending | — | |
| 5 — Specification | pending | — | |
| 6 — Tasks | pending | — | |
| 7 — Implementation | pending | — | |
| 8 — Testing | pending | — | |
| 9 — Review | pending | — | |
| 10 — Release | pending | — | |
| 11 — Retrospective | pending | — | |

## Blocks

None at idea stage. Implementation is gated on:

- `enablePrototypes` feature flag added to `PluginSettings`.
- `PrototypeDataPort` design accepted (joins existing five narrow ports).
- Design-stage decision on caching, hot-reload, and tab-vs-pane integration.

## Hand-off notes

| Date | From | To | Note |
|---|---|---|---|
| 2026-05-10 | pm | — | Spec entry created. Brainstorming-skill design doc co-located under `docs/superpowers/specs/`. GitHub backlog issue created on the same day (link in the issue body to this folder). |

## Open clarifications

- Tab vs pane integration with existing workflow view.
- External-edit hot-reload contract (`MetadataCachePort.onFileChange` vs explicit reload button).
- Whether AI proposal review card needs prototype-specific block diff rendering for v1.
