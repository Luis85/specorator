---
id: TESTREPORT-<AREA>-NNN
title: <Feature name> — Test report
stage: testing
feature: <feature-slug>
status: draft           # draft | complete
owner: qa
inputs:
  - TESTPLAN-<AREA>-NNN
created: YYYY-MM-DD
updated: YYYY-MM-DD
---

# Test report — <Feature name>

## Summary

| Total | Passed | Failed | Skipped | Coverage |
|---|---|---|---|---|
| … | … | … | … | …% |

## Per-requirement results

<!--
TEST-* IDs MUST go in a NON-LEADING column.

`spec.md` is the canonical source of TEST-* definitions (its `## Test scenarios` table
defines them with TEST IDs in the first column). This file only references those IDs.

If you put `TEST-<AREA>-NNN` in the first column of a table here, `specorator check:traceability`
(Specorator plugin command — not a local npm script) treats the row as a NEW definition
and reports a collision against `spec.md`. Keep the first column as the REQ/NFR ID and
list the TEST IDs in a later column.
-->

| REQ ID | Tests | Passed | Failed | Status |
|---|---|---|---|---|
| REQ-<AREA>-001 | TEST-<AREA>-001, TEST-<AREA>-002 | 2 | 0 | ✅ |
| REQ-<AREA>-002 | TEST-<AREA>-003 | 0 | 1 | ❌ |

## Failures

For each failure:

### TEST-<AREA>-NNN — <short title>

- **Requirement:** REQ-<AREA>-NNN
- **Expected:** …
- **Actual:** …
- **Reproduction:** steps or link to CI run
- **Severity:** S1 | S2 | S3 | S4
- **Suspected root cause:** …
- **Owner:** …

## Non-functional results

| Check | Result | Threshold | Pass? |
|---|---|---|---|
| API p95 latency | 187 ms | ≤ 200 ms | ✅ |
| a11y | 2 minor | 0 critical | ✅ |
| SAST | 0 high | 0 high | ✅ |

## Coverage gaps

Areas where coverage is incomplete and why. Risk of each gap.

## Recommendation

- [ ] Ready for `/spec:review`
- [ ] Needs more work — list blockers

---

## Quality gate

- [ ] Every EARS clause has ≥ 1 test executed.
- [ ] Critical paths covered.
- [ ] Coverage threshold met (project-defined in `docs/steering/quality.md`).
- [ ] Non-functional checks run where relevant (perf, a11y, security, i18n).
- [ ] Failures reproducible from the report.
- [ ] Coverage gaps disclosed (not hidden).
