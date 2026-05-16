---
id: d7e8f9a0-1234-4b56-9c78-d9e0f1a2b3c4
feature: 'Agent Sidepanel v2'
area: ASV
slug: agent-sidepanel-v2
current_stage: idea
status: active
last_updated: 2026-05-16
last_agent: pm
createdAt: 2026-05-16T00:00:00+02:00
updatedAt: 2026-05-16T00:00:00+02:00
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

| Stage              | Status   | Artifact  | Notes                                                                                   |
| ------------------ | -------- | --------- | --------------------------------------------------------------------------------------- |
| 1 — Idea           | complete | `idea.md` | IDEA-ASV-001 — Lift chat into its own dedicated sidepanel + adopt Claudian-inspired UX. |
| 2 — Research       | pending  | —         |                                                                                         |
| 3 — Requirements   | pending  | —         |                                                                                         |
| 4 — Design         | pending  | —         |                                                                                         |
| 5 — Specification  | pending  | —         |                                                                                         |
| 6 — Tasks          | pending  | —         |                                                                                         |
| 7 — Implementation | pending  | —         | PR-ASV-1 (structural lift) will land first on `claude/refactor-agent-sidepanel-2CDgl`.  |
| 8 — Testing        | pending  | —         |                                                                                         |
| 9 — Review         | pending  | —         |                                                                                         |
| 10 — Release       | pending  | —         |                                                                                         |
| 11 — Retrospective | pending  | —         |                                                                                         |

## Blocks

None.

## Hand-off notes

| Date       | From | To  | Note                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ---------- | ---- | --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-05-16 | pm   | dev | Spec entry created on `claude/refactor-agent-sidepanel-2CDgl` to track the agent-sidepanel v2 work. Increment 1 of v2 is a pure structural lift: extract chat into its own `ItemView` (`VIEW_TYPE = 'specorator-agent'`), remove `/chat` from `MainLayout` tab nav, preserve every existing REQ-CCS / REQ-ASM behaviour. Claudian-style UX features (multi-turn message list, streaming, slash-command palette, @file mentions) land as Increment 2+. |
| 2026-05-16 | dev  | qa  | PR-ASV-1 landed structural lift + multi-turn message list. New surfaces: `AgentSidepanelView` (`VIEW_TYPE_AGENT = 'specorator-agent'`), `AgentSidepanelRoot.vue`, `AgentSidepanelHeader.vue`, `MessageList.vue`, `ChatMessage` DTO + `appendMessage`/`clearThreadMessages` store actions. Removed: `/chat` route, `ChatSidebarView.vue`, `nav.chat` i18n key. URI handler reroutes `open-chat`/`focus-chat` to the new sidepanel. 1445 tests pass (34 new), typecheck clean, plugin build and standalone web build pass. Streaming, slash palette, `@`-mentions, stop-button still deferred to Increment 2.   |

## Open clarifications

- **OQ-ASV-1** — Increment 2 scope ordering: which Claudian-inspired feature ships first? Candidates: streaming responses, slash-command palette, @file mentions, stop-generation control. PM to confirm before research stage.
- **OQ-ASV-2** — Standalone web demo lost the chat surface in Increment 1 (no `/chat` route). Acceptable trade-off, but if we want to keep a demo we'd add a `/agent` route in `src/ui/main.ts` only. Defer decision to design stage.
