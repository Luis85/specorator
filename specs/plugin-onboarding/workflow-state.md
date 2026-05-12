---
id: c2d3e4f5-a678-4b90-c123-d4e5f6a7b8c9
feature: "Plugin onboarding flow"
area: POB
slug: plugin-onboarding
current_stage: research
status: active
last_updated: 2026-05-12
last_agent: analyst
draft_pr: 282
createdAt: 2026-05-05T00:00:00+02:00
updatedAt: 2026-05-12T00:00:00+02:00
artifacts:
  idea: complete
  research: complete
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
| 1 — Idea | complete | `idea.md` | |
| 2 — Research | complete | `research.md` | Panel wizard, single textarea, 5-step, example cards |
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

`ClaudeCliPort` not yet declared — blocked on `claude-cli-chat-sidebar` spec. Step 3 needs graceful fallback until port is available. `buildSystemPrompt()` injection site not yet located — architect must confirm before persona-injection requirement can be written.

## Hand-off notes

| Date | From | To | Note |
|---|---|---|---|
| 2026-05-05 | pm | — | Spec entry created to satisfy Phase 4 spec-first gate; idea authored based on #162 |
| 2026-05-12 | analyst | pm | Research complete. Key decisions: panel wizard (Alt A), single textarea, merge steps 4+5 → 5-step flow, example cards over char-count hint. Three open items for PM before requirements: ClaudeCliPort fallback, buildSystemPrompt injection site, settings-tab re-entry mechanism. |

## Open clarifications

None.
