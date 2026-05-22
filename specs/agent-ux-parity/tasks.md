---
feature: agent-ux-parity
area: AUX
stage: tasks
status: draft
owner: planner
last_updated: 2026-05-22
total_tasks: 142
inputs:
  - specs/agent-ux-parity/spec.md
  - specs/agent-ux-parity/design.md
  - specs/agent-ux-parity/requirements.md
  - decisions/ADR-AUX-001-icon-port-for-set-icon.md
  - decisions/ADR-AUX-002-sp-design-token-css-layer.md
  - decisions/ADR-AUX-003-hover-actions-primitive.md
---

# Tasks — Agent Sidepanel UX Parity

TDD-ordered execution plan covering 9 workstreams. Every implementation task is preceded by a failing-test (RED) task that names the assertion it makes. Each workstream tip runs `npm run verify` and ships a PR against `develop`.

Slot encoding: `T-AUX-<NNN>` runs across workstreams (`001..099` reserved for ports + tokens; `100..199` primitives; `200..299` agent surfaces; `300..399` integration + verification).

---

## 1. Workstream summary

| WS | Name | Owner | Depends on | Task range | Objective |
|---|---|---|---|---|---|
| WS-AUX-1 | Tokens + animations layer | dev | — | T-AUX-001..014 | Land `tokens.css` + `animations.css` + provider data-attr plumbing (additive, no visual change). |
| WS-AUX-2 | IconPort + SpIcon | dev | WS-AUX-1 | T-AUX-015..034 | New narrow port; bridge impls; `<SpIcon>` primitive; composable + fakes wired through. |
| WS-AUX-3 | Primitives library | dev | WS-AUX-1, WS-AUX-2 | T-AUX-100..139 | `SpButton`, `SpIconButton`, `SpToggleSwitch`, `SpDropdownPanel`, `HoverActions`. |
| WS-AUX-4 | Header + tabs + welcome + compact boundary | dev | WS-AUX-1, WS-AUX-2 | T-AUX-200..224 | Collapse header band; `ThreadTabBadge`; `WelcomeGreeting`; `CompactBoundary` refresh. |
| WS-AUX-5 | Messages + nested blocks + streaming cursor | dev | WS-AUX-3 | T-AUX-225..254 | Bubble asymmetry, role attr, `MessageActions` rewire, `NestedDetailFrame`, `StreamingCursor`. |
| WS-AUX-6 | Composer + InputToolbar + ContextMeter | dev | WS-AUX-3, WS-AUX-5 | T-AUX-255..284 | `contextUsageStore`, `ContextMeter`, `McpIndicator`, `InputToolbar` order, `ChatInput` rewire. |
| WS-AUX-7 | Status panel + transport pill | dev | WS-AUX-6 | T-AUX-285..299 | Group status panel with composer; surface `TransportStatusPill`. |
| WS-AUX-8 | Approval card + help + slash/mention popovers | dev | WS-AUX-3, WS-AUX-5 | T-AUX-300..324 | `InlineApprovalCard` + sub-components; `HelpPopover` refresh; `MentionPopover`; `SlashCommandPopover` migration. |
| WS-AUX-9 | Nav-sidebar + history menu + RTL/lint guard | dev | WS-AUX-3 | T-AUX-325..344 | `FloatingNavSidebar`, `ThreadHistoryMenu`, logical-property lint guard, RTL sweep. |
| WS-AUX-10 | Storybook + parity screenshots + bundle size | qa, sre | WS-AUX-4..9 | T-AUX-345..360 | Storybook coverage gate, axe scan, baseline + delta bundle-size check, WCAG audit. |

---

## 2. Tasks per workstream

### WS-AUX-1 — Tokens + animations layer

- **T-AUX-001** — Confirm ADR-AUX-002 is in `Accepted` status and lists the full token enumeration
  - owner: dev
  - depends_on: []
  - REQ: NFR-AUX-006
  - kind: adr
  - DoD: `decisions/ADR-AUX-002-sp-design-token-css-layer.md` references spec §4.1–§4.7 token tables verbatim.

- **T-AUX-002** — RED: token-presence test for `tokens.css`
  - owner: qa
  - depends_on: [T-AUX-001]
  - REQ: REQ-AUX-006, REQ-AUX-009
  - kind: RED test
  - DoD: `tests/ui/styles/tokens.test.ts` mounts `.specorator-root` with `tokens.css`, asserts every token listed in spec §4 resolves to a non-empty `getPropertyValue`. Fails until file exists.

- **T-AUX-003** — Create `src/ui/styles/tokens.css` with §4.1 colour tokens
  - owner: dev
  - depends_on: [T-AUX-002]
  - REQ: REQ-AUX-009
  - kind: implementation
  - DoD: file declares all colour tokens on `.specorator-root`; defaults map to Obsidian vars verbatim.

- **T-AUX-004** — Add §4.2 brand + provider override blocks to `tokens.css`
  - owner: dev
  - depends_on: [T-AUX-003]
  - REQ: REQ-AUX-006
  - kind: implementation
  - DoD: claude/codex/opencode/cursor selectors land; `body.theme-light` overrides included; cursor placeholder `#6b7280` flagged with CQ-AUX-01 inline comment.

- **T-AUX-005** — Add §4.3 typography tokens (incl. `--sp-font-serif` Copernicus stack)
  - owner: dev
  - depends_on: [T-AUX-003]
  - REQ: REQ-AUX-007
  - kind: implementation
  - DoD: all font / size / weight / line-height tokens present.

- **T-AUX-006** — Add §4.4 spacing, §4.5 radii, §4.6 shadow/z/motion, §4.7 surfaces
  - owner: dev
  - depends_on: [T-AUX-003]
  - REQ: NFR-AUX-006
  - kind: implementation
  - DoD: tokens present; reduced-motion `@media` block collapses `--sp-duration-*` to `0s`.

- **T-AUX-007** — RED: keyframes-presence test for `animations.css`
  - owner: qa
  - depends_on: [T-AUX-001]
  - REQ: REQ-AUX-008, REQ-AUX-019
  - kind: RED test
  - DoD: `tests/ui/styles/animations.test.ts` asserts the stylesheet exports `thinking-pulse`, `streaming-cursor-blink`, `spin`, `mcp-glow`, `external-context-glow` keyframes (string-grep over imported content).

- **T-AUX-008** — Create `src/ui/styles/animations.css` with 5 named keyframes
  - owner: dev
  - depends_on: [T-AUX-007]
  - REQ: REQ-AUX-008, REQ-AUX-019
  - kind: implementation
  - DoD: all five keyframes defined; `spin` has explicit `prefers-reduced-motion` override (CQ-AUX-14).

- **T-AUX-009** — Wire `tokens.css` + `animations.css` into `src/ui/main.ts`
  - owner: dev
  - depends_on: [T-AUX-003, T-AUX-008]
  - REQ: REQ-AUX-009
  - kind: implementation
  - DoD: both files imported; `npm run build:web` succeeds.

- **T-AUX-010** — RED: `[data-provider]` attr plumbing test
  - owner: qa
  - depends_on: [T-AUX-001]
  - REQ: REQ-AUX-006
  - kind: RED test
  - DoD: `tests/ui/agent/AgentSidepanelRoot.test.ts` asserts `data-provider` attribute appears on `.specorator-root` once a provider is active and updates on swap without remount (root element ref preserved).

- **T-AUX-011** — Bind `[data-provider]` on `AgentSidepanelRoot.vue`
  - owner: dev
  - depends_on: [T-AUX-010]
  - REQ: REQ-AUX-006
  - kind: implementation
  - DoD: reactive binding from `chatProviderStore.providerId` getter; root element identity preserved across swaps.

- **T-AUX-012** — RED: provider swap recolours brand without remount
  - owner: qa
  - depends_on: [T-AUX-011]
  - REQ: REQ-AUX-006
  - kind: RED test
  - DoD: switch from `claude` to `codex`; `getComputedStyle(root).getPropertyValue('--sp-brand')` reads as `--sp-brand-codex` mapping; root.\_\_v_uid unchanged.

- **T-AUX-013** — Storybook: `Tokens` reference page
  - owner: dev
  - depends_on: [T-AUX-006]
  - REQ: REQ-AUX-017
  - kind: storybook
  - DoD: `src/ui/styles/__stories__/Tokens.stories.ts` shows all `--sp-*` tokens with values; serves as visual baseline.

- **T-AUX-014** — Capture baseline gzipped bundle size at WS-AUX-1 tip
  - owner: sre
  - depends_on: [T-AUX-009]
  - REQ: NFR-AUX-001
  - kind: verify
  - DoD: `npm run build && npm run build:web`; gzipped sizes of `main.js` + `styles.css` recorded in `specs/agent-ux-parity/bundle-baseline.json`.

---

### WS-AUX-2 — IconPort + SpIcon

- **T-AUX-015** — Confirm ADR-AUX-001 lists `setIcon(el, name): void` exactly as spec §1.1
  - owner: dev
  - depends_on: [T-AUX-001]
  - REQ: REQ-AUX-001
  - kind: adr
  - DoD: ADR is `Accepted`; signature + missing-icon contract match spec.

- **T-AUX-016** — RED: `IconPort` contract test
  - owner: qa
  - depends_on: [T-AUX-015]
  - REQ: REQ-AUX-001
  - kind: RED test
  - DoD: `tests/domain/ports/IconPort.contract.ts` asserts (a) does-not-throw on unknown name, (b) idempotent on repeat invocation, (c) writes svg child when name resolves; ran against MockBridge.

