---
id: f1a2b3c4-d5e6-47f8-9a01-b2c3d4e5f607
feature: "Obsidian CLI-backed MCP server"
area: OCM
slug: obsidian-cli-mcp-server
current_stage: implementation
status: active
last_updated: 2026-05-23
last_agent: dev
createdAt: 2026-05-23T00:00:00+02:00
updatedAt: 2026-05-23T00:00:00+02:00
artifacts:
  idea: complete
  research: complete
  requirements: complete
  design: complete
  spec: complete
  tasks: complete
  implementation-log: in-progress
  test-plan: pending
  test-report: pending
  review: pending
  release-notes: pending
  retrospective: pending
---

# Workflow state — obsidian-cli-mcp-server

## Stage progress

| Stage | Status | Artifact | Notes |
|---|---|---|---|
| 1 — Idea | complete | `idea.md` | Wrap the official Obsidian CLI as an MCP tool surface, managed from settings. |
| 2 — Research | complete | `research.md` | Confirmed the official Obsidian CLI exists (1.12+, Feb 2026); captured command surface, MCP-SDK facts, and the existing in-process MCP server (ADR-013). |
| 3 — Requirements | complete | `requirements.md` | EARS requirements REQ-OCM-001…018, NFR-OCM-001…006. |
| 4 — Design | complete | `design.md` | New `ObsidianCliPort`, `ObsidianCliAdapter`, `ObsidianCliBinaryResolver`, `registerObsidianCliTools`, settings section. ADR-018. |
| 5 — Specification | complete | `spec.md` | SPEC-OCM-001 — port contract, tool surface, allow-list, settings UI. |
| 6 — Tasks | complete | `tasks.md` | T-OCM-001…015. |
| 7 — Implementation | in-progress | code + `implementation-log.md` | Vertical slice on branch `claude/affectionate-ramanujan-SJHOH`. |
| 8 — Testing | pending | — | Unit tests for port/adapter/resolver/tool-group/mock + settings coercion. |
| 9 — Review | pending | — | |
| 10 — Release | pending | — | |
| 11 — Retrospective | pending | — | |

## Skips

None.

## Blocks

None.

## Hand-off notes

| Date | From | To | Note |
|---|---|---|---|
| 2026-05-23 | research | dev | Official CLI confirmed real. Build the MCP tool surface on it as an additive group inside `ObsidianMcpServerAdapter`. Writes via `ProposalStore`; never expose `eval`/destructive commands. |

## Open clarifications

- [ ] CLAR-OCM-001 — Whether to additionally ship a *standalone* stdio MCP process (for external clients that aren't already pointed at the loopback HTTP server). Deferred; the loopback HTTP transport (ADR-013) is the v1 surface and the CLI tool group rides it.
- [ ] CLAR-OCM-002 — Exact binary name/discovery path of the official CLI per OS once it is GA on the user's machine. The resolver uses `obsidian` on PATH; the settings field accepts an explicit absolute path as the authoritative override.
- [ ] CLAR-OCM-003 — A genuinely read-only "daily note" CLI subcommand (e.g. a `daily:path`/`daily:read` variant) once confirmed in the official CLI docs. Until then, `daily` is excluded from the read surface (it can create today's note); a daily-note *creation* tool, if added, would go through `ProposalStore`. Raised by Codex review on PR #428.
