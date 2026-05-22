---
feature: agent-ux-parity
area: AUX
stage: tasks
owner: planner
last_updated: 2026-05-22
purpose: Prompts to dispatch one specorator:dev subagent per workstream.
---

# Dispatch plan — Agent Sidepanel UX Parity

One section per workstream. Copy the prompt directly into the dispatched subagent. Each prompt:

- names the branch to cut (always from `develop`),
- enumerates tasks in scope (verbatim IDs from `tasks.md`),
- references binding ADRs / REQs / spec sections,
- defines the verify-gate exit and PR convention,
- forbids cross-workstream scope creep.

PR title convention: `feat(aux): WS-N <short description>`. Always squash-merge.

---

## WS-AUX-1 — Tokens + animations layer

```
You are specorator:dev. Branch: `feature/aux-ws-1-tokens-animations` cut from origin/develop.

Scope (tasks.md WS-AUX-1): T-AUX-001 through T-AUX-014.

Goal: land the additive `--sp-*` design-token CSS layer (`src/ui/styles/tokens.css`) and named-keyframes file (`src/ui/styles/animations.css`), wire `[data-provider]` on `AgentSidepanelRoot.vue`, and capture the gzipped bundle-size baseline.

Authoritative inputs:
- specs/agent-ux-parity/spec.md §4 (full token contract), §5 (file-level change list), §6 (test scenarios)
- decisions/ADR-AUX-002-sp-design-token-css-layer.md
- REQ-AUX-006, REQ-AUX-009, REQ-AUX-008, REQ-AUX-019

TDD order: write the RED test before the implementation it gates. Do not commit the impl ahead of its RED. Use `tests/__fakes__/fake-ports.ts` (`fakeModulePorts()`) for any test that mounts components.

CQ-AUX-01 (Cursor brand colour) is escalated — keep the placeholder `#6b7280` with the CQ-AUX-01 inline comment per T-AUX-004 and continue. Do not block on it.

Verify gate exit: `npm run verify` green; the baseline bundle size recorded to `specs/agent-ux-parity/bundle-baseline.json` (T-AUX-014). Push the branch; open PR against `develop` titled `feat(aux): WS-1 design-token layer + animations`. WS-1 complete = all 14 tasks done, verify green, PR opened.

Forbidden: introducing `<SpIcon>`, primitives, or component refactors. Those belong to WS-2 and WS-3. Do not modify any file outside the §5 list for WS-AUX-1.
```

---

## WS-AUX-2 — IconPort + SpIcon

```
You are specorator:dev. Branch: `feature/aux-ws-2-iconport-spicon` cut from origin/develop after WS-AUX-1 has merged.

Scope (tasks.md WS-AUX-2): T-AUX-015 through T-AUX-034.

Goal: ship the `IconPort` narrow port (per ADR-AUX-001), implement it in all three bridges (Obsidian / Mock / LocalStorage), expose it through `useIconPort` + InjectionKey, extend `tests/__fakes__/fake-ports.ts`, and ship the `<SpIcon>` primitive with PageObject + Storybook.

Authoritative inputs:
- specs/agent-ux-parity/spec.md §1.1 (port contract), §1.3.1 (SpIcon), §1.5 (bridge impls), §5.2/5.3/5.4
- decisions/ADR-AUX-001-icon-port-for-set-icon.md
- REQ-AUX-001, REQ-AUX-018

TDD order strictly enforced (T-AUX-016 → T-AUX-017, etc.). The port surface is `setIcon(el, name): void` — do not introduce additional methods.

Verify gate exit: `npm run verify` green (T-AUX-034). Push; open PR titled `feat(aux): WS-2 IconPort + SpIcon primitive`. WS-2 complete = all 20 tasks done, verify green, PR opened.

Forbidden: touching primitives other than `<SpIcon>`; touching agent surfaces (`AgentHeader`, `MessageList`, etc.); modifying any non-icon-related port. The InjectionKey lives in `src/infrastructure/bridge/ports.ts` — do not invent a new module.
```

---

## WS-AUX-3 — Primitives library

```
You are specorator:dev. Branch: `feature/aux-ws-3-primitives` cut from origin/develop after WS-AUX-1 and WS-AUX-2 have merged.

Scope (tasks.md WS-AUX-3): T-AUX-100 through T-AUX-121.