- **T-AUX-017** — Create `src/domain/ports/IconPort.ts`
  - owner: dev
  - depends_on: [T-AUX-016]
  - REQ: REQ-AUX-001
  - kind: implementation
  - DoD: interface emitted with TSDoc covering pre/post/errors from spec §1.1.

- **T-AUX-018** — Export `IconPort` from `src/domain/ports/index.ts`
  - owner: dev
  - depends_on: [T-AUX-017]
  - REQ: REQ-AUX-001
  - kind: implementation
  - DoD: barrel re-exports `IconPort` type; `npm run typecheck` green.

- **T-AUX-019** — RED: `ICON_PORT` InjectionKey resolves through `useIconPort`
  - owner: qa
  - depends_on: [T-AUX-016]
  - REQ: REQ-AUX-001
  - kind: RED test
  - DoD: `tests/ui/composables/useIconPort.test.ts` asserts `inject` returns the provided port; throws clear error when not provided.

- **T-AUX-020** — Add `ICON_PORT` to `src/infrastructure/bridge/ports.ts`
  - owner: dev
  - depends_on: [T-AUX-019]
  - REQ: REQ-AUX-001
  - kind: implementation
  - DoD: `InjectionKey<IconPort>` symbol exported.

- **T-AUX-021** — Implement `useIconPort` composable
  - owner: dev
  - depends_on: [T-AUX-020]
  - REQ: REQ-AUX-001
  - kind: implementation
  - DoD: composable injects + throws spec-mandated error message when missing.

- **T-AUX-022** — Implement `ObsidianBridge.setIcon` delegating to `obsidian.setIcon`
  - owner: dev
  - depends_on: [T-AUX-017]
  - REQ: REQ-AUX-001
  - kind: implementation
  - DoD: production bridge implements port; `npm run typecheck` green.

- **T-AUX-023** — Implement `MockBridge.setIcon` placeholder
  - owner: dev
  - depends_on: [T-AUX-017]
  - REQ: REQ-AUX-001
  - kind: implementation
  - DoD: writes `<svg data-icon=name aria-hidden="true"><title>{name}</title></svg>`; clears previous children first; passes T-AUX-016.

- **T-AUX-024** — Implement `LocalStorageBridge.setIcon` (mirror MockBridge)
  - owner: dev
  - depends_on: [T-AUX-023]
  - REQ: REQ-AUX-001
  - kind: implementation
  - DoD: parity with MockBridge; GitHub Pages demo renders placeholder.

- **T-AUX-025** — Extend `tests/__fakes__/fake-ports.ts` to expose `iconPort`
  - owner: dev
  - depends_on: [T-AUX-023]
  - REQ: REQ-AUX-001
  - kind: implementation
  - DoD: `fakeModulePorts()` returns `iconPort` from MockBridge; existing fake-ports tests still pass.

- **T-AUX-026** — Provide `ICON_PORT` in `src/ui/main.ts` (mock setup)
  - owner: dev
  - depends_on: [T-AUX-021, T-AUX-023]
  - REQ: REQ-AUX-001
  - kind: implementation
  - DoD: standalone app provides icon port; dev server renders icons.

- **T-AUX-027** — Provide `ICON_PORT` in `src/plugin/main.ts`
  - owner: dev
  - depends_on: [T-AUX-021, T-AUX-022]
  - REQ: REQ-AUX-001
  - kind: implementation
  - DoD: plugin view receives port; loads in Obsidian without console errors.

- **T-AUX-028** — RED: `<SpIcon>` calls `setIcon` on mount
  - owner: qa
  - depends_on: [T-AUX-025]
  - REQ: REQ-AUX-001
  - kind: RED test
  - DoD: spy on `iconPort.setIcon`; mount `<SpIcon name="send"/>`; assert called once with `(el, "send")`.

- **T-AUX-029** — RED: `<SpIcon>` missing-icon fallback writes `textContent`
  - owner: qa
  - depends_on: [T-AUX-025]
  - REQ: REQ-AUX-001, REQ-AUX-018
  - kind: RED test
  - DoD: configure MockBridge to leave `el` untouched for `"missing-x"`; mount `<SpIcon name="missing-x" ariaLabel="Missing"/>`; assert `el.textContent === "Missing"`.

- **T-AUX-030** — RED: `<SpIcon>` warns once per missing-icon name via LoggerPort
  - owner: qa
  - depends_on: [T-AUX-029]
  - REQ: REQ-AUX-018
  - kind: RED test
  - DoD: spy on `loggerPort.warn`; mount two `<SpIcon name="missing-x"/>` instances; assert warn called once total.

- **T-AUX-031** — Create `src/ui/components/primitives/SpIcon.vue`
  - owner: dev
  - depends_on: [T-AUX-028, T-AUX-029, T-AUX-030]
  - REQ: REQ-AUX-001, REQ-AUX-018
  - kind: implementation
  - DoD: props match §1.3.1; `aria-hidden` flips with `ariaLabel`; module-level `Set<string>` dedupes warnings; passes all three RED tests.

- **T-AUX-032** — `SpIcon.po.ts` PageObject
  - owner: dev
  - depends_on: [T-AUX-031]
  - REQ: REQ-AUX-001
  - kind: implementation
  - DoD: class-based PO with `iconEl()`, `iconName()`, `ariaLabel()` queried by `data-testid`.

- **T-AUX-033** — Storybook: `SpIcon.stories.ts`
  - owner: dev
  - depends_on: [T-AUX-031]
  - REQ: REQ-AUX-017
  - kind: storybook
  - DoD: stories: default, with label, missing-icon fallback, varying size.

- **T-AUX-034** — Verify gate at WS-AUX-2 tip
  - owner: dev
  - depends_on: [T-AUX-033]
  - REQ: NFR-AUX-007
  - kind: verify
  - DoD: `npm run verify` green; PR opened against `develop`.

---

### WS-AUX-3 — Primitives library

- **T-AUX-100** — Confirm ADR-AUX-003 (`HoverActions` primitive) is Accepted
  - owner: dev
  - depends_on: []
  - REQ: REQ-AUX-002
  - kind: adr
  - DoD: ADR-AUX-003 status `Accepted`; CSS contract matches spec §1.3.2.

- **T-AUX-101** — RED: `SpButton` variants render with correct token classes
  - owner: qa
  - depends_on: [T-AUX-034]
  - REQ: REQ-AUX-017
  - kind: RED test
  - DoD: `tests/ui/components/primitives/SpButton.test.ts` asserts `data-variant` attr per prop and `aria-busy` when `loading`.

- **T-AUX-102** — Implement `SpButton.vue`
  - owner: dev
  - depends_on: [T-AUX-101]
  - REQ: REQ-AUX-017
  - kind: implementation
  - DoD: matches §1.3.12 contract; emits `click`; uses `--sp-*` tokens only.

- **T-AUX-103** — `SpButton.po.ts`
  - owner: dev
  - depends_on: [T-AUX-102]
  - REQ: REQ-AUX-017
  - kind: implementation
  - DoD: PO with `variant()`, `isDisabled()`, `isLoading()`, `click()`.

- **T-AUX-104** — Storybook: `SpButton.stories.ts`
  - owner: dev
  - depends_on: [T-AUX-102]
  - REQ: REQ-AUX-017
  - kind: storybook
  - DoD: stories per variant + disabled + loading states.

- **T-AUX-105** — RED: `SpIconButton` requires `ariaLabel`
  - owner: qa
  - depends_on: [T-AUX-034]
  - REQ: REQ-AUX-018
  - kind: RED test
  - DoD: typecheck test asserts `ariaLabel: string` required prop; runtime test asserts rendered button has matching `aria-label`.

- **T-AUX-106** — Implement `SpIconButton.vue`
  - owner: dev
  - depends_on: [T-AUX-105]
  - REQ: REQ-AUX-001, REQ-AUX-018
  - kind: implementation
  - DoD: composes `SpIcon`; size prop wired; loading swaps in spinner icon.

- **T-AUX-107** — `SpIconButton.po.ts` + Storybook
  - owner: dev
  - depends_on: [T-AUX-106]
  - REQ: REQ-AUX-017
  - kind: storybook
  - DoD: PO + stories (default/loading/disabled/sizes).

- **T-AUX-108** — RED: `SpToggleSwitch` v-model contract
  - owner: qa
  - depends_on: [T-AUX-034]
  - REQ: REQ-AUX-017
  - kind: RED test
  - DoD: emits `update:modelValue` with toggled boolean; `aria-pressed` reflects state.

- **T-AUX-109** — Implement `SpToggleSwitch.vue`
  - owner: dev
  - depends_on: [T-AUX-108]
  - REQ: REQ-AUX-017
  - kind: implementation
  - DoD: matches §1.3.13; keyboard Space/Enter toggles; label visible inline.

- **T-AUX-110** — `SpToggleSwitch.po.ts` + Storybook
  - owner: dev
  - depends_on: [T-AUX-109]
  - REQ: REQ-AUX-017
  - kind: storybook
  - DoD: stories for on/off/disabled/long-label.

- **T-AUX-111** — RED: `SpDropdownPanel` opens/closes on prop + Esc + outside-click
  - owner: qa
  - depends_on: [T-AUX-034]
  - REQ: REQ-AUX-012
  - kind: RED test
  - DoD: asserts focus trap active; Escape fires `close`; outside-click fires `close`; backdrop-filter resolves to `blur(...)`.

- **T-AUX-112** — Implement `SpDropdownPanel.vue`
  - owner: dev
  - depends_on: [T-AUX-111]
  - REQ: REQ-AUX-012
  - kind: implementation
  - DoD: matches §1.3.14; backdrop-filter blur with solid fallback; teleport to body; respects `anchorMode`.

