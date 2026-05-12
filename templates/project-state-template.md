---
project: <project-slug>
client: <client-name>
sponsor: <sponsor-name>                 # human who owns the go/no-go
pm: project-manager                    # agent or human PM
phase: scaffolded                      # scaffolded | initiating | executing | closing | closed | post-project
initiation_status: pending             # pending | approved | rejected
closure_status: pending                # pending | accepted
last_report_date: ~
last_updated: YYYY-MM-DD
linked_features:                       # paths to specs/<slug>/ folders in scope
  - specs/<feature-slug>
linked_discoveries:                    # paths to discovery/<slug>/ folders in scope (optional)
  - ~
---

# Project state — <project-slug>

## Phase progress

| Phase | Artifact(s) | Status |
|---|---|---|
| Initiation (Group A) | `project-description.md`, `deliverables-map.md`, `followup-register.md`, `health-register.md` | pending |
| Execution — weekly cycle (Groups C+D) | `weekly-log.md` | pending |
| Closure (Group F) | `project-closure.md` | pending |
| Post-project (Group G) | appended to `project-closure.md` | pending |

> **Phases:** `pending` | `in-progress` | `complete`

## Go/no-go history

| Date | Decision | Notes |
|---|---|---|
| YYYY-MM-DD | (A08 initiation) | pending |

## Open blocking items

> Anything that is preventing a phase transition or needs sponsor attention.

- e.g., go/no-go pending — charter not yet reviewed

## Hand-off notes

```
YYYY-MM-DD (project-manager): Project scaffolded. Next: /project:initiate
```
