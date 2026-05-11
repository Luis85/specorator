---
id: RELREADY-<AREA>-NNN
title: <Feature name> — Release readiness guide
stage: release
feature: <feature-slug>
status: draft        # draft | ready | ready-with-conditions | not-ready | blocked
owner: release-manager
inputs:
  - REVIEW-<AREA>-NNN
created: YYYY-MM-DD
updated: YYYY-MM-DD
---

# Release readiness guide — <Feature name>

## Decision

| Field | Value |
|---|---|
| Target release | <version, tag, or date> |
| Decision needed | Go / go with conditions / no-go |
| Decision owner | <name or role> |
| Required approvers | <product, engineering, operations, support, security, legal, customer, etc.> |
| Decision deadline | <date/time/timezone> |

## Increment summary

- What is shipping:
- Why now:
- Primary users or customers affected:
- Business or mission outcome:
- Linked release notes:

## Readiness by perspective

| Perspective | Requirement or concern | Evidence | Owner | Status | Open condition |
|---|---|---|---|---|---|
| Product value | Does the increment solve the promised problem and match success metrics? | `requirements.md`, roadmap, stakeholder decision | <owner> | open | ... |
| User experience | Are key journeys, docs, accessibility, and supportable states ready? | `design.md`, test report, docs links | <owner> | open | ... |
| Customer / stakeholder | Have affected stakeholders accepted impact, timing, and tradeoffs? | stakeholder notes, project status, approval | <owner> | open | ... |
| Engineering | Are implementation, tests, traceability, and known limitations acceptable? | `implementation-log.md`, `test-report.md`, `traceability.md` | <owner> | open | ... |
| Security / privacy / compliance | Are security, privacy, regulatory, and data-handling obligations satisfied? | review findings, threat model, DPA, policy links | <owner> | open | ... |
| Operations / SRE | Are deploy, rollback, observability, incident response, and on-call coverage ready? | runbook, dashboards, alerts, rollback plan | <owner> | open | ... |
| Support / success | Can support explain, triage, and escalate user issues? | support notes, FAQ, escalation path | <owner> | open | ... |
| Data / analytics | Can the team measure adoption, health, and unintended outcomes? | metrics, dashboard, event schema | <owner> | open | ... |
| Commercial / finance | Are pricing, packaging, contracts, billing, or revenue effects handled? | pricing decision, billing check, contract notes | <owner> | open | ... |
| Communications | Are internal and external messages approved and scheduled? | announcement draft, approver, channel plan | <owner> | open | ... |

Statuses: `satisfied`, `condition`, `gap`, `not-applicable`.

## Stakeholder requirements

| Stakeholder | Requirement | Evidence needed | Approver | Status | Notes |
|---|---|---|---|---|---|
| <role/team/customer> | <requirement> | <artifact or link> | <name> | open | ... |

## Conditions and blockers

| ID | Type | Description | Severity | Owner | Due | Release impact |
|---|---|---|---|---|---|---|
| COND-<AREA>-001 | condition | ... | S2 | <owner> | YYYY-MM-DD | Must be met before deploy |

## Go / no-go record

- [ ] Go — all required perspectives are satisfied.
- [ ] Go with conditions — listed conditions have owners, due dates, and accepted release impact.
- [ ] No-go — release stops until blockers are corrected.

Decision rationale:

## Follow-up

- Items that must move into `release-notes.md`:
- Items that must move into `retrospective.md`:
- Items that require a new requirement, ADR, issue, or roadmap decision:
