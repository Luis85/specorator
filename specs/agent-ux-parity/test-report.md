---
feature: agent-ux-parity
area: AUX
stage: testing
status: complete
owner: qa
last_updated: 2026-05-22
inputs:
  - specs/agent-ux-parity/requirements.md
  - specs/agent-ux-parity/spec.md
  - specs/agent-ux-parity/tasks.md
  - specs/agent-ux-parity/bundle-baseline.json
  - specs/agent-ux-parity/bundle-final.json
  - specs/agent-ux-parity/traceability.md
---

# Test report — Agent Sidepanel UX Parity

Final QA gate for **WS-AUX-10**. Closes Stage 7 (Testing) and hands off to
the reviewer.

## 1. Execution summary

| Stage | Result |
|---|---|
| `npm run typecheck` | PASS (0 errors) |
| `npm run lint` | PASS (0 errors, 85 pre-existing warnings — none new) |
| `npm run test` | PASS (263 test files / 2459 tests) |
| `npm run test:coverage` | PASS (thresholds met — see §3.2) |
| `scripts/lint-style-tokens.mjs` | PASS (0 violations across guarded paths) |
| `npm run build` | PASS (plugin gzip 738,128 B) |
| `npm run build:web` | PASS (standalone gzip 99,783 B) |
| Bundle delta vs baseline (NFR-AUX-001) | PASS (+3.00 % / +1.30 %, see `bundle-final.json`) |

## 2. Per-REQ status

All 21 REQ-AUX-NNN clauses have ≥1 passing test at the WS-10 tip. Mapping in
`traceability.md` §1. Notable test counts surfaced by workstream owners:

| REQ | Cases | Result |
|---|---|---|
| REQ-AUX-001 | 5 (SpIcon: missing-icon fallback + warn dedup) | PASS |
| REQ-AUX-002 | 10 (HoverActions: a11y-tree + reduced-motion + coarse-pointer) | PASS |
| REQ-AUX-003 | covered by `AgentSidepanelRoot` + `AgentSidepanelHeader` | PASS |
| REQ-AUX-004 | InputToolbar source-order assertion + sub-component tests | PASS |
| REQ-AUX-005 | MessageBubble + MessageList role/alignment | PASS |
| REQ-AUX-006 | tokens.test.ts + AgentSidepanelRoot.dataProvider | PASS |
| REQ-AUX-007 | WelcomeGreeting + WelcomeSuggestionChip | PASS |
| REQ-AUX-008 | StreamingCursor + MessageList cursor placement | PASS |
| REQ-AUX-009 | tokens.test.ts + lint-style-tokens guard | PASS |
| REQ-AUX-010 | lint-style-tokens guard (6 test cases for the guard itself) | PASS |
| REQ-AUX-011 | StatusPanel grouping + max-height | PASS |
| REQ-AUX-012 | SpDropdownPanel (12 cases incl. Esc + click-outside) | PASS |
| REQ-AUX-013 | NestedDetailFrame + ThinkingBlock + ToolCallBlock wraps | PASS |
| REQ-AUX-014 | MessageList timestamp visibility | PASS *(inline render — MessageItem.vue extraction is a follow-up; see release-notes Known Limitations)* |
| REQ-AUX-015 | CompactBoundary | PASS |
| REQ-AUX-016 | ProviderBadge copy table + i18n keys | PASS |
| REQ-AUX-017 | Storybook inventory (manual at WS-10 — see §3.1) | PASS |
| REQ-AUX-018 | Manual keyboard walk in `test-plan.md` §6; axe scan deferred (see §3.4) | PARTIAL |
| REQ-AUX-019 | ThreadTabBadge states | PASS |
| REQ-AUX-020 | HelpPopover (7 cases — search/arrow/Enter/Esc) | PASS |
| REQ-AUX-021 | InlineApprovalCard (6 cases) | PASS |

## 3. Non-functional / gate results

### 3.1 Storybook coverage (NFR-AUX-009, REQ-AUX-017, T-AUX-345)

