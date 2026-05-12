---
id: SCOPE-<AREA>-NNN
title: <System name> — Scope
project: <project-slug>
phase: scope
status: in-progress       # in-progress | complete | blocked
owner: legacy-auditor
created: YYYY-MM-DD
last_updated: YYYY-MM-DD
inputs:
  - stock-taking/<project-slug>/stock-taking-state.md
---

# Scope — <project-slug>

## Systems in scope

> Name each system included in this engagement, its primary purpose, and its owner.

| System name | Primary purpose | Owner (team / person) | Codebase / environment |
|---|---|---|---|
| | | | |

## Stakeholders

> People who own, use, depend on, or maintain the system(s) in scope. These are the interview and review candidates for the Audit phase.

| Role | Name | Relationship to system | Priority for interview |
|---|---|---|---|
| System Owner | | Accountable for the system | High |
| Power User | | Uses the system daily; knows workarounds | High |
| Downstream Consumer | | Receives outputs from the system | Medium |
| Integration Partner | | External system that exchanges data | Medium |
| Maintainer / IT | | Operates and deploys the system | Medium |

## Audit boundary

### In scope

> What is explicitly included. Be specific — vague inclusions become unplanned work.

Processes:
- e.g., Order intake and fulfilment workflow
- e.g., Monthly billing reconciliation process

Modules / components:
- e.g., CRM customer module
- e.g., Invoice generation service

Integrations:
- e.g., ERP → CRM data sync
- e.g., Payment gateway API

Data domains:
- e.g., Customer master data
- e.g., Order history (last 3 years)

### Out of scope

> What is explicitly excluded and why.

| Item | Reason excluded |
|---|---|
| e.g., Mobile app | Out of scope for this migration; separate team owns it |
| e.g., Archived data pre-2020 | Not required for new system; will be retained read-only |

## Available source material

> All inputs available for the Audit phase. Rate each for reliability.

| Source | Type | Reliability | Location / contact |
|---|---|---|---|
| e.g., System architecture doc | Architecture diagram | stale (2022) | Confluence: /arch/crm |
| e.g., Database schema | Schema dump | authoritative | DBA team |
| e.g., Process runbook | Word doc | contradictory (two versions exist) | SharePoint |
| e.g., Power-user interviews | Scheduled | TBD | <name>, week of <date> |

> Reliability scale: `authoritative` (current, trusted) · `stale` (outdated but directionally correct) · `contradictory` (conflicting versions) · `hearsay` (verbal, unverified)

## Known-unknowns log

> What is not yet known going into the Audit, and how it will be resolved. This is the audit's research agenda.

| Unknown | Impact if unresolved | Resolution plan | Target date |
|---|---|---|---|
| e.g., Full set of integration partners | May miss coupling constraints | Review firewall rules + ask IT | <date> |
| e.g., Data quality of customer table | May affect migration scope | Request sample extract from DBA | <date> |

## Audit plan

> Ordered list of investigation steps for Phase 2. The legacy-auditor follows this when starting `audit.md`.

1. Conduct power-user interview(s) — walk through primary workflows end-to-end.
2. Read available architecture docs; note gaps.
3. Map processes via Event Storming (text-form) for each workflow in scope.
4. Review integration documentation; supplement with firewall / API log review.
5. Request and review database schema; sample key tables for quality assessment.
6. Review ticket / incident backlog for recurrent pain points and debt indicators.
7. Review known-unknowns log; schedule follow-ups for any unresolved items.

---

## Quality gate

> All boxes must be checked before advancing to Phase 2 (Audit).

- [ ] At least one system named with owner and purpose.
- [ ] Stakeholder table populated (names or `TBD` with plan to identify).
- [ ] Audit boundary is explicit — in-scope list and out-of-scope list both present.
- [ ] Source material inventory lists at least one authoritative or scheduled source per scoped domain.
- [ ] Known-unknowns log populated (empty log means unknowns are not acknowledged, not that they don't exist).
- [ ] Audit plan has at least 3 ordered steps.
