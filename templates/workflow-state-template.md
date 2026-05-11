---
feature: <feature-slug>
area: <AREA>            # short uppercase code; used in IDs (REQ-<AREA>-NNN)
current_stage: idea     # idea | research | requirements | design | specification | tasks | implementation | testing | review | release | learning
status: active          # active | blocked | paused | done
last_updated: YYYY-MM-DD
last_agent: <role>
artifacts:              # canonical machine-readable map; the table below is its human view
  idea.md: pending              # pending | in-progress | complete | skipped | blocked
  research.md: pending
  requirements.md: pending
  design.md: pending
  spec.md: pending
  tasks.md: pending
  implementation-log.md: pending
  test-plan.md: pending
  test-report.md: pending
  review.md: pending
  traceability.md: pending
  release-notes.md: pending
  retrospective.md: pending
---

# Workflow state — <feature-slug>

## Stage progress

| Stage | Artifact | Status |
|---|---|---|
| 1. Idea | `idea.md` | pending |
| 2. Research | `research.md` | pending |
| 3. Requirements | `requirements.md` | pending |
| 4. Design | `design.md` | pending |
| 5. Specification | `spec.md` | pending |
| 6. Tasks | `tasks.md` | pending |
| 7. Implementation | `implementation-log.md` + code | pending |
| 8. Testing | `test-plan.md`, `test-report.md` | pending |
| 9. Review | `review.md`, `traceability.md` | pending |
| 10. Release | `release-notes.md` | pending |
| 11. Learning | `retrospective.md` | pending |

> **Statuses:** `pending` | `in-progress` | `complete` | `skipped` | `blocked`. Section semantics + status enums: see [`_shared/state-file-sections.md`](./_shared/state-file-sections.md).

## Notes on meta-features

Plan-level meta-features may skip Stage 7-9 canonical artifacts when each sub-task ships as its own PR with implementation evidence, tests, review, and trace links. Record the rationale under `## Skips` and point to the per-PR evidence. See [`_shared/state-file-sections.md`](./_shared/state-file-sections.md) for the full rule.

## Skips

- e.g., `idea.md` — trivial copy fix

## Blocks

- e.g., `requirements.md blocked — awaiting compliance signoff from <name>`

## Hand-off notes

```
2026-04-26 (analyst): Research complete. Recommend Alternative B (event-sourced).
                      PM should treat as starting point; revisit RISK-003 in PRD.
2026-04-27 (pm):     Drafting REQ-* now. Will run /spec:clarify before handoff.
```

## Open clarifications

- [ ] CLAR-001 — …
- [x] CLAR-002 — …  *(resolved YYYY-MM-DD: …)*
