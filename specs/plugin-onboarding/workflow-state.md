---
id: c2d3e4f5-a678-4b90-c123-d4e5f6a7b8c9
feature: "Plugin onboarding flow"
area: POB
slug: plugin-onboarding
current_stage: specification
status: active
last_updated: 2026-05-12
last_agent: architect
draft_pr: 282
createdAt: 2026-05-05T00:00:00+02:00
updatedAt: 2026-05-12T00:00:00+02:00
artifacts:
  idea: complete
  research: complete
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
| 2 — Research | complete | `research.md` | Panel wizard, single textarea, 5-step, example cards |
| 3 — Requirements | complete | `requirements.md` | 29 REQs, 10 NFRs; 2 open Qs (ClaudeCliPort, injection site) |
| 4 — Design | complete | `design.md` | ADR-014–017; Q1+Q2 resolved |
| 5 — Specification | pending | — | |
| 6 — Tasks | pending | — | |
| 7 — Implementation | pending | — | |
| 8 — Testing | pending | — | |
| 9 — Review | pending | — | |
| 10 — Release | pending | — | |
| 11 — Retrospective | pending | — | |

## Blocks

- REQ-POB-018/019 (persona injection) integration-pending `claude-cli-chat-sidebar` shipping `buildSystemPrompt()` — contract defined in ADR-017; fallback covered by omitting block when `userPersona` is empty. Not a blocker for wizard implementation.

## Hand-off notes

| Date | From | To | Note |
|---|---|---|---|
| 2026-05-05 | pm | — | Spec entry created to satisfy Phase 4 spec-first gate; idea authored based on #162 |
| 2026-05-12 | analyst | pm | Research complete. Key decisions: panel wizard (Alt A), single textarea, merge steps 4+5 → 5-step flow, example cards over char-count hint. |
| 2026-05-12 | pm | architect | Requirements complete (proposed). Two open Qs require architect input before design/spec of REQ-POB-008/009/018/019 can proceed. |
| 2026-05-12 | architect | planner | Design complete. Q1 resolved (ADR-017: interface contract defined, impl deferred). Q2 resolved (ADR-014: ClaudeCliPort declared). 4 ADRs filed. Run /spec:specify next. |

## Open clarifications

None. Q1 and Q2 resolved in design stage (ADR-014, ADR-017).
