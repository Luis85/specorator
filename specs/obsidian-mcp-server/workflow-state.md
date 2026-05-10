---
id: c4a5b6d7-e890-4f12-a345-b6c7d8e9f012
feature: "Obsidian MCP server"
area: MCP
slug: obsidian-mcp-server
current_stage: research
status: active
last_updated: 2026-05-10
last_agent: research
createdAt: 2026-05-10T00:00:00+02:00
updatedAt: 2026-05-10T00:00:00+02:00
artifacts:
  idea: skipped
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
| 1 — Idea | skipped | — | Feature surface defined upstream by #165 (requirement) and #184 (epic). |
| 2 — Research | complete | `research.md` | Closes #203. Decision: in-process ports for all tools; `vault_move_note` uses `app.fileManager.renameFile()`. |
| 3 — Requirements | pending | — | Captured in #165 + #184 issue bodies; formal artifact deferred until needed. |
| 4 — Design | pending | — | |
| 5 — Specification | pending | — | |
| 6 — Tasks | pending | — | Tracked as sub-issues #190 / #191 / #192 / #193 of #184. |
| 7 — Implementation | pending | — | |
| 8 — Testing | pending | — | |
| 9 — Review | pending | — | |
| 10 — Release | pending | — | |
| 11 — Retrospective | pending | — | |

## Blocks

None. #190 was waiting on this research note to confirm `vault_move_note` strategy — now unblocked.

## Hand-off notes

| Date | From | To | Note |
|---|---|---|---|
| 2026-05-10 | research | engineering | `research.md` posted. `vault_move_note` → `app.fileManager.renameFile()` via new `VaultPort.moveFile`. No CLI delegation. |

## Open clarifications

None.
