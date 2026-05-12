---
id: REVIEW-<AREA>-NNN
title: <Feature name> — Review
stage: review
feature: <feature-slug>
status: draft          # draft | complete
owner: reviewer
inputs:
  - PRD-<AREA>-NNN
  - DESIGN-<AREA>-NNN
  - SPECDOC-<AREA>-NNN
  - TASKS-<AREA>-NNN
  - IMPL-LOG-<AREA>-NNN
  - TESTREPORT-<AREA>-NNN
created: YYYY-MM-DD
updated: YYYY-MM-DD
---

# Review — <Feature name>

## Verdict

- [ ] ✅ Approved — proceed to release.
- [ ] ⚠️ Approved with conditions — see findings.
- [ ] ❌ Blocked — must address before release.

## Requirements compliance

| REQ ID | Satisfied? | Evidence |
|---|---|---|
| REQ-<AREA>-001 | ✅ | TEST-<AREA>-001, TEST-<AREA>-002, RTM row |
| REQ-<AREA>-002 | ❌ | Implementation missing branch X |

## Design compliance

Did implementation honour the design? Note any drift.

## Spec compliance

Any deviations from spec? Are they logged and justified in the implementation log? Material ones must have ADRs.

## Constitution check

Does this work uphold the constitution's principles? Note any violations.

## Risks

Status of every risk from `research.md` and `design.md`. Any new risks discovered during implementation?

## Findings

For each issue found in this review:

### R-<AREA>-001 — <short title>

- **Severity:** critical | high | medium | low
- **Category:** correctness | security | performance | maintainability | a11y | docs | other
- **Where:** file:line, or section reference
- **Description:** …
- **Recommendation:** …
- **Owner:** …
- **Status:** open | accepted-as-is | scheduled-fix | fixed-in-this-cycle

## Traceability matrix

Status of `traceability.md`:

- [ ] Complete — every REQ has downstream rows filled.
- [ ] Incomplete — list gaps.

## Recommendation

What needs to happen before `/spec:release`?

---

## Quality gate

- [ ] Requirements satisfied (verified against RTM).
- [ ] Design honoured.
- [ ] No critical findings open.
- [ ] Risk assessment current.
- [ ] Traceability matrix complete and consistent.
- [ ] Constitution check passes.
