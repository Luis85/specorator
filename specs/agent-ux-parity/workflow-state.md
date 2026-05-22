---
feature: agent-ux-parity
area: AUX
current_stage: implementation
status: active
last_updated: 2026-05-22
last_agent: dev
artifacts:
  idea.md: complete
  research.md: skipped
  requirements.md: complete
  design.md: complete
  spec.md: complete
  tasks.md: complete
  implementation-log.md: in-progress
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
| 7. Implementation | `implementation-log.md` + code | in-progress (WS-AUX-1 complete; WS-AUX-2..9 pending) |
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

2026-05-22 (dev WS-AUX-1): Shipped WS-AUX-1 (T-AUX-001..014) on branch
                          feature/aux-ws-1-tokens-animations and squash-merged
                          to develop. Adds: src/ui/styles/tokens.css
                          (--sp-* design-token layer, spec §4.1–§4.7),
                          src/ui/styles/animations.css (5 named keyframes
                          + spin reduced-motion override), [data-provider]
                          binding on AgentSidepanelRoot.vue (specorator-root
                          class + computed from chatProviderStore.resolved),
                          stories/styles/Tokens.stories.ts, and
                          specs/agent-ux-parity/bundle-baseline.json
                          (plugin gzip 716,631 B / standalone gzip 98,499 B;
                          NFR-AUX-001 budget enforced at WS-AUX-10). ADR-AUX-002
                          marked Accepted (T-AUX-001). Verify gate green:
                          2276 tests / 232 files / coverage 91.37/85.35/91.05/92.48
                          (above 80/70/80/80). Deviations: (1) Tokens story
                          lives under stories/styles/ rather than
                          src/ui/styles/__stories__/ because storybook globs
                          ../stories/** — relocation deferred. (2) Spec
                          mentions chatProviderStore.providerId but the actual
                          store exposes resolved.provider — computed maps it,
                          no API change. CQ-AUX-01 carry-through: cursor
                          brand uses placeholder #6b7280 with CQ-AUX-01 inline
                          comment; PM + ux-designer must confirm before
                          release. Next agent: dev for WS-AUX-2 (T-AUX-015..034)
                          — branch feature/aux-ws-2-iconport-spicon cut from
                          develop after this merge. WS-AUX-3..10 follow per
                          dispatch-plan.md.

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
