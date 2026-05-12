---
id: c2d3e4f5-a678-4b90-c123-d4e5f6a7b8c9
feature: "Plugin onboarding flow"
area: POB
slug: plugin-onboarding
current_stage: design
status: active
last_updated: 2026-05-12
last_agent: pm
draft_pr: 282
createdAt: 2026-05-05T00:00:00+02:00
updatedAt: 2026-05-12T00:00:00+02:00
artifacts:
  idea: complete
  research: complete
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
| 2 — Research | complete | `research.md` | Panel wizard, single textarea, 5-step, example cards |
| 3 — Requirements | complete | `requirements.md` | 29 REQs, 10 NFRs; 2 open Qs (ClaudeCliPort, injection site) |
| 4 — Design | pending | — | |
| 5 — Specification | pending | — | |
| 6 — Tasks | pending | — | |
| 7 — Implementation | pending | — | |
| 8 — Testing | pending | — | |
| 9 — Review | pending | — | |
| 10 — Release | pending | — | |
| 11 — Retrospective | pending | — | |

## Blocks

`ClaudeCliPort` not yet declared — blocked on `claude-cli-chat-sidebar` spec. REQ-POB-009 covers graceful fallback. `buildSystemPrompt()` injection site not located — architect must identify before REQ-POB-018/019 implementation can begin.

## Hand-off notes

| Date | From | To | Note |
|---|---|---|---|
| 2026-05-05 | pm | — | Spec entry created to satisfy Phase 4 spec-first gate; idea authored based on #162 |
| 2026-05-12 | analyst | pm | Research complete. Key decisions: panel wizard (Alt A), single textarea, merge steps 4+5 → 5-step flow, example cards over char-count hint. |
| 2026-05-12 | pm | architect | Requirements complete (proposed). Two open Qs require architect input before design/spec of REQ-POB-008/009/018/019 can proceed. Run /spec:clarify to resolve Q1+Q2 before /spec:design. |

## Open clarifications

- **Q1 — Persona injection site** — `buildSystemPrompt()` not found in codebase. May be introduced by `claude-cli-chat-sidebar`. REQ-POB-018/019 define the contract; architect must identify integration point before implementation. *Owner: architect.* Status: open.
- **Q2 — ClaudeCliPort interface** — Not yet declared in `src/domain/ports/`. REQ-POB-008 depends on `isAvailable(): Promise<boolean>`. Must be declared and registered in MockBridge before Step 3 implementation. *Owner: architect / claude-cli-chat-sidebar spec.* Status: open.
