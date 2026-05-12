---
id: RETRO-<AREA>-NNN
title: <Feature name> — Retrospective
stage: learning
feature: <feature-slug>
status: draft         # draft | complete
owner: retrospective
inputs:
  - RELEASE-<AREA>-NNN
created: YYYY-MM-DD
updated: YYYY-MM-DD
---

# Retrospective — <Feature name>

> Mandatory, even on clean ships. For trivial work, a single paragraph is fine.

## Outcome

- Shipped on plan? Date vs. plan.
- Met success metrics? (Initial readings, plus when to re-check.)
- Surprises (positive and negative).

## What worked

- …
- …

## What didn't work

- …
- …

## Spec adherence

- Did we drift from spec? Where?
- Were deviations documented?
- Did we change requirements mid-flight? Were they re-baselined?

## Process observations

- Stages that took longer than expected — why?
- Quality gates that flagged real issues — keep them.
- Quality gates that produced noise — tune them.
- Agents / roles that needed manual intervention — fix scope or tools.

## Actions

> Each action has an owner and a follow-up.
> Carry-forward actions must link to a GitHub issue, PR, or roadmap item before the retro is complete.

| Action | Type | Owner | Due | Tracker |
|---|---|---|---|---|
| Update `templates/<x>` to add … | template | … | … | [#NNN](https://github.com/<owner>/<repo>/issues/NNN) |
| Tighten `qa.md` agent scope to … | agent | … | … | [#NNN](https://github.com/<owner>/<repo>/issues/NNN) |
| Add ADR-NNNN for … | adr | … | … | [#NNN](https://github.com/<owner>/<repo>/issues/NNN) |
| Amend constitution Article … | constitution | … | … | [#NNN](https://github.com/<owner>/<repo>/issues/NNN) |

## Lessons (one-liners worth remembering)

- …
- …

---

## Quality gate

- [ ] Three buckets covered (worked / didn't / actions).
- [ ] Every action has an owner and a due date.
- [ ] Spec adherence assessed.
- [ ] Improvements proposed back into the kit (templates / agents / constitution).
