---
id: b7c8d9e0-f123-4a56-b789-c0d1e2f3a4b5
feature: "Specorator Agent Orchestrator — Symphony-inspired autonomous agent dispatch"
area: SAO
slug: specorator-agent-orchestrator
current_stage: idea
status: active
last_updated: 2026-05-09
last_agent: pm
createdAt: 2026-05-09T00:00:00+02:00
updatedAt: 2026-05-09T00:00:00+02:00
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
| 1 — Idea | complete | `idea.md` | Brainstormed from Symphony SPEC.md; design doc in `docs/superpowers/specs/` |
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

- Depends on `claude-cli-chat-sidebar` for `ClaudeCliPort` implementation — SAO cannot be wired up until that port exists.
- Depends on `agent-interaction-placeholder` for the `IAgentBridge` / `OrchestratorPort` typed seam.

## Hand-off notes

| Date | From | To | Note |
|---|---|---|---|
| 2026-05-09 | pm | — | Idea authored; brainstorm design doc written; spec-first gate satisfied for idea stage |

## Open clarifications

| # | Question | Owner | Resolved |
|---|---|---|---|
| 1 | Per-feature `AGENT.md` template override: MVP or deferred? | pm | — |
| 2 | Merge strategy after agent success: cherry-pick vs. `git merge --no-ff`? | architect | — |
| 3 | `WorktreePort` location: `src/domain/ports/` flat or `src/domain/ports/worktree/` sub-namespace? | architect | — |
