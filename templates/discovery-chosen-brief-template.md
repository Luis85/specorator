---
id: BRIEF-<AREA>-NNN
title: <Concept name>
sprint: <sprint-slug>
status: handed-off          # draft | handed-off | feature-opened | dropped
recommended_feature_slug: <feature-slug>
recommended_area: <AREA>
decider: <name>
created: YYYY-MM-DD
inputs:
  - discovery/<sprint-slug>/frame.md
  - discovery/<sprint-slug>/convergence.md
  - discovery/<sprint-slug>/validation.md
---

# Chosen brief — <Concept name>

> Handoff from the Discovery Track to Stage 1 (Idea). The analyst reads this *and* the linked phase artifacts as mandatory inputs.
>
> One file per surviving concept. A sprint may emit 0, 1, or N briefs.

## What we're recommending build

One paragraph. Include the concept name, the customer segment, the problem it addresses, and the validated mechanic.

## Why this, not the alternatives

One paragraph. Why did this concept survive convergence and validation when the others didn't? Reference the rejected concepts in `convergence.md` by ID.

## Validation evidence

| Hypothesis | Verdict | Evidence |
|---|---|---|
| *(from prototype.md / validation.md)* | supported / refuted / inconclusive | *(quote / metric / link)* |

## Customer segment(s)

- Primary: …
- Secondary: …
- Out of scope: …

## Job to be Done

Restate the JTBD that this concept addresses. Forces of Progress (Push / Pull / Anxiety / Habit) and how this concept moves them.

## Strategic outcome served

Which North Star metric does this concept move? By how much do we *believe* (not yet *know*) it can move it? What's the leading indicator we'd watch?

## Riskiest assumptions remaining

The validated hypothesis is now off the list. What are the next-riskiest assumptions the analyst, PM, and architect will need to address? These become the research agenda in `research.md` and risk entries in `requirements.md`.

| ID | Assumption | Severity | Likely owner |
|---|---|---|---|
| A-001 | … | high / med / low | analyst / pm / architect |
| A-002 | … | … | … |

## Open questions for the analyst

The questions that should land in `idea.md`'s `## Open questions` section.

- Q1 …
- Q2 …
- Q3 …

## Constraints carried forward

From `frame.md` — time, budget, technical, policy/compliance constraints that survive into Stage 1.

## Game-design lenses worth carrying into Design

The MDA framing, core loop, and Schell lens observations that the `ux-designer` and `architect` should preserve when they reach Stage 4.

- **Mechanics** — …
- **Dynamics** — …
- **Aesthetic target** — *(one of the 8 MDA aesthetics)*
- **Core loop** — …
- **Lenses to revisit** — …

## Recommended Stage 1 scaffolding

```
/spec:start <feature-slug> [<AREA>]
/spec:idea            # analyst reads this brief + linked phase artifacts
```

> The analyst's first action is to seed `idea.md`'s `## Problem statement`, `## Target users`, and `## Open questions` from this brief. The brief does not replace `idea.md` — it seeds it.