- **T-AUX-113** — `SpDropdownPanel.po.ts` + Storybook
  - owner: dev
  - depends_on: [T-AUX-112]
  - REQ: REQ-AUX-017
  - kind: storybook
  - DoD: stories: dropup, dropdown, with long content, narrow viewport.

- **T-AUX-114** — RED: `HoverActions` keeps children in a11y tree at all states
  - owner: qa
  - depends_on: [T-AUX-100]
  - REQ: REQ-AUX-002
  - kind: RED test
  - DoD: query slotted buttons under hidden + revealed; both states have non-null nodes with no `display: none`; assert opacity transitions.

- **T-AUX-115** — RED: `HoverActions` reduced-motion snaps without transition
  - owner: qa
  - depends_on: [T-AUX-100]
  - REQ: REQ-AUX-002
  - kind: RED test
  - DoD: simulate `prefers-reduced-motion: reduce`; assert computed `transition-duration` resolves to `0s`.

- **T-AUX-116** — RED: `HoverActions` coarse-pointer media forces opacity 1
  - owner: qa
  - depends_on: [T-AUX-100]
  - REQ: REQ-AUX-002
  - kind: RED test
  - DoD: simulate `pointer: coarse`; assert computed `opacity` is `1` with no hover.

- **T-AUX-117** — Implement `HoverActions.vue`
  - owner: dev
  - depends_on: [T-AUX-114, T-AUX-115, T-AUX-116]
  - REQ: REQ-AUX-002
  - kind: implementation
  - DoD: matches §1.3.2 CSS contract; `role="toolbar"`; `data-placement` reflects prop.

- **T-AUX-118** — `HoverActions.po.ts`
  - owner: dev
  - depends_on: [T-AUX-117]
  - REQ: REQ-AUX-002
  - kind: implementation
  - DoD: PO with `actionsContainer()`, `isVisible()`, slotted-children count.

- **T-AUX-119** — Storybook: `HoverActions.stories.ts`
  - owner: dev
  - depends_on: [T-AUX-117]
  - REQ: REQ-AUX-017
  - kind: storybook
  - DoD: stories for each placement, `alwaysVisible`, reduced-motion.

- **T-AUX-120** — JSDoc + lint guard for `.sp-hover-host` ancestor
  - owner: dev
  - depends_on: [T-AUX-117]
  - REQ: REQ-AUX-002
  - kind: implementation
  - DoD: HoverActions JSDoc references the `.sp-hover-host` requirement; dev-only `console.warn` if mounted without that ancestor.

- **T-AUX-121** — Verify gate at WS-AUX-3 tip
  - owner: dev
  - depends_on: [T-AUX-104, T-AUX-107, T-AUX-110, T-AUX-113, T-AUX-119, T-AUX-120]
  - REQ: NFR-AUX-007
  - kind: verify
  - DoD: `npm run verify` green; PR opened against `develop`.

---

### WS-AUX-4 — Header + tabs + welcome + compact boundary

- **T-AUX-200** — RED: `AgentHeader` collapses to single 36px band
  - owner: qa
  - depends_on: [T-AUX-034]
  - REQ: REQ-AUX-003
  - kind: RED test
  - DoD: mount `AgentSidepanelRoot`; assert `[data-testid="agent-header"]` direct children = single band (logo+title+actions); no `ProviderBadge` or `ModelSelector` descendants; computed `height` resolves to 36px.

- **T-AUX-201** — Modify `AgentHeader.vue` to collapse to 36px band
  - owner: dev
  - depends_on: [T-AUX-200]
  - REQ: REQ-AUX-003
  - kind: implementation
  - DoD: removes `ProviderBadge` + `ModelSelector` slots; uses `SpIconButton` for actions.

- **T-AUX-202** — Create `AgentHeaderTooltip.vue` wrapper
  - owner: dev
  - depends_on: [T-AUX-201]
  - REQ: REQ-AUX-016
  - kind: implementation
  - DoD: tooltip uses `title` attr + `aria-describedby`; reads from `agent.header.action.*.tooltip` keys.

- **T-AUX-203** — Storybook: `AgentHeader.stories.ts`
  - owner: dev
  - depends_on: [T-AUX-201]
  - REQ: REQ-AUX-017
  - kind: storybook
  - DoD: default, narrow-pane, long-title-truncated stories.

- **T-AUX-204** — RED: `ThreadTabBadge` border colour matches §3.4 mapping
  - owner: qa
  - depends_on: [T-AUX-034]
  - REQ: REQ-AUX-019
  - kind: RED test
  - DoD: mount per state; assert computed `border-color` resolves to mapped token.

- **T-AUX-205** — RED: `ThreadTabBadge` streaming applies `thinking-pulse` animation
  - owner: qa
  - depends_on: [T-AUX-204]
  - REQ: REQ-AUX-019
  - kind: RED test
  - DoD: under `state="streaming"`, computed `animation-name` includes `thinking-pulse`.

- **T-AUX-206** — Implement `ThreadTabBadge.vue`
  - owner: dev
  - depends_on: [T-AUX-204, T-AUX-205]
  - REQ: REQ-AUX-019
  - kind: implementation
  - DoD: matches §1.3.8; 24x24 fixed; data-state attr drives CSS.

- **T-AUX-207** — `ThreadTabBadge.po.ts` + Storybook
  - owner: dev
  - depends_on: [T-AUX-206]
  - REQ: REQ-AUX-017
  - kind: storybook
  - DoD: stories per state.

- **T-AUX-208** — Modify `ThreadTabStrip.vue` to render via `ThreadTabBadge`
  - owner: dev
  - depends_on: [T-AUX-206]
  - REQ: REQ-AUX-019
  - kind: implementation
  - DoD: each tab uses `ThreadTabBadge`; existing `rename` emit preserved.

- **T-AUX-209** — RED: `WelcomeGreeting` variant by hour
  - owner: qa
  - depends_on: [T-AUX-034]
  - REQ: REQ-AUX-007
  - kind: RED test
  - DoD: stub `Date`; assert greeting key resolves correctly across the four time bands (morning/afternoon/evening/night).

- **T-AUX-210** — RED: `WelcomeGreeting` uses Copernicus serif stack
  - owner: qa
  - depends_on: [T-AUX-209]
  - REQ: REQ-AUX-007
  - kind: RED test
  - DoD: computed `font-family` on greeting node includes `Copernicus`.

- **T-AUX-211** — Implement `WelcomeGreeting.vue`
  - owner: dev
  - depends_on: [T-AUX-209, T-AUX-210]
  - REQ: REQ-AUX-007
  - kind: implementation
  - DoD: matches §1.3.5; uses `--sp-font-serif`; emits `suggestion-pick`.

- **T-AUX-212** — Implement `WelcomeSuggestionChip.vue` sub-component
  - owner: dev
  - depends_on: [T-AUX-211]
  - REQ: REQ-AUX-007
  - kind: implementation
  - DoD: renders one chip; click bubbles up through `WelcomeGreeting`'s emit.

- **T-AUX-213** — `WelcomeGreeting.po.ts` + Storybook
  - owner: dev
  - depends_on: [T-AUX-211]
  - REQ: REQ-AUX-017
  - kind: storybook
  - DoD: stories per time-of-day; PO queries by `data-testid`.

- **T-AUX-214** — Add microcopy keys `welcome.greeting.*` + `welcome.suggestion.*`
  - owner: dev
  - depends_on: [T-AUX-211]
  - REQ: REQ-AUX-007, REQ-AUX-016
  - kind: implementation
  - DoD: keys added to `src/ui/i18n/locales/en.ts` matching spec §1.6.

- **T-AUX-215** — RED: empty `MessageList` mounts `WelcomeGreeting`, no dashed tile grid
  - owner: qa
  - depends_on: [T-AUX-211]
  - REQ: REQ-AUX-007
  - kind: RED test
  - DoD: mount with empty messages; assert `[data-testid="welcome-greeting"]` present and `[data-testid="empty-tile-grid"]` absent.

- **T-AUX-216** — Modify `MessageList.vue` for welcome empty state
  - owner: dev
  - depends_on: [T-AUX-215]
  - REQ: REQ-AUX-007
  - kind: implementation
  - DoD: replaces dashed tile grid with `WelcomeGreeting`.

- **T-AUX-217** — RED: `CompactBoundary` renders centred token-driven label + rules
  - owner: qa
  - depends_on: [T-AUX-034]
  - REQ: REQ-AUX-015
  - kind: RED test
  - DoD: assert label colour resolves to `var(--sp-compact)`; both side rules present (computed `border-top` on hr-like nodes).

- **T-AUX-218** — Modify `CompactBoundary.vue` for token-driven rule + chip
  - owner: dev
  - depends_on: [T-AUX-217]
  - REQ: REQ-AUX-015
  - kind: implementation
  - DoD: consumes `--sp-compact`; consumes `agent.compact.boundary.label` microcopy.

- **T-AUX-219** — Add `agent.compact.boundary.label` microcopy
  - owner: dev
  - depends_on: [T-AUX-218]
  - REQ: REQ-AUX-015, REQ-AUX-016
  - kind: implementation
  - DoD: locale entry added with `{time}` interpolation.

- **T-AUX-220** — RED: ResizeObserver exposes `narrow` for sub-360px width
  - owner: qa
  - depends_on: [T-AUX-201]
  - REQ: REQ-AUX-004
  - kind: RED test
  - DoD: resize root to 320px; assert injected `narrow` ref becomes `true`; resize to 400px; becomes `false`.

- **T-AUX-221** — Wire `ResizeObserver` + provide `narrow` in `AgentSidepanelRoot.vue`
  - owner: dev
  - depends_on: [T-AUX-220]
  - REQ: REQ-AUX-004
  - kind: implementation
  - DoD: observer attaches to `.specorator-root`; provides `narrow` ref via inject key.

