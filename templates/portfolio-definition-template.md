---
doc: portfolio-definition
portfolio: ~
version: 1
date: <YYYY-MM-DD>
sponsor: ~
manager: portfolio-manager
---

# Portfolio Definition

> **P5 Express — Document 1.** Defines what is in scope, who governs it, and how it aligns strategically. Created by `/portfolio:start`; updated at each Z cycle (Z2) when projects start, stop, or change status; reviewed at every X and Y cycle.

## Portfolio overview

**Portfolio name:** <!-- slug or friendly display name -->
**Portfolio Sponsor:** <!-- name / role — owns strategic decisions (start, stop, pivot) -->
**Portfolio Manager:** <!-- name / role — owns day-to-day operations and cycle runs -->
**Review cadence:** X every 6 months · Y every month · Z daily or as decisions arise

## Strategic context

<!-- 2–3 sentences: the business or client objective this portfolio serves.
     What outcome are all these projects collectively pursuing?
     Example: "Deliver platform modernisation for Acme Corp by Q4. All projects reduce operational toil or unlock new revenue streams." -->

## Scope boundaries

**In scope:** <!-- which programs and projects are managed here -->
**Out of scope:** <!-- anything explicitly excluded — avoids scope creep -->

## Programs and projects

| ID | Name | Type | Spec slug | Status | Stage | Owner | Notes |
|---|---|---|---|---|---|---|---|
| P-001 | <!-- name --> | Program / Project | `specs/<slug>` | Active | <!-- stage --> | <!-- owner --> | <!-- optional --> |

*Status values: **Active** · **On Hold** · **Proposed** · **Closed***
*Add rows as projects enter or leave the portfolio. Log all status changes in the Change log below.*

## Resource envelope

| Team / Person | Allocation | Committed to | Constraints |
|---|---|---|---|
| <!-- name --> | <!-- % or days/week --> | <!-- project IDs --> | <!-- e.g. "not available Aug" --> |

## Governance

**Decision rights:**

| Decision type | Authority | Escalation |
|---|---|---|
| Strategic (stop/start/pivot/budget) | Portfolio Sponsor | — |
| Tactical (resource re-allocation within period) | Portfolio Manager | Portfolio Sponsor if > X% of envelope |
| Operational (daily follow-up, Z2 status updates) | Portfolio Manager | Portfolio Sponsor for new starts |

**Escalation path:** Portfolio Manager → Portfolio Sponsor → <!-- next level e.g. board, client exec -->

## Constraints and dependencies

<!-- Known hard constraints (budget ceiling, regulatory deadline, key person availability)
     and cross-project dependencies (Project A must finish before Project B can start). -->

| Constraint / Dependency | Type | Affects | Notes |
|---|---|---|---|
| <!-- description --> | Budget / Schedule / Resource / Regulatory | <!-- project IDs --> | <!-- details --> |

## Change log

| Date | Change | Author |
|---|---|---|
| <!-- YYYY-MM-DD --> | Initial definition | <!-- name --> |
