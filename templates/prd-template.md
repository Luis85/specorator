---
id: PRD-<AREA>-NNN
title: <Feature name>
stage: requirements
feature: <feature-slug>
status: draft        # draft | proposed | accepted | superseded
owner: pm
inputs:
  - IDEA-<AREA>-NNN
  - RESEARCH-<AREA>-NNN
created: YYYY-MM-DD
updated: YYYY-MM-DD
---

# PRD — <Feature name>

## Summary

One paragraph: what we're building, for whom, and why now.

## Goals

- G1 …
- G2 …
- G3 …

## Non-goals

- NG1 …
- NG2 …

## Personas / stakeholders

| Persona | Need | Why it matters |
|---|---|---|
| … | … | … |

## Jobs to be done

- When **<situation>**, I want to **<motivation>**, so I can **<outcome>**.

## Functional requirements (EARS)

> Use [EARS notation](../docs/ears-notation.md). One requirement per entry. Stable IDs.

### REQ-<AREA>-001 — <short title>

- **Pattern:** ubiquitous | event-driven | state-driven | optional-feature | unwanted-behaviour
- **Statement:** *<EARS sentence>*
- **Acceptance:**
  - Given …
  - When …
  - Then …
- **Priority:** must | should | could
- **Satisfies:** (upstream IDs from `idea.md` / `research.md`, e.g. `IDEA-<AREA>-NNN`, `RESEARCH-<AREA>-NNN`)

### REQ-<AREA>-002 — <short title>

- …

## Non-functional requirements

> **Baseline-relative targets:** If the target is relative to a baseline (e.g., ≤ baseline + X%), specify in the table comment WHEN and WHERE the baseline is captured (integration branch, before implementation). Pair with a baseline-capture task in `tasks.md`.

| ID | Category | Requirement | Target |
|---|---|---|---|
| NFR-<AREA>-001 | performance | API p95 latency | ≤ 200 ms |
| NFR-<AREA>-002 | accessibility | WCAG conformance | 2.2 AA |
| NFR-<AREA>-003 | security | … | … |
| NFR-<AREA>-004 | privacy | … | … |
| NFR-<AREA>-005 | reliability | … | … |

## Success metrics

- **North star:** …
- **Supporting:** …
- **Counter-metric:** …

## Release criteria

What must be true to ship.

- [ ] All `must` requirements pass acceptance.
- [ ] All NFRs met (or explicitly waived with ADR).
- [ ] Test plan executed; no critical bugs open.
- [ ] Documentation, runbooks, support artefacts updated.

## Open questions / clarifications

- Q1 — *owner: <name>*
- Q2 — *owner: <name>*

## Out of scope

What we explicitly will not do this cycle.

---

## Quality gate

- [ ] Goals and non-goals explicit.
- [ ] Personas / stakeholders named.
- [ ] Jobs to be done captured.
- [ ] Every functional requirement uses EARS and has an ID.
- [ ] Acceptance criteria testable.
- [ ] NFRs listed with targets.
- [ ] Success metrics defined (including a counter-metric).
- [ ] Release criteria stated.
- [ ] `/spec:clarify` returned no open questions.