- **T-AUX-222** — `AgentHeader.po.ts` + `ThreadTabStrip.po.ts`
  - owner: dev
  - depends_on: [T-AUX-201, T-AUX-208]
  - REQ: REQ-AUX-003, REQ-AUX-019
  - kind: implementation
  - DoD: POs query by `data-testid`; no CSS-class selectors.

- **T-AUX-223** — Storybook: `ThreadTabStrip.stories.ts`
  - owner: dev
  - depends_on: [T-AUX-208]
  - REQ: REQ-AUX-017
  - kind: storybook
  - DoD: stories for 1/3/10 tabs incl. overflow scroll.

- **T-AUX-224** — Verify gate at WS-AUX-4 tip
  - owner: dev
  - depends_on: [T-AUX-203, T-AUX-207, T-AUX-213, T-AUX-216, T-AUX-218, T-AUX-221, T-AUX-222, T-AUX-223]
  - REQ: NFR-AUX-007
  - kind: verify
  - DoD: `npm run verify` green; PR opened against `develop`.

---

### WS-AUX-5 — Messages + nested blocks + streaming cursor

- **T-AUX-225** — RED: `MessageItem` user role aligns end, assistant transparent
  - owner: qa
  - depends_on: [T-AUX-121]
  - REQ: REQ-AUX-005
  - kind: RED test
  - DoD: user message has `data-role="user"` and computed `align-self: flex-end`; assistant has `data-role="assistant"` with `background-color: transparent` (or none set).

- **T-AUX-226** — Modify `MessageItem.vue` to add `data-role` + asymmetric corners
  - owner: dev
  - depends_on: [T-AUX-225]
  - REQ: REQ-AUX-005
  - kind: implementation
  - DoD: role attr rendered; bubble radii use `--sp-radius-bubble-tail-*`.

- **T-AUX-227** — RED: `MessageItem` content sets `unicode-bidi: plaintext`
  - owner: qa
  - depends_on: [T-AUX-226]
  - REQ: REQ-AUX-010
  - kind: RED test
  - DoD: computed `unicode-bidi` on content node resolves to `plaintext`.

- **T-AUX-228** — Add `unicode-bidi: plaintext` + `dir="auto"` to MessageItem content
  - owner: dev
  - depends_on: [T-AUX-227]
  - REQ: REQ-AUX-010
  - kind: implementation
  - DoD: scoped style and template attribute added.

- **T-AUX-229** — RED: `MessageActions` hidden until hover/focus
  - owner: qa
  - depends_on: [T-AUX-117]
  - REQ: REQ-AUX-002
  - kind: RED test
  - DoD: mount MessageItem; assert actions opacity 0 at rest; pointerenter parent → opacity 1; focus inside child → opacity 1; blur/leave → 0.

- **T-AUX-230** — Wrap `MessageActions.vue` in `HoverActions` and migrate to `SpIcon`
  - owner: dev
  - depends_on: [T-AUX-229]
  - REQ: REQ-AUX-001, REQ-AUX-002
  - kind: implementation
  - DoD: parent gains `.sp-hover-host`; each action is an `SpIconButton`.

- **T-AUX-231** — RED: copy action toggles "Copied" label for 1.5s
  - owner: qa
  - depends_on: [T-AUX-230]
  - REQ: REQ-AUX-016
  - kind: RED test
  - DoD: fake timers; click copy; assert tooltip text becomes `Copied` for 1.5s then reverts.

- **T-AUX-232** — Implement "Copied" confirm swap in `MessageActions.vue`
  - owner: dev
  - depends_on: [T-AUX-231]
  - REQ: REQ-AUX-016
  - kind: implementation
  - DoD: uses `agent.message.action.copy.confirm` key; setTimeout cleared on unmount.

- **T-AUX-233** — Create `MessageActionIcon.vue` wrapper
  - owner: dev
  - depends_on: [T-AUX-230]
  - REQ: REQ-AUX-001, REQ-AUX-018
  - kind: implementation
  - DoD: composes `SpIconButton` + tooltip + aria; one place for per-action a11y.

- **T-AUX-234** — Add `agent.message.action.*` microcopy
  - owner: dev
  - depends_on: [T-AUX-230]
  - REQ: REQ-AUX-016
  - kind: implementation
  - DoD: keys for copy/edit/regenerate/fork/delete tooltips + `copy.confirm`.

- **T-AUX-235** — `MessageItem.po.ts` + `MessageActions.po.ts`
  - owner: dev
  - depends_on: [T-AUX-226, T-AUX-230]
  - REQ: REQ-AUX-005
  - kind: implementation
  - DoD: POs query by `data-testid`; expose `role()`, `actionVisible()`, `clickCopy()`.

- **T-AUX-236** — Storybook: `MessageItem.stories.ts`
  - owner: dev
  - depends_on: [T-AUX-230]
  - REQ: REQ-AUX-017
  - kind: storybook
  - DoD: stories: user-short, user-long-rtl, assistant-markdown, assistant-streaming.

- **T-AUX-237** — RED: `NestedDetailFrame` border-inline-start + indent
  - owner: qa
  - depends_on: [T-AUX-121]
  - REQ: REQ-AUX-013
  - kind: RED test
  - DoD: mount with each `status`; computed `border-inline-start` resolves to `2px solid var(--sp-border)`; identical `padding-inline-start` across all statuses.

- **T-AUX-238** — Implement `NestedDetailFrame.vue`
  - owner: dev
  - depends_on: [T-AUX-237]
  - REQ: REQ-AUX-013
  - kind: implementation
  - DoD: matches §1.3.7; `data-status` attr; default slot for body.

- **T-AUX-239** — `NestedDetailFrame.po.ts` + Storybook
  - owner: dev
  - depends_on: [T-AUX-238]
  - REQ: REQ-AUX-017
  - kind: storybook
  - DoD: stories per status; PO queries by data-testid.

- **T-AUX-240** — RED: `ThinkingBlock` renders inside NestedDetailFrame
  - owner: qa
  - depends_on: [T-AUX-238]
  - REQ: REQ-AUX-013
  - kind: RED test
  - DoD: mount; assert root is `NestedDetailFrame`; assert old border-indent CSS removed.

- **T-AUX-241** — Refactor `ThinkingBlock.vue` to wrap in `NestedDetailFrame`
  - owner: dev
  - depends_on: [T-AUX-240]
  - REQ: REQ-AUX-013
  - kind: refactor
  - DoD: removes own border-indent CSS; status prop wired.

- **T-AUX-242** — RED: `ToolCallBlock` renders inside NestedDetailFrame
  - owner: qa
  - depends_on: [T-AUX-238]
  - REQ: REQ-AUX-013
  - kind: RED test
  - DoD: parallel to T-AUX-240.

- **T-AUX-243** — Refactor `ToolCallBlock.vue` to wrap in `NestedDetailFrame`
  - owner: dev
  - depends_on: [T-AUX-242]
  - REQ: REQ-AUX-013
  - kind: refactor
  - DoD: removes own border CSS.

- **T-AUX-244** — RED: `SubagentBlock` renders inside NestedDetailFrame
  - owner: qa
  - depends_on: [T-AUX-238]
  - REQ: REQ-AUX-013
  - kind: RED test
  - DoD: parallel.

- **T-AUX-245** — Refactor `SubagentBlock.vue` to wrap in `NestedDetailFrame`
  - owner: dev
  - depends_on: [T-AUX-244]
  - REQ: REQ-AUX-013
  - kind: refactor
  - DoD: removes own border CSS.

- **T-AUX-246** — RED: `StreamingCursor` mounts only while streaming
  - owner: qa
  - depends_on: [T-AUX-008]
  - REQ: REQ-AUX-008
  - kind: RED test
  - DoD: set `messagesStore.status = 'streaming'`; assert `.sp-streaming-cursor` at tail of last assistant message; set to `idle`; assert removed; assert no `▍` glyph in transcript text.

- **T-AUX-247** — RED: `StreamingCursor` reduced-motion is static
  - owner: qa
  - depends_on: [T-AUX-246]
  - REQ: REQ-AUX-008
  - kind: RED test
  - DoD: simulate reduced-motion; computed `animation-name: none`.

- **T-AUX-248** — Implement `StreamingCursor.vue`
  - owner: dev
  - depends_on: [T-AUX-246, T-AUX-247]
  - REQ: REQ-AUX-008
  - kind: implementation
  - DoD: matches §1.3.6; uses `streaming-cursor-blink` keyframe from animations.css.

- **T-AUX-249** — Wire `StreamingCursor` into in-progress assistant bubble
  - owner: dev
  - depends_on: [T-AUX-248]
  - REQ: REQ-AUX-008
  - kind: implementation
  - DoD: mounted at tail of last assistant message when `messagesStore.status === 'streaming'`.

- **T-AUX-250** — Storybook: `StreamingCursor.stories.ts`
  - owner: dev
  - depends_on: [T-AUX-248]
  - REQ: REQ-AUX-017
  - kind: storybook
  - DoD: default + reduced-motion stories.

- **T-AUX-251** — RED: `MessageItem` user-role avatar absent for assistant
  - owner: qa
  - depends_on: [T-AUX-226]
  - REQ: REQ-AUX-014
  - kind: RED test
  - DoD: user MessageItem shows user avatar + no model name; assistant shows assistant avatar + model display name.

