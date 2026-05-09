---
id: b7c8d9e0-f123-4a56-b789-c0d1e2f3a4b5
feature: "Specorator Agent Orchestrator — Symphony-inspired autonomous agent dispatch"
area: SAO
slug: specorator-agent-orchestrator
current_stage: idea
status: active
last_updated: 2026-05-09
last_agent: architect
createdAt: 2026-05-09T00:00:00+02:00
updatedAt: 2026-05-09T00:00:00+02:00
artifacts:
  idea: complete
  research: skipped
  requirements: skipped
  design: draft
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
| 1 — Idea | complete | `idea.md` | Brainstormed from Symphony SPEC.md |
| 2 — Research | skipped | — | Symphony spec + existing port conventions cover domain research |
| 3 — Requirements | skipped | — | PM sign-off to proceed from idea directly; formal requirements deferred |
| 4 — Design | draft | `design.md` | DESIGN-SAO-001; 3 open decisions pending architect sign-off |
| 5 — Specification | pending | — | |
| 6 — Tasks | pending | — | |
| 7 — Implementation | pending | — | |
| 8 — Testing | pending | — | |
| 9 — Review | pending | — | |
| 10 — Release | pending | — | |
| 11 — Retrospective | pending | — | |

## Blocks

- Depends on `claude-cli-chat-sidebar` for `ClaudeCliPort` implementation — SAO cannot be wired up until that port exists.
- Depends on `agent-interaction-placeholder` for the `IAgentBridge` / `OrchestratorPort` typed seam.

## Hand-off notes

| Date | From | To | Note |
|---|---|---|---|
| 2026-05-09 | pm | architect | Idea authored; brainstorm completed; research + requirements skipped per PM sign-off |
| 2026-05-09 | architect | pm | DESIGN-SAO-001 draft written; 3 open decisions need resolution before design accepted |

## Open clarifications

| # | Question | Owner | Resolved |
|---|---|---|---|
| 1 | Per-feature `AGENT.md` template override: MVP or deferred? | pm | — |
| 2 | Merge strategy after agent success: cherry-pick vs. `git merge --no-ff`? | architect | — |
| 3 | `WorktreePort` location: `src/domain/ports/` flat or `src/domain/ports/worktree/` sub-namespace? | architect | — |
