---
id: CONVERGE-<SPRINT>-001
title: <Sprint title> — convergence
phase: converge
sprint: <sprint-slug>
status: draft               # draft | complete
owner: facilitator
consulted:
  - critic
  - product-strategist
inputs:
  - discovery/<sprint-slug>/frame.md
  - discovery/<sprint-slug>/divergence.md
decider: <name or facilitator-as-proxy>
created: YYYY-MM-DD
updated: YYYY-MM-DD
---

# Convergence — <Sprint title>

> Phase 3 — *Develop (convergent).* Pick the small set worth prototyping.
> Method baseline: Lightning Decision Jam.

## Decision matrix

Score each concept on weighted dimensions (1–5 each). Add a final column for the weighted total.

> **Suggested weights:** Impact ×3, Confidence ×2, Strategic fit ×2, Effort ×1 (inverted), Risk ×1 (inverted). Adjust per sprint and document in `discovery-state.md` hand-off notes.

| Concept | Impact | Confidence | Strategic fit | Effort (inv) | Risk (inv) | Weighted total |
|---|---|---|---|---|---|---|
| C-001 | 5 | 3 | 4 | 3 | 2 | 30 |
| C-002 | 4 | 4 | 3 | 4 | 3 | 28 |
| … | … | … | … | … | … | … |

## Dot voting

Silent dot vote results. Each participant gets N dots (default 3). Capture both the absolute count and the Decider's "super-vote" if used.

| Concept | Dots | Decider super-vote | Notes |
|---|---|---|---|
| C-001 | 4 | ✓ | … |
| C-002 | 3 |   | … |

## Speed critique

For each shortlist candidate, capture 1 minute of strengths, 1 minute of risks, 1 minute of riskiest-assumption naming. The **critic** owns this column.

### C-001 — <concept name>

- **Strengths** — …
- **Risks** — …
- **Riskiest assumption** — *(this is what Phase 4 prototype will test)*
- **Falsification criterion** — what specific observation would prove the assumption wrong?

### C-002 — …

## Shortlist

The 1–3 concepts that go to Phase 4. Each must have a named riskiest assumption with a falsification criterion.

| Concept | Riskiest assumption (RAT) | Falsification criterion | Prototype style |
|---|---|---|---|
| C-001 | … | "If <X> happens in <Y>% of test sessions, the concept is dead." | paper / Wizard-of-Oz / lo-fi screen |
| C-002 | … | … | … |

## Rejected concepts

For each non-shortlisted concept from Phase 2, one line on **why**. This is the most useful artifact for the retrospective and for next sprint.

| Concept | Reason rejected |
|---|---|
| C-003 | low confidence, no path to validate in 1 day |
| C-004 | duplicates C-001 with worse mechanics |

## Decider sign-off

The Decider — a named human (or the `facilitator` agent acting as proxy with a documented mandate) — confirms the shortlist.

> *Decider:* <name> · *Sign-off date:* YYYY-MM-DD · *Notes:* …

---

## Quality gate

- [ ] Decision matrix scored for ≥ 5 candidates from the divergence catalog.
- [ ] Dot vote captured.
- [ ] Speed critique completed for each shortlist candidate.
- [ ] Shortlist of 1–3 concepts.
- [ ] Each shortlist concept has a named riskiest assumption AND a falsification criterion.
- [ ] Every non-shortlisted concept has a one-line rejection reason.
- [ ] Decider has signed off.
