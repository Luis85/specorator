---
feature: mcp-host-side-proposals
area: MHP
current_stage: requirements
status: active
last_updated: 2026-05-24
last_agent: analyst
artifacts:
  idea.md: complete
  research.md: complete
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
| 2. Research | `research.md` | complete |
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
2026-05-24 (analyst):      research.md complete; gate PASS. All 7 research
                           questions answered. Webviewer carve-out confirmed
                           (CLAR-MHP-003 closed). DevTools threat-model text
                           ready for ADR-019 (CLAR-MHP-004 closed). New
                           CLAR-MHP-005 surfaced: proposal-queue ephemerality
                           on plugin restart — recommend ephemeral v1 with
                           shutdown logging; PM to confirm. New risks
                           RISK-MHP-001..008 documented; PM should map to
                           requirements (esp. RISK-MHP-001 dual-accept race,
                           RISK-MHP-008 system-prompt-addendum drift). Tool
                           naming verdict: `workflow_proposal_*` namespace.
```

## Open clarifications

- [x] CLAR-MHP-001 — Bearer-token policy. *(resolved 2026-05-24: no token for this feature; loopback + proposal-gating + read allow-list. Revisit if multi-user.)*
- [ ] CLAR-MHP-002 — Tier-policy thresholds. Research answered (`research.md` Q1) with defaults; user signoff still required at /spec:design.
- [x] CLAR-MHP-003 — Webviewer scope. *(resolved 2026-05-24: carve out into separate spec; this feature emits `kind` discriminator only for forward compatibility — `research.md` Q2.)*
- [x] CLAR-MHP-004 — DevTools opt-in surface. *(resolved 2026-05-24: per-tool threat model drafted in `research.md` Q3 and will be embedded verbatim in ADR-019.)*
- [ ] CLAR-MHP-005 — Proposal-queue persistence across plugin restarts. Recommendation in `research.md`: ephemeral for v1, log discarded proposals on shutdown, defer persistence to follow-up. PM to confirm during /spec:requirements.


