---
id: SYNTH-<AREA>-NNN
title: <System name> — Synthesis
project: <project-slug>
phase: synthesize
status: in-progress       # in-progress | complete | blocked
owner: legacy-auditor
recommended_next: TBD     # discovery | spec | both | TBD
created: YYYY-MM-DD
last_updated: YYYY-MM-DD
inputs:
  - stock-taking/<project-slug>/scope.md
  - stock-taking/<project-slug>/audit.md
---

# Synthesis — <project-slug>

> This artifact distils findings from `scope.md` and `audit.md`. It contains **observations and constraints only** — no requirements, no solution proposals. Turning findings into requirements is the job of the PM in Stage 3.

---

## Gap analysis

> For each process, use-case, integration, and data domain in scope: is it documented, understood by the project team, and handled in the new-system scope? Gaps are rows where any column is `No` or `Partial`.

| Item | Type | Documented | Team understands it | In new-system scope | Gap? | Notes |
|---|---|---|---|---|---|---|
| | process / use-case / integration / data | Y / N / Partial | Y / N / Partial | Y / N / TBD | Y / N | |

---

## Hard constraints

> Items the new system must honour unconditionally. Source each constraint — a constraint without a source is an assumption.

| # | Constraint | Source | Immutability | Notes |
|---|---|---|---|---|
| HC-001 | | regulation / contract / SLA / technical | fixed / negotiable / time-bound | |
| HC-002 | | | | |

---

## Soft constraints

> Organisational habits, user mental models, and operational norms. The new solution should respect these or explicitly plan to migrate users away from them.

| # | Constraint | Who it affects | Change sensitivity | Notes |
|---|---|---|---|---|
| SC-001 | | | high / medium / low | |

---

## Candidate opportunities

> Pain points and gaps that point to high-value improvement areas. Phrased as observations — **not** requirements or solution proposals. These are candidate inputs to the Discovery Track's Frame phase.

> Format: "Users currently struggle with **X** because **Y** — this suggests an opportunity to explore **Z**."

1. Users currently struggle with **<X>** because **<Y>** — this suggests an opportunity to explore **<Z>**.
2. …

---

## Migration considerations

> For each data domain: complexity, risk, and open questions.

| Data domain | Row count est. | Cleanliness (1–5) | Transformation complexity | Migration risk | Open questions |
|---|---|---|---|---|---|
| | | | low / medium / high | green / amber / red | |

**Overall migration risk:** green / amber / red

**Key migration decisions needed (for downstream tracks):**
- e.g., Whether to do a big-bang cutover or a strangler-fig migration
- e.g., How to handle the 12% of orders with missing customer references

---

## Strangler Fig map

> For each system component in scope: Retain, Wrap, Replace, or Retire. ([Fowler — StranglerFigApplication](https://martinfowler.com/bliki/StranglerFigApplication.html))

| Component | Recommendation | Rationale | Dependencies to manage |
|---|---|---|---|
| | Retain / Wrap / Replace / Retire | | |

> **Retain** — keep as-is; the new system integrates with it unchanged.
> **Wrap** — keep but add an adapter or anti-corruption layer to decouple.
> **Replace** — rewrite; existing component is retired after the new one is live.
> **Retire** — decommission without replacement; functionality is no longer needed.

---

## What to keep

> Summary of what the new system must preserve from the existing one — features, behaviours, data, or operational properties that users depend on.

- e.g., The existing order-reference numbering scheme (downstream systems depend on it)
- e.g., The weekly batch export format sent to the logistics partner

## What to replace

> Summary of what the new system can safely replace or improve — areas where the existing system is known to be inadequate and stakeholders have confirmed they want change.

- e.g., The manual reconciliation step (all stakeholders agreed it should be automated)
- e.g., The per-record export format (logistics partner is willing to migrate to API)

---

## Recommended next

> Which downstream track should follow this engagement, and why.

**Recommendation:** `discovery` | `spec` | `both`

**Rationale:**
> e.g., "The scope contains three distinct pain areas with no clear solution direction. A Discovery Sprint is needed to identify which to tackle first and what form the solution should take."
> e.g., "The project brief is already clear ('replace the billing module'). The inventory provides the constraints and migration map needed to proceed directly to /spec:idea."
> e.g., "Parts of the scope (customer management) need a Discovery Sprint; the billing module replacement has a clear brief and can proceed to /spec:start immediately."

**For `discovery`:** recommend sprint slug (names the outcome, not the solution): `<proposed-sprint-slug>`
**For `spec`:** recommend feature slug and AREA code: `<feature-slug>` / `<AREA>`
**For `both`:** list each path separately.

---

## Quality gate

> All boxes must be checked before advancing to Handoff.

- [ ] Every major finding in `audit.md` is addressed in this synthesis (as constraint, opportunity, migration item, or out-of-scope with reason).
- [ ] Gap analysis covers all processes, use-cases, integrations, and data domains from `scope.md`.
- [ ] Hard constraints are all sourced (no unsourced constraints).
- [ ] Candidate opportunities are phrased as observations ("Users currently struggle with…"), not as requirements or solutions.
- [ ] Migration considerations table covers all data domains with quality score ≤ 3 from `audit.md`.
- [ ] Strangler Fig map covers all system components in scope.
- [ ] `recommended_next` field is set to `discovery`, `spec`, or `both` (not `TBD`).
- [ ] No solution proposals appear in this document — findings and constraints only.
