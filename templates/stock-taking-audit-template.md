---
id: AUDIT-<AREA>-NNN
title: <System name> — Audit
project: <project-slug>
phase: audit
status: in-progress       # in-progress | complete | blocked
owner: legacy-auditor
created: YYYY-MM-DD
last_updated: YYYY-MM-DD
inputs:
  - stock-taking/<project-slug>/scope.md
---

# Audit — <project-slug>

> All sections below are scoped to the boundary defined in `scope.md`. For any item where evidence is absent, record `unknown — resolve via: <action>` rather than leaving the field blank or inventing content.

---

## Process map

> Swim-lane descriptions of primary workflows. For each: name the actors, the steps in order, decision points, integration touchpoints, and manual steps (marked **[MANUAL]**). Include the happy path and 1–2 main exception paths.

### Process: <process name>

**Actors:** <list of swim lanes>

**Happy path:**
1. <Actor A> — <step>
2. <Actor B> — <step>
3. **[MANUAL]** <Actor A> — <step> (workaround: <why this is manual>)
4. Integration call → <external system> — <what is sent/received>
5. <Actor B> — <step>

**Exception path — <exception name>:**
1. At step 3, if <condition> then <Actor A> does <X> instead.
2. Escalation to <Actor C>.

**Volume / frequency:** <e.g., ~200 orders/day; month-end spike to 500>

**Known issues:** <fragile step, workaround in use, recurring failure>

---

*(Repeat for each process in scope. Mark as `unknown — resolve via: <action>` if process is not yet mapped.)*

---

## Use-case catalog

> One entry per actor-goal pair within the audit boundary. Include basic flow and 2–3 alternate/exception flows. Note volume and frequency if known.

### UC-NNN: <Actor> — <Goal>

**Actor:** <role name>
**Goal:** <what they are trying to accomplish>
**Frequency:** <e.g., daily / weekly / on-demand>
**Volume:** <e.g., ~50 instances/week>

**Basic flow:**
1. <step>
2. <step>
3. <step>

**Alternate flow — <name>:**
1. At step 2, if <condition>, <actor> does <X>.

**Exception flow — <name>:**
1. If <error condition>, <actor> does <Y>; system responds with <Z>.

**Notes:** <workarounds, known limitations, undocumented behavior>

---

*(Repeat for each actor-goal pair in scope.)*

---

## Integration map

> One row per system boundary crossing within the audit boundary.

| # | Source system | Destination system | Data transferred | Protocol | Frequency | Owner | SLA | Coupling | Fragility notes |
|---|---|---|---|---|---|---|---|---|---|
| INT-001 | | | | | | | | sync / async | |
| INT-002 | | | | | | | | | |

> **Coupling:** `sync` = blocking call (tight); `async` = event/queue (loose); `batch` = scheduled file/extract (loose but time-bound).
> **Fragility notes:** known failure modes, retry logic, manual intervention required, no monitoring in place, etc.

---

## Data landscape

> One entry per primary data entity within the audit boundary.

| Entity | Owner system | Approx. volume | Quality score | Known issues |
|---|---|---|---|---|
| | | | 1–5 | |

> **Quality score:** 1 = severely degraded (nulls, duplicates, no PK, stale); 3 = usable with cleanup; 5 = clean, well-governed.

### Data quality detail: <entity name>

- **Null / missing fields:** <e.g., 30% of customer records missing email>
- **Duplicates:** <e.g., ~5% duplicate customer accounts (legacy import)>
- **Stale data:** <e.g., addresses not updated since <year>>
- **Referential integrity:** <e.g., 12% of order records reference deleted customer IDs>
- **Migration notes:** <what needs to happen before this data can be used in a new system>

---

*(Repeat data quality detail for each entity with quality score ≤ 3.)*

---

## Pain points

> User-reported and observed frustrations, workarounds, and recurring failures.

| # | Who experiences it | Pain description | Workaround in use | Frequency | Severity | Evidence source |
|---|---|---|---|---|---|---|
| PP-001 | | | | | high / medium / low | |
| PP-002 | | | | | | |

> **Evidence source:** interview date + participant, ticket number, incident log reference, direct observation.

---

## Technical debt register

> Known technical debt items within the audit boundary. Classified by the Technical Debt Quadrant.

| # | Description | Affected component | Quadrant | Est. remediation effort | Risk if unaddressed | Source |
|---|---|---|---|---|---|---|
| TD-001 | | | | S/M/L/XL | | |
| TD-002 | | | | | | |

> **Quadrant:** `Reckless-Deliberate` (knew, chose not to fix) · `Prudent-Deliberate` (knew, deferred consciously) · `Reckless-Inadvertent` (didn't know enough to see it) · `Prudent-Inadvertent` (found out later; now acting). ([Fowler — Technical Debt Quadrant](https://martinfowler.com/bliki/TechnicalDebtQuadrant.html))

---

## Open unknowns from this phase

> Items that could not be resolved during the audit. Each blocks `synthesis.md` unless explicitly acknowledged.

| # | Unknown | Impact | Resolution plan | Target date |
|---|---|---|---|---|
| UNK-001 | | | | |

---

## Quality gate

> All boxes must be checked before advancing to Phase 3 (Synthesize).

- [ ] Every process listed in `scope.md` has at least one process-map entry (or `unknown` entry with resolution plan).
- [ ] Every actor-goal pair in the scoped stakeholder table has at least one use-case entry.
- [ ] Integration map covers all system boundary crossings named in `scope.md`'s in-scope integration list.
- [ ] Data landscape entry exists for every primary entity in scope.
- [ ] Pain points section contains at least one entry (even if "no pain points identified — evidence: <source>").
- [ ] Technical debt register contains at least one entry (even if "no debt items identified — evidence: <source>").
- [ ] Open unknowns table is populated (empty = unknowns not acknowledged, not that none exist).
- [ ] All evidence sources in pain points and debt register are cited.
