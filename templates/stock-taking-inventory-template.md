---
id: INV-<AREA>-NNN
title: <System name> — Stock-taking Inventory
project: <project-slug>
status: complete           # in-progress | complete | incomplete (open items remain)
recommended_next: TBD      # discovery | spec | both
created: YYYY-MM-DD
last_updated: YYYY-MM-DD
inputs:
  - stock-taking/<project-slug>/scope.md
  - stock-taking/<project-slug>/audit.md
  - stock-taking/<project-slug>/synthesis.md
---

# Stock-taking Inventory — <project-slug>

> This is the consolidated handoff artifact for the Stock-taking Engagement. It summarises key findings from all three phases. Downstream tracks (Discovery or Specorator) treat this as a mandatory input — they reference it in `chosen-brief.md` or `idea.md` `inputs:` frontmatter.

---

## System summary

**Systems inventoried:** <list>
**Engagement period:** <start date> — <end date>
**Lead auditor:** legacy-auditor (+ human contacts: <names if applicable>)
**Inventory status:** `complete` | `incomplete — open items: <count> (see § Open items)`

---

## Audit boundary (summary)

**In scope:** <one-line summary of what was inventoried>
**Out of scope:** <one-line summary of what was excluded and why>

---

## Process inventory

> Summary of all processes mapped. Full detail in `audit.md` § Process map.

| Process | Primary actors | Status | Key finding |
|---|---|---|---|
| | | mapped / partial / unknown | |

---

## Use-case inventory

> Summary of all use-cases catalogued. Full detail in `audit.md` § Use-case catalog.

**Total use-cases catalogued:** <N>
**Actor summary:**

| Actor | Use-cases | Notable observations |
|---|---|---|
| | | |

---

## Integration inventory

> Summary of all integration touchpoints. Full detail in `audit.md` § Integration map.

**Total integrations identified:** <N>

| Integration | Coupling | Risk level | Notes |
|---|---|---|---|
| <source> → <destination> | sync / async / batch | green / amber / red | |

---

## Data inventory

> Summary of data domains and quality. Full detail in `audit.md` § Data landscape.

| Domain | Quality | Migration risk | Key concern |
|---|---|---|---|
| | 1–5 | green / amber / red | |

---

## Pain point summary

> Top pain points by severity. Full list in `audit.md` § Pain points.

| # | Pain | Severity | Impacted actor(s) |
|---|---|---|---|
| PP-001 | | high / medium / low | |

---

## Technical debt summary

> Top debt items by risk. Full register in `audit.md` § Technical debt register.

| # | Item | Quadrant | Risk if unaddressed |
|---|---|---|---|
| TD-001 | | | |

---

## Constraints

> Hard constraints the new system must honour. Full list in `synthesis.md` § Hard constraints.

| # | Constraint | Source |
|---|---|---|
| HC-001 | | |

---

## Candidate opportunities

> Summarised from `synthesis.md` § Candidate opportunities. Full phrasing in synthesis.

1. …
2. …
3. …

---

## Strangler Fig map (summary)

| Component | Recommendation |
|---|---|
| | Retain / Wrap / Replace / Retire |

---

## Migration risk summary

**Overall risk:** green / amber / red

| Domain | Risk | Key concern |
|---|---|---|
| | green / amber / red | |

---

## Open items

> Items that could not be resolved during the engagement. If `status: incomplete`, these must be treated as research agenda items by the downstream track.

| # | Open item | Impact | Resolution plan |
|---|---|---|---|
| UNK-001 | | | |

*(Empty table = inventory is complete.)*

---

## Recommended next steps

**Recommendation:** `discovery` | `spec` | `both`

**Rationale:** <one paragraph>

### If discovery:
- Start sprint: `/discovery:start <sprint-slug>`
- The Frame phase should reference this inventory in its `inputs:` frontmatter.
- Constraint catalogue and candidate opportunities are direct inputs to the Frame phase.

### If spec:
- Start feature: `/spec:start <feature-slug> [<AREA>]` then `/spec:idea`
- The analyst reads this inventory as a mandatory input alongside the brief.
- Open items above become the Stage 2 (Research) research agenda.

### If both:
- <Discovery path: what scope feeds into the sprint>
- <Spec path: what scope has a clear enough brief>