- **T-AUX-252** — RED: `showMessageTimestamps` toggles visibility
  - owner: qa
  - depends_on: [T-AUX-251]
  - REQ: REQ-AUX-014
  - kind: RED test
  - DoD: toggle `settingsStore.showMessageTimestamps`; assert timestamp `[data-testid="timestamp"]` visibility flips.

- **T-AUX-253** — Implement role-aware avatar + timestamp gating in `MessageItem.vue`
  - owner: dev
  - depends_on: [T-AUX-251, T-AUX-252]
  - REQ: REQ-AUX-014
  - kind: implementation
  - DoD: avatars + model name + conditional timestamp wired through stores.

- **T-AUX-254** — Verify gate at WS-AUX-5 tip
  - owner: dev
  - depends_on: [T-AUX-236, T-AUX-239, T-AUX-241, T-AUX-243, T-AUX-245, T-AUX-250, T-AUX-253]
  - REQ: NFR-AUX-007
  - kind: verify
  - DoD: `npm run verify` green; PR opened against `develop`.

---

### WS-AUX-6 — Composer + InputToolbar + ContextMeter

- **T-AUX-255** — RED: `contextUsageStore` records + resets tokens
  - owner: qa
  - depends_on: [T-AUX-121]
  - REQ: REQ-AUX-004
  - kind: RED test
  - DoD: `tests/ui/stores/contextUsageStore.test.ts` asserts `recordTokens(100)` accumulates, `reset()` zeroes, `setCap` invalidates on provider/model change.

- **T-AUX-256** — RED: `usageFraction` / `isWarning` getters
  - owner: qa
  - depends_on: [T-AUX-255]
  - REQ: REQ-AUX-004
  - kind: RED test
  - DoD: assert `null` when cap missing; `0.8` triggers `isWarning: true`.

- **T-AUX-257** — Implement `contextUsageStore.ts`
  - owner: dev
  - depends_on: [T-AUX-255, T-AUX-256]
  - REQ: REQ-AUX-004
  - kind: implementation
  - DoD: matches §1.2 contract; reset hooked to `/clear` action.

- **T-AUX-258** — Wire streaming reducer to call `recordTokens(delta)`
  - owner: dev
  - depends_on: [T-AUX-257]
  - REQ: REQ-AUX-004
  - kind: implementation
  - DoD: existing usage-reporting path emits to store; existing tests still green.

- **T-AUX-259** — Set cap from `ProviderRegistry.getCapabilities().contextWindow`
  - owner: dev
  - depends_on: [T-AUX-257]
  - REQ: REQ-AUX-004
  - kind: implementation
  - DoD: `setCap` invoked on active-model change; `null` when capability missing.

- **T-AUX-260** — RED: `ContextMeter` SVG donut binds to `usageFraction`
  - owner: qa
  - depends_on: [T-AUX-257]
  - REQ: REQ-AUX-004
  - kind: RED test
  - DoD: stub store with `usageFraction=0.5`; assert `stroke-dashoffset` matches calculation; `stroke` resolves to `--sp-brand`.

- **T-AUX-261** — RED: `ContextMeter` warning state transitions stroke colour
  - owner: qa
  - depends_on: [T-AUX-260]
  - REQ: REQ-AUX-004
  - kind: RED test
  - DoD: `isWarning=true`; computed stroke resolves to `var(--sp-warning)`.

- **T-AUX-262** — Implement `ContextMeter.vue`
  - owner: dev
  - depends_on: [T-AUX-260, T-AUX-261]
  - REQ: REQ-AUX-004
  - kind: implementation
  - DoD: matches §1.3.4; tooltip uses `composer.contextMeter.tooltip` interpolation.

- **T-AUX-263** — `ContextMeter.po.ts` + Storybook
  - owner: dev
  - depends_on: [T-AUX-262]
  - REQ: REQ-AUX-017
  - kind: storybook
  - DoD: stories: 0/25/50/80/95% + unknown-cap.

- **T-AUX-264** — RED: `McpIndicator` glows when MCP active
  - owner: qa
  - depends_on: [T-AUX-008]
  - REQ: REQ-AUX-004
  - kind: RED test
  - DoD: store mcp-active true; assert `animation-name: mcp-glow`; inactive → none.

- **T-AUX-265** — Implement `McpIndicator.vue`
  - owner: dev
  - depends_on: [T-AUX-264]
  - REQ: REQ-AUX-004
  - kind: implementation
  - DoD: uses `mcp-glow` keyframe; tooltip from `composer.mcp.label`.

- **T-AUX-266** — Storybook: `McpIndicator.stories.ts`
  - owner: dev
  - depends_on: [T-AUX-265]
  - REQ: REQ-AUX-017
  - kind: storybook
  - DoD: active + inactive stories.

- **T-AUX-267** — RED: `InputToolbar` source order matches REQ-AUX-004
  - owner: qa
  - depends_on: [T-AUX-262, T-AUX-265]
  - REQ: REQ-AUX-004
  - kind: RED test
  - DoD: query `[data-testid]`s in order; assert sequence `model, mode, permission, thinking, mcp, context-meter, send`.

- **T-AUX-268** — RED: `InputToolbar` send/stop swap on streaming
  - owner: qa
  - depends_on: [T-AUX-267]
  - REQ: REQ-AUX-004
  - kind: RED test
  - DoD: `messagesStore.status='streaming'` → trailing button icon `square`, emits `stop`; idle → icon `send`, emits `send`.

- **T-AUX-269** — RED: `InputToolbar` narrow-pane wraps to two rows
  - owner: qa
  - depends_on: [T-AUX-267]
  - REQ: REQ-AUX-004
  - kind: RED test
  - DoD: with injected `narrow=true`; assert `flex-wrap` resolves to wrap and second row contains toggles + meter.

- **T-AUX-270** — Implement `InputToolbar.vue`
  - owner: dev
  - depends_on: [T-AUX-267, T-AUX-268, T-AUX-269]
  - REQ: REQ-AUX-004
  - kind: implementation
  - DoD: matches §1.3.3; composes selectors and toggles in order.

- **T-AUX-271** — Migrate `ModeSelector.vue` to `SpToggleSwitch`
  - owner: dev
  - depends_on: [T-AUX-109]
  - REQ: REQ-AUX-004
  - kind: refactor
  - DoD: existing tests still green; adopts toggle primitive.

- **T-AUX-272** — Migrate `PermissionToggle.vue` to `SpToggleSwitch`
  - owner: dev
  - depends_on: [T-AUX-109]
  - REQ: REQ-AUX-004
  - kind: refactor
  - DoD: parallel migration.

- **T-AUX-273** — Migrate `ThinkingToggle.vue` to `SpToggleSwitch`
  - owner: dev
  - depends_on: [T-AUX-109]
  - REQ: REQ-AUX-004
  - kind: refactor
  - DoD: parallel migration.

- **T-AUX-274** — Migrate `ModelSelector.vue` dropdown to `SpDropdownPanel`
  - owner: dev
  - depends_on: [T-AUX-112]
  - REQ: REQ-AUX-012
  - kind: refactor
  - DoD: dropdown renders via primitive; Esc + outside-click close behaviours preserved.

- **T-AUX-275** — RED: `ProviderBadge` copy-table resolution + fallback
  - owner: qa
  - depends_on: [T-AUX-121]
  - REQ: REQ-AUX-016
  - kind: RED test
  - DoD: `provider.id="claude/cli"` → text `Claude · CLI`; `provider.id="unknown-thing"` → `Unknown · Thing` title-case fallback.

- **T-AUX-276** — Refactor `ProviderBadge.vue` to use copy table
  - owner: dev
  - depends_on: [T-AUX-275]
  - REQ: REQ-AUX-016
  - kind: refactor
  - DoD: reads `agent.provider.label/mode/combined`; fallback humanisation function colocated.

- **T-AUX-277** — Add `agent.provider.*` + `agent.composer.*` microcopy
  - owner: dev
  - depends_on: [T-AUX-276]
  - REQ: REQ-AUX-016
  - kind: implementation
  - DoD: all keys from spec §1.6 present in en.ts + locale stubs.

- **T-AUX-278** — RED: `ChatInput` mounts `InputToolbar` (single row)
  - owner: qa
  - depends_on: [T-AUX-270]
  - REQ: REQ-AUX-004
  - kind: RED test
  - DoD: mount `ChatInput`; assert one `InputToolbar` present; assert legacy send-only row absent.

- **T-AUX-279** — Modify `ChatInput.vue` to host `InputToolbar`
  - owner: dev
  - depends_on: [T-AUX-278]
  - REQ: REQ-AUX-004
  - kind: implementation
  - DoD: send/stop/attach wired to existing handlers; AttachmentStrip placement per CQ-AUX-18 (inside wrapper).

- **T-AUX-280** — `InputToolbar.po.ts` + Storybook
  - owner: dev
  - depends_on: [T-AUX-270]
  - REQ: REQ-AUX-017
  - kind: storybook
  - DoD: stories: idle, streaming, narrow-pane.

- **T-AUX-281** — `ChatInput.po.ts` updates
  - owner: dev
  - depends_on: [T-AUX-279]
  - REQ: REQ-AUX-004
  - kind: implementation
  - DoD: PO queries `InputToolbar` testids; legacy selectors removed.

- **T-AUX-282** — `ProviderBadge.po.ts` + Storybook
  - owner: dev
  - depends_on: [T-AUX-276]
  - REQ: REQ-AUX-017
  - kind: storybook
  - DoD: stories per provider + unknown fallback.

- **T-AUX-283** — Storybook: `ChatInput.stories.ts`
  - owner: dev
  - depends_on: [T-AUX-279]
  - REQ: REQ-AUX-017
  - kind: storybook
  - DoD: stories: empty, with attachments, streaming.

