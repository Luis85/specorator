---
id: c8f9a3b2-d4e5-4f67-89ab-cdef01234567
feature: "Agent Sidepanel MVP"
area: ASM
slug: agent-sidepanel-mvp
current_stage: retrospective
status: complete
last_updated: 2026-05-15
last_agent: retrospective
createdAt: 2026-05-14T00:00:00+02:00
updatedAt: 2026-05-15T13:00:00+02:00
artifacts:
  idea: complete
  research: complete
  requirements: complete
  design: complete
  spec: complete
  tasks: complete
  implementation-log: complete
  test-plan: complete
  test-report: complete
  review: complete
  release-notes: complete
  retrospective: complete
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
| 7 — Implementation | complete | `implementation-log.md` | All 5 PRs merged to `develop`: #325 (PR-ASM-1), #345 (PR-ASM-2), #346 (PR-ASM-3), #347 (PR-ASM-4), #348 (PR-ASM-5) |
| 8 — Testing | complete | inline test gates per PR | 1375/1375 unit tests passing on `develop`; cross-cutting integration tests landed in PR-ASM-5 |
| 9 — Review | complete | Codex review threads on each PR | Each PR went through ≥2 Codex passes; every P1 finding addressed before merge |
| 10 — Release | complete | `release-notes.md` | `develop → demo` promotion 2026-05-15 |
| 11 — Retrospective | complete | `retrospective.md` | Cross-PR retro: what worked, what hurt, what changes for next time |

## Blocks

None — Increment 1 shipped. Future increments tracked separately.

## Hand-off notes

| Date | From | To | Note |
|---|---|---|---|
| 2026-05-14 | pm | analyst | Spec entry created on `claude/add-subscription-support-Cdlat` branch to satisfy the Phase-4 spec-first gate. `idea.md` accepted; design brief filed under `inputs/sidepanel-design-2026-05/`. |
| 2026-05-14 | analyst | pm | `research.md` complete with 10 D-ASM decisions including the ToS-driven "user installs claude themselves, plugin shells out, never reads ~/.claude/" posture. |
| 2026-05-14 | pm | architect | `requirements.md` complete: 55 EARS-format REQ-ASM + 12 NFR-ASM, 16 REQ-CCS reuses by citation, full coverage matrix. |
| 2026-05-14 | architect | architect | Stage-4 Design complete: `design.md` (10.3k words, Parts A/B/C); ADRs 0029 (transport split), 0030 (JSON discipline + Zod), 0031 (session-id location + no-claude-home-reads ESLint rule), 0032 (file-write proposal envelope). 67/67 requirements coverage. |
| 2026-05-14 | architect | planner | `spec.md` complete: implementation-ready contract with 20+ TS interfaces (TransportKind, SessionId branded, StructuredEnvelope union, FileWriteProposal, ClaudeSubscriptionTransportPort, ConfirmModalPort, error types, PluginSettings + ChatStore extensions), 52 TEST-ASM scenarios, INV-1..INV-6 argv invariants, all REQ-ASM + NFR-ASM mapped to spec sections + tests. |
| 2026-05-14 | planner | dev | `tasks.md` complete: 85 contiguous tasks (T-ASM-001..085) across 5 mergeable PRs. PR-ASM-1 (subscription adapter + transport selector, 23 tasks), PR-ASM-2 (stage prompt + structured envelope, 20 tasks), PR-ASM-3 (session persistence + audit log, 15 tasks), PR-ASM-4 (file-write proposal + ConfirmModalPort, 18 tasks), PR-ASM-5 (ESLint rule + integration + release polish, 9 tasks). TDD-paired, zero L estimates, 67/67 coverage. Three non-blocking OQs documented inline. |
| 2026-05-15 | dev | qa | All 5 PR-ASM PRs merged. 1375/1375 tests green. SPEC §13.4 release-blockers checklist verified in PR-ASM-5 (#348). |
| 2026-05-15 | qa | release-manager | Cross-PR review complete. Every P1 Codex finding addressed; no carry-over P1s. `develop` ready for `demo` promotion. |
| 2026-05-15 | release-manager | retrospective | `release-notes.md` written for Increment 1. `develop → demo` PR opened. |
| 2026-05-15 | retrospective | — | `retrospective.md` captured cross-PR learnings; workflow state marked complete. |

## Open clarifications

- **OQ-ASM-T1** (PR-ASM-3): `chatThreads` flush cadence — planner assumed 1 s debounced; implementation landed with that cadence + onunload-synchronous-flush after Codex P1. Closed.
- **OQ-ASM-T2** (PR-ASM-4): proposal-card unmount focus target — implementation returns focus to ChatInput textarea. Holds for now; a11y testing on real surfaces could revisit.
- **OQ-ASM-T3** (PR-ASM-4): potential opt-in eager-flush for `appendUserAssistant` — not pursued. The current fire-and-forget contract held up; revisit only if a real workflow needs it.
