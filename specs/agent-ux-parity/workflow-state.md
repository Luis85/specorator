---
feature: agent-ux-parity
area: AUX
current_stage: tasks
status: active
last_updated: 2026-05-22
last_agent: planner
artifacts:
  idea.md: complete
  research.md: skipped
  requirements.md: complete
  design.md: complete
  spec.md: complete
  tasks.md: complete
  implementation-log.md: pending
  test-plan.md: pending
  test-report.md: pending
  review.md: pending
  traceability.md: pending
  release-notes.md: pending
  retrospective.md: pending
predecessors:
  - multi-provider-agent-sidepanel   # MPS shipped feature parity (WS-1..WS-10); this feature ships UX/visual parity
adrs:
  - ADR-AUX-001-icon-port-for-set-icon
  - ADR-AUX-002-sp-design-token-css-layer
  - ADR-AUX-003-hover-actions-primitive
---

# Workflow state — agent-ux-parity

## Stage progress

| Stage | Artifact | Status |
|---|---|---|
| 1. Idea | `idea.md` | complete |
| 2. Research | `research.md` | skipped (Claudian + current-MPS audits supplied as upstream input) |
| 3. Requirements | `requirements.md` | complete |
| 4. Design | `design.md` (consolidated A+B+C) | complete |
| 5. Specification | `spec.md` | complete |
| 6. Tasks | `tasks.md` | complete |
| 7. Implementation | `implementation-log.md` + code | pending |
| 8. Testing | `test-plan.md`, `test-report.md` | pending |
| 9. Review | `review.md`, `traceability.md` | pending |
| 10. Release | `release-notes.md` | pending |
| 11. Learning | `retrospective.md` | pending |

## Skips

- `research.md` — Two authoritative audits supplied as upstream input: (a) current Specorator MPS UI/UX inventory, (b) Claudian plugin UX design reference. See `idea.md` for findings + delta summary. No additional research required.

## Hand-off notes

```
2026-05-22 (orchestrator): Feature scaffolded after MPS WS-10 closeout. Goal = UX/visual
                          parity with Claudian plugin (D:\Projects\claudian-main). Two
                          upstream audits captured in idea.md. Dispatching ux-designer,
                          ui-designer, architect in parallel for stages 3/4/5.

2026-05-22 (architect):   Consolidated Part A (UX) + Part B (UI) + new Part C (Architecture)
                          into specs/agent-ux-parity/design.md. Filed three ADRs in
                          decisions/: ADR-AUX-001 (IconPort), ADR-AUX-002 (--sp-* token
                          layer), ADR-AUX-003 (HoverActions primitive). Produced
                          implementation-ready spec.md with 19 file-level NEWs + ~20
                          MODIFIEDs, 9-workstream graph, 18 CQ-AUX-NN clarifications.
                          Hand-off to planner: consume design.md §C.5 + spec.md §7 to
                          produce TDD-ordered tasks.md. 18 open clarifications captured
                          in spec.md §10 — none block planning, but CQ-AUX-04 (SpDropdownPanel
                          cross-feature impact) and CQ-AUX-06 (Fork action in scope?)
                          should be answered before WS-AUX-3 / WS-AUX-5 ship. Scratch
                          drafts design-part-a-ux.md and design-part-b-ui.md retained
                          as inputs.

2026-05-22 (planner):     Produced tasks.md (142 tasks across 9 workstreams,
                          TDD-ordered) and dispatch-plan.md (one prompt per
                          workstream). Critical path is 24 hops; WS-AUX-1 → WS-AUX-2
                          → WS-AUX-3 → WS-AUX-5 → WS-AUX-10. WS-AUX-3 fans into
                          four parallel sub-chains after T-AUX-031 (SpIcon).
                          18 CQ-AUX-NN resolved per tasks.md §4: 9 routed into
                          tasks, 6 deferred, 3 escalated — CQ-AUX-01 (cursor brand)
                          before WS-1, CQ-AUX-04 (dropdown cross-feature) before
                          WS-3 T-AUX-112, CQ-AUX-06 (Fork action) before WS-5
                          T-AUX-230. Hand-off → dev: start with T-AUX-001
                          (ADR-AUX-002 confirmation) on branch
                          `feature/aux-ws-1-tokens-animations` cut from develop.
                          The dispatch-plan.md WS-AUX-1 section is the verbatim
                          prompt for the first dispatched specorator:dev subagent.
                          QA owner of the first RED test (T-AUX-002) should be
                          dispatched in parallel with dev for T-AUX-001 to
                          minimise critical-path lag.
```