Static inventory of `stories/**/*.stories.ts` against the spec §5 NEW
component list. The shipped surface — 16 NEW components — is covered:

| Shipped NEW component | Story file |
|---|---|
| `SpIcon` | `stories/primitives/SpIcon.stories.ts` |
| `SpButton` | `stories/primitives/SpButton.stories.ts` |
| `SpIconButton` | `stories/primitives/SpIconButton.stories.ts` |
| `SpToggleSwitch` | `stories/primitives/SpToggleSwitch.stories.ts` |
| `SpDropdownPanel` | `stories/primitives/SpDropdownPanel.stories.ts` |
| `HoverActions` | `stories/primitives/HoverActions.stories.ts` |
| `ThreadTabBadge` | `stories/agent/ThreadTabBadge.stories.ts` (added WS-10) |
| `WelcomeGreeting` | `stories/agent/WelcomeGreeting.stories.ts` (added WS-10) |
| `WelcomeSuggestionChip` | `stories/agent/WelcomeSuggestionChip.stories.ts` (added WS-10) |
| `NestedDetailFrame` | `stories/agent/NestedDetailFrame.stories.ts` |
| `InputToolbar` | `stories/agent/InputToolbar.stories.ts` |
| `ContextMeter` | `stories/agent/ContextMeter.stories.ts` |
| `McpIndicator` | `stories/agent/McpIndicator.stories.ts` |
| `ThreadHistoryMenu` | `stories/agent/ThreadHistoryMenu.stories.ts` |
| `StreamingCursor` | `stories/agent/StreamingCursor.stories.ts` |
| `InlineApprovalCard` | `stories/agent/InlineApprovalCard.stories.ts` |
| `FloatingNavSidebar` | `stories/agent/FloatingNavSidebar.stories.ts` |
| `NavSidebarButton` | `stories/agent/NavSidebarButton.stories.ts` |
| `TransportStatusPill` | `stories/agent/TransportStatusPill.stories.ts` |
| `MessageBubble` | `stories/agent/MessageBubble.stories.ts` |
| `MessageActions` | `stories/agent/MessageActions.stories.ts` |
| `HelpPopover` | `stories/agent/HelpPopover.stories.ts` |
| Tokens layer (visual coverage) | `stories/styles/Tokens.stories.ts` |

**NEW components from spec §5 that were collapsed / deferred upstream and
intentionally have no story** (documented in `workflow-state.md` hand-off
notes):

| Component | Reason |
|---|---|
| `AgentHeaderTooltip.vue` | Header collapsed to a single 36 px band in WS-4 (REQ-AUX-003); tooltip wrapper was never needed. |
| `MessageActionIcon.vue` | Collapsed into `MessageActions.vue` (WS-5); `SpIconButton` already provides the per-action a11y contract. |
| `StatusTodoItem.vue` | TodoList + BashHistoryList already encapsulate item rendering; wrapper would be a pass-through (WS-7 deviation). |
| `MentionPopover.vue` | Existing `MentionDropdown.vue` adopted via `SpDropdownPanel` migration; no separate file shipped. |
| `ApprovalTabBar.vue`, `ApprovalItem.vue`, `ApprovalReviewBody.vue` | Single-tab single-resource case shipped in `InlineApprovalCard.vue` directly (WS-8a); split deferred to multi-resource follow-up. |

### 3.2 Coverage thresholds (NFR-AUX-012, T-AUX-353)

`npm run test:coverage` output:

```
Statements   : 91.05% ( 2218/2436 )
Branches     : 85.37% ( 1191/1395 )
Functions    : 90.92% (  501/ 551 )
Lines        : 92.14% ( 2018/2190 )
```

All above the 80/70/80/80 floor. PASS.

### 3.3 Bundle delta (NFR-AUX-001, T-AUX-351)

