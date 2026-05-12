---
design: <design-slug>
surface: <surface name>
status: frame-in-progress   # see state machine below
last_updated: YYYY-MM-DD
last_agent: design-lead
downstream: ""              # filled at Handoff: feature-slug or "engineering direct"
---

# Design state — <Surface name>

## State machine

```
frame-in-progress → frame-complete →
sketch-in-progress → sketch-complete →
mock-in-progress → mock-complete →
handoff-in-progress → complete
```

Blocked states: append `-blocked` (e.g. `sketch-complete-blocked`).
Parked: `parked` — design deprioritised before handoff; artifacts preserved.

## Artifacts

| Artifact | Status | Notes |
|---|---|---|
| `design-brief.md` | pending | |
| `sketch.md` | pending | |
| `mock.html` | optional | |
| `design-handoff.md` | pending | |

## Token decisions (Phase 3)

<!-- Record every token chosen during the Mock phase. Proposed new tokens must be listed here before use. -->

| Element | Token | Value (reference) |
|---|---|---|
| | | |

**Proposed new tokens:**

| Token name | Proposed value | Status |
|---|---|---|
| | | proposed / approved / rejected |

## Blocks

<!-- Active blocks preventing phase progression. Remove when resolved. -->

| # | Block | Owner | Opened | Resolved |
|---|---|---|---|---|

## Hand-off notes

<!-- Notes for the next agent or the engineer. Written at the end of each phase. -->

### After Frame
<!-- design-lead → ux-designer brief: what to focus on in Sketch -->

### After Sketch
<!-- design-lead → ui-designer brief: what screens need the most visual decision-making -->

### After Mock
<!-- design-lead → ui-designer or engineer: brand check results, proposed tokens to approve -->

### After Handoff
<!-- design-lead → engineer or /spec:design: open questions, asset status, token PR status -->

## Open clarifications

<!-- Questions for the human that are blocking or about to block a phase. -->

| # | Question | Phase | Opened | Answered |
|---|---|---|---|---|