- **T-AUX-284** — Verify gate at WS-AUX-6 tip
  - owner: dev
  - depends_on: [T-AUX-263, T-AUX-266, T-AUX-280, T-AUX-281, T-AUX-282, T-AUX-283]
  - REQ: NFR-AUX-007
  - kind: verify
  - DoD: `npm run verify` green; PR opened against `develop`.

---

### WS-AUX-7 — Status panel + transport pill

- **T-AUX-285** — RED: `StatusPanel` shares bordered ancestor with `ChatInput`
  - owner: qa
  - depends_on: [T-AUX-284]
  - REQ: REQ-AUX-011
  - kind: RED test
  - DoD: mount composite; assert both `.closest('.sp-composer-group')` returns same node.

- **T-AUX-286** — RED: `StatusPanel` max-height resolves to `min(40vh, 320px)`
  - owner: qa
  - depends_on: [T-AUX-285]
  - REQ: REQ-AUX-011
  - kind: RED test
  - DoD: computed `max-height` parses to `min(40vh, 320px)` (string or equivalent px under jsdom viewport).

- **T-AUX-287** — Modify `StatusPanel.vue` to group with composer
  - owner: dev
  - depends_on: [T-AUX-285, T-AUX-286]
  - REQ: REQ-AUX-011
  - kind: implementation
  - DoD: wraps both in `.sp-composer-group`; panel owns its own scroll.

- **T-AUX-288** — Extract `StatusTodoItem.vue` for Storybook coverage
  - owner: dev
  - depends_on: [T-AUX-287]
  - REQ: REQ-AUX-017
  - kind: implementation
  - DoD: pure presentational; consumes status item DTO.

- **T-AUX-289** — RED: `TransportStatusPill` renders per-kind microcopy
  - owner: qa
  - depends_on: [T-AUX-121]
  - REQ: REQ-AUX-016
  - kind: RED test
  - DoD: mount with each `kind`; assert text matches `agent.transport.{connecting|degraded|offline}` with `{provider}` interpolation.

- **T-AUX-290** — RED: `TransportStatusPill` emits `retry` on action click
  - owner: qa
  - depends_on: [T-AUX-289]
  - REQ: REQ-AUX-016
  - kind: RED test
  - DoD: click retry button; assert `retry` event.

- **T-AUX-291** — Implement `TransportStatusPill.vue`
  - owner: dev
  - depends_on: [T-AUX-289, T-AUX-290]
  - REQ: REQ-AUX-016
  - kind: implementation
  - DoD: matches §1.3.10; pill placed at top of scroll region.

- **T-AUX-292** — `TransportStatusPill.po.ts` + Storybook
  - owner: dev
  - depends_on: [T-AUX-291]
  - REQ: REQ-AUX-017
  - kind: storybook
  - DoD: stories per kind.

- **T-AUX-293** — Surface `TransportStatusPill` in `MessageList.vue`
  - owner: dev
  - depends_on: [T-AUX-291]
  - REQ: REQ-AUX-016
  - kind: implementation
  - DoD: reads dormant `ChatDegradedState`; pill displayed when state non-idle.

- **T-AUX-294** — RED: "↓ New messages" pill appears when streaming + scrolled-up
  - owner: qa
  - depends_on: [T-AUX-293]
  - REQ: REQ-AUX-016
  - kind: RED test
  - DoD: scroll to non-bottom + streaming; assert pill visible; click → scroll-to-bottom; pill hides.

- **T-AUX-295** — Implement "↓ New messages" pill in `MessageList.vue`
  - owner: dev
  - depends_on: [T-AUX-294]
  - REQ: REQ-AUX-016
  - kind: implementation
  - DoD: floats at bottom of scroll region; emits scroll command on click.

- **T-AUX-296** — Add `agent.transport.*` microcopy
  - owner: dev
  - depends_on: [T-AUX-291]
  - REQ: REQ-AUX-016
  - kind: implementation
  - DoD: keys present in en.ts.

- **T-AUX-297** — Storybook: `StatusPanel.stories.ts` + `StatusTodoItem.stories.ts`
  - owner: dev
  - depends_on: [T-AUX-287, T-AUX-288]
  - REQ: REQ-AUX-017
  - kind: storybook
  - DoD: stories: empty, with-todos, scrolling, narrow.

- **T-AUX-298** — `StatusPanel.po.ts`
  - owner: dev
  - depends_on: [T-AUX-287]
  - REQ: REQ-AUX-011
  - kind: implementation
  - DoD: PO queries by data-testid.

- **T-AUX-299** — Verify gate at WS-AUX-7 tip
  - owner: dev
  - depends_on: [T-AUX-292, T-AUX-295, T-AUX-296, T-AUX-297, T-AUX-298]
  - REQ: NFR-AUX-007
  - kind: verify
  - DoD: `npm run verify` green; PR opened against `develop`.

---

### WS-AUX-8 — Approval card + help + slash/mention popovers

- **T-AUX-300** — RED: `InlineApprovalCard` renders Question/Review tabs
  - owner: qa
  - depends_on: [T-AUX-121, T-AUX-254]
  - REQ: REQ-AUX-021
  - kind: RED test
  - DoD: mount; assert both tab labels present from `agent.approval.tab.*`.

- **T-AUX-301** — RED: single-select decision payload
  - owner: qa
  - depends_on: [T-AUX-300]
  - REQ: REQ-AUX-021
  - kind: RED test
  - DoD: click item then Allow once; assert `decision` event `{verdict:'allow-once', selectedItemIds:['…']}`.

- **T-AUX-302** — RED: multi-select decision payload
  - owner: qa
  - depends_on: [T-AUX-300]
  - REQ: REQ-AUX-021
  - kind: RED test
  - DoD: `selectMode='multi'`; toggle two items; allow always; assert payload contains both ids; verdict `allow-always`.

- **T-AUX-303** — RED: deny emits `deny` verdict
  - owner: qa
  - depends_on: [T-AUX-300]
  - REQ: REQ-AUX-021
  - kind: RED test
  - DoD: click Deny; assert `verdict:'deny'`.

- **T-AUX-304** — RED: item prefix glyphs (`▌` single / `[ ]/[✓]` multi)
  - owner: qa
  - depends_on: [T-AUX-300]
  - REQ: REQ-AUX-021
  - kind: RED test
  - DoD: assert glyphs rendered in items per `selectMode`.

- **T-AUX-305** — RED: Enter submits, Esc denies (shortcut hint)
  - owner: qa
  - depends_on: [T-AUX-300]
  - REQ: REQ-AUX-021
  - kind: RED test
  - DoD: keyboard events fire decision payloads accordingly.

- **T-AUX-306** — Implement `InlineApprovalCard.vue`
  - owner: dev
  - depends_on: [T-AUX-301, T-AUX-302, T-AUX-303, T-AUX-304, T-AUX-305]
  - REQ: REQ-AUX-021
  - kind: implementation
  - DoD: matches §1.3.9; lifecycle per §3.5; uses microcopy.

- **T-AUX-307** — Implement `ApprovalTabBar.vue`
  - owner: dev
  - depends_on: [T-AUX-306]
  - REQ: REQ-AUX-021
  - kind: implementation
  - DoD: tabbed nav with `role="tablist"`; arrow-key navigation.

- **T-AUX-308** — Implement `ApprovalItem.vue`
  - owner: dev
  - depends_on: [T-AUX-306]
  - REQ: REQ-AUX-021
  - kind: implementation
  - DoD: single/multi prefix; selectable; `editableFields` left empty (CQ-AUX-09).

- **T-AUX-309** — Implement `ApprovalReviewBody.vue`
  - owner: dev
  - depends_on: [T-AUX-306]
  - REQ: REQ-AUX-021
  - kind: implementation
  - DoD: review-tab body slot; matches design B layout.

- **T-AUX-310** — Add `agent.approval.*` microcopy
  - owner: dev
  - depends_on: [T-AUX-306]
  - REQ: REQ-AUX-016
  - kind: implementation
  - DoD: title, tab labels, actions, hint keys present.

- **T-AUX-311** — `InlineApprovalCard.po.ts` + Storybook
  - owner: dev
  - depends_on: [T-AUX-306]
  - REQ: REQ-AUX-017
  - kind: storybook
  - DoD: stories: single-select, multi-select, with-review, decided-collapsed.

- **T-AUX-312** — RED: `HelpPopover` search filters items
  - owner: qa
  - depends_on: [T-AUX-121]
  - REQ: REQ-AUX-020
  - kind: RED test
  - DoD: type in search input; assert visible items reduce to matches.

- **T-AUX-313** — RED: `HelpPopover` arrow-keys + Enter pick
  - owner: qa
  - depends_on: [T-AUX-312]
  - REQ: REQ-AUX-020
  - kind: RED test
  - DoD: ArrowDown twice + Enter; assert `pick` event with the third command id; Esc emits `close`.

- **T-AUX-314** — RED: selection announced via `useA11yAnnouncer`
  - owner: qa
  - depends_on: [T-AUX-312]
  - REQ: REQ-AUX-018, REQ-AUX-020
  - kind: RED test
  - DoD: spy on announcer; assert called with current selection label on each arrow key.

- **T-AUX-315** — Refresh `HelpPopover.vue` with search + arrow nav
  - owner: dev
  - depends_on: [T-AUX-312, T-AUX-313, T-AUX-314]
  - REQ: REQ-AUX-020
  - kind: implementation
  - DoD: search input + filter + roving focus; renders inside `SpDropdownPanel`.

- **T-AUX-316** — `HelpPopover.po.ts` + Storybook
  - owner: dev
  - depends_on: [T-AUX-315]
  - REQ: REQ-AUX-017
  - kind: storybook
  - DoD: stories: open, with-search-query, empty results.

