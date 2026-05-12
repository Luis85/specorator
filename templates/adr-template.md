---
id: ADR-NNNN
title: <Imperative title — what we are doing>
status: proposed       # proposed | accepted | deprecated | superseded by ADR-NNNN
date: YYYY-MM-DD
deciders:
  - <name or role>
consulted:
  - <name or role>
informed:
  - <name or role>
supersedes: []         # list ADR IDs this one supersedes
superseded-by: []      # filled when this ADR is itself superseded
tags: [<area>, <topic>]
---

# ADR-NNNN — <Imperative title>

## Status

Proposed | Accepted | Deprecated | `Superseded by ADR-NNNN`

## Context

What is the situation forcing this decision? What forces are at play (technical, organisational, regulatory, time)? Cite evidence.

## Decision

What are we doing? Active voice, present tense.

> *We will adopt PostgreSQL as the primary data store for service X.*

## Considered options

If the choice was non-trivial, list options with pros/cons.

### Option A — <name>
- Pros: …
- Cons: …

### Option B — <name>
- Pros: …
- Cons: …

### Option C — <name>
- Pros: …
- Cons: …

## Consequences

### Positive

- …

### Negative

- …

### Neutral

- …

## Compliance

How will we know this decision is being honoured? Linters, CI checks, review checklists, dashboards.

## References

- Linked PRD / spec / design IDs.
- External docs.
- Related ADRs.

---

> **ADR bodies are immutable.** To change a decision, supersede it with a new ADR; only the predecessor's `status` and `superseded-by` pointer fields may be updated.
