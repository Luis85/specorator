---
title: Migrate the chat sidepanel shell (header + tab strip + content host) to a Vue 3 + Pinia island
date: 2026-07-11
status: draft
scope: src/features/chat (SpecoratorView frame, tabs/TabBar), src/features/chat/ui/vue (new)
---

# Chat Shell Vue Migration — Design

## Context

`features/chat` is the largest remaining imperative surface (~25k LOC): the daily-driver
sidebar chat. It splits into a **view layer** (rendering, tabs, ui, composer — migrate to
Vue) and an **engine layer** (controllers, `TabManager` runtime/warmup coordination,
`ChatState`, stream-consumption state machines — stays imperative). This is the ADR 0004
(Agent Board) seam applied to chat: a Vue island over an untouched engine.

The full view migration is decomposed into four independently shippable sub-projects, each
its own spec → plan → PR:

1. **Chat shell** — header + tab strip + the content host (THIS spec).
2. **Transcript rendering pipeline** — `MessageRenderer` + block renderers.
3. **Composer + input toolbar**.
4. **Side panels** — status, conversation history, navigation sidebar, file/image context.

This spec covers sub-project 1 only. It establishes the chat Vue island seam, the
Pinia-over-`TabManager` projection, and the content-hosting contract the later sub-projects
build on.

## Goal

Replace `SpecoratorView`'s imperative outer frame (the `specorator-header`, the tab-badge
strip, and the `specorator-tab-content-container`) with a Vue 3 + Pinia island, **without
changing any engine behavior**: stream consumption, runtime lifecycle, tab switching, and the
per-tab imperative DOM are untouched. The still-imperative transcript + composer mount into a
Vue-provided slot.

## Current structure (what we replace)

`SpecoratorView.onOpen` builds (imperatively, in `viewContainerEl` = `specorator-container`):

- `specorator-header` — title row (`specorator-title-slot` + title text), meta row
  (`specorator-bound-agent-chip-slot`, `specorator-header-actions`), and the header-actions
  content: the tab-bar container, work-order-activity slot, quick-actions button, new-tab
  button, "new" button, and the history button + `specorator-history-menu` dropdown.
- `specorator-tab-content-container` (`tabContentEl`) — a **sibling** of the header. Each tab
  owns a persistent `specorator-tab-content` div (`tabFactory`), appended here once and shown
  / hidden by toggling `specorator-hidden` on tab switch (`tabLifecycle`). All tabs' subtrees
  stay mounted simultaneously; only the active one is visible.
- `specorator-empty-state` — the "no tabs yet" call-to-action.

`TabBar.ts` (215 LOC) renders the badge strip from a `TabBarItem[]` (id, 1-based index,
title, providerId, isActive, isStreaming, needsAttention, canClose, kind, isAgentBound) with
three callbacks (`onTabClick`, `onTabClose`, `onNewTab`). `SpecoratorView.updateTabBar` is
re-invoked from the `TabManager` callbacks `onTabCreated / onTabSwitched / onTabClosed /
onTabStreamingChanged / onTabTitleChanged / onTabAttentionChanged / onTabConversationChanged /
onTabProviderChanged`.

## Architecture

Vue 3 + Pinia island over the untouched engine (ADR 0004 pattern):