Goal: ship five primitives under `src/ui/components/primitives/`: `SpButton`, `SpIconButton`, `SpToggleSwitch`, `SpDropdownPanel`, `HoverActions`. Each gets PageObject + Storybook + tests. `HoverActions` is the only ADR-AUX-003 primitive — children must stay in the a11y tree under all states.

Authoritative inputs:
- specs/agent-ux-parity/spec.md §1.3.12 (Sp*Button), §1.3.13 (SpToggleSwitch), §1.3.14 (SpDropdownPanel), §1.3.2 (HoverActions), §3.1 (hover state machine)
- decisions/ADR-AUX-003-hover-actions-primitive.md
- REQ-AUX-002, REQ-AUX-012, REQ-AUX-017, REQ-AUX-018

TDD order: never commit the implementation before its RED test (T-AUX-101/105/108/111/114/115/116 all precede their impls). Each primitive PageObject is `<Component>.po.ts` co-located with the `.test.ts` and queries by `data-testid` only.

CQ-AUX-04 (SpDropdownPanel cross-feature impact) is escalated — do not extend the primitive to Settings tab pickers in this WS. If the architect resolves CQ-AUX-04 mid-stream, route the change to a follow-up feature.

Verify gate exit: `npm run verify` green (T-AUX-121). Push; open PR titled `feat(aux): WS-3 primitives (SpButton, SpIconButton, SpToggleSwitch, SpDropdownPanel, HoverActions)`. WS-3 complete = all 22 tasks done, verify green, PR opened.

Forbidden: refactoring existing agent components to consume these primitives (that work belongs to WS-4/5/6/8). Do not migrate `ModeSelector`, `PermissionToggle`, etc. in this WS — those tasks live in WS-6.
```

---

## WS-AUX-4 — Header + tabs + welcome + compact boundary

```
You are specorator:dev. Branch: `feature/aux-ws-4-header-tabs-welcome` cut from origin/develop after WS-AUX-1 and WS-AUX-2 have merged. May run in parallel with WS-AUX-3.

Scope (tasks.md WS-AUX-4): T-AUX-200 through T-AUX-224.

Goal: collapse `AgentHeader` to a single 36px band, ship `ThreadTabBadge` with state-aware borders, ship `WelcomeGreeting` + `WelcomeSuggestionChip`, refresh `CompactBoundary` to be token-driven, and wire `ResizeObserver` on `AgentSidepanelRoot` to expose a `narrow` provide for sub-360px width.

Authoritative inputs:
- specs/agent-ux-parity/spec.md §1.3.5 (Welcome), §1.3.8 (ThreadTabBadge), §1.4 (existing component changes), §3.4 (tab badge state map), §6 (REQ-AUX-003/007/015/019 tests)
- REQ-AUX-003, REQ-AUX-007, REQ-AUX-015, REQ-AUX-019, REQ-AUX-016

TDD order: T-AUX-200/204/205/209/210/215/217/220 all precede their impls.

Verify gate exit: `npm run verify` green (T-AUX-224). Push; open PR titled `feat(aux): WS-4 header collapse + tab badges + welcome greeting`. WS-4 complete = all 25 tasks done, verify green, PR opened.

Forbidden: touching `MessageItem`, `MessageActions`, or nested-block components — those belong to WS-5. Do not touch `ChatInput` / `InputToolbar` (WS-6) or any approval / popover components (WS-8). The `HoverActions` primitive from WS-3 is allowed if WS-3 has merged; otherwise stub the empty-state surface and rebase.
```

---

## WS-AUX-5 — Messages + nested blocks + streaming cursor

```
You are specorator:dev. Branch: `feature/aux-ws-5-messages-nested-streaming` cut from origin/develop after WS-AUX-3 has merged.

Scope (tasks.md WS-AUX-5): T-AUX-225 through T-AUX-254.

Goal: make user vs assistant bubbles visually distinct (data-role + asymmetric corners + alignment), wire MessageActions through `HoverActions` + `SpIcon`, ship `NestedDetailFrame` and refactor `ThinkingBlock`/`ToolCallBlock`/`SubagentBlock` to consume it, and ship `StreamingCursor`.

Authoritative inputs:
- specs/agent-ux-parity/spec.md §1.3.6 (StreamingCursor), §1.3.7 (NestedDetailFrame), §1.4 (MessageItem / MessageActions changes), §3.2 (streaming state), §6 (REQ-AUX-002/005/008/010/013/014/016)
- decisions/ADR-AUX-003-hover-actions-primitive.md
- REQ-AUX-002, REQ-AUX-005, REQ-AUX-008, REQ-AUX-010, REQ-AUX-013, REQ-AUX-014, REQ-AUX-016

