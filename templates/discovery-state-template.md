---
sprint: <sprint-slug>
current_phase: frame      # frame | diverge | converge | prototype | validate | handoff
status: active            # active | blocked | paused | complete | no-go | pivot
last_updated: YYYY-MM-DD
last_agent: <role>
artifacts:                # canonical machine-readable map; the table below is its human view
  frame.md: pending               # pending | in-progress | complete | skipped | blocked
  divergence.md: pending
  convergence.md: pending
  prototype.md: pending
  validation.md: pending
  chosen-brief.md: pending
chosen_briefs: []         # list of feature slugs spawned by handoff (0..N)
---

# Discovery sprint state — <sprint-slug>

## Phase progress

| Phase | Artifact | Status |
|---|---|---|
| 1. Frame | `frame.md` | pending |
| 2. Diverge | `divergence.md` | pending |
| 3. Converge | `convergence.md` | pending |
| 4. Prototype | `prototype.md` | pending |
| 5. Validate | `validation.md` | pending |
| Handoff | `chosen-brief.md` (0..N) | pending |

> **Statuses:** `pending` | `in-progress` | `complete` | `skipped` | `blocked`. Sprint-level: `active | blocked | paused | complete | no-go | pivot`. `complete` = at least one brief handed off; `no-go` = every candidate failed validation; `pivot` = re-framing required. Section semantics: see [`_shared/state-file-sections.md`](./_shared/state-file-sections.md).

## Skips

- e.g., `divergence.md` — collapsed into frame.md for compressed sprint

## Blocks

- e.g., `validation.md blocked — no target users available before <date>`

## Hand-off notes

```
2026-04-27 (facilitator):     Sprint kicked off. Outcome: Q2 retention. Decider: <name>.
2026-04-27 (product-strategist): Lean Canvas drafted; riskiest assumption is willingness-to-pay.
2026-04-28 (user-researcher): 5 JTBD interviews scheduled this week.
```

## Open clarifications

- [ ] CLAR-001 — …
- [x] CLAR-002 — …  *(resolved YYYY-MM-DD: …)*

## Specialists

> Names of human specialists in the room (or `agent` if the AI shadow is carrying the role).

| Role | Specialist |
|---|---|
| Facilitator / Decider | <name> |
| Product Strategy | <name or `agent`> |
| User Research | <name or `agent`> |
| Game / Experience Design | <name or `agent`> |
| Divergent Thinking | <name or `agent`> |
| Critic / Devil's Advocate | <name or `agent`> |
| Prototyping | <name or `agent`> |
