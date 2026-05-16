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

- Depends on IDEA-TSP-001 (terminal sidepanel) — the PTY spawn site is where the env vars must be injected.

## Hand-off notes

| Date | From | To | Note |
|---|---|---|---|
| 2026-05-16 | pm | — | Spec entry created. Layers Claude Code IDE integration protocol (reverse-engineered, used by VS Code / JetBrains / Neovim) on top of IDEA-TSP-001 to give the embedded Claude session ambient awareness of vault state. |

## Open clarifications

- WebSocket implementation choice: bundle `ws` vs. hand-rolled `http` upgrade handshake. Bundle-size impact on the plugin must be measured.
- Minimum viable tool surface — confirm via Claude Code traces which tools are actually called during typical interactive sessions.
- `openDiff` modal UX — side-by-side vs. unified vs. inline; persistence path when accepted (direct `VaultPort.writeFile` vs. review queue).
- Behaviour when a concurrent VS Code or JetBrains IDE is running on the same machine and Claude is launched from the Obsidian-spawned terminal — confirm `CLAUDE_CODE_SSE_PORT` correctly disambiguates.
- Autosave reconciliation for `checkDocumentDirty` / `saveDocument`.