CQ-AUX-06 (Fork action in scope?) is escalated — if PM has not confirmed Fork by the time T-AUX-230 starts, ship without it and leave a TODO referencing CQ-AUX-06. Do not invent unilaterally.

TDD order strictly enforced; six RED tests precede impls. Co-located PageObjects required.

Verify gate exit: `npm run verify` green (T-AUX-254). Push; open PR titled `feat(aux): WS-5 message roles + nested blocks + streaming cursor`. WS-5 complete = all 30 tasks done, verify green, PR opened.

Forbidden: touching composer / InputToolbar (WS-6), status panel (WS-7), or approval card (WS-8). Do not introduce new ports.
```

---

## WS-AUX-6 — Composer + InputToolbar + ContextMeter

```
You are specorator:dev. Branch: `feature/aux-ws-6-composer-toolbar-meter` cut from origin/develop after WS-AUX-3 and WS-AUX-5 have merged.

Scope (tasks.md WS-AUX-6): T-AUX-255 through T-AUX-284.

Goal: stand up `contextUsageStore`, ship `ContextMeter` + `McpIndicator`, build `InputToolbar` with the REQ-AUX-004 normative order (model · mode · permission · thinking · mcp · context-meter · send), migrate `ModeSelector` / `PermissionToggle` / `ThinkingToggle` to `SpToggleSwitch`, migrate `ModelSelector` to `SpDropdownPanel`, refactor `ProviderBadge` to use the copy table, and rewire `ChatInput` to host `InputToolbar`.

Authoritative inputs:
- specs/agent-ux-parity/spec.md §1.2 (contextUsageStore), §1.3.3 (InputToolbar), §1.3.4 (ContextMeter), §1.6 (microcopy), §2.3 (capability fields), §6 (REQ-AUX-004/012/016)
- REQ-AUX-004, REQ-AUX-012, REQ-AUX-016

CQ-AUX-10 (↑ to edit last user message) routed here — guard the keypress to "textarea empty + no open picker" per T-AUX-279 DoD.

CQ-AUX-18 (AttachmentStrip placement) routed here — strip moves inside composer wrapper per T-AUX-279 DoD.

Verify gate exit: `npm run verify` green (T-AUX-284). Push; open PR titled `feat(aux): WS-6 composer toolbar + context meter`. WS-6 complete = all 30 tasks done, verify green, PR opened.

Forbidden: modifying `StatusPanel` (WS-7), approval card (WS-8), or nav sidebar (WS-9).
```

---

## WS-AUX-7 — Status panel + transport pill

```
You are specorator:dev. Branch: `feature/aux-ws-7-status-transport` cut from origin/develop after WS-AUX-6 has merged.

Scope (tasks.md WS-AUX-7): T-AUX-285 through T-AUX-299.

Goal: group `StatusPanel` visually with the composer (shared `.sp-composer-group` ancestor, `max-height: min(40vh, 320px)`, own scroll), surface the dormant `ChatDegradedState` via a new `TransportStatusPill`, and add the "↓ New messages" pill while streaming + scrolled-up.

Authoritative inputs:
- specs/agent-ux-parity/spec.md §1.3.10 (TransportStatusPill), §1.4 (StatusPanel + MessageList changes), §1.6 (transport microcopy), §6 (REQ-AUX-011/016)
- REQ-AUX-011, REQ-AUX-016

Verify gate exit: `npm run verify` green (T-AUX-299). Push; open PR titled `feat(aux): WS-7 status panel grouping + transport pill`. WS-7 complete = all 15 tasks done, verify green, PR opened.

Forbidden: changes to approval card (WS-8), nav sidebar (WS-9), composer/InputToolbar (WS-6 owns these).
```

---

## WS-AUX-8 — Approval card + help + slash/mention popovers

```
You are specorator:dev. Branch: `feature/aux-ws-8-approval-popovers` cut from origin/develop after WS-AUX-3 and WS-AUX-5 have merged. May run in parallel with WS-AUX-6 / WS-AUX-7.

Scope (tasks.md WS-AUX-8): T-AUX-300 through T-AUX-324.

Goal: ship `InlineApprovalCard` (+ `ApprovalTabBar`, `ApprovalItem`, `ApprovalReviewBody`) with single/multi select, refresh `HelpPopover` with search + arrow-key navigation + a11y announcements, migrate `SlashCommandPopover` to `SpDropdownPanel`, and ship `MentionPopover` mirroring slash behaviour.