- **T-AUX-317** — Migrate `SlashCommandPopover.vue` to `SpDropdownPanel`
  - owner: dev
  - depends_on: [T-AUX-112]
  - REQ: REQ-AUX-012
  - kind: refactor
  - DoD: dropup behaviour preserved; tests still green.

- **T-AUX-318** — RED: `MentionPopover` mirrors slash dropdown behaviour
  - owner: qa
  - depends_on: [T-AUX-317]
  - REQ: REQ-AUX-020
  - kind: RED test
  - DoD: open via `@`; assert search + arrow nav + pick event; Esc close.

- **T-AUX-319** — Implement `MentionPopover.vue`
  - owner: dev
  - depends_on: [T-AUX-318]
  - REQ: REQ-AUX-020
  - kind: implementation
  - DoD: file/thread mention search; renders inside `SpDropdownPanel`.

- **T-AUX-320** — `MentionPopover.po.ts` + Storybook
  - owner: dev
  - depends_on: [T-AUX-319]
  - REQ: REQ-AUX-017
  - kind: storybook
  - DoD: stories: open empty, with results, empty results.

- **T-AUX-321** — `SlashCommandPopover.po.ts` updates
  - owner: dev
  - depends_on: [T-AUX-317]
  - REQ: REQ-AUX-012
  - kind: implementation
  - DoD: PO queries the `SpDropdownPanel` panel via data-testid.

- **T-AUX-322** — Wire `InlineApprovalCard` into `messagesStore` lifecycle
  - owner: dev
  - depends_on: [T-AUX-306]
  - REQ: REQ-AUX-021
  - kind: implementation
  - DoD: at most one card at a time; queued approvals appear collapsed; decision dispatches existing approval action.

- **T-AUX-323** — Storybook: `SlashCommandPopover.stories.ts`
  - owner: dev
  - depends_on: [T-AUX-317]
  - REQ: REQ-AUX-017
  - kind: storybook
  - DoD: open + filtered stories.

- **T-AUX-324** — Verify gate at WS-AUX-8 tip
  - owner: dev
  - depends_on: [T-AUX-311, T-AUX-316, T-AUX-320, T-AUX-321, T-AUX-322, T-AUX-323]
  - REQ: NFR-AUX-007
  - kind: verify
  - DoD: `npm run verify` green; PR opened against `develop`.

---

### WS-AUX-9 — Nav-sidebar + history menu + RTL/lint guard

- **T-AUX-325** — RED: `FloatingNavSidebar` emits scroll/regen/new-thread
  - owner: qa
  - depends_on: [T-AUX-121]
  - REQ: REQ-AUX-016
  - kind: RED test
  - DoD: mount; click each button; assert corresponding events fire.

- **T-AUX-326** — RED: `FloatingNavSidebar` hides under narrow-pane
  - owner: qa
  - depends_on: [T-AUX-221]
  - REQ: REQ-AUX-004
  - kind: RED test
  - DoD: with injected `narrow=true`; assert sidebar not rendered (or `visible=false`).

- **T-AUX-327** — Implement `FloatingNavSidebar.vue`
  - owner: dev
  - depends_on: [T-AUX-325, T-AUX-326]
  - REQ: REQ-AUX-016
  - kind: implementation
  - DoD: matches §1.3.11; right-edge floating column; ResizeObserver-controlled visibility.

- **T-AUX-328** — Implement `NavSidebarButton.vue` sub-component
  - owner: dev
  - depends_on: [T-AUX-327]
  - REQ: REQ-AUX-016
  - kind: implementation
  - DoD: circular `SpIconButton` variant; passes ariaLabel through.

- **T-AUX-329** — Mount `FloatingNavSidebar` in `AgentSidepanelRoot.vue`
  - owner: dev
  - depends_on: [T-AUX-327]
  - REQ: REQ-AUX-016
  - kind: implementation
  - DoD: wiring hooks scroll + regen + new-thread to existing store actions.

- **T-AUX-330** — `FloatingNavSidebar.po.ts` + Storybook
  - owner: dev
  - depends_on: [T-AUX-327]
  - REQ: REQ-AUX-017
  - kind: storybook
  - DoD: stories: wide/visible, narrow/hidden, action click states.

- **T-AUX-331** — RED: `ThreadHistoryMenu` opens via header history button
  - owner: qa
  - depends_on: [T-AUX-201, T-AUX-112]
  - REQ: REQ-AUX-016
  - kind: RED test
  - DoD: click history `SpIconButton`; assert `ThreadHistoryMenu` open; Esc closes.

- **T-AUX-332** — RED: history rows reveal rename + delete on hover
  - owner: qa
  - depends_on: [T-AUX-117]
  - REQ: REQ-AUX-002
  - kind: RED test
  - DoD: each row wraps in `HoverActions`; rename + delete icons reveal on hover.

- **T-AUX-333** — Implement `ThreadHistoryMenu.vue`
  - owner: dev
  - depends_on: [T-AUX-331, T-AUX-332]
  - REQ: REQ-AUX-016
  - kind: implementation
  - DoD: list inside `SpDropdownPanel`; uses `agent.history.*` microcopy.

- **T-AUX-334** — Add `agent.history.*` microcopy
  - owner: dev
  - depends_on: [T-AUX-333]
  - REQ: REQ-AUX-016
  - kind: implementation
  - DoD: sectionTitle, empty, rename/delete tooltips, confirmDelete keys.

- **T-AUX-335** — `ThreadHistoryMenu.po.ts` + Storybook
  - owner: dev
  - depends_on: [T-AUX-333]
  - REQ: REQ-AUX-017
  - kind: storybook
  - DoD: stories: empty, with-threads, scrolling.

- **T-AUX-336** — RED: logical-property grep guard fails on physical properties
  - owner: qa
  - depends_on: [T-AUX-121]
  - REQ: REQ-AUX-010, NFR-AUX-010
  - kind: RED test
  - DoD: CI grep test under `src/ui/agent/**` + `src/ui/components/agent/**` flags any `padding-left|padding-right|margin-left|margin-right|left:|right:|text-align:\s*(left|right)|border-(top|bottom)-(left|right)-radius` outside an explicit allow-list comment.

- **T-AUX-337** — Add Stylelint config / grep guard in `eslint.config.js` (or scripts)
  - owner: dev
  - depends_on: [T-AUX-336]
  - REQ: REQ-AUX-010, NFR-AUX-010
  - kind: implementation
  - DoD: guard wired into `npm run verify`; passing on current sources after sweep.

- **T-AUX-338** — RTL sweep: convert remaining physical properties in scoped styles
  - owner: dev
  - depends_on: [T-AUX-337]
  - REQ: REQ-AUX-010
  - kind: refactor
  - DoD: zero physical-property matches under guarded paths.

- **T-AUX-339** — RED: theme-token grep guard for `--text-`/`--background-`/`--interactive-`
  - owner: qa
  - depends_on: [T-AUX-121]
  - REQ: REQ-AUX-009
  - kind: RED test
  - DoD: grep test asserts no occurrences of those Obsidian raw vars in scoped agent styles.

- **T-AUX-340** — Theme-token sweep: replace raw Obsidian vars with `--sp-*` tokens
  - owner: dev
  - depends_on: [T-AUX-339]
  - REQ: REQ-AUX-009
  - kind: refactor
  - DoD: zero raw-Obsidian-var matches under guarded paths.

- **T-AUX-341** — Storybook: RTL/forced-colors decorators
  - owner: dev
  - depends_on: [T-AUX-338]
  - REQ: REQ-AUX-018
  - kind: storybook
  - DoD: global toolbar in Storybook flips `dir="rtl"` + `forced-colors: active` for visual review.

- **T-AUX-342** — Documentation: `.sp-hover-host` + token-layer notes in CLAUDE.md / contributor docs
  - owner: dev
  - depends_on: [T-AUX-340]
  - REQ: NFR-AUX-006, NFR-AUX-010
  - kind: docs
  - DoD: contributor doc references ADR-AUX-002 + ADR-AUX-003; lint guard documented.

- **T-AUX-343** — `ThreadHistoryMenu` wired into header history button
  - owner: dev
  - depends_on: [T-AUX-333]
  - REQ: REQ-AUX-016
  - kind: implementation
  - DoD: header history `SpIconButton` opens menu via dropup.

- **T-AUX-344** — Verify gate at WS-AUX-9 tip
  - owner: dev
  - depends_on: [T-AUX-330, T-AUX-335, T-AUX-337, T-AUX-338, T-AUX-340, T-AUX-341, T-AUX-342, T-AUX-343]
  - REQ: NFR-AUX-007
  - kind: verify
  - DoD: `npm run verify` green; PR opened against `develop`.

---

### WS-AUX-10 — Storybook + parity screenshots + bundle size

- **T-AUX-345** — RED: Storybook coverage check enumerates NEW components
  - owner: qa
  - depends_on: [T-AUX-224, T-AUX-254, T-AUX-284, T-AUX-299, T-AUX-324, T-AUX-344]
  - REQ: REQ-AUX-017, NFR-AUX-009
  - kind: RED test
  - DoD: `tests/storybook/coverage.test.ts` enumerates §5 NEW component list and asserts each has ≥1 story.

- **T-AUX-346** — Storybook coverage gate implementation
  - owner: dev
  - depends_on: [T-AUX-345]
  - REQ: NFR-AUX-009
  - kind: implementation
  - DoD: helper reads story manifest; wired into `npm run test:storybook`.

