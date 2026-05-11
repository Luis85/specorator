---
id: TESTPLAN-<AREA>-NNN
title: <Feature name> — Test plan
stage: testing
feature: <feature-slug>
status: draft         # draft | accepted | complete  (use the artifact-map's `in-progress` for the executing window)
owner: qa
inputs:
  - PRD-<AREA>-NNN
  - SPECDOC-<AREA>-NNN
created: YYYY-MM-DD
updated: YYYY-MM-DD
---

# Test plan — <Feature name>

## Scope

What this plan validates, and what it doesn't.

## Test types in scope

- [ ] Unit
- [ ] Integration
- [ ] End-to-end
- [ ] Contract
- [ ] Performance
- [ ] Security
- [ ] Accessibility
- [ ] Localisation
- [ ] Manual exploratory

## Entry criteria

- [ ] Spec accepted.
- [ ] Implementation complete for the scope under test.
- [ ] Test environment provisioned and seeded.

## Exit criteria

- [ ] Every EARS clause has ≥ 1 test referencing its REQ ID.
- [ ] Critical paths covered.
- [ ] Coverage threshold met.
- [ ] No critical defects open.
- [ ] Failures reproducible from the report.

## Test inventory

<!--
TEST-* IDs MUST go in a NON-LEADING column.

`spec.md` is the canonical source of TEST-* definitions (its `## Test scenarios` table
defines them with TEST IDs in the first column). This file only references those IDs.

If you put `TEST-<AREA>-NNN` in the first column of a table here, `npm run check:traceability`
treats the row as a NEW definition and reports a collision against `spec.md`. Keep the
first column as the REQ/NFR/Group ID and place the TEST ID in a later column.
-->

| REQ ID | Test ID | Type | Description | Owner |
|---|---|---|---|---|
| REQ-<AREA>-001 | TEST-<AREA>-001 | unit | Happy path: … | qa |
| REQ-<AREA>-001 | TEST-<AREA>-002 | integration | Edge: … | qa |
| REQ-<AREA>-002 | TEST-<AREA>-003 | e2e | Full flow: … | qa |

## Non-functional checks

| Check | Tool | Threshold |
|---|---|---|
| API p95 latency | k6 / wrk | ≤ 200 ms |
| Bundle size | size-limit | ≤ X KB |
| a11y | axe-core | 0 critical |
| SAST | <tool> | 0 high |

## Test data

Where test data comes from, how it's seeded, how secrets are handled.

## Risks to test coverage

- (Areas where coverage will be partial and why.)

---

## Quality gate

- [ ] Every EARS clause has ≥ 1 planned test referencing its REQ ID.
- [ ] Edge cases from spec have planned tests.
- [ ] Non-functional checks listed with tools and thresholds.
- [ ] Entry and exit criteria stated.
