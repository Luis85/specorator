---
feature: agentic-workflow-vault-structure
area: AVS
current_stage: requirements
status: active
last_updated: 2026-05-01
last_agent: pm
artifacts:
  idea: complete
  research: skipped
  requirements: complete
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
| 1 — Idea | complete | `idea.md` | |
| 2 — Research | skipped | — | Agentic-workflow conventions already documented publicly |
| 3 — Requirements | complete | `requirements.md` | 6 functional + 4 non-functional |
| 4 — Design | pending | — | Needs schema design for workflow-state.md frontmatter extension |
| 5 — Specification | pending | — | Blocked on design |
| 6 — Tasks | pending | — | |
| 7 — Implementation | pending | — | Blocked on requirements → spec |
| 8 — Testing | pending | — | |
| 9 — Review | pending | — | |
| 10 — Release | pending | — | |
| 11 — Retrospective | pending | — | |

## Skips

- **Research (stage 2):** The agentic-workflow vault conventions are publicly documented in the template repository. No additional research is needed before writing requirements.

## Blocks

None at this stage. Implementation is blocked until design and spec are complete.

## Hand-off notes

| Date | From | To | Note |
|---|---|---|---|
| 2026-05-01 | analyst | pm | Idea accepted; requirements drafted and accepted |
| 2026-05-01 | pm | — | Awaiting design stage to define workflow-state.md schema extension |

## Open clarifications

| # | Question | Owner | Resolved |
|---|---|---|---|
| 1 | Should ADRs be stored per-feature (`specs/{slug}/adr/`) or globally (`docs/adr/`)? | architect | — |
| 2 | How should the plugin detect and handle existing `features/` vaults on first load? | pm | — |