- **T-AUX-347** — Axe scan story for `AgentSidepanelRoot`
  - owner: qa
  - depends_on: [T-AUX-344]
  - REQ: REQ-AUX-018, NFR-AUX-008
  - kind: storybook
  - DoD: story exists; axe addon enabled; CI runs scan; no critical violations.

- **T-AUX-348** — Manual keyboard walk-through (recorded)
  - owner: qa
  - depends_on: [T-AUX-344]
  - REQ: REQ-AUX-018
  - kind: verify
  - DoD: keyboard-only walk recorded in `test-plan.md`; tab order: header → tabs → transcript actionable → status panel → composer; every icon-only button has non-empty aria-label.

- **T-AUX-349** — WCAG 2.2 AA contrast audit on default themes
  - owner: qa
  - depends_on: [T-AUX-344]
  - REQ: REQ-AUX-018, NFR-AUX-008
  - kind: verify
  - DoD: dark + light + forced-colors all surfaces pass AA; findings logged.

- **T-AUX-350** — Reduced-motion review across components
  - owner: qa
  - depends_on: [T-AUX-344]
  - REQ: NFR-AUX-008
  - kind: verify
  - DoD: each animated component verified under `prefers-reduced-motion: reduce`.

- **T-AUX-351** — Capture WS-AUX-10 gzipped bundle size; assert delta ≤ 5%
  - owner: sre
  - depends_on: [T-AUX-014, T-AUX-344]
  - REQ: NFR-AUX-001
  - kind: verify
  - DoD: build outputs measured; `(new - baseline)/baseline ≤ 0.05`; written to `specs/agent-ux-parity/bundle-delta.json`. Block release if exceeded.

- **T-AUX-352** — ESLint guard regression scan
  - owner: qa
  - depends_on: [T-AUX-344]
  - REQ: NFR-AUX-002, NFR-AUX-003, NFR-AUX-004, NFR-AUX-005
  - kind: verify
  - DoD: confirm no new exceptions to `vue/no-v-html`, `no-restricted-properties`, `no-restricted-globals`, `no-restricted-imports`.

- **T-AUX-353** — `npm run test:coverage` threshold check
  - owner: qa
  - depends_on: [T-AUX-344]
  - REQ: NFR-AUX-012
  - kind: verify
  - DoD: 80/70/80/80 stmts/branches/funcs/lines holds.

- **T-AUX-354** — Code-review pass for outbound-call invariants
  - owner: qa
  - depends_on: [T-AUX-344]
  - REQ: NFR-AUX-011
  - kind: verify
  - DoD: no new outbound network calls, no new `localStorage`/`SettingsPort` writes introduced by this feature.

- **T-AUX-355** — Parity screenshot set vs Claudian reference
  - owner: qa
  - depends_on: [T-AUX-344]
  - REQ: REQ-AUX-017
  - kind: verify
  - DoD: side-by-side screenshots for header, tabs, welcome, message bubbles, composer, approval card; logged in `test-report.md`.

- **T-AUX-356** — Traceability matrix regen
  - owner: qa
  - depends_on: [T-AUX-344]
  - REQ: NFR-AUX-007
  - kind: docs
  - DoD: `specs/agent-ux-parity/traceability.md` produced; every REQ/NFR maps to ≥1 test + ≥1 task.

- **T-AUX-357** — Close out resolved CQ-AUX-NN clarifications
  - owner: qa
  - depends_on: [T-AUX-356]
  - REQ: NFR-AUX-007
  - kind: docs
  - DoD: spec §10 updated with resolution per CQ resolution table below.

- **T-AUX-358** — Cleanup: remove dormant `ChatDegradedState` TODO comments now that pill ships
  - owner: dev
  - depends_on: [T-AUX-293]
  - REQ: REQ-AUX-016
  - kind: cleanup
  - DoD: dormant flag/TODOs removed; grep shows no leftovers.

- **T-AUX-359** — Release-notes draft
  - owner: qa
  - depends_on: [T-AUX-355, T-AUX-356]
  - REQ: NFR-AUX-007
  - kind: docs
  - DoD: `release-notes.md` summarises UX parity surfaces; references ADRs.

- **T-AUX-360** — Final verify-gate run + WS-AUX-10 PR opened
  - owner: dev
  - depends_on: [T-AUX-346, T-AUX-347, T-AUX-348, T-AUX-349, T-AUX-350, T-AUX-351, T-AUX-352, T-AUX-353, T-AUX-354, T-AUX-355, T-AUX-356, T-AUX-357, T-AUX-358, T-AUX-359]
  - REQ: NFR-AUX-007
  - kind: verify
  - DoD: `npm run verify` green; PR opened against `develop`; merge unblocks Stage 9 review.

---

## 3. Critical path

**Longest chain (24 hops):**

T-AUX-001 → T-AUX-002 → T-AUX-003 → T-AUX-006 → T-AUX-009 → T-AUX-010 → T-AUX-011 (root [data-provider]) → T-AUX-016 → T-AUX-017 → T-AUX-018 → T-AUX-019 → T-AUX-020 → T-AUX-021 → T-AUX-023 → T-AUX-025 → T-AUX-028 → T-AUX-031 (SpIcon) → T-AUX-100 → T-AUX-114 → T-AUX-117 (HoverActions) → T-AUX-229 → T-AUX-230 → T-AUX-254 (WS-5 tip) → T-AUX-345 → T-AUX-360.

**Parallelisation opportunities:**

- WS-AUX-3 forks four parallel sub-chains once T-AUX-031 lands (SpButton / SpIconButton / SpToggleSwitch / SpDropdownPanel / HoverActions are all independent of each other).
- After T-AUX-121 (WS-AUX-3 tip): WS-AUX-4 (already running off WS-AUX-2), WS-AUX-5, and WS-AUX-9 lint-guard tasks (T-AUX-336 / T-AUX-339) can all run in parallel.
- WS-AUX-6 and WS-AUX-8 can run in parallel once WS-AUX-5 ships (both depend on it for `HoverActions`-integrated MessageItem).
- WS-AUX-10 fans into all six upstream workstreams; only verify-style tasks within it (T-AUX-348..T-AUX-355) can run concurrently.

---

## 4. CQ-AUX-NN resolution

| CQ | Resolution | Maps to |
|---|---|---|
| CQ-AUX-01 | escalate (PM + ux-designer must confirm Cursor brand colour before WS-AUX-1 ships; placeholder accepted with inline comment via T-AUX-004) | escalate |
| CQ-AUX-02 | route into a task | T-AUX-237..T-AUX-239 (NestedDetailFrame contract + tests + Storybook) |
| CQ-AUX-03 | route into a task | T-AUX-267 (InputToolbar slot-order test) |
| CQ-AUX-04 | escalate (architect + ux-designer must sign off on cross-feature impact before WS-AUX-3 lands T-AUX-112; if Settings tab pickers must adopt, file follow-up feature) | escalate |
| CQ-AUX-05 | defer (PM closes after launch; spec defaults to 3 chips — T-AUX-211 implements default) | defer |
| CQ-AUX-06 | escalate (PM + architect must confirm Fork action ships in this feature before WS-AUX-5 begins T-AUX-230) | escalate |
| CQ-AUX-07 | defer (modal-only kept; planner closes after launch) | defer |
| CQ-AUX-08 | route into a task | T-AUX-325 / T-AUX-327 implement listed actions |
| CQ-AUX-09 | defer (editableFields empty until tool schemas land — T-AUX-308 explicitly leaves it empty) | defer |
| CQ-AUX-10 | route into a task | add to T-AUX-279 (ChatInput) DoD — guard `↑` to edit when textarea empty + no open picker |
| CQ-AUX-11 | defer (icon mapping per boundary type — non-blocker; planner closes after launch) | defer |
| CQ-AUX-12 | route into a task | T-AUX-247 (StreamingCursor reduced-motion) |
| CQ-AUX-13 | defer (Plan-mode label colour token — non-blocker; inline acceptable) | defer |
| CQ-AUX-14 | route into a task | T-AUX-008 (animations.css `spin` reduced-motion override) |
| CQ-AUX-15 | defer (provider-agnostic strings; PM closes after launch) | defer |
| CQ-AUX-16 | route into a task | T-AUX-336 / T-AUX-337 (lint guard in WS-AUX-9) |
| CQ-AUX-17 | route into a task | each WS owns its Storybook tasks (e.g. T-AUX-033, T-AUX-104, T-AUX-119, T-AUX-203, T-AUX-236, T-AUX-280, T-AUX-292, T-AUX-311, T-AUX-330) |
| CQ-AUX-18 | route into a task | T-AUX-279 (ChatInput hosts AttachmentStrip inside composer wrapper) |

Escalation summary: **CQ-AUX-01, CQ-AUX-04, CQ-AUX-06** must be answered before their gating workstream begins (WS-AUX-1, WS-AUX-3, WS-AUX-5 respectively).

---

## 5. Risks for the plan

1. **Bundle-size growth beyond 5% (NFR-AUX-001).** New primitives + Lucide icon coverage + Storybook coverage could exceed budget. **Counter-task:** T-AUX-014 (baseline) + T-AUX-351 (delta check) bracket the work; if exceeded, T-AUX-351 blocks release and planner re-prioritises (likely deferring `FloatingNavSidebar` / `MentionPopover` lazy-load).
2. **Hover-reveal a11y regressions (REQ-AUX-002, REQ-AUX-018).** Opacity-only reveal can leak focus-visible state or break under coarse-pointer; reduced-motion can break interaction expectations. **Counter-tasks:** T-AUX-114 (a11y-tree invariant), T-AUX-115 (reduced-motion), T-AUX-116 (coarse-pointer) + the axe scan at T-AUX-347 + manual keyboard walk T-AUX-348.

---
