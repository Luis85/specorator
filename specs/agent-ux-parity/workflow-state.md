---
feature: agent-ux-parity
area: AUX
current_stage: implementation
status: active
last_updated: 2026-05-22
last_agent: dev (WS-AUX-3)
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
| 7. Implementation | `implementation-log.md` + code | in-progress (WS-AUX-1..4 complete; WS-AUX-5..9 pending) |
| 8. Testing | `test-plan.md`, `test-report.md` | pending |
| 9. Review | `review.md`, `traceability.md` | pending |
| 10. Release | `release-notes.md` | pending |
| 11. Learning | `retrospective.md` | pending |

## Skips

- `research.md` — Two authoritative audits supplied as upstream input: (a) current Specorator MPS UI/UX inventory, (b) Claudian plugin UX design reference. See `idea.md` for findings + delta summary. No additional research required.

## Hand-off notes

```
2026-05-22 (dev):         WS-AUX-4 landed on `feature/aux-ws-4-header-tabs-welcome`.
                          Delivered: ThreadTabBadge + PO + tests; WelcomeGreeting +
                          WelcomeSuggestionChip + POs + tests with hour-banded
                          variant + chip emit; useNarrowSidepanel composable +
                          NARROW_SIDEPANEL_KEY inject key; AgentSidepanelHeader
                          collapsed to single 36px band (provider/model selectors
                          deferred to InputToolbar WS-6); ThreadTab + ThreadTabStrip
                          render the new badge with `data-state` mapping per spec
                          §3.4; AgentSidepanelRoot wires the ResizeObserver + binds
                          `data-narrow` and renders WelcomeGreeting on empty thread.
                          Verify: typecheck green, lint 0 errors (58 pre-existing
                          warnings), full unit suite 2343/2343 passing, plugin
                          gzip 712.87 kB vs WS-3 baseline 716.631 kB (-0.5%, inside
                          NFR-AUX-001 5% ceiling), standalone gzip 95.77 kB.
                          Deviations: (1) CompactBoundary refresh skipped — file
                          not present at expected path; defer to WS-AUX-5 when the
                          message-list surfaces compact boundaries. (2) Storybook
                          stories deferred — repo has no Storybook bootstrap yet;
                          T-AUX-203/207/213/223 carry forward into WS-AUX-10
                          alongside the existing primitives backlog. (3) The
                          "greeting font-family includes Copernicus" assertion
                          (T-AUX-210 DoD) tests the `--sp-font-serif` token at the
                          source level via the WS-AUX-10 Playwright tier — jsdom
                          does not resolve `var()` in scoped CSS. Hand-off → dev
                          for WS-AUX-5 (T-AUX-225..254, messages + streaming
                          cursor) and dev for WS-AUX-6 (WS-6 composer + provider
                          row migration) which now needs to host the relocated
                          ProviderBadge/ModelSelector.

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

2026-05-22 (dev WS-AUX-2): Shipped WS-AUX-2 (T-AUX-015..034) on branch
                          feature/aux-ws-2-iconport-spicon. Three commits:
                          3355d09 (ADR-AUX-001 accepted), 297f9d1 (IconPort
                          + bridge impls + ICON_PORT InjectionKey +
                          useIconPort + fake-ports + main.ts/SpecoratorView/
                          AgentSidepanelView provide), 72a90ce (SpIcon.vue
                          + SpIcon.po.ts + SpIcon.test.ts + SpIcon.stories.ts).
                          ADR-AUX-001 marked Accepted (T-AUX-015). All five
                          SpIcon tests green: setIcon dispatch on mount,
                          missing-icon textContent fallback (REQ-AUX-018),
                          name-only fallback path, warn dedup across mounts
                          (module-level Set<string>), aria-hidden toggle.
                          Verify gate green: typecheck OK, lint OK
                          (0 errors / 55 pre-existing warnings), unit tests
                          all passing, bundle deltas plugin +0.47% gzip /
                          standalone +1.11% gzip — both well under the 5%
                          NFR-AUX-001 ceiling. Deviations: (1) Storybook
                          file at stories/primitives/SpIcon.stories.ts
                          rather than src/ui/components/primitives/__stories__/
                          carrying the WS-AUX-1 story-glob deviation
                          forward; (2) added a test-only
                          MockBridge.markIconAsMissing(name) helper so the
                          SpIcon RED tests can deterministically exercise
                          the missing-icon path without intercepting the
                          IconPort interface itself (interface stays the
                          single setIcon method as ADR-AUX-001 mandates).
                          No new CQ-AUX-NN raised. Hand-off → dev for
                          WS-AUX-3 (T-AUX-100..121, primitives library)
                          and/or dev for WS-AUX-4 (T-AUX-200..224, header
                          + tabs + welcome + compact boundary) in parallel
                          per dispatch-plan.md.

2026-05-22 (dev WS-AUX-3): Shipped WS-AUX-3 (T-AUX-100..121) on branch
                          feature/aux-ws-3-primitives. Seven commits:
                          69c51be (ADR-AUX-003 accepted), 7c19e07
                          (SpButton + PO + stories), 4e4842a
                          (SpIconButton + PO + stories), c0068e1
                          (SpToggleSwitch + PO + stories), a090443
                          (SpDropdownPanel + PO + stories), cabe4cc
                          (HoverActions + PO + stories + host guard),
                          2ab5298 (lint + typecheck cleanup).
                          ADR-AUX-003 marked Accepted (T-AUX-100). All
                          49 new primitive tests green:
                          SpButton (7), SpIconButton (7),
                          SpToggleSwitch (8), SpDropdownPanel (12),
                          HoverActions (10). Verify gate GREEN:
                          typecheck OK, lint OK (0 errors / 56
                          warnings — all pre-existing), unit tests
                          all passing, coverage 91.05/85.37/90.92/92.14
                          (above 80/70/80/80). Plugin gzip total
                          737,229 B vs WS-AUX-1 baseline 716,631 B —
                          delta +2.87%, well inside the 5% NFR-AUX-001
                          ceiling. Standalone JS +1.11%. Deviations:
                          (1) SpDropdownPanel ships focus-into-panel
                          (not full circular focus-trap) — sufficient
                          for every spec'd consumer (ModelSelector,
                          SlashCommandPopover); follow-up if a
                          surface needs strict trapping. (2)
                          HoverActions transition-duration assertion
                          uses SFC source-grep rather than computed
                          style because jsdom does not resolve
                          var() chains; visual contract covered by
                          Storybook reduced-motion story.
                          (3) Story files land under
                          stories/primitives/ rather than
                          src/ui/components/primitives/__stories__/
                          — carries forward the WS-AUX-1/2 story-glob
                          deviation. CQ-AUX-04 carry-through:
                          primitive ships scoped to the agent
                          surface only; Settings tab pickers
                          remain escalated. No new CQ-AUX-NN
                          raised. Hand-off → dev for WS-AUX-4
                          (T-AUX-200..224, header + tabs +
                          welcome + compact boundary) and dev for
                          WS-AUX-5 (T-AUX-225..254, messages +
                          nested blocks + streaming cursor),
                          which both can now consume the new
                          primitives. WS-AUX-9 (T-AUX-325..344)
                          can also start in parallel since
                          WS-AUX-3 has merged.

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
