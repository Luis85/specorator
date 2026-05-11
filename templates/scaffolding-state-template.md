---
project: <project-slug>
current_phase: intake       # intake | extract | assemble | handoff
status: active              # active | blocked | paused | complete | incomplete
last_updated: YYYY-MM-DD
last_agent: project-scaffolder
artifacts:
  intake.md: pending
  source-inventory.md: pending
  extraction.md: pending
  starter-pack.md: pending
  handoff.md: pending
recommended_next: TBD       # discovery | spec | project | stock-taking | none | TBD
---

# Project scaffolding state — <project-slug>

## Phase progress

| Phase | Artifact | Status |
|---|---|---|
| 1. Intake | `intake.md`, `source-inventory.md` | pending |
| 2. Extract | `extraction.md` | pending |
| 3. Assemble | `starter-pack.md` | pending |
| Handoff | `handoff.md` | pending |

> **Statuses:** `pending` | `in-progress` | `complete` | `skipped` | `blocked`. Engagement-level status: `active | blocked | paused | complete | incomplete`.

## Skips

- e.g., `source-inventory.md` — single trusted source document; inventory collapsed into intake.

## Blocks

- e.g., `extraction.md blocked — source folder not accessible from this checkout`

## Hand-off notes

Free-form notes for the next phase or human reviewer.

```
YYYY-MM-DD (project-scaffolder): Intake complete. Source pointer: <path>. Key unknowns: <list>.
```

## Open clarifications

- [ ] CLAR-001 — …

## Source pointers

| Pointer | Type | Notes |
|---|---|---|
| <path-or-url> | folder | <notes> |
