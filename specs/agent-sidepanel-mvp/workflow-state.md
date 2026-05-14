---
id: c8f9a3b2-d4e5-4f67-89ab-cdef01234567
feature: "Agent Sidepanel MVP"
area: ASM
slug: agent-sidepanel-mvp
current_stage: tasks
status: active
last_updated: 2026-05-14
last_agent: planner
createdAt: 2026-05-14T00:00:00+02:00
updatedAt: 2026-05-14T00:00:00+02:00
artifacts:
  idea: complete
  research: complete
  requirements: complete
  design: complete
  spec: complete
  tasks: complete
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
| 1 — Idea | complete | `idea.md` | IDEA-ASM-001 · Increment 1 of the May-2026 sidepanel design brief |
| 2 — Research | complete | `research.md` | RES-ASM-001 · 10 D-ASM decisions, 7 R-ASM risks, ToS posture locked |
| 3 — Requirements | complete | `requirements.md` | PRD-ASM-001 · 55 REQ-ASM (EARS) + 12 NFR-ASM |
| 4 — Design | complete | `design.md` + 4 ADRs (0029-0032) | DESIGN-ASM-001 · Parts A/B/C; ADRs cover transport split, JSON discipline, session-id location, file-write envelope |
| 5 — Specification | complete | `spec.md` | SPEC-ASM-001 · 9.8k words, 20+ TS interfaces, 52 TEST-ASM scenarios, 67/67 coverage |
| 6 — Tasks | complete | `tasks.md` | TASKS-ASM-001 · 85 tasks across 5 PRs (PR-ASM-1..5), zero L, 67/67 coverage, TDD-paired |
| 7 — Implementation | pending | — | PR-ASM-1..5 dispatch order; each chunk lands as its own PR cut from develop |
| 8 — Testing | pending | — | Per-PR test gates inline; cross-cutting integration tests in PR-ASM-5 |
| 9 — Review | pending | — | Per-PR Codex review + qa sign-off |
| 10 — Release | pending | — | Final release notes after PR-ASM-5 merges |
| 11 — Retrospective | pending | — | Cross-PR retrospective once Increment 1 ships |

## Blocks

None — Stage 6 (Tasks) complete. Awaiting implementation kickoff (PR-ASM-1).

## Hand-off notes

| Date | From | To | Note |
|---|---|---|---|
| 2026-05-14 | pm | analyst | Spec entry created on `claude/add-subscription-support-Cdlat` branch to satisfy the Phase-4 spec-first gate. `idea.md` accepted; design brief filed under `inputs/sidepanel-design-2026-05/`. |
| 2026-05-14 | analyst | pm | `research.md` complete with 10 D-ASM decisions including the ToS-driven "user installs claude themselves, plugin shells out, never reads ~/.claude/" posture. |
| 2026-05-14 | pm | architect | `requirements.md` complete: 55 EARS-format REQ-ASM + 12 NFR-ASM, 16 REQ-CCS reuses by citation, full coverage matrix. |
| 2026-05-14 | architect | architect | Stage-4 Design complete: `design.md` (10.3k words, Parts A/B/C); ADRs 0029 (transport split), 0030 (JSON discipline + Zod), 0031 (session-id location + no-claude-home-reads ESLint rule), 0032 (file-write proposal envelope). 67/67 requirements coverage. |
| 2026-05-14 | architect | planner | `spec.md` complete: implementation-ready contract with 20+ TS interfaces (TransportKind, SessionId branded, StructuredEnvelope union, FileWriteProposal, ClaudeSubscriptionTransportPort, ConfirmModalPort, error types, PluginSettings + ChatStore extensions), 52 TEST-ASM scenarios, INV-1..INV-6 argv invariants, all REQ-ASM + NFR-ASM mapped to spec sections + tests. |
| 2026-05-14 | planner | dev | `tasks.md` complete: 85 contiguous tasks (T-ASM-001..085) across 5 mergeable PRs. PR-ASM-1 (subscription adapter + transport selector, 23 tasks), PR-ASM-2 (stage prompt + structured envelope, 20 tasks), PR-ASM-3 (session persistence + audit log, 15 tasks), PR-ASM-4 (file-write proposal + ConfirmModalPort, 18 tasks), PR-ASM-5 (ESLint rule + integration + release polish, 9 tasks). TDD-paired, zero L estimates, 67/67 coverage. Three non-blocking OQs documented inline. |

## Open clarifications

- **OQ-ASM-T1** (PR-ASM-3): `chatThreads` flush cadence — planner assumed 1 s debounced; can be revisited during PR-ASM-3 implementation if SPEC §9.3 needs to pin it.
- **OQ-ASM-T2** (PR-ASM-4): proposal-card unmount focus target — planner assumed return to ChatInput textarea; revisit during PR-ASM-4 UI design if a11y testing reveals a better target.
- **OQ-ASM-T3** (PR-ASM-4): potential opt-in eager-flush for `appendUserAssistant` — additive, not blocking PR-ASM-4.
