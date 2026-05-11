---
project: <project-slug>
version: 1.0
baselined: YYYY-MM-DD    # date plan was approved (A08)
last-updated: YYYY-MM-DD
---

# Deliverables Map — <Project Name>

> P3.Express Document 2 — created in Group A (Initiation, A05), refined each weekly cycle.
> Structure: hierarchical list of **deliverables as nouns** (products, not tasks).
> Rolling wave: only the current sprint's items need full breakdown; future items remain high-level.

## Milestones

| ID | Milestone | Target date | Forecast date | Status |
|---|---|---|---|---|
| M1 | [e.g., Alpha delivery — authentication] | YYYY-MM-DD | YYYY-MM-DD | 🟢 / 🟡 / 🔴 |
| M2 | [e.g., Beta delivery — full feature set] | YYYY-MM-DD | YYYY-MM-DD | 🟢 / 🟡 / 🔴 |
| M3 | [e.g., Go-live] | YYYY-MM-DD | YYYY-MM-DD | 🟢 / 🟡 / 🔴 |

## Deliverables hierarchy

> Format: top-level deliverables → sub-deliverables → (optional) components.
> Each deliverable links to its `specs/<slug>/` folder once created.

### 1. [Top-level deliverable name]

**Description:** [What this is — one paragraph]
**Acceptance criteria:** [How we know it's done]
**Milestone:** M1
**Spec folder:** `specs/feature-slug/workflow-state.md` — TBD
**Dependencies:** [e.g., "requires access to client's legacy API"]

#### 1.1 [Sub-deliverable]

**Description:** [...]
**Acceptance criteria:** [...]
**Stage:** [e.g., In progress — specs/feature-slug at Stage 3 (Requirements)]

#### 1.2 [Sub-deliverable]

**Description:** [...]
**Acceptance criteria:** [...]
**Stage:** pending

---

### 2. [Top-level deliverable name]

**Description:** [...]
**Acceptance criteria:** [...]
**Milestone:** M2
**Spec folder:** TBD
**Dependencies:** [...]

---

## Discovery sprints in scope

> If the project includes an ideation or discovery phase, link the sprint here.

| Sprint slug | Phase | Milestone | Outputs |
|---|---|---|---|
| `discovery/sprint-slug/discovery-state.md` | [e.g., Validation] | M1 | chosen-brief.md |

## Accepted deliverables log

> D02 — Record of formally accepted deliverables (updated each /project:weekly run).

| Date | Deliverable | Accepted by | Notes |
|---|---|---|---|
| YYYY-MM-DD | [deliverable name] | [name] | [e.g., Linked to spec Stage 11 complete] |

## Change history

| Version | Date | What changed | Change ref |
|---|---|---|---|
| 1.0 | YYYY-MM-DD | Initial map | — |
