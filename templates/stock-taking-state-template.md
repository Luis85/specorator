---
project: <project-slug>
current_phase: scope      # scope | audit | synthesize | handoff
status: active            # active | blocked | paused | complete | incomplete
last_updated: YYYY-MM-DD
last_agent: legacy-auditor
artifacts:                # canonical machine-readable map; the table below is its human view
  scope.md: pending               # pending | in-progress | complete | skipped | blocked
  audit.md: pending
  synthesis.md: pending
  stock-taking-inventory.md: pending
recommended_next: TBD     # discovery | spec | both | TBD (set during synthesize phase)
---

# Stock-taking engagement state — <project-slug>

## Phase progress

| Phase | Artifact | Status |
|---|---|---|
| 1. Scope | `scope.md` | pending |
| 2. Audit | `audit.md` | pending |
| 3. Synthesize | `synthesis.md` | pending |
| Handoff | `stock-taking-inventory.md` | pending |

> **Statuses:** `pending` | `in-progress` | `complete` | `skipped` | `blocked`. Engagement-level: `active | blocked | paused | complete | incomplete`. `complete` = all phases done and inventory produced; `incomplete` = inventory produced but open unknowns remain (documented in `## Blocks`). Section semantics: see [`_shared/state-file-sections.md`](./_shared/state-file-sections.md).

## Skips

- e.g., `audit.md` — process map section skipped; no access to system during initial engagement. Scheduled for follow-up session.

## Blocks

- e.g., `audit.md blocked — database schema access requires IT approval; ETA <date>`

## Hand-off notes

```
2026-04-27 (legacy-auditor):  Engagement kicked off. System in scope: <system-name>. Owner: <name>.
2026-04-27 (legacy-auditor):  Scope defined. Audit boundary: <summary>. Key unknowns: <list>.
2026-04-28 (legacy-auditor):  Audit complete. 3 unknown items outstanding — see Blocks. Recommend resolving before synthesis.
```

## Open clarifications

- [ ] CLAR-001 — …
- [x] CLAR-002 — …  *(resolved YYYY-MM-DD: …)*

## Stakeholders

> Names of key contacts for this engagement (system owners, power users, IT contacts).

| Role | Name | Availability |
|---|---|---|
| System Owner | <name> | <contact / availability> |
| Power User | <name> | <contact / availability> |
| IT / Platform Contact | <name> | <contact / availability> |
| Integration Partner | <name> | <contact / availability> |
