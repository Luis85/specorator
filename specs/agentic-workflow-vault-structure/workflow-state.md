---
feature: agentic-workflow-vault-structure
area: AVS
current_stage: design
status: active
last_updated: 2026-05-02
last_agent: architect
artifacts:
  idea: complete
  research: skipped
  requirements: complete
  design: complete
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
| 1 — Idea | complete | `idea.md` | |
| 2 — Research | skipped | — | Agentic-workflow conventions already documented publicly |
| 3 — Requirements | complete | `requirements.md` | 6 functional + 4 non-functional |
| 4 — Design | complete | `design.md` | Schema, ADR location, migration detection, serializer delta |
| 5 — Specification | pending | — | |
| 6 — Tasks | pending | — | |
| 7 — Implementation | pending | — | |
| 8 — Testing | pending | — | |
| 9 — Review | pending | — | |
| 10 — Release | pending | — | |
| 11 — Retrospective | pending | — | |

## Skips

- **Research (stage 2):** The agentic-workflow vault conventions are publicly documented in the template repository. No additional research is needed before writing requirements.

## Blocks

None. Specification stage can begin.

## Hand-off notes

| Date | From | To | Note |
|---|---|---|---|
| 2026-05-01 | analyst | pm | Idea accepted; requirements drafted and accepted |
| 2026-05-01 | pm | — | Awaiting design stage to define workflow-state.md schema extension |
| 2026-05-02 | architect | spec | Design accepted: canonical schema defined, ADR location decided (global `docs/adr/`), migration detection behavior specified, serializer delta documented |

## Open clarifications

| # | Question | Owner | Resolved |
|---|---|---|---|
| 1 | Should ADRs be stored per-feature (`specs/{slug}/adr/`) or globally (`docs/adr/`)? | architect | ✅ Global `docs/adr/` — see DESIGN-AVS-001 §Decision 1 |
| 2 | How should the plugin detect and handle existing `features/` vaults on first load? | pm | ✅ Detect and show notice; no auto-migration in v1 — see DESIGN-AVS-001 §Decision 2 |