- `SpecoratorView` stays an `ItemView`. It mounts `ChatShellRoot.vue` into `viewContainerEl`
  through the shipped `globalPinia` / island harness, and provides the plugin + a callbacks
  object via inject keys (`markRaw`'d Obsidian objects). It keeps ALL engine wiring imperative.
- `useChatShellStore` (Pinia) is a reactive projection over `TabManager`: `tabs: TabBarItem[]`
  for the strip, `header` state (title, boundAgent, activeProviderId), and `activeTabId`. I/O
  and truth stay in `TabManager`; the store is a read-model. Setters are whole-value / array
  replacements (`shallowRef`), the churn-minimizing contract from `useAgentBoardStore`.
- `useChatShellEventRouting` subscribes the existing `TabManager` callbacks on mount and maps
  each to a store setter (granular tier), disposing every subscription on unmount — mirroring
  `useBoardEventRouting`. No new events are invented; the callbacks at `SpecoratorView:277–313`
  are reused.
- Vue → engine goes through the callbacks seam only (`onTabClick`, `onTabClose`, `onNewTab`,
  `onOpenHistory`, `onOpenWorkOrders`, `onRename`, `onQuickActions`, …) — thin delegators to
  existing `SpecoratorView` / `TabManager` methods. Vue never reaches into the engine directly.

### The content-hosting seam (the novel part)

`ChatShellRoot` renders the `specorator-tab-content-container` element and hands it to the
imperative tab layer via a stable template ref (exposed through an inject key or a
`ChatShellRoot` `expose`). The imperative `tabFactory` keeps `createDiv`-ing each tab's
`specorator-tab-content` subtree into it and keeps toggling `specorator-hidden` on switch —
unchanged.

Vue **owns the container element but treats its children as opaque**: the host is rendered
once, never re-rendered, and carries no `v-for` / reactive children — the same
"leave-me-alone host" contract as `MarkdownHost` and the board's lane-editor mount. All N tab
subtrees persist across shell re-renders exactly as today; scroll position and live streaming
DOM are untouched.

## Component tree

Under `src/features/chat/ui/vue/`, styled on the `.specorator-vue` baseline + `--sp-*` tokens:

```
ChatShellRoot.vue                     — owns layout; mounts store + event routing; exposes the content-host ref
├── ChatHeader.vue
│   ├── ChatTitle.vue                 — title text + rename slot
│   ├── BoundAgentChip.vue            — avatar + name (v-if bound)
│   ├── TabStrip.vue  → TabBadge.vue  — the v-for'd badge strip (roving tabindex + a11y)
│   └── HeaderActions.vue             — new-tab / quick-actions / new / history + work-order buttons
│       ├── (history dropdown host)   — ref handed to imperative ConversationHistoryView
│       └── (work-order dropdown host)— ref handed to imperative WorkOrderActivityDropdown
├── TabContentHost.vue                — the opaque "leave-me-alone" slot (specorator-tab-content-container)
└── ChatEmptyState.vue                — the "no tabs yet" call-to-action
```

The **conversation-history** and **work-order-activity** dropdowns stay imperative for this
sub-project: `HeaderActions` exposes container refs and `SpecoratorView` mounts the existing
`ConversationHistoryView` / `WorkOrderActivityDropdown` into them ("island hosts imperative
widget"). They become Vue in the side-panels sub-project.

## Data flow

```
TabManager (engine, unchanged)
  → onTabCreated / onTabSwitched / onTabClosed / onTabStreamingChanged / onTabTitleChanged
    / onTabAttentionChanged / onTabConversationChanged / onTabProviderChanged
  → useChatShellEventRouting (granular setters)
  → useChatShellStore (tabs[], header, activeTabId)
  → TabStrip / ChatHeader (render)

User action (badge click / close / new-tab / open history …)
  → callbacks seam (inject key)
  → SpecoratorView / TabManager method (unchanged)
```

## Cutover

Hard cut, no feature flag (ADR 0003 / 0004 precedent). In one PR: `SpecoratorView` mounts
`ChatShellRoot` instead of building the frame imperatively; `buildHeader`, `updateTabBar`,
`TabBar.ts`, and the imperative frame DOM are deleted. The engine is untouched, so the blast
radius is the frame only. Merge is gated on the full suite plus a manual vault smoke checklist
(chat is the daily driver):

- open / switch / close tabs; new-tab button; keyboard tab navigation
- streaming badge (`aria-busy`, working class) during a live turn
- needs-attention badge on a backgrounded tab that needs input
- work-order tabs hidden from the visible badge strip; Work Orders dropdown lists them
- conversation-history dropdown opens / switches / loads
- bound-agent chip + agent-glyph badge for an agent-bound tab
- empty state with no tabs

## Testing (Vitest lane, `tests/vue/chat/`)

- **Characterization first** — before deleting `TabBar.ts`, lock its behavior: badge index /
  glyph (chat number vs wrench vs agent-user glyph), active / streaming / attention / idle
  classes, work-order-first margin, roving tabindex + `aria-selected` / `aria-busy`, click /
  close / keyboard wiring. Then assert `TabStrip` / `TabBadge` reproduce each (parity).
- **Hosting-seam test** (the novel risk): mount `ChatShellRoot`, imperatively append a child
  + listener into the `TabContentHost` ref, force a shell re-render (mutate the tab store),
  assert the imperative child and its listener survive — the "leave-me-alone host" contract.
- **Store / routing tests**: each `TabManager` callback → the right store setter;
  churn-minimizing (no new array reference when nothing changed).
- **Perf**: a scaling guard that the strip stays O(rendered badges) and one streaming-badge
  change re-renders one `TabBadge` (mirrors `agentBoardScaling`).

## Guardrails

- Jest `collectCoverageFrom` excludes `src/features/chat/ui/vue/**` (Vitest-tested), mirroring
  the board exclusion; Vitest `coverage.include` adds the new tree.
- LOC ratchet re-locked (net deletion expected: `TabBar.ts` + imperative frame out, SFCs in).
- `check:css` + the `.specorator-vue` namespace guard cover the new styles.
- `check:quality` ratchet re-locked after the cut.

## Risks & mitigations

1. **Content-hosting seam is new** → the dedicated seam test + the opaque-host contract
   (rendered once, no `v-for`, children owned by imperative code).
2. **Cross-window popouts** → `nodeType` / `ownerDocument` checks from the start (never
   `instanceof HTMLElement`; the mountLucide / IconButton lesson).
3. **Daily-driver regressions** → characterization parity + the manual smoke checklist as a
   merge gate.
4. **`InlineAskUserQuestion.renderTabBar` also renders a tab bar** (`InlineAskUserQuestion:139`)
   → audit that call path so the ask-user card's mini tab-bar stays consistent with the Vue
   strip (reuse the same projection, or leave it imperative if it is independent).

## Out of scope (later sub-projects)

Transcript rendering, the composer / input toolbar, and the side panels (status, conversation
history, navigation sidebar, file / image context). The history + work-order dropdowns remain
imperative here and migrate with the side panels.