| Artefact | Baseline gzip | Final gzip | Delta | Verdict |
|---|---|---|---|---|
| Plugin (main.js + styles.css) | 716,631 B | 738,128 B | +21,497 B / **+3.00 %** | PASS |
| Standalone (browser demo) | 98,499 B | 99,783 B | +1,284 B / **+1.30 %** | PASS |

Both inside the 5 % NFR-AUX-001 ceiling. Detail in `bundle-final.json`.

### 3.4 Accessibility (REQ-AUX-018, NFR-AUX-008, T-AUX-347..350)

- **Axe scan on `AgentSidepanelRoot` (T-AUX-347):** **Deferred.** The
  Storybook test-runner relies on Chromium and was not bootstrapped on the
  Windows host running this WS-10 pass; carried over to release-stage
  reviewer with the parity-screenshot manual capture. The static guard
  (SpIconButton requires `ariaLabel`; ESLint
  `vue/no-v-html` + `no-restricted-properties` clean) catches the most
  common regressions in CI.
- **Manual keyboard walk (T-AUX-348):** PASS — tab order on
  `AgentSidepanelRoot`: header → tab strip → transcript actionable →
  status panel → composer; every icon-only button has a non-empty
  `aria-label` (enforced by `SpIconButton`'s required prop).
- **WCAG 2.2 AA contrast (T-AUX-349):** Default dark theme: PASS.
  Default light theme + forced-colors: **Deferred** to release-stage
  reviewer alongside the parity-screenshot pass (light theme literals
  for codex `#000` + opencode `#707070` already overridden under
  `body.theme-light .specorator-root`).
- **Reduced-motion review (T-AUX-350):** PASS — every animated component
  (`StreamingCursor`, `HoverActions`, `ThreadTabBadge[streaming]`, `spin`)
  has a `prefers-reduced-motion` override; verified via component tests
  + tokens.css reduced-motion block.

### 3.5 ESLint guard regression scan (T-AUX-352)

`vue/no-v-html`, `no-restricted-properties`, `no-restricted-globals`,
`no-restricted-imports` all at error severity; 0 violations across the WS-10
tip. PASS.

### 3.6 Outbound-call invariants (NFR-AUX-011, T-AUX-354)

Code-review pass: no new outbound `fetch`/HTTP calls, no new `localStorage`
writes, no new `SettingsPort.saveSettings` invocations attributable to this
feature. PASS.

## 4. Failures, gaps, deferrals

| Item | Severity | Owner | Note |
|---|---|---|---|
| Storybook test-runner not bootstrapped (Chromium) | low | reviewer | Static inventory satisfies coverage gate (§3.1); axe scan deferred (§3.4). |
| Light-theme + forced-colors WCAG audit | low | reviewer | Default dark theme PASS; deferred alongside parity screenshots. |
| Parity screenshot capture (manual) | low | reviewer | Checklist authored at `specs/agent-ux-parity/parity-screenshots.md`. |
| MessageItem extraction for REQ-AUX-014 | low | dev (follow-up) | Behaviour shipped inline in `MessageList.vue`; refactor for clarity deferred. |
| Open CQ-AUX-01 / 04 / 06 / 09 / 13 | varies | PM + ux-designer | See `traceability.md` §4. None block release. |

No critical or high-severity defects open. No flaky tests observed across
the 2459-test run.

## 5. Recommendation

**Ready for `/spec:review`.** All gates PASS or are deferred with explicit
reviewer hand-off notes. Five carry-through CQs are documented in
`traceability.md` §4 and `release-notes.md`.

## 6. Verify chain snapshot (timestamp 2026-05-22)

```
npm run typecheck   → PASS
npm run lint        → PASS (0 errors, 85 pre-existing warnings)
npm run test        → PASS (263 / 263 files; 2459 / 2459 tests)
node scripts/lint-style-tokens.mjs → PASS (0 violations)
npm run build       → PASS (plugin gzip 738,128 B)
npm run build:web   → PASS (standalone gzip 99,783 B)
npm run test:coverage → PASS (91.05 / 85.37 / 90.92 / 92.14)
```
