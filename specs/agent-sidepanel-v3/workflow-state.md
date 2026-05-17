---
id: a7f3b9d2-4c81-4e6a-9f12-3b8e5c7d2a91
feature: 'Agent Sidepanel v3 — Post-v2 deepening + UX/perf/a11y/sec hardening'
area: ASV3
slug: agent-sidepanel-v3
current_stage: implementation-log
status: active
last_updated: 2026-05-17
last_agent: pm
createdAt: 2026-05-17T00:00:00+02:00
updatedAt: 2026-05-17T00:00:00+02:00
artifacts:
  idea: complete
  research: complete
  requirements: complete
  design: complete
  spec: complete
  tasks: complete
  implementation-log: in-progress
  test-plan: complete
  test-report: pending
  review: pending
  release-notes: pending
  retrospective: pending
references:
  - spec: 'specs/agent-sidepanel-v2/idea.md'
  - spec: 'specs/agent-sidepanel-v2/workflow-state.md'
  - skill: 'https://github.com/mattpocock/skills/tree/main/skills/engineering/improve-codebase-architecture'
---

## Stage progress

| Stage | Status | Artifact | Notes |
| --- | --- | --- | --- |
| 1 — Idea | complete | `idea.md` | Post-v2 follow-up wave. PM-authorised inline. |
| 2 — Research | complete | inline (6 reviewer subagents) | Architecture (Matt Pocock skill) + UX + Security + Performance + Accessibility + Testing. Findings synthesised in `work-packages.md`. |
| 3 — Requirements | complete | implicit — derived from reviewer findings | Each WP brief carries its acceptance criteria. |
| 4 — Design | complete | per-WP `brief.md` | Each WP brief specifies the chosen approach + risk callouts. |
| 5 — Specification | complete | per-WP `brief.md` | Brief = spec + tasks. |
| 6 — Tasks | complete | `work-packages.md` + per-WP briefs | 15 PR-sized work packages, sequenced into 5 lanes. |
| 7 — Implementation | in-progress | per-WP loop-state.md | RALPH-loop implementer subagent per WP. Lanes 1 + 2 launched first. |
| 8 — Testing | per-WP | per-WP definition of done | Each WP's DoD includes the relevant test additions. |
| 9 — Review | pending | per-PR Codex review | Each WP opens its own PR targeting `develop`. |
| 10 — Release | pending | post-stack consolidation | Tracked separately after lanes complete. |
| 11 — Retrospective | pending | — | Post lanes 1+2. |

## Work packages

See `work-packages.md` for the full table. Per-WP folders hold `brief.md` (scope + DoD) and `loop-state.md` (RALPH heuristic, updated by the implementer each iteration).

## Lanes

| Lane | WPs | Sequencing |
| --- | --- | --- |
| Spine | WP-1 → (WP-11 ∥ WP-12) | WP-11 + WP-12 require WP-1 |
| Store + UX | WP-3 → WP-2 → (WP-7 ∥ WP-8) | Sequential inner; WP-7/8 parallel |
| Markdown | WP-4 | Independent |
| Log | WP-5 | Independent (needs `VaultPort.appendFile`) |
| Mount | WP-6 | Independent |
| Security | WP-9 | Independent |
| Perf | WP-10 | After WP-2 + WP-3 |
| Tests | WP-13, WP-14 | Independent |
| Cleanup | WP-15 | Last |

## Blocks

None.

## Hand-off notes

| Date | From | To | Note |
| --- | --- | --- | --- |
| 2026-05-17 | pm | dev | Six parallel reviewer subagents completed against the agent-sidepanel-v2 stack on `develop`. Findings consolidated into 15 work packages. Lanes 1 (Spine) and 2 (Store + UX) launched first per PM direction. Each implementer subagent runs a RALPH loop scoped to its WP folder; one PR per WP, all targeting `develop`. |
