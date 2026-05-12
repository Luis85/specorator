---
id: RTM-<AREA>-NNN
title: <Feature name> — Traceability matrix
stage: review
feature: <feature-slug>
status: draft           # draft | complete
owner: reviewer
inputs:
  - PRD-<AREA>-NNN
  - SPECDOC-<AREA>-NNN
  - TASKS-<AREA>-NNN
  - IMPL-LOG-<AREA>-NNN
  - TESTREPORT-<AREA>-NNN
generated: YYYY-MM-DD HH:MM
---

# Traceability matrix — <Feature name>

> Should be regenerable from the artifacts — document-level frontmatter plus the marked-up per-item entries in body (REQ/SPEC/T headings and `Satisfies:` fields). Any empty cell is a defect.

## Forward chain

| REQ | Spec | Tasks | Code | Tests | Status |
|---|---|---|---|---|---|
| REQ-<AREA>-001 | SPEC-<AREA>-001 | T-<AREA>-001, T-<AREA>-002, T-<AREA>-003 | `src/...:42-98` | TEST-<AREA>-001, TEST-<AREA>-002 | ✅ |
| REQ-<AREA>-002 | SPEC-<AREA>-002 | T-<AREA>-004, T-<AREA>-005 | `src/...:12-60` | TEST-<AREA>-003 | ⚠️ 1 failing |
| REQ-<AREA>-003 | SPEC-<AREA>-003 | T-<AREA>-006 | — | — | ❌ not started |

## Reverse coverage check

> Every test, task, and material code change must reference an upstream ID.

### Orphan tests (tests without a REQ ID)

- — none —

### Orphan tasks (tasks without a REQ / SPEC ID)

- — none —

### Orphan ADRs (decisions without a triggering artifact)

- — none —

## Coverage summary

| Bucket | Total | Covered | %% |
|---|---|---|---|
| Functional REQs | … | … | …% |
| NFRs | … | … | …% |
| Edge cases (from spec) | … | … | …% |

## Open items blocking review

- [ ] REQ-<AREA>-003 — implementation not started; planned for next cycle? Owner?

---

## Quality gate

- [ ] Every REQ row has all downstream cells filled or marked as accepted gap.
- [ ] No orphan tests / tasks / ADRs.
- [ ] Coverage summary shows the bar set in `docs/quality-framework.md` is met.