Authoritative inputs:
- specs/agent-ux-parity/spec.md §1.3.9 (InlineApprovalCard), §1.3.15 (HelpPopover refresh), §1.6 (approval + help microcopy), §3.5 (approval lifecycle), §6 (REQ-AUX-020/021)
- REQ-AUX-012, REQ-AUX-020, REQ-AUX-021

CQ-AUX-09 (editableFields) deferred — keep `editableFields: []` per T-AUX-308 DoD until tool schemas land.

Verify gate exit: `npm run verify` green (T-AUX-324). Push; open PR titled `feat(aux): WS-8 approval card + help + slash/mention popovers`. WS-8 complete = all 25 tasks done, verify green, PR opened.

Forbidden: touching status panel (WS-7), nav sidebar (WS-9), or composer (WS-6). Do not introduce additional approval verdicts beyond `allow-once | allow-always | deny`.
```

---

## WS-AUX-9 — Nav-sidebar + history menu + RTL/lint guard

```
You are specorator:dev. Branch: `feature/aux-ws-9-nav-history-rtl-guard` cut from origin/develop after WS-AUX-3 has merged. May run in parallel with WS-AUX-5/6/7/8.

Scope (tasks.md WS-AUX-9): T-AUX-325 through T-AUX-344.

Goal: ship `FloatingNavSidebar` (+ `NavSidebarButton`), ship `ThreadHistoryMenu`, add the logical-property lint/grep guard plus the raw-Obsidian-var theme-token guard wired into `npm run verify`, and do the RTL + theme-token sweep across `src/ui/agent/**` + `src/ui/components/agent/**`.

Authoritative inputs:
- specs/agent-ux-parity/spec.md §1.3.11 (FloatingNavSidebar), §1.4 (ThreadHistoryMenu / history changes), §5.7 (lint guard tooling), §6 (REQ-AUX-009/010/016)
- REQ-AUX-009, REQ-AUX-010, REQ-AUX-016, NFR-AUX-006, NFR-AUX-010

CQ-AUX-16 (Stylelint guard) routed here — guard MUST be wired into `npm run verify` and MUST pass on the current sources after the sweep (T-AUX-337 + T-AUX-338).

Verify gate exit: `npm run verify` green including the new guards (T-AUX-344). Push; open PR titled `feat(aux): WS-9 floating nav + history menu + RTL/lint guard`. WS-9 complete = all 20 tasks done, verify green, PR opened.

Forbidden: changes outside §5's WS-9 file list. Do not loosen the lint guard's scope. If the guard flags existing violations in non-agent areas, file a follow-up task and keep the guard scoped to the agent paths for this WS.
```

---

## WS-AUX-10 — Storybook + parity screenshots + bundle size

```
You are specorator:qa with sre support. Branch: `feature/aux-ws-10-storybook-parity-bundle` cut from origin/develop after WS-AUX-4, 5, 6, 7, 8, and 9 have all merged.

Scope (tasks.md WS-AUX-10): T-AUX-345 through T-AUX-360.

Goal: enforce Storybook coverage on the §5 NEW components, run axe scan + manual keyboard walk + WCAG audit + reduced-motion review, capture WS-10 gzipped bundle delta (must be ≤ 5% vs baseline from T-AUX-014), regenerate `traceability.md`, close out resolved CQ-AUX-NN, draft release notes, and run the final verify gate.

Authoritative inputs:
- specs/agent-ux-parity/spec.md §5 (NEW component list — coverage check source), §6 (NFR test scenarios), §10 (CQ resolution table — see tasks.md §4)
- NFR-AUX-001 (≤ 5% bundle growth), NFR-AUX-007 (verify gate), NFR-AUX-008 (a11y), NFR-AUX-009 (Storybook coverage), NFR-AUX-012 (test coverage thresholds)

Bundle-size delta is a release blocker: if T-AUX-351 reports > 5%, do not open the WS-10 PR; raise to planner for re-prioritisation per spec §9 risk row.

Verify gate exit: `npm run verify` green; bundle delta within budget; traceability + release notes generated; PR titled `feat(aux): WS-10 storybook coverage + parity audit + bundle gate`. WS-10 complete = all 16 tasks done, verify green, PR opened. Merge of this PR unblocks Stage 9 review.

Forbidden: introducing new components or refactors. Any required code change discovered during audit becomes a follow-up task referencing the failing audit step; do not extend WS-10 scope.
```
