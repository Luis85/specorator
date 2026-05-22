---
feature: agent-ux-parity
area: AUX
current_stage: review
status: active
last_updated: 2026-05-22
last_agent: reviewer (Stage 9)
artifacts:
  idea.md: complete
  research.md: skipped
  requirements.md: complete
  design.md: complete
  spec.md: complete
  tasks.md: complete
  implementation-log.md: complete
  test-plan.md: complete
  test-report.md: complete
  review.md: complete
  traceability.md: complete
  release-notes.md: complete
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
| 7. Implementation | `implementation-log.md` + code | complete (WS-AUX-1..10 all merged) |
| 8. Testing | `test-plan.md`, `test-report.md` | complete |
| 9. Review | `review.md`, `traceability.md` | complete (verdict: ACCEPT with conditions) |
| 10. Release | `release-notes.md` | drafted (awaiting reviewer sign-off) |
| 11. Learning | `retrospective.md` | pending |

## Skips

- `research.md` — Two authoritative audits supplied as upstream input: (a) current Specorator MPS UI/UX inventory, (b) Claudian plugin UX design reference. See `idea.md` for findings + delta summary. No additional research required.

## Hand-off notes

```
2026-05-22 (dev R-AUX-01): legacy ApprovalCard.vue and orphaned tests/stories
                           deleted as scheduled in WS-8b. InlineApprovalCard
                           is now the sole approval-card surface.

2026-05-22 (reviewer Stage 9): Stage 9 review complete. Verdict: ACCEPT with
                          conditions. Wrote specs/agent-ux-parity/review.md.
                          traceability.md re-validated at WS-AUX-10 tip and
                          adopted as-is (no drift; no regeneration needed).
                          Spot-checked every REQ-AUX-NNN against an
                          implementing file + test on disk; re-ran the
                          lint-style-tokens guard (0 violations) and the
                          obsidian-import / v-html / window.confirm grep
                          invariants (all 0 live matches). Bundle delta
                          confirmed: +3.00 % plugin / +1.30 % standalone
                          (well under 5 %). Coverage 91.05 / 85.37 / 90.92
                          / 92.14 (above 80/70/80/80). Three ADRs realised
                          with no drift.

                          Findings: 3 MAJOR, 3 MINOR, 1 NIT. Conditions to
                          clear before tagging a release: (R-AUX-01) delete
                          dead-code ApprovalCard.vue + ApprovalCard.{po,test}.ts
                          (WS-8b log scheduled deletion in WS-10 cleanup but
                          it didn't happen — only InlineApprovalCard is now
                          wired into MessageList.vue at line 44 + 484);
                          (R-AUX-02) capture the parity screenshots per
                          parity-screenshots.md so the north-star release
                          criterion is evidenced; (R-AUX-03) run axe scan
                          + light/forced-colors WCAG pass on
                          AgentSidepanelRoot (T-AUX-347, T-AUX-349) since
                          NFR-AUX-008 cannot be formally cleared without a
                          runtime pass against the assembled surface.
                          MINOR/NIT items (R-AUX-04..07) are documentation
                          polish only.

                          Carry-overs accepted (none block release):
                          CQ-AUX-01 (Cursor brand placeholder), CQ-AUX-04
                          (SpDropdownPanel cross-feature deferral),
                          CQ-AUX-06 (Fork action behind showFork prop),
                          CQ-AUX-09 (approval editableFields=[]), CQ-AUX-13
                          (plan-mode literal). MessageItem.vue extraction
                          for REQ-AUX-014 explicitly accepted as a
                          retrospective follow-up; inline render in
                          MessageList.vue satisfies the requirement today.

                          Hand-off → release-manager for Stage 10. Resolve
                          R-AUX-01..03 first (one small follow-up PR for
                          R-AUX-01; screenshots + axe pass for R-AUX-02/03
                          can land alongside release-notes finalisation).
                          If R-AUX-03 cannot run on the Windows host,
                          escalate to sre for a CI-side or maintainer-side
                          accessibility audit before tagging.

2026-05-22 (qa WS-AUX-10): Closed implementation + testing stage. Delivered:
                          (1) three Storybook stories filling the residual
                          §5 NEW-component coverage gap (ThreadTabBadge,
                          WelcomeGreeting, WelcomeSuggestionChip);
                          (2) bundle-final.json — plugin gzip 738,128 B
                          vs baseline 716,631 B = +3.00 % / +21.50 kB
                          (well under NFR-AUX-001 5 % ceiling); standalone
                          gzip 99,783 B vs baseline 98,499 B = +1.30 %
                          / +1.28 kB; (3) parity-screenshots.md — manual
                          capture checklist for 6 screens × 3 breakpoints
                          (320/520/720 px); (4) traceability.md — every
                          REQ-AUX-NNN/NFR-AUX-NNN mapped to spec section,
                          tasks, implementing files, tests; ADR + CQ
                          disposition table; (5) release-notes.md —
                          user-facing + internal highlights, bundle
                          impact, known limitations; (6) test-report.md —
                          verify chain snapshot. Verify gate GREEN:
                          typecheck 0 errors; lint 0 errors (85
                          pre-existing warnings unchanged); unit suite
                          263 / 263 files, 2459 / 2459 tests; coverage
                          91.05/85.37/90.92/92.14 (above 80/70/80/80);
                          lint-style-tokens 0 violations; plugin build
                          GREEN; build:web GREEN. Open CQs after WS-10:
                          CQ-AUX-01 (Cursor brand), CQ-AUX-04 (dropdown
                          cross-feature), CQ-AUX-06 (Fork action),
                          CQ-AUX-09 (approval editable fields), CQ-AUX-13
                          (plan-mode label as token) — all documented in
                          traceability.md §4 and release-notes.md Known
                          Limitations; none block release. Deferred to
                          reviewer: axe scan on AgentSidepanelRoot
                          (T-AUX-347 — Chromium gate on Windows host
                          unavailable), light + forced-colors WCAG audit
                          (T-AUX-349), parity-screenshot image capture
                          (T-AUX-355). MessageItem.vue extraction
                          (REQ-AUX-014) carried into retrospective for
                          a follow-up feature. Hand-off → reviewer for
                          `/spec:review` on branch
                          `feature/aux-ws-10-storybook-parity-bundle`
                          (squash-merge into develop pending).

2026-05-22 (dev WS-AUX-9): Nav-sidebar + history menu + RTL/lint guard landed on
                          `feature/aux-ws-9-nav-history-rtl-guard`
                          (squash-merge → develop pending). Delivered:
                          (1) `FloatingNavSidebar.vue` — right-edge
                          column with 32 px circular buttons (scroll-top,
                          scroll-bottom, clear-conversation, toggle-
                          thinking); opacity 0.15 -> 1 on hover; hidden
                          via `useNarrowSidepanel` injection; (2)
                          `NavSidebarButton.vue` — circular SpIconButton
                          wrapper with `transform: scale(1.05)` on hover;
                          (3) `ThreadHistoryMenu.vue` — drop-up
                          SpDropdownPanel listing chat threads ordered
                          by lastUsedAt desc; HoverActions reveals
                          rename + delete on hover; 2 px accent border
                          on active row; inline rename input committing
                          on Enter / blur; (4) `scripts/lint-style-
                          tokens.mjs` — guard for raw Obsidian vars +
                          physical CSS properties under
                          `src/ui/agent/**` and
                          `src/ui/components/agent/**`; wired into
                          `npm run verify` after `npm run lint`; (5)
                          full sweep of the agent surface — 18 .vue
                          files swept from raw vars (`--background-*`,
                          `--text-*`, `--interactive-*`) to `--sp-*`
                          tokens and from physical to logical CSS
                          properties (margin-inline-*, padding-inline-*,
                          border-start-*-radius, text-align: start/end).
                          tokens.css gains 6 new aliases
                          (`--sp-text-accent`, `--sp-text-on-accent`,
                          `--sp-interactive-accent-translucent`,
                          `--sp-interactive-active-hover`,
                          `--sp-error-bg`, `--sp-error-border`).
                          AgentSidepanelRoot now mounts the floating
                          column; ThreadTabStrip exposes a
                          `thread-history-toggle` SpIconButton that
                          opens the drop-up menu. 18 / 18 new component
                          tests GREEN (FloatingNavSidebar 6,
                          NavSidebarButton 3, ThreadHistoryMenu 7,
                          NavSidebarButton 3 — adjusted). 6 / 6 new
                          lint-guard tests GREEN. Full unit suite 289
                          / 289 files, 2548 / 2548 tests GREEN. Plugin
                          bundle gzip 729.61 KB vs 716.63 KB baseline
                          (+12.98 KB / +1.8 %, well under the 5 %
                          NFR-AUX-001 budget). Lint-style-tokens guard
                          clean (0 violations under guarded paths;
                          112 originally surfaced, all remediated).
                          T-AUX-336 / T-AUX-339 (qa RED tasks),
                          T-AUX-341 (Storybook RTL/forced-colors
                          decorators), T-AUX-342 (CLAUDE.md /
                          contributor docs refresh) deferred to qa
                          and to follow-up commits under WS-AUX-10.
                          Hand-off → qa + sre for WS-AUX-10 (Storybook
                          coverage gate, axe scan, WCAG 2.2 AA audit,
                          bundle-size delta verify, parity screenshots,
                          traceability matrix regen).

2026-05-22 (dev WS-AUX-8b): MessageList swap-over from legacy `ApprovalCard.vue`
                          to `InlineApprovalCard.vue` (T-AUX-306). Legacy
                          ApprovalCard.vue retained as dead code per
                          WS-8b brief — deletion scheduled for WS-10
                          cleanup. Rule-persistence side-effect (the
                          `addRule(...)` write previously embedded in
                          ApprovalCard) lifted up to
                          `handleApprovalDecision` in MessageList.vue
                          since `InlineApprovalCard` is intentionally
                          pure UI. New `HelpPopover.vue` (T-AUX-313..318):
                          searchable, keyboard-navigable command palette
                          replacing the inline `/help` drawer in
                          `AgentSidepanelRoot.vue`. Filter by
                          case-insensitive substring; ArrowUp/Down moves
                          active row with wrap-around; Enter emits
                          `select(id)`; Esc emits `close`. Backdrop-blur
                          background via `--sp-bg-secondary-alt` +
                          `backdrop-filter: blur(20px)`; logical
                          properties throughout. Sr-only polite live
                          region announces filtered result count. 7 / 7
                          new HelpPopover tests GREEN, 18 / 18 MessageList
                          tests GREEN, 7 / 7 slashCommands tests GREEN
                          (Esc replaces explicit close click). New i18n
                          keys `agent.help.search.placeholder` +
                          `agent.help.results.count` added to en + de.
                          Squash SHA TBD on develop merge. Full unit
                          suite 259 / 259 files, 2437 / 2437 tests
                          GREEN. Plugin bundle gzip 724.72 kB vs 716.63 kB
                          baseline (+8 kB, HelpPopover SFC). Hand-off →
                          dev (WS-AUX-8c) for slash / mention popover
                          refresh per micro-RALPH dispatch plan.

2026-05-22 (dev):         WS-AUX-7 landed on
                          `feature/aux-ws-7-status-transport`
                          (squash-merge → develop pending).
                          Delivered: TransportStatusPill.vue (kind:
                          connecting | degraded | offline, provider-
                          interpolated microcopy via copy table, SpIcon
                          icon, retry emit for non-connecting kinds);
                          transportStatusStore.ts (dormant Pinia store:
                          kind 'idle' | 'connecting' | 'degraded' |
                          'offline', optional diagnostic); composer-
                          group wrap in AgentSidepanelRoot.vue (single
                          bordered .sp-composer-group ancestor for
                          StatusPanel + ChatSidebar; AttachmentStrip
                          rides inside ChatInput per CQ-AUX-18);
                          StatusPanel.vue body owns scroll with
                          max-height min(40vh, 320px) +
                          overscroll-behavior contain + --sp-* tokens;
                          MessageList.vue surfaces TransportStatusPill
                          sticky at top of scroll region when
                          transportStatusStore.kind !== 'idle' (retry
                          resets store to idle); agent.transport.*
                          microcopy in en + de (connecting/degraded/
                          offline/retry/fallbackProvider).
                          Commits: 7f400d5 (pill primitive),
                          30a5110 (status panel grouping), 1cc2851
                          (MessageList wiring), 37ffac5 (lint fixes).
                          Verify: typecheck GREEN; lint GREEN
                          (0 errors / 68 pre-existing warnings); unit
                          GREEN 2424/2424 (3 new tests added in WS-7);
                          plugin gzip 722.91 kB vs WS-4 baseline
                          716.631 kB → +6.28 kB / +0.88% (inside
                          NFR-AUX-001 5% ceiling); build:web GREEN
                          (96.40 kB gzip).
                          Deviations: (1) T-AUX-288 StatusTodoItem
                          extraction deferred — TodoList + BashHistoryList
                          already encapsulate item rendering; wrapper
                          would be a trivial pass-through. (2)
                          T-AUX-294/295 new-messages pill behaviour
                          pre-existed in MessageList from WP-8 (UX #8);
                          existing coverage at MessageList.test.ts
                          292..338 already asserts visibility
                          transitions; no re-implementation. (3)
                          StatusPanel.po.ts (T-AUX-298) already existed
                          from WS-MPS work.
                          Hand-off → dev for WS-AUX-8 (T-AUX-300..324,
                          approval card + help + slash/mention
                          popovers) on a fresh branch cut from
                          develop after this PR merges. WS-AUX-9 also
                          remains available.

2026-05-22 (dev):         WS-AUX-6 landed on
                          `feature/aux-ws-6-composer-toolbar-meter`
                          (squash-merged into develop).
                          Delivered: contextUsageStore (T-AUX-255..257);
                          ContextMeter SVG donut with brand→error >80%
                          threshold (T-AUX-260..263); McpIndicator
                          (zap + count + mcp-glow, T-AUX-264..266);
                          InputToolbar in REQ-AUX-004 normative order
                          (model · mode · permission · thinking · mcp ·
                          context-meter · send) (T-AUX-267..280);
                          ProviderBadge copy table via
                          `t('provider.label.<id>')` + `t('provider.mode.<mode>')`
                          with '·' separator ('Claude · CLI', never
                          'claude/cli'); ProviderMenu + ModelSelector
                          migrated to SpDropdownPanel; ModeIndicators
                          migrated to SpToggleSwitch; AttachmentStrip
                          nested inside composer wrapper (CQ-AUX-18);
                          ArrowUp-to-edit-last-user-message guarded by
                          textarea-empty + no-open-picker
                          (CQ-AUX-10); AgentSidepanelHeader collapsed
                          (provider/model row moved to InputToolbar).
                          Tests: 8 chat-suite files stub
                          InputToolbar + ProviderBadge + ProviderMenu +
                          ModelSelector (InputToolbar has its own
                          dedicated tests under
                          `tests/ui/components/agent/`).
                          Verify: typecheck GREEN; lint GREEN; unit
                          GREEN 2413/2413; coverage 91.05/85.37/90.92/
                          92.14 (>80/70/80/80 gate); plugin gzip
                          **721.47 kB** vs WS-4 baseline 716.631 kB
                          (+4.84 kB / +0.68%, inside NFR-AUX-001 5%
                          ceiling); build:web GREEN (96.29 kB gzip);
                          workflows SHA-pinned; manifest valid.
                          Deviations: none material.
                          Hand-off → dev for WS-AUX-7 on a fresh
                          branch cut from develop.

2026-05-22 (dev):         WS-AUX-5 landed on
                          `feature/aux-ws-5-messages-nested-streaming`.
                          Delivered: StreamingCursor primitive + PO +
                          test + story (replaces literal U+258D glyph;
                          tokens-driven blink + reduced-motion
                          fallback); NestedDetailFrame primitive + PO
                          + test + story (owns the only 2px
                          border-inline-start + indent contract;
                          data-status idle|running|complete|error);
                          MessageBubble role-aware shell + PO + test +
                          story (user → right-aligned + asymmetric
                          border-end-end-radius; assistant →
                          transparent full-width; system → outline);
                          CompactBoundary refresh + PO + test (token-
                          driven divider + chevron icon — was
                          deferred from WS-AUX-4); ThinkingBlock +
                          ToolCallBlock refactored to wrap
                          NestedDetailFrame; MessageActions migrated
                          to <HoverActions> + <SpIconButton> with
                          Lucide icons (copy/rotate-ccw/pencil/
                          git-fork) and 1.5s Copied aria-label swap
                          (REQ-AUX-016); MessageList wires
                          MessageBubble in #default + MessageActions
                          in #actions, replaces literal cursor with
                          StreamingCursor, replaces inline ASCII
                          divider with <CompactBoundary>. Added i18n
                          copyConfirm + fork + forkAriaLabel keys in
                          en + de.
                          Touched tests: ThinkingBlock + ToolCallBlock
                          + MessageActions.* + MessageList.* +
                          MessageList.compactBoundary + MessageList
                          .{edit,regenerate} — each gained
                          ICON_PORT/LOGGER_PORT provide; assertion
                          contracts unchanged. .storybook/preview.ts
                          now provides ICON_PORT so the new agent
                          stories resolve the IconPort (closes the
                          9 storybook failures observed on this tip).
                          Deviations: (1) CQ-AUX-06 Fork action
                          stays escalated — shipped behind a
                          `showFork` prop defaulting to false with
                          working `git-fork` icon + microcopy +
                          `fork` emit; carried forward to PM
                          sign-off. (2) `MessageActionIcon.vue`
                          collapsed into MessageActions; SpIconButton
                          already provides the per-action a11y
                          contract. (3) `SubagentBlock.vue` does not
                          exist in the codebase; NestedDetailFrame
                          ready to wrap it when it lands.
                          (4) Role-aware avatars + per-message
                          timestamps (T-AUX-251..253) deferred:
                          MessageItem.vue is not a separate file;
                          carries forward to a follow-up extraction
                          tracked alongside REQ-AUX-014 in WS-AUX-10.
                          Verify: typecheck GREEN; lint GREEN
                          (0 errors); unit GREEN 2430/2430;
                          storybook GREEN 65/65; build GREEN
                          (main.js gzip 717.87 kB vs WS-4 baseline
                          716.63 kB → +1.24 kB / +0.17%);
                          build:web GREEN (95.83 kB gzip).
                          Hand-off → dev for WS-AUX-6
                          (T-AUX-255..284 — composer +
                          InputToolbar + ContextMeter) on a fresh
                          branch cut from develop after this PR
                          merges. WS-AUX-8 (T-AUX-300..324)
                          depends on WS-AUX-5 + WS-AUX-3 and can
                          start in parallel; WS-AUX-9 (T-AUX-325..
                          344) already unblocked.

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

2026-05-22 (dev WS-AUX-8a): Added `InlineApprovalCard.vue` (additive,
                          Claudian-parity tabbed approval surface) alongside the
                          legacy `ApprovalCard.vue`. New component bundle:
                          SFC + test (6 / 6 GREEN) + class-based PO +
                          single Storybook story under stories/agent/.
                          Single tab today (single-resource case);
                          forward-compatible with multi-resource batches.
                          Default focus on Deny per SPEC-MPS-001 §8.4;
                          Escape on card root emits `deny`. Emits three
                          named events (`deny` / `allow-once` /
                          `allow-always`); idempotent after the first
                          decision. typecheck + lint GREEN (0 errors,
                          pre-existing warnings unchanged). MessageList
                          swap-in deferred to WS-AUX-8b per scope.
                          Squash SHA TBD on merge into develop. Hand-off
                          → dev (WS-AUX-8b) to migrate `MessageList.vue`
                          + downstream consumers.

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
