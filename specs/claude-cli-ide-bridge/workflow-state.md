---
id: 7c7348cf-e2d3-4a34-933f-0436cb6d4e87
feature: "Claude CLI IDE bridge"
area: CIB
slug: claude-cli-ide-bridge
current_stage: idea
status: active
last_updated: 2026-05-16
last_agent: pm
createdAt: 2026-05-16T00:00:00+02:00
updatedAt: 2026-05-16T12:55:00+02:00
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
| 1 — Idea | complete | `idea.md` | |
| 2 — Research | pending | — | |
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

- **Hard dependency on IDEA-TSP-001 (terminal sidepanel).** The PTY spawn site is where the bridge's environment variables must be injected into the child process. TSP must reach the design stage and expose a spawn-env hook before this feature can advance past requirements.

## Hand-off notes

| Date | From | To | Note |
|---|---|---|---|
| 2026-05-16 | pm | — | Spec entry created. Layers Claude Code IDE integration protocol (reverse-engineered, used by VS Code / JetBrains / Neovim) on top of IDEA-TSP-001 to give the embedded Claude session ambient awareness of vault state. |
| 2026-05-16 | pm | analyst | Idea revised after parallel PM / architecture / security review and three deep-research passes (protocol details, Obsidian API mapping, WebSocket library choice). Solution detail demoted to research questions; ports split per ADR-008; same-UID threat boundary, origin header, stale-lockfile sweep, multi-window safety added to constraints and questions. |

## Open clarifications

- ADR target: ownership of the bridge's lifecycle — terminal panel (start on open) versus PluginCore (start on load). Parity with `ObsidianMcpServerPort` (PluginCore-owned) is the prevailing precedent.
- ADR target: `openDiff` accept path — reuse the existing propose/commit envelope (ADR-0032) versus a new direct write path via `VaultPort.writeFile` with vault-scoped path validation.
- Subscribe-vs-modify decision for REQ-CCS-009 "Add to chat context" integration. Event-bus emission is the preferred shape — confirm with the chat-sidebar owner before requirements.
- WebSocket implementation choice and bundle-size delta. Research recommends `ws ^8.x` (~30 KB added to the plugin bundle, used by the closest prior-art Obsidian plugin); confirm during requirements.
- Minimum viable tool surface. Reverse-engineered references suggest five-to-six tools cover real usage; remaining tools can ship as documented stubs.
- Behaviour when a concurrent VS Code or JetBrains IDE is running on the same machine — research confirms `CLAUDE_CODE_SSE_PORT` strictly disambiguates and there is no silent first-lockfile-wins fallback.
- Autosave reconciliation for `checkDocumentDirty` / `saveDocument` — working hypothesis: report `isDirty: false`; `saveDocument` calls `TextFileView.save()` to force a flush.
