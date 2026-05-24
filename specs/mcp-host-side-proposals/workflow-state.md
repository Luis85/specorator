---
feature: mcp-host-side-proposals
area: MHP
current_stage: design
status: active
last_updated: 2026-05-24
last_agent: pm
artifacts:
  idea.md: complete
  research.md: complete
  requirements.md: complete
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
| 3. Requirements | `requirements.md` | complete |
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
2026-05-24 (pm):           requirements.md complete; 40 REQs + 14 NFRs + 6
                           JTBDs. Gate FAIL on 2 open CLARs. CLAR-MHP-005
                           closed by REQ-MHP-038 (ephemeral v1 + shutdown
                           audit rows). New CLAR-MHP-006 surfaced: client
                           identification mechanism (`x-mcp-client-name`
                           header vs MCP-native `clientInfo.name` from
                           initialize). REQ-MHP-014 deny-list explicitly
                           EXCLUDES the 8 DevTools commands (CLAR-MHP-004
                           user override over SYNTHESIS deny-list).
                           Recommend `/spec:clarify` to resolve CLAR-MHP-002
                           (user signoff on REQ-MHP-009) and CLAR-MHP-006
                           before `/spec:design`.
```

## Open clarifications

- [x] CLAR-MHP-001 — Bearer-token policy. *(resolved 2026-05-24: no token for this feature; loopback + proposal-gating + read allow-list. Revisit if multi-user.)*
- [ ] CLAR-MHP-002 — Tier-policy thresholds. Research answered (`research.md` Q1) with defaults; user signoff still required (only auto-accept default that ships here is REQ-MHP-009 active-feature-append rule — other Tier-B thresholds deferred to follow-up).
- [x] CLAR-MHP-003 — Webviewer scope. *(resolved 2026-05-24: carve out into separate spec; this feature emits `kind` discriminator only for forward compatibility — `research.md` Q2.)*
- [x] CLAR-MHP-004 — DevTools opt-in surface. *(resolved 2026-05-24: per-tool threat model drafted in `research.md` Q3 and will be embedded verbatim in ADR-019.)*
- [x] CLAR-MHP-005 — Proposal-queue persistence across plugin restarts. *(resolved 2026-05-24 by REQ-MHP-038: ephemeral v1, log discarded proposals on shutdown, persistence deferred to follow-up.)*
- [ ] CLAR-MHP-006 — Client identification mechanism. REQ-MHP-034 specifies `x-mcp-client-name` header but MCP-native path is parsing `clientInfo.name` from the `initialize` request. Resolve at /spec:design; testable intent (capture identity, fall back to `unknown`) is wire-mechanism-agnostic.


