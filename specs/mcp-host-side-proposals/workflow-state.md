---
feature: mcp-host-side-proposals
area: MHP
current_stage: research
status: active
last_updated: 2026-05-24
last_agent: analyst
artifacts:
  idea.md: complete
  research.md: pending
  requirements.md: pending
  design.md: pending
  spec.md: pending
  tasks.md: pending
  implementation-log.md: pending
  test-plan.md: pending
  test-report.md: pending
  review.md: pending
  traceability.md: pending
  release-notes.md: pending
  retrospective.md: pending
---

# Workflow state — mcp-host-side-proposals

## Stage progress

| Stage | Artifact | Status |
|---|---|---|
| 1. Idea | `idea.md` | complete |
| 2. Research | `research.md` | pending |
| 3. Requirements | `requirements.md` | pending |
| 4. Design | `design.md` | pending |
| 5. Specification | `spec.md` | pending |
| 6. Tasks | `tasks.md` | pending |
| 7. Implementation | `implementation-log.md` + code | pending |
| 8. Testing | `test-plan.md`, `test-report.md` | pending |
| 9. Review | `review.md`, `traceability.md` | pending |
| 10. Release | `release-notes.md` | pending |
| 11. Learning | `retrospective.md` | pending |

> **Statuses:** `pending` | `in-progress` | `complete` | `skipped` | `blocked`. Section semantics + status enums: see [`_shared/state-file-sections.md`](./_shared/state-file-sections.md).

## Skips

_None yet._

## Blocks

_None._

## Hand-off notes

```
2026-05-24 (orchestrator): Feature bootstrapped. Existing discovery artifacts
                           live under discovery/obsidian-cli-mcp-expansion/
                           (SYNTHESIS.md is the entry point) — analyst should
                           cite them as upstream evidence during /spec:research.
2026-05-24 (analyst):      idea.md complete; gate PASS. Open CLARs MHP-002/
                           003/004 carried forward to research with current
                           resolution status noted. Researcher should converge
                           on tier-policy thresholds (CLAR-MHP-002) and
                           confirm webviewer carve-out (CLAR-MHP-003) before
                           handoff to PM. Q4–Q7 added in idea.md surface
                           audit-log format, tool naming, system-prompt
                           addendum, DevTools settings ergonomics as new
                           research-stage gaps.
```

## Open clarifications

- [ ] CLAR-MHP-001 — Bearer-token policy. Current default is no token (loopback + proposal-gating + read allow-list). Revisit if multi-user or threat model expands.
- [ ] CLAR-MHP-002 — Tier-policy thresholds (which writes auto-accept vs prompt) need user signoff before /spec:design fixes them.
- [ ] CLAR-MHP-003 — Webviewer scope: ship in this feature or carve out as separate spec? Critic recommends own ADR + fresh Electron partition POC.
- [ ] CLAR-MHP-004 — DevTools opt-in surface. User wants `dev:screenshot` + sophisticated devtools. Decision: low-risk read tools (`screenshot`, `errors`, `console`) on a single DevTools toggle; high-risk (`dom`, `cdp`, `debug`, `mobile`, `devtools`) behind per-tool toggle + warning. ADR-019 must document the threat model the user accepted.

