---
doc: portfolio-log
portfolio: ~
---

# Portfolio Operations Log

> **P5 Express — Document 5.** Append-only operations log maintained at the Z cycle cadence (daily or as decisions arise). Records follow-up item management (Z1), start/stop/pause decisions applied to `portfolio-definition.md` (Z2), and resource balancing notes (Z3).
>
> **Append-only — never edit or delete previous entries.**

---

## <!-- YYYY-MM-DD --> — Z Cycle

**Run by:** portfolio-manager

### Z1 — Follow-up items

> Review of open items from the previous entry.

| Item | From entry | Status | Notes |
|---|---|---|---|
| <!-- item description --> | <!-- YYYY-MM-DD --> | Open / Resolved / Overdue | <!-- context or evidence --> |

*If this is the first log entry, write "None — first Z cycle run."*

### Z2 — Start / stop / pause decisions applied

> Only decisions explicitly provided as input to `/portfolio:z`. Do not infer decisions.

| Decision | Project | Effective date | Rationale | Sponsor approval |
|---|---|---|---|---|
| Start / Stop / Pause / Resume / Close | `specs/<slug>` | <!-- YYYY-MM-DD --> | <!-- human decision passed as argument --> | <!-- name, date, or "delegated to PM" --> |

*If no decisions were provided, write "No decisions this cycle."*

### Z3 — Resource balance

> Contention check across Active projects in `portfolio-definition.md`.

| Resource | Active on | Contention? | Proposed reallocation |
|---|---|---|---|
| <!-- person / team --> | <!-- project IDs --> | Yes / No | <!-- proposal, or — --> |

**New follow-up items for next Z:**

| Item | Owner | Due date |
|---|---|---|
| <!-- item --> | <!-- owner --> | <!-- YYYY-MM-DD or "ongoing" --> |

---

<!-- Add new Z cycle entries above this line. Keep entries in reverse-chronological order (newest first). -->
