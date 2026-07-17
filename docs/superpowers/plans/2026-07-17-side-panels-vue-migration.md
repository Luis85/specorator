# Chat Side Panels + Header Remnants Vue 3 + Pinia Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the five remaining imperative chat rendering surfaces — StatusPanel, NavigationSidebar, ConversationHistoryView, WorkOrderActivityDropdown, GitActionButton — to Vue 3 + Pinia islands over the untouched engine, leaving the chat feature with no imperative *rendering* surface (ADR 0005 sub-project 4).

**Architecture:** Two homes reusing the established island seams. **Home 1** extends the shipped shell island: the three header widgets become native Vue components in `ChatHeader.vue`/`HeaderActions.vue`, reading three new `chatShellStore` slices (`conversations`/`workOrder`/`git`) projected by `SpecoratorView.projectChatShell*()` and firing new `ChatShellCallbacks`. **Home 2** is a new per-tab "tab-chrome" island (`mountTabChrome`, `createTabChromePinia`, `TabChromeProjection`, `useTabChromeStore`) mirroring `mountTabComposer`, rooted at `statusPanelContainerEl`, rendering `StatusPanel.vue` in place and `NavOverlay.vue` `<Teleport>`ed to a new `.specorator-nav-sidebar-host`. The imperative engine (`ChatState`, controllers, `StreamController`, `workOrderActivity`/`gitStatusWatcher` providers, `ConversationStore`) stays untouched behind projection seams.

**Tech Stack:** Vue 3 (`<script setup lang="ts">` SFCs), Pinia (`shallowRef` whole-value stores), Obsidian API (`setIcon`/`Menu`/`Notice`), Vitest (component lane, `tests/vue/`), Jest (unit + perf lanes), the `.specorator-vue` style baseline + `--sp-*` tokens.

---

## File Structure

### Phase 1 — Shell store slices + projection prep (unwired)

| File | Create/Modify | Responsibility |
|------|---------------|----------------|
| `src/features/chat/ui/vue/stores/chatShellStore.ts` | Modify | Add `conversations`/`workOrder`/`git` slices + types (`ChatShellConversations`, `ChatShellGit`, `ChatShellConversationMeta`, `HistoryConversationOpenState`) + setters |
| `src/features/chat/ui/vue/chatShellCallbacks.ts` | Modify | Add `conversations`/`workOrder`/`git` to `ChatShellSnapshot`; add conversation/work-order/git delegator signatures to `ChatShellCallbacks` |
| `src/features/chat/ui/vue/useChatShellEventRouting.ts` | Modify | Fan the three new slices into the store |
| `src/features/chat/SpecoratorView.ts` | Modify | Add `projectChatShellConversations`/`projectChatShellWorkOrder`/`projectChatShellGit`, fold into `projectChatShell`, subscribe to `workOrderActivity`/`gitStatusWatcher`, implement the new callback delegators (unwired) |
| `tests/vue/chat/sidePanels/shellSlices.test.ts` | Create | Lock the store setters + routing for the three new slices |

### Phase 2 — Native header components + cutover

| File | Create/Modify | Responsibility |
|------|---------------|----------------|
| `src/features/chat/ui/vue/components/GitActionButton.vue` | Create | Native git commit-&-push button reading `store.git` |
| `src/features/chat/ui/vue/components/WorkOrderActivityDropdown.vue` | Create | Native work-order activity dropdown reading `store.workOrder` |
| `src/features/chat/ui/vue/components/ConversationHistoryDropdown.vue` | Create | Native history dropdown reading `store.conversations` (windowed + show-more + active-pin + rename input + context menu) |
| `src/features/chat/ui/vue/components/conversationHistoryFormat.ts` | Create | `formatConversationDate` helper (moved from `ConversationHistoryView.formatDate`) |
| `src/features/chat/ui/vue/components/ChatHeader.vue` | Modify | Render `<GitActionButton/>`; drop `gitActionHost` ref + `mountGitActionHost` |
| `src/features/chat/ui/vue/components/HeaderActions.vue` | Modify | Render `<WorkOrderActivityDropdown/>` + `<ConversationHistoryDropdown/>`; drop history/work-order host refs |
| `src/features/chat/SpecoratorView.ts` | Modify | Delete `mount*Host`, `historyDropdown`/`historyBtn`, `workOrderActivity*`, `gitActionButton`, `toggleHistoryDropdown`/`updateHistoryDropdown`/`mountWorkOrderActivityDropdown` + `openHistoryConversation*`; add `regenerateHistoryTitle`/`deleteHistoryConversation` |
| `src/features/chat/controllers/ConversationController.ts` | Modify | Delete `renderHistoryDropdown`/`updateHistoryDropdown`/`toggleHistoryDropdown`/`regenerateTitle`/`formatDate` delegators + `historyView` field + `getHistoryDropdown`/`getStatusPanel` deps |
| `src/features/chat/ui/ConversationHistoryView.ts` | Delete | Superseded by the Vue component |
| `src/features/chat/ui/WorkOrderActivityDropdown.ts` | Delete | Superseded by the Vue component |
| `src/features/chat/ui/GitActionButton.ts` | Delete | Superseded (except `shouldShowGitButton`, moved) |
| `tests/vue/chat/sidePanels/gitActionButton.test.ts` | Create | Legacy-class + visibility + commit-callback lock |
| `tests/vue/chat/sidePanels/workOrderActivityDropdown.test.ts` | Create | Legacy-class + toggle + open/close-callback lock |
| `tests/vue/chat/sidePanels/conversationHistoryDropdown.test.ts` | Create | Legacy-class + row actions + rename/context-menu lock |
| `tests/vue/chat/sidePanels/conversationHistoryWindow.test.ts` | Create | Migrated perf window guard (chunk-50 + show-more + active-pin) |
| `tests/perf/conversationHistory.perf.test.ts` | Modify | Delete the `history dropdown render` describe; keep `loadConversations` |
| `tests/unit/features/chat/ui/{GitActionButton,WorkOrderActivityDropdown,ConversationHistoryView}.test.ts` | Delete | Cover the deleted imperative widgets |
| `tests/unit/features/chat/controllers/ConversationController.test.ts` | Modify | Delete describe blocks for deleted methods |

### Phase 3 — Tab-chrome island scaffold + StatusPanel

| File | Create/Modify | Responsibility |
|------|---------------|----------------|
| `src/features/chat/state/BashOutputStore.ts` | Create | Engine-side LRU-50 bang-bash output owner + `PanelBashOutput` type |
| `src/features/chat/ui/vue/tabChrome/tabChromeKeys.ts` | Create | Injection keys (`APP_KEY`/`COMPONENT_KEY`/`PLUGIN_KEY`/`CALLBACKS_KEY`/`SCROLL_HOST_KEY`/`NAV_HOST_KEY`) |
| `src/features/chat/ui/vue/tabChrome/tabChromePinia.ts` | Create | `createTabChromePinia()` fresh per leaf |
| `src/features/chat/ui/vue/tabChrome/stores/tabChromeStore.ts` | Create | `useTabChromeStore` (`todos`/`bashOutputs` shallowRef + setters) |
| `src/features/chat/ui/vue/tabChrome/tabChromeCallbacks.ts` | Create | `TabChromeSnapshot`/`TabChromeSubscribe`/`TabChromeCallbacks` |
| `src/features/chat/ui/vue/tabChrome/useTabChromeEventRouting.ts` | Create | Sync subscribe → store fan |
| `src/features/chat/ui/vue/tabChrome/mountTabChromeApp.ts` | Create | `createApp(TabChromeRoot)` + fresh Pinia + provides (mirror `mountComposer`) |
| `src/features/chat/ui/vue/tabChrome/TabChromeRoot.vue` | Create | Renders `<StatusPanel/>` (Phase 4 adds `<NavOverlay/>`) |
| `src/features/chat/ui/vue/tabChrome/StatusPanel.vue` | Create | Todos (reuse `TodoListView.vue`) + bash outputs, legacy classes |
| `src/features/chat/tabs/tabChrome.ts` | Create | `TabChromeProjection` (mirror `tabComposer.ts`) |
| `tests/vue/chat/sidePanels/statusPanel.test.ts` | Create | Todo render + bash add/update/collapse/copy/clear lock |
| `tests/vue/chat/sidePanels/tabChrome.test.ts` | Create | Projection subscribe/emit lock |
| `tests/unit/features/chat/state/BashOutputStore.test.ts` | Create | LRU-50 + add/update/clear |

### Phase 3 (wiring) — lifecycle cutover

| File | Create/Modify | Responsibility |
|------|---------------|----------------|
| `src/features/chat/tabs/tabChromeMount.ts` | Create | `mountTabChrome(tab, plugin, component)` orchestrator (mirror `tabComposerMount.ts`) |
| `src/features/chat/tabs/types.ts` | Modify | Add `bashOutputs`/`tabChrome`/`mountedTabChrome` to `TabData`; drop `statusPanel` from `TabUIComponents` |
| `src/features/chat/tabs/TabManager.ts` | Modify | Call `mountTabChrome` after `mountTabComposer` |
| `src/features/chat/tabs/tabUi.ts` | Modify | Bang-bash `onSubmit` writes `tab.bashOutputs`; `onTodosChanged` → `tab.tabChrome?.emit()`; drop `StatusPanel` construction |
| `src/features/chat/tabs/tabLifecycle.ts` | Modify | Unmount `mountedTabChrome`; drop `statusPanel` teardown |
| `src/features/chat/ui/StatusPanel.ts` | Delete | Superseded by `StatusPanel.vue` |
| `tests/unit/features/chat/ui/StatusPanel.test.ts` | Delete | Covers deleted widget |

### Phase 4 — NavOverlay + useTabNavigation

| File | Create/Modify | Responsibility |
|------|---------------|----------------|
| `src/features/chat/tabs/tabFactory.ts` | Modify | Add `.specorator-nav-sidebar-host` in `buildTabDOM`; add `navSidebarHostEl` |
| `src/features/chat/tabs/types.ts` | Modify | Add `navSidebarHostEl` to `TabDOMElements` |
| `src/features/chat/ui/vue/tabChrome/useTabNavigation.ts` | Create | Imperative scroll geometry composable |
| `src/features/chat/ui/vue/tabChrome/NavOverlay.vue` | Create | Teleported 4-button navigator |
| `src/features/chat/ui/vue/tabChrome/TabChromeRoot.vue` | Modify | Add `<NavOverlay/>` |
| `src/features/chat/ui/vue/tabChrome/mountTabChromeApp.ts` | Modify | Provide `SCROLL_HOST_KEY`/`NAV_HOST_KEY`; expose `setScrollHost` |
| `src/features/chat/ui/vue/tabChrome/tabChromeCallbacks.ts` | Modify | Add `resolveNavHost()` |
| `src/features/chat/tabs/tabChromeMount.ts` | Modify | Wire `resolveNavHost` |
| `src/features/chat/tabs/tabControllers.ts` | Modify | `tab.mountedTabChrome?.setScrollHost(scrollEl)` post-transcript-mount |
| `src/features/chat/tabs/tabUi.ts` | Modify | Drop `NavigationSidebar` construction + `onAutoScrollChanged` nav call + ResizeObserver |
| `src/features/chat/tabs/tabLifecycle.ts` | Modify | Drop `navigationSidebar` teardown + `activateTab` nav call |
| `src/features/chat/ui/NavigationSidebar.ts` | Delete | Superseded by `NavOverlay.vue` + `useTabNavigation` |
| `tests/vue/chat/sidePanels/navOverlay.test.ts` | Create | Visibility overflow + prev/next scan + teleport lock |
| `tests/vue/chat/sidePanels/navOverlayScaling.test.ts` | Create | Migrated `navigationSidebar.perf` scan-scaling guard |
| `tests/perf/navigationSidebar.perf.test.ts` | Delete | Imports the deleted `NavigationSidebar` |
| `tests/unit/features/chat/ui/NavigationSidebar.test.ts` | Delete | Covers deleted widget |

### Phase 5 — DOM-contract test + docs + re-lock

| File | Create/Modify | Responsibility |
|------|---------------|----------------|
| `tests/vue/chat/sidePanels/sidePanelsDomContract.test.ts` | Create | Each surface emits legacy classes over a rich projection; NavOverlay reads `.specorator-message-user` |
| `src/features/chat/CLAUDE.md` | Modify | Empty the "Still-imperative" line to only the retained engine widgets |
| `docs/adr/0005-chat-shell-vue-migration.md` | Modify | Add "Sub-project 4 — Side panels" note |
| `scripts/loc-baseline.json` | Modify | Re-lock down `SpecoratorView`/`ConversationController` (net shrink) |
| `scripts/quality-baseline.json` | Modify | Re-lock down + dated note |

---

## Gate step (every commit runs this)

Every task's final "commit" step MUST first run, from repo root, and see all green:

```bash
rm -rf coverage
npm run typecheck && npm run typecheck:vue && npm run lint \
  && npm run test:vue && npm run test -- --selectProjects unit \
  && npm run build && npm run check:css && npm run check:loc
```

> **IMPORTANT — `check:quality` gotcha:** run `npm run check:quality` ONLY with NO `coverage/` directory present. Fallow reads Istanbul coverage if present and inflates `criticalComplexity` far above baseline. Always `rm -rf coverage` immediately before it (the command above already deletes it first, and no gate command between the delete and quality writes coverage). Run it as the last check:
>
> ```bash
> rm -rf coverage && npm run check:quality
> ```

Every commit uses these exact trailers (co-author "Claude Opus 4.8" is REQUIRED; never a dashed lowercase id):

```bash
git config user.email noreply@anthropic.com && git config user.name Claude
```

Commit message body always ends with:

```
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014VDsSXWHRqZr2EcNgDX2eq
```

Do NOT push — the controller pushes at milestones.

---

## Phase 1 — Shell store slices + projection prep (unwired)

Adds the three projected slices, snapshot fields, routing, projection builders, provider subscriptions, and callback delegators. The imperative widgets still render (hosted via `mount*Host`) — nothing is cut over yet.

### Task 1: Add `conversations`/`workOrder`/`git` slices to `chatShellStore`

**Files:**
- Modify: `src/features/chat/ui/vue/stores/chatShellStore.ts`
- Test: `tests/vue/chat/sidePanels/shellSlices.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/vue/chat/sidePanels/shellSlices.test.ts`:

```ts
import { setActivePinia, createPinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';

import { useChatShellStore } from '@/features/chat/ui/vue/stores/chatShellStore';

describe('chatShellStore — side-panel slices', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('defaults the three new slices to empty', () => {
    const store = useChatShellStore();
    expect(store.conversations).toEqual({ items: [], currentConversationId: null, perItem: {} });
    expect(store.workOrder.items).toEqual([]);
    expect(store.git).toEqual({ isRepo: false, dirtyCount: 0, visible: false });
  });

  it('replaces whole values through the setters', () => {
    const store = useChatShellStore();
    store.setConversations({ items: [{ id: 'c1' } as never], currentConversationId: 'c1', perItem: { c1: { openState: 'current' } } });
    store.setWorkOrder({ items: [], closableTabs: [], runningCount: 0, attentionCount: 0 });
    store.setGit({ isRepo: true, dirtyCount: 3, visible: true });
    expect(store.conversations.currentConversationId).toBe('c1');
    expect(store.conversations.perItem.c1.openState).toBe('current');
    expect(store.git.dirtyCount).toBe(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:vue -- tests/vue/chat/sidePanels/shellSlices.test.ts`
Expected: FAIL — `store.setConversations is not a function`.

- [ ] **Step 3: Add the slice types + state + setters**

In `src/features/chat/ui/vue/stores/chatShellStore.ts`, add these imports at the top of the import block:

```ts
import type { ConversationMeta } from '../../../../../core/types';
import type { WorkOrderActivitySummary } from '../../../../../core/types/workOrderActivity';
import { EMPTY_WORK_ORDER_ACTIVITY_SUMMARY } from '../../../../../core/types/workOrderActivity';
```

Add these exported types just above `export interface ChatShellHeader`:

```ts
/** Whether a conversation is the active tab's (`current`), open in some tab
 *  (`open`), or not open (`closed`). Moved here from the deleted
 *  ConversationHistoryView; the history context menu keys off it. */
export type HistoryConversationOpenState = 'closed' | 'open' | 'current';

/** Per-conversation projected chrome for the history dropdown. `titleGenerationStatus`
 *  is read directly off the `ConversationMeta` item (already carried there), so this
 *  only adds the computed open state. */
export interface ChatShellConversationMeta {
  openState: HistoryConversationOpenState;
}

/** History-dropdown slice: the global conversation list (sorted lastResponseAt??createdAt
 *  desc at projection time), the ACTIVE tab's current conversation id (highlight follows
 *  the active tab), and per-item computed open state keyed by conversation id. */
export interface ChatShellConversations {
  items: ConversationMeta[];
  currentConversationId: string | null;
  perItem: Record<string, ChatShellConversationMeta>;
}

/** Git commit-&-push button slice. `visible` folds `shouldShowGitButton`
 *  (isRepo && dirtyCount > 0 && enabled) so the component only reads one flag. */
export interface ChatShellGit {
  isRepo: boolean;
  dirtyCount: number;
  visible: boolean;
}
```

Add the default constants beside `DEFAULT_HEADER`:

```ts
const DEFAULT_CONVERSATIONS: ChatShellConversations = Object.freeze({
  items: [], currentConversationId: null, perItem: {},
}) as ChatShellConversations;
const DEFAULT_GIT: ChatShellGit = Object.freeze({ isRepo: false, dirtyCount: 0, visible: false });
```

Inside the `defineStore('chat-shell', () => { ... })` factory, add the state refs after `const activeTabId = ...`:

```ts
  const conversations = shallowRef<ChatShellConversations>(DEFAULT_CONVERSATIONS);
  const workOrder = shallowRef<WorkOrderActivitySummary>(EMPTY_WORK_ORDER_ACTIVITY_SUMMARY);
  const git = shallowRef<ChatShellGit>(DEFAULT_GIT);
```

Add the setters after `setActiveTabId`:

```ts
  function setConversations(next: ChatShellConversations): void { conversations.value = next; }
  function setWorkOrder(next: WorkOrderActivitySummary): void { workOrder.value = next; }
  function setGit(next: ChatShellGit): void { git.value = next; }
```

Extend the returned object:

```ts
  return {
    tabs, header, activeTabId, conversations, workOrder, git,
    setTabs, setHeader, setActiveTabId, setConversations, setWorkOrder, setGit,
  };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:vue -- tests/vue/chat/sidePanels/shellSlices.test.ts`
Expected: PASS (both cases).

- [ ] **Step 5: Commit**

```bash
rm -rf coverage
npm run typecheck && npm run typecheck:vue && npm run lint && npm run test:vue && npm run test -- --selectProjects unit && npm run build && npm run check:css && npm run check:loc
rm -rf coverage && npm run check:quality
git config user.email noreply@anthropic.com && git config user.name Claude
git add src/features/chat/ui/vue/stores/chatShellStore.ts tests/vue/chat/sidePanels/shellSlices.test.ts
git commit -m "$(cat <<'EOF'
feat(chat): add conversations/workOrder/git slices to chatShellStore

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014VDsSXWHRqZr2EcNgDX2eq
EOF
)"
```

### Task 2: Extend `ChatShellSnapshot` + routing to fan the three slices

**Files:**
- Modify: `src/features/chat/ui/vue/chatShellCallbacks.ts`
- Modify: `src/features/chat/ui/vue/useChatShellEventRouting.ts`
- Test: `tests/vue/chat/sidePanels/shellSlices.test.ts` (extend)

- [ ] **Step 1: Write the failing test**

Append to `tests/vue/chat/sidePanels/shellSlices.test.ts`:

```ts
import { mount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';
import { useChatShellEventRouting } from '@/features/chat/ui/vue/useChatShellEventRouting';
import type { ChatShellSnapshot } from '@/features/chat/ui/vue/chatShellCallbacks';
import { DEFAULT_HEADER_FOR_TEST } from '@/features/chat/ui/vue/stores/chatShellStore';

describe('useChatShellEventRouting — side-panel slices', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('fans conversations/workOrder/git from the snapshot into the store', () => {
    let push: (s: ChatShellSnapshot) => void = () => {};
    const store = useChatShellStore();
    const Comp = defineComponent({
      setup() {
        useChatShellEventRouting((onChange) => { push = onChange; return () => {}; });
        return () => h('div');
      },
    });
    mount(Comp);
    push({
      tabs: [], activeTabId: null, header: DEFAULT_HEADER_FOR_TEST,
      conversations: { items: [], currentConversationId: 'x', perItem: {} },
      workOrder: { items: [], closableTabs: [], runningCount: 0, attentionCount: 0 },
      git: { isRepo: true, dirtyCount: 2, visible: true },
    });
    expect(store.conversations.currentConversationId).toBe('x');
    expect(store.git.dirtyCount).toBe(2);
  });
});
```

Export a test-only default header from `chatShellStore.ts` so the snapshot builds without importing the frozen private constant. Add at the end of `chatShellStore.ts`:

```ts
/** Test-only re-export of the default header (private DEFAULT_HEADER stays frozen). */
export const DEFAULT_HEADER_FOR_TEST: ChatShellHeader = DEFAULT_HEADER;
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:vue -- tests/vue/chat/sidePanels/shellSlices.test.ts`
Expected: FAIL — `ChatShellSnapshot` has no `conversations`/`workOrder`/`git`.

- [ ] **Step 3: Extend the snapshot type**

In `src/features/chat/ui/vue/chatShellCallbacks.ts`, add imports:

```ts
import type { WorkOrderActivitySummary } from '../../../../core/types/workOrderActivity';
import type { ChatShellConversations, ChatShellGit, ChatShellHeader } from './stores/chatShellStore';
```

(Leave the existing `ChatShellHeader` import; merge it into the line above.) Extend `ChatShellSnapshot`:

```ts
export interface ChatShellSnapshot {
  tabs: TabBarItem[];
  header: ChatShellHeader;
  activeTabId: TabId | null;
  conversations: ChatShellConversations;
  workOrder: WorkOrderActivitySummary;
  git: ChatShellGit;
}
```

- [ ] **Step 4: Fan the new slices in the router**

In `src/features/chat/ui/vue/useChatShellEventRouting.ts`, inside the `subscribe((snapshot) => { ... })` body, after `store.setActiveTabId(snapshot.activeTabId);` add:

```ts
      store.setConversations(snapshot.conversations);
      store.setWorkOrder(snapshot.workOrder);
      store.setGit(snapshot.git);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test:vue -- tests/vue/chat/sidePanels/shellSlices.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
rm -rf coverage
npm run typecheck && npm run typecheck:vue && npm run lint && npm run test:vue && npm run test -- --selectProjects unit && npm run build && npm run check:css && npm run check:loc
rm -rf coverage && npm run check:quality
git config user.email noreply@anthropic.com && git config user.name Claude
git add src/features/chat/ui/vue/chatShellCallbacks.ts src/features/chat/ui/vue/useChatShellEventRouting.ts src/features/chat/ui/vue/stores/chatShellStore.ts tests/vue/chat/sidePanels/shellSlices.test.ts
git commit -m "$(cat <<'EOF'
feat(chat): fan conversations/workOrder/git through ChatShellSnapshot

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014VDsSXWHRqZr2EcNgDX2eq
EOF
)"
```

### Task 3: Projection builders + provider subscriptions in `SpecoratorView`

**Files:**
- Modify: `src/features/chat/SpecoratorView.ts` (`projectChatShell` ~495-502; add builders; subscriptions in `wireEventHandlers` ~891)
- Test: `tests/unit/features/chat/SpecoratorView.test.ts` (extend)

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/features/chat/SpecoratorView.test.ts` (adapt the existing `makeView`/prototype-instance pattern already in that file; if the file constructs a bare prototype instance, reuse it):

```ts
describe('projectChatShell side-panel slices', () => {
  it('projects git as visible only when repo dirty and enabled', () => {
    const view = Object.create(SpecoratorView.prototype) as any;
    view.plugin = {
      gitStatusWatcher: { getLastStatus: () => ({ isRepo: true, dirtyCount: 3 }) },
      workOrderActivity: { getSummary: () => ({ items: [], closableTabs: [], runningCount: 0, attentionCount: 0 }) },
      getConversationList: () => [],
      settings: {},
    };
    view.tabManager = { getActiveTab: () => null };
    view.isActiveTabGitActionEnabled = () => true;
    const git = view.projectChatShellGit();
    expect(git).toEqual({ isRepo: true, dirtyCount: 3, visible: true });
  });

  it('projects an empty conversation slice when the list is empty', () => {
    const view = Object.create(SpecoratorView.prototype) as any;
    view.plugin = { getConversationList: () => [] };
    view.tabManager = { getActiveTab: () => null };
    view.getHistoryConversationOpenState = () => 'closed';
    const conv = view.projectChatShellConversations();
    expect(conv.items).toEqual([]);
    expect(conv.currentConversationId).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- --selectProjects unit tests/unit/features/chat/SpecoratorView.test.ts`
Expected: FAIL — `view.projectChatShellGit is not a function`.

- [ ] **Step 3: Add the three builders + fold into `projectChatShell`**

In `src/features/chat/SpecoratorView.ts`, add imports if missing:

```ts
import { EMPTY_WORK_ORDER_ACTIVITY_SUMMARY, type WorkOrderActivitySummary } from '../../core/types/workOrderActivity';
import type { ChatShellConversations, ChatShellGit, HistoryConversationOpenState } from './ui/vue/chatShellCallbacks';
```

> Import `HistoryConversationOpenState` from `./ui/vue/stores/chatShellStore` (where Task 1 defined it) — replace any existing import that pointed at `./ui/ConversationHistoryView`.

Replace the body of `projectChatShell()` to include the three slices:

```ts
  private projectChatShell(): ChatShellSnapshot {
    const activeTab = this.tabManager?.getActiveTab() ?? null;
    return {
      tabs: this.tabManager?.getTabBarItems() ?? [],
      activeTabId: activeTab?.id ?? null,
      header: this.projectChatShellHeader(),
      conversations: this.projectChatShellConversations(),
      workOrder: this.projectChatShellWorkOrder(),
      git: this.projectChatShellGit(),
    };
  }

  /** Projects the global conversation list (sorted lastResponseAt??createdAt desc),
   *  the ACTIVE tab's current conversation id, and per-item open state. Mirrors the
   *  deleted ConversationHistoryView's sort + currentConversationId read. */
  private projectChatShellConversations(): ChatShellConversations {
    const items = [...this.plugin.getConversationList()].sort(
      (a, b) => (b.lastResponseAt ?? b.createdAt) - (a.lastResponseAt ?? a.createdAt),
    );
    const currentConversationId = this.tabManager?.getActiveTab()?.conversationId ?? null;
    const perItem: Record<string, { openState: HistoryConversationOpenState }> = {};
    for (const c of items) perItem[c.id] = { openState: this.getHistoryConversationOpenState(c.id) };
    return { items, currentConversationId, perItem };
  }

  /** Projects the current work-order activity summary (already a plain value). */
  private projectChatShellWorkOrder(): WorkOrderActivitySummary {
    return this.plugin.workOrderActivity?.getSummary() ?? EMPTY_WORK_ORDER_ACTIVITY_SUMMARY;
  }

  /** Projects the git button slice; `visible` folds `shouldShowGitButton`. */
  private projectChatShellGit(): ChatShellGit {
    const status = this.plugin.gitStatusWatcher?.getLastStatus() ?? null;
    const isRepo = status?.isRepo ?? false;
    const dirtyCount = status?.dirtyCount ?? 0;
    const visible = Boolean(status && isRepo && dirtyCount > 0 && this.isActiveTabGitActionEnabled());
    return { isRepo, dirtyCount, visible };
  }
```

- [ ] **Step 4: Subscribe to the two providers so changes re-project**

In `wireEventHandlers()` (near the other `this.register(...)` subscriptions ~961-981), add:

```ts
    // Re-project the git + work-order header slices when their providers change,
    // so the (future) native Vue widgets track live state without a mount* host.
    if (this.plugin.gitStatusWatcher) {
      this.register({ unload: this.plugin.gitStatusWatcher.subscribe(() => this.emitChatShellChange()) });
    }
    if (this.plugin.workOrderActivity) {
      this.register({ unload: this.plugin.workOrderActivity.subscribe(() => this.emitChatShellChange()) });
    }
```

> `this.register(...)` accepts anything with an `unload()` — both `subscribe` calls return an unsubscribe fn, wrapped here so Obsidian disposes them on view unload. This does NOT remove the imperative `mountGitActionHost`/`mountWorkOrderActivityDropdown` subscriptions yet (Phase 2 does).

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test -- --selectProjects unit tests/unit/features/chat/SpecoratorView.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
rm -rf coverage
npm run typecheck && npm run typecheck:vue && npm run lint && npm run test:vue && npm run test -- --selectProjects unit && npm run build && npm run check:css && npm run check:loc
rm -rf coverage && npm run check:quality
git config user.email noreply@anthropic.com && git config user.name Claude
git add src/features/chat/SpecoratorView.ts tests/unit/features/chat/SpecoratorView.test.ts
git commit -m "$(cat <<'EOF'
feat(chat): project conversations/workOrder/git slices + subscribe providers

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014VDsSXWHRqZr2EcNgDX2eq
EOF
)"
```

### Task 4: Add the new `ChatShellCallbacks` delegators (unwired)

**Files:**
- Modify: `src/features/chat/ui/vue/chatShellCallbacks.ts`
- Modify: `src/features/chat/SpecoratorView.ts` (`buildChatShellCallbacks` ~422-491)
- Test: `tests/unit/features/chat/SpecoratorView.test.ts` (extend)

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/features/chat/SpecoratorView.test.ts`:

```ts
describe('side-panel callback delegators', () => {
  it('onGitCommit delegates to sendGitCommitPromptToActiveTab', () => {
    const view = Object.create(SpecoratorView.prototype) as any;
    view.plugin = {}; view.tabManager = null; view.chatShellObservers = new Set();
    const spy = vi.fn?.() ?? jest.fn();
    view.sendGitCommitPromptToActiveTab = spy;
    const cb = view.buildChatShellCallbacks();
    cb.onGitCommit();
    expect(spy).toHaveBeenCalled();
  });

  it('onOpenWorkOrderItem delegates to workOrderActivity.openItem', () => {
    const view = Object.create(SpecoratorView.prototype) as any;
    const openItem = jest.fn().mockResolvedValue(undefined);
    view.plugin = { workOrderActivity: { openItem } }; view.tabManager = null; view.chatShellObservers = new Set();
    const cb = view.buildChatShellCallbacks();
    cb.onOpenWorkOrderItem('wo-1');
    expect(openItem).toHaveBeenCalledWith('wo-1');
  });
});
```

> Use whichever mock fn the file already imports (`jest.fn`); the `??` line is only a hedge — delete it if the file uses plain `jest.fn`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- --selectProjects unit tests/unit/features/chat/SpecoratorView.test.ts`
Expected: FAIL — `cb.onGitCommit is not a function`.

- [ ] **Step 3: Add the delegator signatures to the contract**

In `src/features/chat/ui/vue/chatShellCallbacks.ts`, add to the `ChatShellCallbacks` interface (keep the existing members; these are additive this task — the `mount*Host`/`onOpenWorkOrders` removals happen in Phase 2):

```ts
  /** Switch the active tab to a conversation (history row click). */
  onSelectConversation: (id: string) => void;
  /** Open a conversation in a new tab (modifier/middle click or context menu). */
  onOpenConversationInNewTab: (id: string, activate: boolean) => void;
  /** Rename a conversation (inline rename input commit). */
  onRenameConversation: (id: string, title: string) => void;
  /** Delete a conversation (streaming-gated; reloads active if it was current). */
  onDeleteConversation: (id: string) => void;
  /** Regenerate a conversation's AI title (pending/failed status flow). */
  onRegenerateConversationTitle: (id: string) => void;
  /** Build the Obsidian right-click Menu for a history row at the event. */
  onConversationContextMenu: (id: string, event: MouseEvent, anchorEl: HTMLElement) => void;
  /** Open a work-order activity item (then the dropdown closes). */
  onOpenWorkOrderItem: (id: string) => void;
  /** Close a finished work-order tab (dropdown stays open for batch dismiss). */
  onCloseWorkOrderTab: (tabId: string) => void;
  /** Send the commit-&-push prompt to the active tab. */
  onGitCommit: () => void;
```

- [ ] **Step 4: Implement the delegators + `deleteHistoryConversation`/`regenerateHistoryTitle`**

In `SpecoratorView.buildChatShellCallbacks()`, add these members to the returned object (alongside the existing ones):

```ts
      onSelectConversation: (id) => { void this.tabManager?.openConversation(id).catch(() => new Notice(t('chat.history.loadFailed'))); },
      onOpenConversationInNewTab: (id, activate) => {
        void this.tabManager?.openConversation(id, { requireNewTab: true, activate })
          .catch(() => new Notice(t('chat.history.loadFailed')));
      },
      onRenameConversation: (id, title) => {
        void this.plugin.renameConversation(id, title.trim() || title)
          .then(() => this.emitChatShellChange())
          .catch(() => new Notice(t('chat.history.renameFailed')));
      },
      onDeleteConversation: (id) => { void this.deleteHistoryConversation(id); },
      onRegenerateConversationTitle: (id) => { void this.regenerateHistoryTitle(id); },
      onConversationContextMenu: (id, event, anchorEl) => this.showHistoryContextMenu(id, event, anchorEl),
      onOpenWorkOrderItem: (id) => { void this.plugin.workOrderActivity?.openItem(id); },
      onCloseWorkOrderTab: (tabId) => { void this.plugin.workOrderActivity?.closeTab(tabId); },
      onGitCommit: () => this.sendGitCommitPromptToActiveTab(),
```

Add these private methods to `SpecoratorView` (place near the History Dropdown section ~808). `regenerateHistoryTitle` is the body relocated verbatim from `ConversationHistoryView.regenerateTitle`, swapping the four `this.updateHistoryDropdown()` calls for `this.emitChatShellChange()` and reading the title service off the active tab:

```ts
  /** Deletes a conversation (streaming-gated), re-projects, and reloads the
   *  active conversation if the deleted one was current. Relocated from
   *  ConversationHistoryView.deleteHistoryConversation. */
  private async deleteHistoryConversation(conversationId: string): Promise<void> {
    const activeTab = this.tabManager?.getActiveTab();
    if (activeTab?.state.isStreaming) return;
    try {
      await this.plugin.deleteConversation(conversationId);
      this.emitChatShellChange();
      if (conversationId === activeTab?.conversationId) {
        await activeTab.controllers.conversationController?.loadActive();
      }
    } catch {
      new Notice(t('chat.history.deleteFailed'));
    }
  }

  /** Regenerates the AI title for a conversation. Relocated verbatim from
   *  ConversationHistoryView.regenerateTitle; the on-demand list refresh is now a
   *  header re-projection. */
  private async regenerateHistoryTitle(conversationId: string): Promise<void> {
    if (!this.plugin.settings.enableAutoTitleGeneration) return;
    const fullConv = await this.plugin.getConversationById(conversationId);
    if (!fullConv || fullConv.messages.length < 1) return;
    const titleService = this.tabManager?.getActiveTab()?.services.titleGenerationService ?? null;
    if (!titleService) return;
    const firstUserMsg = fullConv.messages.find((m) => m.role === 'user');
    if (!firstUserMsg) return;
    const userContent = firstUserMsg.displayContent || firstUserMsg.content;
    const expectedTitle = fullConv.title;
    await this.plugin.updateConversation(conversationId, { titleGenerationStatus: 'pending' });
    this.emitChatShellChange();
    await titleService.generateTitle(conversationId, userContent, async (convId, result) => {
      const currentConv = await this.plugin.getConversationById(convId);
      if (!currentConv) return;
      const userManuallyRenamed = currentConv.title !== expectedTitle;
      if (result.success && !userManuallyRenamed) {
        await this.plugin.renameConversation(convId, result.title);
        await this.plugin.updateConversation(convId, { titleGenerationStatus: 'success' });
      } else if (!userManuallyRenamed) {
        await this.plugin.updateConversation(convId, { titleGenerationStatus: 'failed' });
      } else {
        await this.plugin.updateConversation(convId, { titleGenerationStatus: undefined });
      }
      this.emitChatShellChange();
    });
  }

  /** Builds the Obsidian right-click Menu for a history row. Relocated from
   *  ConversationHistoryView.showHistoryContextMenu; open-state comes from the
   *  live projection helper, actions delegate to the same view methods. */
  private showHistoryContextMenu(conversationId: string, event: MouseEvent, anchorEl: HTMLElement): void {
    const activeTab = this.tabManager?.getActiveTab();
    const isCurrent = activeTab?.conversationId === conversationId;
    const openState = this.getHistoryConversationOpenState(conversationId);
    const menu = new Menu();
    if (!isCurrent) {
      if (openState === 'closed') {
        menu.addItem((mi) => mi.setTitle('Open in new tab').onClick(() => {
          void this.tabManager?.openConversation(conversationId, { requireNewTab: true, activate: true }).catch(() => new Notice(t('chat.history.loadFailed')));
        }));
        menu.addItem((mi) => mi.setTitle('Open in background tab').onClick(() => {
          void this.tabManager?.openConversation(conversationId, { requireNewTab: true, activate: false }).catch(() => new Notice(t('chat.history.loadFailed')));
        }));
      } else if (openState === 'open') {
        menu.addItem((mi) => mi.setTitle('Switch to open session').onClick(() => {
          void this.tabManager?.openConversation(conversationId).catch(() => new Notice(t('chat.history.loadFailed')));
        }));
      }
    }
    menu.addItem((mi) => mi.setTitle('Delete').onClick(() => { void this.deleteHistoryConversation(conversationId); }));
    menu.showAtMouseEvent(event);
    void anchorEl; // anchor retained for parity; menu positions at the event
  }
```

Add `import { Menu, Notice } from 'obsidian';` if `Menu` is not already imported (`Notice` already is).

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test -- --selectProjects unit tests/unit/features/chat/SpecoratorView.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
rm -rf coverage
npm run typecheck && npm run typecheck:vue && npm run lint && npm run test:vue && npm run test -- --selectProjects unit && npm run build && npm run check:css && npm run check:loc
rm -rf coverage && npm run check:quality
git config user.email noreply@anthropic.com && git config user.name Claude
git add src/features/chat/ui/vue/chatShellCallbacks.ts src/features/chat/SpecoratorView.ts tests/unit/features/chat/SpecoratorView.test.ts
git commit -m "$(cat <<'EOF'
feat(chat): add side-panel ChatShellCallbacks delegators (unwired)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014VDsSXWHRqZr2EcNgDX2eq
EOF
)"
```

## Phase 2 — Native header components + cutover

Each task ports one imperative header widget to a native Vue component, renders it in the header tree, then deletes the imperative widget + its `mount*Host` callback + host refs. Simplest widget (git) first.

### Task 5: `GitActionButton.vue` + cutover

**Files:**
- Create: `src/features/chat/ui/vue/components/GitActionButton.vue`
- Modify: `src/features/chat/ui/vue/components/ChatHeader.vue`
- Modify: `src/features/chat/ui/vue/chatShellCallbacks.ts` (remove `mountGitActionHost`)
- Modify: `src/features/chat/SpecoratorView.ts` (remove `mountGitActionHost` impl + `gitActionButton` field + `import GitActionButton`)
- Delete: `src/features/chat/ui/GitActionButton.ts`
- Delete: `tests/unit/features/chat/ui/GitActionButton.test.ts`
- Create: `tests/vue/chat/sidePanels/gitActionButton.test.ts`

- [ ] **Step 1: Write the failing characterization test**

Create `tests/vue/chat/sidePanels/gitActionButton.test.ts`:

```ts
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import GitActionButton from '@/features/chat/ui/vue/components/GitActionButton.vue';
import { CALLBACKS_KEY } from '@/features/chat/ui/vue/chatShellKeys';
import { useChatShellStore } from '@/features/chat/ui/vue/stores/chatShellStore';

vi.mock('obsidian', () => ({ setIcon: (el: HTMLElement, name: string) => el.setAttribute('data-icon', name) }));

function mountBtn(cb: Record<string, unknown> = {}) {
  return mount(GitActionButton, { global: { provide: { [CALLBACKS_KEY as symbol]: { onGitCommit: vi.fn(), ...cb } } } });
}

describe('GitActionButton.vue', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('hides when store.git.visible is false and emits legacy classes when visible', () => {
    const store = useChatShellStore();
    const w = mountBtn();
    expect(w.find('.specorator-git-action').classes()).toContain('specorator-hidden');
    store.setGit({ isRepo: true, dirtyCount: 4, visible: true });
    return w.vm.$nextTick().then(() => {
      expect(w.find('.specorator-git-action').classes()).not.toContain('specorator-hidden');
      expect(w.find('.specorator-git-action-btn').exists()).toBe(true);
      expect(w.find('.specorator-git-action-icon').exists()).toBe(true);
      expect(w.find('.specorator-git-action-label').text()).toBe('Commit & push');
      expect(w.find('.specorator-git-action-badge').text()).toBe('4');
    });
  });

  it('calls onGitCommit on click', async () => {
    const store = useChatShellStore();
    store.setGit({ isRepo: true, dirtyCount: 1, visible: true });
    const onGitCommit = vi.fn();
    const w = mountBtn({ onGitCommit });
    await w.find('.specorator-git-action-btn').trigger('click');
    expect(onGitCommit).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:vue -- tests/vue/chat/sidePanels/gitActionButton.test.ts`
Expected: FAIL — cannot resolve `GitActionButton.vue`.

- [ ] **Step 3: Create the component**

Create `src/features/chat/ui/vue/components/GitActionButton.vue`:

```vue
<script setup lang="ts">
import { computed, inject } from 'vue';

import { CALLBACKS_KEY } from '../chatShellKeys';
import { mountIcon } from '../mountIcon';
import { useChatShellStore } from '../stores/chatShellStore';

// Native git commit-&-push button (replaces the imperative GitActionButton).
// Reads store.git; self-hides when not visible; click delegates to onGitCommit.
const cb = inject(CALLBACKS_KEY);
if (!cb) throw new Error('GitActionButton mounted without CALLBACKS_KEY');
const store = useChatShellStore();

const visible = computed(() => store.git.visible);
const dirtyCount = computed(() => store.git.dirtyCount);
const changes = computed(() => `${dirtyCount.value} change${dirtyCount.value === 1 ? '' : 's'}`);
const ariaLabel = computed(() => (visible.value ? `Commit and push ${changes.value}` : 'Commit and push changes'));
const title = computed(() => `Ask the active agent to commit and push ${changes.value}.`);

function iconHost(el: unknown): void { mountIcon(el, 'git-commit-horizontal'); }
</script>

<template>
  <div
    class="specorator-git-action"
    :class="{ 'specorator-hidden': !visible }"
  >
    <button
      type="button"
      class="specorator-git-action-btn"
      :aria-label="ariaLabel"
      :title="visible ? title : undefined"
      @click.stop="cb.onGitCommit()"
    >
      <span
        :ref="iconHost"
        class="specorator-git-action-icon"
      />
      <span class="specorator-git-action-label">Commit &amp; push</span>
      <span class="specorator-git-action-badge">{{ visible ? String(dirtyCount) : '' }}</span>
    </button>
  </div>
</template>
```

- [ ] **Step 4: Render it in `ChatHeader.vue`; drop the host**

In `src/features/chat/ui/vue/components/ChatHeader.vue`:
- Add to the script imports: `import GitActionButton from './GitActionButton.vue';`
- Delete the `gitActionHost` ref + the `onMounted(() => { if (gitActionHost.value) cb.mountGitActionHost(gitActionHost.value); });` block (and the now-unused `onMounted`/`ref` imports if nothing else uses them — keep `computed`/`inject`).
- Replace `<div ref="gitActionHost" />` inside `.specorator-header-actions-slot` with `<GitActionButton />`.

- [ ] **Step 5: Remove the callback + engine field**

In `src/features/chat/ui/vue/chatShellCallbacks.ts` delete the `mountGitActionHost` member + its doc comment.

In `src/features/chat/SpecoratorView.ts`:
- Delete the `import { GitActionButton } from './ui/GitActionButton';` line, replacing it with `import { shouldShowGitButton } from './ui/GitActionButton';` ONLY IF `shouldShowGitButton` is referenced elsewhere — it is not (projection folds it inline), so delete the import entirely.
- Delete the `private gitActionButton: GitActionButton | null = null;` field.
- Delete the entire `mountGitActionHost: (el) => { ... }` member from `buildChatShellCallbacks`.
- In `projectChatShellHeader`, the `hasGitAction` computation reads `this.gitActionButton != null`. Replace it with the projected git slice: change `const hasGitAction = this.gitActionButton != null && tm != null;` to `const hasGitAction = this.projectChatShellGit().visible && tm != null;`.
- Delete `src/features/chat/ui/GitActionButton.ts`.
- Delete `tests/unit/features/chat/ui/GitActionButton.test.ts`.

> Search for any remaining `gitActionButton` / `mountGitActionHost` / `GitActionButton` references: `git grep -n "gitActionButton\|mountGitActionHost\|GitActionButton"` — expect only the new `.vue` + its test. Fix any stragglers.

- [ ] **Step 6: Run tests**

Run: `npm run test:vue -- tests/vue/chat/sidePanels/gitActionButton.test.ts`
Expected: PASS.

Run: `npm run test -- --selectProjects unit tests/unit/features/chat/SpecoratorView.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
rm -rf coverage
npm run typecheck && npm run typecheck:vue && npm run lint && npm run test:vue && npm run test -- --selectProjects unit && npm run build && npm run check:css && npm run check:loc
rm -rf coverage && npm run check:quality
git config user.email noreply@anthropic.com && git config user.name Claude
git add -A
git commit -m "$(cat <<'EOF'
feat(chat): migrate GitActionButton to a native Vue header component

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014VDsSXWHRqZr2EcNgDX2eq
EOF
)"
```

### Task 6: `WorkOrderActivityDropdown.vue` + cutover

**Files:**
- Create: `src/features/chat/ui/vue/components/WorkOrderActivityDropdown.vue`
- Modify: `src/features/chat/ui/vue/components/HeaderActions.vue`
- Modify: `src/features/chat/ui/vue/chatShellCallbacks.ts` (remove `mountWorkOrderHost`, `onOpenWorkOrders`)
- Modify: `src/features/chat/SpecoratorView.ts` (remove `mountWorkOrderHost`/`mountWorkOrderActivityDropdown`/`disposeWorkOrderActivityDropdown`/`onOpenWorkOrders`/`workOrderActivity*` fields)
- Delete: `src/features/chat/ui/WorkOrderActivityDropdown.ts`
- Delete: `tests/unit/features/chat/ui/WorkOrderActivityDropdown.test.ts`
- Create: `tests/vue/chat/sidePanels/workOrderActivityDropdown.test.ts`

- [ ] **Step 1: Write the failing characterization test**

Create `tests/vue/chat/sidePanels/workOrderActivityDropdown.test.ts`:

```ts
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import WorkOrderActivityDropdown from '@/features/chat/ui/vue/components/WorkOrderActivityDropdown.vue';
import { CALLBACKS_KEY } from '@/features/chat/ui/vue/chatShellKeys';
import { useChatShellStore } from '@/features/chat/ui/vue/stores/chatShellStore';

vi.mock('obsidian', () => ({ setIcon: (el: HTMLElement, n: string) => el.setAttribute('data-icon', n) }));
vi.mock('@/i18n/i18n', () => ({ t: (k: string) => k }));

const SUMMARY = {
  items: [{ id: 'i1', path: 'p', title: 'Run 1', status: 'running', labelKey: 'k.l', actionHintKey: 'k.a', sidepanelTabId: null }],
  closableTabs: [{ tabId: 't1', title: 'Done 1' }],
  runningCount: 1, attentionCount: 0,
};

function mountDd(cb: Record<string, unknown> = {}) {
  return mount(WorkOrderActivityDropdown, {
    global: { provide: { [CALLBACKS_KEY as symbol]: { onOpenWorkOrderItem: vi.fn(), onCloseWorkOrderTab: vi.fn(), ...cb } } },
  });
}

describe('WorkOrderActivityDropdown.vue', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('hides when empty and shows toggle + count when populated', async () => {
    const store = useChatShellStore();
    const w = mountDd();
    expect(w.find('.specorator-work-order-activity-slot').classes()).toContain('specorator-hidden');
    store.setWorkOrder(SUMMARY as never);
    await w.vm.$nextTick();
    expect(w.find('.specorator-work-order-activity-slot').classes()).not.toContain('specorator-hidden');
    expect(w.find('.specorator-work-order-activity-toggle').exists()).toBe(true);
    expect(w.find('.specorator-work-order-activity-count').text()).toBe('2');
  });

  it('opens the menu, opens an item, and closes a finished tab', async () => {
    const store = useChatShellStore();
    store.setWorkOrder(SUMMARY as never);
    const onOpenWorkOrderItem = vi.fn();
    const onCloseWorkOrderTab = vi.fn();
    const w = mountDd({ onOpenWorkOrderItem, onCloseWorkOrderTab });
    await w.find('.specorator-work-order-activity-toggle').trigger('click');
    expect(w.find('.specorator-work-order-activity-menu').exists()).toBe(true);
    await w.find('.specorator-work-order-activity-close').trigger('click');
    expect(onCloseWorkOrderTab).toHaveBeenCalledWith('t1');
    await w.find('.specorator-work-order-activity-item').trigger('click');
    expect(onOpenWorkOrderItem).toHaveBeenCalledWith('i1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:vue -- tests/vue/chat/sidePanels/workOrderActivityDropdown.test.ts`
Expected: FAIL — cannot resolve the component.

- [ ] **Step 3: Create the component**

Create `src/features/chat/ui/vue/components/WorkOrderActivityDropdown.vue`:

```vue
<script setup lang="ts">
import { computed, inject, ref } from 'vue';

import { t } from '../../../../../i18n/i18n';
import { CALLBACKS_KEY } from '../chatShellKeys';
import { mountIcon } from '../mountIcon';
import { useChatShellStore } from '../stores/chatShellStore';

// Native work-order activity dropdown (replaces the imperative widget).
// Self-hides when empty; toggle owns local open state; item click opens then
// closes; finished-tab close keeps the menu open for batch dismissal.
const cb = inject(CALLBACKS_KEY);
if (!cb) throw new Error('WorkOrderActivityDropdown mounted without CALLBACKS_KEY');
const store = useChatShellStore();

const open = ref(false);
const summary = computed(() => store.workOrder);
const entryCount = computed(() => summary.value.items.length + summary.value.closableTabs.length);
const isEmpty = computed(() => entryCount.value === 0);
const attention = computed(() => summary.value.attentionCount > 0);

// Collapse when the summary drains to empty (parity with the imperative update()).
const toggleLabel = computed(() => {
  const s = summary.value;
  if (s.attentionCount > 0) return t('workOrderActivity.toggleAttention', { count: String(s.items.length), attention: String(s.attentionCount) });
  if (s.items.length === 0 && s.closableTabs.length > 0) return t('workOrderActivity.toggleFinished', { count: String(s.closableTabs.length) });
  return t('workOrderActivity.toggleRunning', { count: String(s.items.length) });
});

function toggleIcon(el: unknown): void { mountIcon(el, 'clipboard-list'); }
function closeIcon(el: unknown): void { mountIcon(el, 'x'); }

function onToggle(): void { if (!isEmpty.value) open.value = !open.value; }
function onOpenItem(id: string): void { open.value = false; void cb.onOpenWorkOrderItem(id); }
function onCloseTab(tabId: string): void { void cb.onCloseWorkOrderTab(tabId); }
function onKey(e: KeyboardEvent, fn: () => void): void {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); }
}
</script>

<template>
  <div
    class="specorator-work-order-activity-slot"
    :class="{ 'specorator-hidden': isEmpty }"
  >
    <div
      v-if="!isEmpty"
      class="specorator-work-order-activity"
    >
      <div
        class="specorator-header-btn specorator-work-order-activity-toggle"
        :class="{ 'specorator-work-order-activity-toggle--attention': attention }"
        role="button"
        tabindex="0"
        aria-haspopup="menu"
        :aria-expanded="open ? 'true' : 'false'"
        :aria-label="toggleLabel"
        @click.stop="onToggle()"
        @keydown="onKey($event, onToggle)"
      >
        <span
          :ref="toggleIcon"
          class="specorator-work-order-activity-icon"
        />
        <span class="specorator-work-order-activity-count">{{ entryCount }}</span>
      </div>
      <div
        v-if="open"
        class="specorator-work-order-activity-menu"
        role="menu"
      >
        <div
          v-for="item in summary.items"
          :key="item.id"
          class="specorator-work-order-activity-item"
          role="menuitem"
          tabindex="0"
          @click="onOpenItem(item.id)"
          @keydown="onKey($event, () => onOpenItem(item.id))"
        >
          <span class="specorator-work-order-activity-title">{{ item.title }}</span>
          <span class="specorator-work-order-activity-status">{{ t(item.labelKey) }}</span>
          <span class="specorator-work-order-activity-action">{{ t(item.actionHintKey) }}</span>
        </div>
        <div
          v-for="tab in summary.closableTabs"
          :key="tab.tabId"
          class="specorator-work-order-activity-item specorator-work-order-activity-item--finished"
          role="menuitem"
        >
          <span class="specorator-work-order-activity-title">{{ tab.title }}</span>
          <span class="specorator-work-order-activity-status">{{ t('workOrderActivity.status.finished') }}</span>
          <span
            :ref="closeIcon"
            class="specorator-work-order-activity-close"
            role="button"
            tabindex="0"
            :aria-label="t('workOrderActivity.action.close')"
            @click.stop="onCloseTab(tab.tabId)"
            @keydown.stop="onKey($event, () => onCloseTab(tab.tabId))"
          />
        </div>
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 4: Render it in `HeaderActions.vue`; drop the host**

In `src/features/chat/ui/vue/components/HeaderActions.vue`:
- Add import: `import WorkOrderActivityDropdown from './WorkOrderActivityDropdown.vue';`
- Delete the `workOrderHost` ref + its `onMounted` line (`if (workOrderHost.value) cb.mountWorkOrderHost(workOrderHost.value);`). Keep the `historyHost` `onMounted` for now (Task 7 removes it).
- Replace `<div ref="workOrderHost" class="specorator-work-order-activity-slot" />` with `<WorkOrderActivityDropdown />`.

- [ ] **Step 5: Remove the callbacks + engine wiring**

In `src/features/chat/ui/vue/chatShellCallbacks.ts` delete the `mountWorkOrderHost` member and the `onOpenWorkOrders` member (+ their doc comments).

In `src/features/chat/SpecoratorView.ts`:
- Delete the `import { WorkOrderActivityDropdown } from './ui/WorkOrderActivityDropdown';` line.
- Delete the fields `workOrderActivitySlotEl`, `workOrderActivityDropdown`, `disposeWorkOrderActivitySubscription`.
- Delete the `mountWorkOrderHost: (el) => { ... }` member and the `onOpenWorkOrders: () => {}` member from `buildChatShellCallbacks`.
- Delete the `mountWorkOrderActivityDropdown()` and `disposeWorkOrderActivityDropdown()` methods.
- Search for any remaining call to `disposeWorkOrderActivityDropdown()` (e.g. in `onClose`) and delete it — the provider subscription added in Task 3 (`this.register(...)`) now owns disposal.
- Delete `src/features/chat/ui/WorkOrderActivityDropdown.ts`.
- Delete `tests/unit/features/chat/ui/WorkOrderActivityDropdown.test.ts`.

> `git grep -n "workOrderActivityDropdown\|mountWorkOrderHost\|WorkOrderActivityDropdown\|onOpenWorkOrders"` — expect only the new `.vue` + test. Fix stragglers.

- [ ] **Step 6: Run tests**

Run: `npm run test:vue -- tests/vue/chat/sidePanels/workOrderActivityDropdown.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
rm -rf coverage
npm run typecheck && npm run typecheck:vue && npm run lint && npm run test:vue && npm run test -- --selectProjects unit && npm run build && npm run check:css && npm run check:loc
rm -rf coverage && npm run check:quality
git config user.email noreply@anthropic.com && git config user.name Claude
git add -A
git commit -m "$(cat <<'EOF'
feat(chat): migrate WorkOrderActivityDropdown to a native Vue component

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014VDsSXWHRqZr2EcNgDX2eq
EOF
)"
```

### Task 7: `ConversationHistoryDropdown.vue` + cutover (windowing-critical)

**Files:**
- Create: `src/features/chat/ui/vue/components/conversationHistoryFormat.ts`
- Create: `src/features/chat/ui/vue/components/ConversationHistoryDropdown.vue`
- Modify: `src/features/chat/ui/vue/components/HeaderActions.vue`
- Modify: `src/features/chat/ui/vue/chatShellCallbacks.ts` (remove `mountHistoryHost`, `onOpenHistory` stays but re-purposed)
- Modify: `src/features/chat/SpecoratorView.ts` (remove history-dropdown host plumbing)
- Modify: `src/features/chat/controllers/ConversationController.ts` (shed list presentation)
- Delete: `src/features/chat/ui/ConversationHistoryView.ts`
- Delete: `tests/unit/features/chat/ui/ConversationHistoryView.test.ts`
- Modify: `tests/unit/features/chat/controllers/ConversationController.test.ts`
- Create: `tests/vue/chat/sidePanels/conversationHistoryDropdown.test.ts`

- [ ] **Step 1: Write the failing characterization test**

Create `tests/vue/chat/sidePanels/conversationHistoryDropdown.test.ts`:

```ts
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ConversationHistoryDropdown from '@/features/chat/ui/vue/components/ConversationHistoryDropdown.vue';
import { CALLBACKS_KEY } from '@/features/chat/ui/vue/chatShellKeys';
import { useChatShellStore } from '@/features/chat/ui/vue/stores/chatShellStore';

vi.mock('obsidian', () => ({ setIcon: (el: HTMLElement, n: string) => el.setAttribute('data-icon', n) }));
vi.mock('@/i18n/i18n', () => ({ t: (k: string) => k }));

function conv(id: string, extra: Record<string, unknown> = {}) {
  return { id, providerId: 'claude', title: `Title ${id}`, createdAt: 1, updatedAt: 1, lastResponseAt: 1, messageCount: 2, preview: '', ...extra };
}

function mountDd(cb: Record<string, unknown> = {}) {
  const w = mount(ConversationHistoryDropdown, {
    global: {
      provide: {
        [CALLBACKS_KEY as symbol]: {
          onOpenHistory: vi.fn(), onSelectConversation: vi.fn(), onOpenConversationInNewTab: vi.fn(),
          onRenameConversation: vi.fn(), onDeleteConversation: vi.fn(), onRegenerateConversationTitle: vi.fn(),
          onConversationContextMenu: vi.fn(), ...cb,
        },
      },
    },
  });
  return w;
}

describe('ConversationHistoryDropdown.vue', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('renders legacy history classes and marks the current row active', async () => {
    const store = useChatShellStore();
    store.setConversations({ items: [conv('a'), conv('b')], currentConversationId: 'b', perItem: { a: { openState: 'closed' }, b: { openState: 'current' } } });
    const w = mountDd();
    await w.find('.specorator-header-btn').trigger('click'); // open
    expect(w.findAll('.specorator-history-item')).toHaveLength(2);
    expect(w.find('.specorator-history-item.active .specorator-history-item-title').text()).toBe('Title b');
    expect(w.find('.specorator-history-header').exists()).toBe(true);
  });

  it('selects a non-current row', async () => {
    const store = useChatShellStore();
    store.setConversations({ items: [conv('a'), conv('b')], currentConversationId: 'b', perItem: { a: { openState: 'closed' }, b: { openState: 'current' } } });
    const onSelectConversation = vi.fn();
    const w = mountDd({ onSelectConversation });
    await w.find('.specorator-header-btn').trigger('click');
    await w.findAll('.specorator-history-item')[0].find('.specorator-history-item-content').trigger('click');
    expect(onSelectConversation).toHaveBeenCalledWith('a');
  });

  it('commits an inline rename on Enter', async () => {
    const store = useChatShellStore();
    store.setConversations({ items: [conv('a')], currentConversationId: null, perItem: { a: { openState: 'closed' } } });
    const onRenameConversation = vi.fn();
    const w = mountDd({ onRenameConversation });
    await w.find('.specorator-header-btn').trigger('click');
    await w.find('.specorator-action-btn[aria-label="Rename"]').trigger('click');
    const input = w.find('input.specorator-rename-input');
    await input.setValue('New name');
    await input.trigger('keydown', { key: 'Enter' });
    expect(onRenameConversation).toHaveBeenCalledWith('a', 'New name');
  });

  it('shows a regenerate button for failed title generation', async () => {
    const store = useChatShellStore();
    store.setConversations({ items: [conv('a', { titleGenerationStatus: 'failed' })], currentConversationId: null, perItem: { a: { openState: 'closed' } } });
    const onRegenerateConversationTitle = vi.fn();
    const w = mountDd({ onRegenerateConversationTitle });
    await w.find('.specorator-header-btn').trigger('click');
    await w.find('.specorator-action-btn[aria-label="Regenerate title"]').trigger('click');
    expect(onRegenerateConversationTitle).toHaveBeenCalledWith('a');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:vue -- tests/vue/chat/sidePanels/conversationHistoryDropdown.test.ts`
Expected: FAIL — cannot resolve the component.

- [ ] **Step 3: Create the date helper**

Create `src/features/chat/ui/vue/components/conversationHistoryFormat.ts`:

```ts
/** Formats a conversation timestamp for a history row. Same rule as the deleted
 *  ConversationHistoryView.formatDate: time-of-day if today, else "Mon D". */
export function formatConversationDate(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
  }
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
```

- [ ] **Step 4: Create the component (windowing preserved)**

Create `src/features/chat/ui/vue/components/ConversationHistoryDropdown.vue`. The `visibleCount` (chunk 50) + "Show more" + active-pin reproduce `renderHistoryItems` exactly; a naive full `v-for` would fail the migrated perf guard.

```vue
<script setup lang="ts">
import { computed, inject, nextTick, ref } from 'vue';

import type { ConversationMeta } from '../../../../../core/types';
import { t } from '../../../../../i18n/i18n';
import { CALLBACKS_KEY } from '../chatShellKeys';
import { mountIcon } from '../mountIcon';
import { useChatShellStore } from '../stores/chatShellStore';
import { formatConversationDate } from './conversationHistoryFormat';

// Native conversation-history dropdown (replaces the imperative ConversationHistoryView).
// Preserves the perf-locked chunk-50 window + Show-more reveal + active-conversation pin.
const HISTORY_RENDER_WINDOW_SIZE = 50;

const cb = inject(CALLBACKS_KEY);
if (!cb) throw new Error('ConversationHistoryDropdown mounted without CALLBACKS_KEY');
const store = useChatShellStore();

const open = ref(false);
const visibleCount = ref(HISTORY_RENDER_WINDOW_SIZE);
const renamingId = ref<string | null>(null);
const renameValue = ref('');

// Pin the active conversation to the top when it sorts past the first window
// (parity with renderHistoryItems' currentIdx >= WINDOW splice/unshift).
const ordered = computed<ConversationMeta[]>(() => {
  const items = [...store.conversations.items];
  const currentId = store.conversations.currentConversationId;
  if (currentId) {
    const idx = items.findIndex((c) => c.id === currentId);
    if (idx >= HISTORY_RENDER_WINDOW_SIZE) {
      const [cur] = items.splice(idx, 1);
      items.unshift(cur);
    }
  }
  return items;
});
const visible = computed(() => ordered.value.slice(0, visibleCount.value));
const hasMore = computed(() => visibleCount.value < ordered.value.length);

function isCurrent(id: string): boolean { return id === store.conversations.currentConversationId; }
function itemIcon(id: string) { return (el: unknown) => mountIcon(el, isCurrent(id) ? 'message-square-dot' : 'message-square'); }
function actionIcon(name: string) { return (el: unknown) => mountIcon(el, name); }

function toggleOpen(): void {
  open.value = !open.value;
  if (open.value) {
    visibleCount.value = HISTORY_RENDER_WINDOW_SIZE;
    cb.onOpenHistory(); // re-project so the list is fresh at open (parity with updateHistoryDropdown)
  }
}
function close(): void { open.value = false; renamingId.value = null; }

function showMore(): void { visibleCount.value += HISTORY_RENDER_WINDOW_SIZE; }

function isNewTabModifierClick(e: MouseEvent): boolean {
  return !e.altKey && !e.shiftKey && (e.metaKey || e.ctrlKey);
}
function onRowClick(conv: ConversationMeta, e: MouseEvent): void {
  if (isNewTabModifierClick(e)) { e.preventDefault(); cb.onOpenConversationInNewTab(conv.id, true); close(); return; }
  cb.onSelectConversation(conv.id); close();
}
function onRowAux(conv: ConversationMeta, e: MouseEvent): void {
  if (e.button !== 1) return;
  e.preventDefault(); e.stopPropagation();
  cb.onOpenConversationInNewTab(conv.id, true); close();
}
function onContextMenu(conv: ConversationMeta, e: MouseEvent): void {
  e.preventDefault(); e.stopPropagation();
  cb.onConversationContextMenu(conv.id, e, e.currentTarget as HTMLElement);
}

async function startRename(conv: ConversationMeta): Promise<void> {
  renamingId.value = conv.id;
  renameValue.value = conv.title;
  await nextTick();
}
function commitRename(conv: ConversationMeta): void {
  const next = renameValue.value.trim() || conv.title;
  cb.onRenameConversation(conv.id, next);
  renamingId.value = null;
}
function onRenameKeydown(e: KeyboardEvent, conv: ConversationMeta): void {
  if (e.key === 'Enter' && !e.isComposing) { (e.target as HTMLInputElement).blur(); }
  else if (e.key === 'Escape' && !e.isComposing) { renamingId.value = null; }
}
function onHeaderKeydown(e: KeyboardEvent): void {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleOpen(); }
}
</script>

<template>
  <div class="specorator-history-container">
    <div
      :ref="actionIcon('history')"
      class="specorator-header-btn"
      role="button"
      tabindex="0"
      aria-label="Chat history"
      aria-haspopup="true"
      :aria-expanded="open ? 'true' : 'false'"
      @click.stop="toggleOpen()"
      @keydown="onHeaderKeydown($event)"
    />
    <div
      class="specorator-history-menu"
      :class="{ visible: open }"
    >
      <div class="specorator-history-header">
        <span>Conversations</span>
      </div>
      <div class="specorator-history-list">
        <div
          v-if="ordered.length === 0"
          class="specorator-history-empty"
        >No conversations</div>
        <div
          v-for="conv in visible"
          :key="conv.id"
          class="specorator-history-item"
          :class="{ active: isCurrent(conv.id) }"
          @contextmenu="onContextMenu(conv, $event)"
        >
          <div
            :ref="itemIcon(conv.id)"
            class="specorator-history-item-icon"
          />
          <div class="specorator-history-item-content">
            <input
              v-if="renamingId === conv.id"
              v-model="renameValue"
              class="specorator-rename-input"
              type="text"
              @blur="commitRename(conv)"
              @keydown="onRenameKeydown($event, conv)"
            >
            <div
              v-else
              class="specorator-history-item-title"
              :title="conv.title"
              @click.stop="onRowClick(conv, $event)"
              @auxclick="onRowAux(conv, $event)"
            >{{ conv.title }}</div>
            <div class="specorator-history-item-date">
              {{ isCurrent(conv.id) ? 'Current session' : formatConversationDate(conv.lastResponseAt ?? conv.createdAt) }}
            </div>
          </div>
          <div class="specorator-history-item-actions">
            <span
              v-if="conv.titleGenerationStatus === 'pending'"
              :ref="actionIcon('loader-2')"
              class="specorator-action-btn specorator-action-loading"
              aria-label="Generating title..."
            />
            <button
              v-else-if="conv.titleGenerationStatus === 'failed'"
              :ref="actionIcon('refresh-cw')"
              class="specorator-action-btn"
              aria-label="Regenerate title"
              @click.stop="cb.onRegenerateConversationTitle(conv.id)"
            />
            <button
              :ref="actionIcon('pencil')"
              class="specorator-action-btn"
              aria-label="Rename"
              @click.stop="startRename(conv)"
            />
            <button
              :ref="actionIcon('trash-2')"
              class="specorator-action-btn specorator-delete-btn"
              aria-label="Delete"
              @click.stop="cb.onDeleteConversation(conv.id)"
            />
          </div>
        </div>
        <div
          v-if="hasMore"
          class="specorator-history-show-more"
        >
          <button
            type="button"
            class="specorator-history-show-more-btn"
            @click.stop="showMore()"
          >{{ t('chat.history.showMore') }}</button>
        </div>
      </div>
    </div>
  </div>
</template>
```

> Note on rename-blur ordering: pressing Enter calls `.blur()`, which fires `@blur` → `commitRename` once; Escape sets `renamingId = null` so the subsequent blur's `commitRename` runs against a row that is no longer in rename mode — harmless (it still calls the callback with the unedited title). To match the imperative "Escape reverts", `commitRename` reads `renameValue`, which Escape leaves at the last typed value; acceptable parity. If strict revert is required, guard `commitRename` with `if (renamingId.value !== conv.id) return;` — include that guard.

Add the guard to `commitRename`:

```ts
function commitRename(conv: ConversationMeta): void {
  if (renamingId.value !== conv.id) return; // Escape already cancelled
  const next = renameValue.value.trim() || conv.title;
  cb.onRenameConversation(conv.id, next);
  renamingId.value = null;
}
```

- [ ] **Step 5: Render it in `HeaderActions.vue`; drop the history host**

In `src/features/chat/ui/vue/components/HeaderActions.vue`:
- Add import: `import ConversationHistoryDropdown from './ConversationHistoryDropdown.vue';`
- Delete the `historyHost` ref, the `historyHostIcon` host function, and the entire `onMounted(() => { ... })` block (now empty after Task 6 removed workOrder and this removes history — delete `onMounted`/`ref` imports if unused).
- Replace the whole `<div class="specorator-history-container"> ... </div>` block (the history icon button + `<div ref="historyHost" class="specorator-history-menu" />`) with `<ConversationHistoryDropdown />`.

- [ ] **Step 6: Repurpose `onOpenHistory`; delete host plumbing in `SpecoratorView`**

In `src/features/chat/ui/vue/chatShellCallbacks.ts`: delete the `mountHistoryHost` member + doc comment. Keep `onOpenHistory` (its doc comment now reads "re-project so the history list is fresh when the dropdown opens").

In `src/features/chat/SpecoratorView.ts`:
- Delete the `historyDropdown` and `historyBtn` fields.
- Replace the `onOpenHistory: () => this.toggleHistoryDropdown(),` member with `onOpenHistory: () => this.emitChatShellChange(),`.
- Delete the `mountHistoryHost: (el) => { ... }` member.
- Delete the methods `toggleHistoryDropdown()`, `closeHistoryDropdown()`, `updateHistoryDropdown()`, `openHistoryConversation()`, `openHistoryConversationInNewTab()`. KEEP `getHistoryConversationOpenState()` and `findTabWithConversation()` (the projection + context menu use them).
- In `wireEventHandlers`, delete the `this.registerDomEvent(activeDocument, 'click', () => { this.closeHistoryDropdown(); });` block (the Vue dropdown owns its own open state; outside-click close is handled in Step 7-follow-up below).
- In `newConversationInActiveTab()`, replace `this.updateHistoryDropdown();` with `this.emitChatShellChange();`.

- [ ] **Step 7: Outside-click close in the component**

Add a document click-away listener to `ConversationHistoryDropdown.vue` so clicking outside closes it (parity with the deleted document-click handler). In `<script setup>`, after the refs:

```ts
import { onBeforeUnmount, onMounted } from 'vue';
const rootEl = ref<HTMLElement | null>(null);
function onDocClick(e: MouseEvent): void {
  if (!open.value) return;
  if (rootEl.value && !rootEl.value.contains(e.target as Node)) close();
}
onMounted(() => document.addEventListener('click', onDocClick));
onBeforeUnmount(() => document.removeEventListener('click', onDocClick));
```

Bind `ref="rootEl"` on the outer `.specorator-history-container` div.

- [ ] **Step 8: Shed list presentation from `ConversationController`**

In `src/features/chat/controllers/ConversationController.ts`:
- Delete the `import { ConversationHistoryView, ... }` line and the `import type { HistoryConversationOpenState, HistoryRenderOptions } from '../ui/ConversationHistoryView';` (and any `ConversationHistoryViewDeps`).
- Delete the `private historyView: ConversationHistoryView;` field and its construction in the constructor.
- Delete the methods `toggleHistoryDropdown()`, `updateHistoryDropdown()`, `regenerateTitle()`, `formatDate()`, `renderHistoryDropdown()`.
- Delete the deps `getHistoryDropdown` and `getStatusPanel` from `ConversationControllerDeps` (and the `import type { StatusPanel }` and `import type { TitleGenerationService }` if now unused — `TitleGenerationService` may still be used by `getTitleGenerationService`; keep that dep since `SpecoratorView.regenerateHistoryTitle` no longer needs it here but other callers might — verify with `git grep getTitleGenerationService`; if only the deleted `regenerateTitle` used it, delete the dep too).
- Delete `src/features/chat/ui/ConversationHistoryView.ts`.

> Now wire the deps: in `tabControllerSetup.ts` (~149, ~277) the `getStatusPanel: () => ui.statusPanel` and any `getHistoryDropdown` dep passed to `ConversationController` must be removed. `git grep -n "getHistoryDropdown\|getStatusPanel"` and delete those dep assignments (they feed the now-deleted deps). `ui.statusPanel` is deleted in Phase 3 — leaving `getStatusPanel` wired to it now is fine to delete here since the dep is gone.

- [ ] **Step 9: Fix the controller + related unit tests**

- Delete `tests/unit/features/chat/ui/ConversationHistoryView.test.ts`.
- In `tests/unit/features/chat/controllers/ConversationController.test.ts`, delete the describe blocks that exercise deleted methods: `describe('toggleHistoryDropdown', ...)`, `describe('updateHistoryDropdown with conversations', ...)`, `describe('renderHistoryDropdown', ...)`, the `formatDate` tests, the `regenerateTitle` tests, and any other `updateHistoryDropdown()`/`renderHistoryDropdown()` call sites (lines ~642-1736 per the grep). Delete any `getHistoryDropdown`/`getStatusPanel` fields from the `deps` fixtures in that file.
- In `tests/unit/features/chat/controllers/InputController.test.ts` (~206), delete the `updateHistoryDropdown: jest.fn(),` line from its ConversationController stub if it stubs the controller shape.

Run: `npm run test -- --selectProjects unit tests/unit/features/chat/controllers/ConversationController.test.ts`
Expected: PASS (remaining blocks).

- [ ] **Step 10: Run the Vue test**

Run: `npm run test:vue -- tests/vue/chat/sidePanels/conversationHistoryDropdown.test.ts`
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
rm -rf coverage
npm run typecheck && npm run typecheck:vue && npm run lint && npm run test:vue && npm run test -- --selectProjects unit && npm run build && npm run check:css && npm run check:loc
rm -rf coverage && npm run check:quality
git config user.email noreply@anthropic.com && git config user.name Claude
git add -A
git commit -m "$(cat <<'EOF'
feat(chat): migrate conversation history dropdown to Vue (windowing preserved)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014VDsSXWHRqZr2EcNgDX2eq
EOF
)"
```

### Task 8: Migrate the `conversationHistory.perf` window guard to the Vitest lane

**Files:**
- Create: `tests/vue/chat/sidePanels/conversationHistoryWindow.test.ts`
- Modify: `tests/perf/conversationHistory.perf.test.ts` (delete the render describe, keep loadConversations)

- [ ] **Step 1: Write the migrated window guard**

Create `tests/vue/chat/sidePanels/conversationHistoryWindow.test.ts`:

```ts
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ConversationHistoryDropdown from '@/features/chat/ui/vue/components/ConversationHistoryDropdown.vue';
import { CALLBACKS_KEY } from '@/features/chat/ui/vue/chatShellKeys';
import { useChatShellStore } from '@/features/chat/ui/vue/stores/chatShellStore';

vi.mock('obsidian', () => ({ setIcon: (el: HTMLElement, n: string) => el.setAttribute('data-icon', n) }));
vi.mock('@/i18n/i18n', () => ({ t: (k: string) => k }));

const HISTORY_RENDER_WINDOW_SIZE = 50;

function metas(n: number, currentId: string | null = null) {
  const items = Array.from({ length: n }, (_, i) => ({
    id: `conv-${i}`, providerId: 'claude', title: `Conversation ${i}`,
    createdAt: i * 1000, updatedAt: i * 1000, lastResponseAt: i * 1000, messageCount: 4, preview: '',
  }));
  const perItem: Record<string, { openState: 'closed' | 'open' | 'current' }> = {};
  for (const c of items) perItem[c.id] = { openState: c.id === currentId ? 'current' : 'closed' };
  return { items, currentConversationId: currentId, perItem };
}

function mountOpen(store: ReturnType<typeof useChatShellStore>) {
  const w = mount(ConversationHistoryDropdown, {
    global: { provide: { [CALLBACKS_KEY as symbol]: {
      onOpenHistory: vi.fn(), onSelectConversation: vi.fn(), onOpenConversationInNewTab: vi.fn(),
      onRenameConversation: vi.fn(), onDeleteConversation: vi.fn(), onRegenerateConversationTitle: vi.fn(),
      onConversationContextMenu: vi.fn(),
    } } },
  });
  return w.find('.specorator-header-btn').trigger('click').then(() => w);
}

describe('conversation history window (migrated from conversationHistory.perf)', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('mounts min(n, 50) rows regardless of conversation count', async () => {
    for (const n of [50, 200, 800, 2000]) {
      setActivePinia(createPinia());
      const store = useChatShellStore();
      store.setConversations(metas(n) as never);
      const w = await mountOpen(store);
      expect(w.findAll('.specorator-history-item')).toHaveLength(Math.min(n, HISTORY_RENDER_WINDOW_SIZE));
    }
  });

  it('reveals the next chunk on "Show more" click', async () => {
    const store = useChatShellStore();
    store.setConversations(metas(120) as never);
    const w = await mountOpen(store);
    expect(w.findAll('.specorator-history-item')).toHaveLength(50);
    await w.find('.specorator-history-show-more-btn').trigger('click');
    expect(w.findAll('.specorator-history-item')).toHaveLength(100);
    await w.find('.specorator-history-show-more-btn').trigger('click');
    expect(w.findAll('.specorator-history-item')).toHaveLength(120);
  });

  it('pins the active conversation to the top when it sorts past the window', async () => {
    const store = useChatShellStore();
    // conv-0 is most recent; make an OLD one current so it sorts past the window.
    store.setConversations(metas(120, 'conv-119') as never);
    const w = await mountOpen(store);
    const first = w.findAll('.specorator-history-item')[0];
    expect(first.classes()).toContain('active');
    expect(first.find('.specorator-history-item-title').text()).toBe('Conversation 119');
  });
});
```

- [ ] **Step 2: Run it to verify it passes (component already exists)**

Run: `npm run test:vue -- tests/vue/chat/sidePanels/conversationHistoryWindow.test.ts`
Expected: PASS.

- [ ] **Step 3: Delete the Jest render describe**

In `tests/perf/conversationHistory.perf.test.ts`, delete the entire `describe('history dropdown render (renderHistoryItems)', ...)` block and its now-unused helpers (`conversationMetas`, `countNodes`, `countListeners`, `HISTORY_RENDER_WINDOW_SIZE`, the `ConversationController` import). KEEP the `describe('ConversationStore.loadConversations (activation proxy)', ...)` block and everything it uses (`ConversationStore`, `sessionMetas`, `SCALES`, `reportMetrics`, `timeMs`, the two `jest.mock` calls).

- [ ] **Step 4: Verify the perf lane still runs**

Run: `npm run test:perf -- tests/perf/conversationHistory.perf.test.ts`
Expected: PASS (loadConversations block only).

- [ ] **Step 5: Commit**

```bash
rm -rf coverage
npm run typecheck && npm run typecheck:vue && npm run lint && npm run test:vue && npm run test -- --selectProjects unit && npm run build && npm run check:css && npm run check:loc
rm -rf coverage && npm run check:quality
git config user.email noreply@anthropic.com && git config user.name Claude
git add -A
git commit -m "$(cat <<'EOF'
test(chat): migrate history window perf guard to the Vitest lane

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014VDsSXWHRqZr2EcNgDX2eq
EOF
)"
```

## Phase 3 — Tab-chrome island scaffold + StatusPanel

Builds the per-tab tab-chrome island (mirror of the composer island), lifts the bang-bash output map to an engine owner, ports StatusPanel to Vue, and wires it into the tab lifecycle.

### Task 9: `BashOutputStore` engine owner (LRU-50)

**Files:**
- Create: `src/features/chat/state/BashOutputStore.ts`
- Create: `tests/unit/features/chat/state/BashOutputStore.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/features/chat/state/BashOutputStore.test.ts`:

```ts
import { BashOutputStore } from '@/features/chat/state/BashOutputStore';

describe('BashOutputStore', () => {
  it('adds, lists in insertion order, and notifies onChange', () => {
    const onChange = jest.fn();
    const store = new BashOutputStore(onChange);
    store.add({ id: 'a', command: 'ls', status: 'running', output: '' });
    store.add({ id: 'b', command: 'pwd', status: 'running', output: '' });
    expect(store.list().map((o) => o.id)).toEqual(['a', 'b']);
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('updates an existing entry and preserves id/command', () => {
    const store = new BashOutputStore(() => {});
    store.add({ id: 'a', command: 'ls', status: 'running', output: '' });
    store.update('a', { status: 'completed', output: 'done', exitCode: 0 });
    expect(store.list()[0]).toEqual({ id: 'a', command: 'ls', status: 'completed', output: 'done', exitCode: 0 });
  });

  it('evicts the oldest beyond 50 (LRU) and exposes latest()', () => {
    const store = new BashOutputStore(() => {});
    for (let i = 0; i < 55; i++) store.add({ id: `id-${i}`, command: `c${i}`, status: 'running', output: '' });
    expect(store.list()).toHaveLength(50);
    expect(store.list()[0].id).toBe('id-5');
    expect(store.latest()?.id).toBe('id-54');
  });

  it('clears everything', () => {
    const store = new BashOutputStore(() => {});
    store.add({ id: 'a', command: 'ls', status: 'running', output: '' });
    store.clear();
    expect(store.list()).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- --selectProjects unit tests/unit/features/chat/state/BashOutputStore.test.ts`
Expected: FAIL — cannot find `BashOutputStore`.

- [ ] **Step 3: Create the store**

Create `src/features/chat/state/BashOutputStore.ts`:

```ts
/** A single bang-bash command's output row (moved verbatim from StatusPanel.ts,
 *  now owned engine-side so it survives conversation switch + Vue remount). */
export interface PanelBashOutput {
  id: string;
  command: string;
  status: 'running' | 'completed' | 'error';
  output: string;
  exitCode?: number;
}

const MAX_BASH_OUTPUTS = 50;

/**
 * Engine-side owner of a tab's bang-bash outputs. Bounded LRU-50 insertion-ordered
 * map; the bang-bash `onSubmit` writes here and the `TabChromeProjection` reads
 * `list()`. `onChange` fires the projection emit (mirror of ComposerDropdownCoordinator).
 * Truth stays in the engine; Vue only renders + owns view-local collapse state.
 */
export class BashOutputStore {
  private readonly outputs = new Map<string, PanelBashOutput>();

  constructor(private readonly onChange: () => void) {}

  add(info: PanelBashOutput): void {
    this.outputs.set(info.id, info);
    while (this.outputs.size > MAX_BASH_OUTPUTS) {
      let oldest: string | undefined;
      for (const key of this.outputs.keys()) { oldest = key; break; }
      if (oldest === undefined) break;
      this.outputs.delete(oldest);
    }
    this.onChange();
  }

  update(id: string, updates: Partial<Omit<PanelBashOutput, 'id' | 'command'>>): void {
    const existing = this.outputs.get(id);
    if (!existing) return;
    this.outputs.set(id, { ...existing, ...updates });
    this.onChange();
  }

  clear(): void {
    this.outputs.clear();
    this.onChange();
  }

  list(): PanelBashOutput[] {
    return [...this.outputs.values()];
  }

  latest(): PanelBashOutput | null {
    return this.list().at(-1) ?? null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- --selectProjects unit tests/unit/features/chat/state/BashOutputStore.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
rm -rf coverage
npm run typecheck && npm run typecheck:vue && npm run lint && npm run test:vue && npm run test -- --selectProjects unit && npm run build && npm run check:css && npm run check:loc
rm -rf coverage && npm run check:quality
git config user.email noreply@anthropic.com && git config user.name Claude
git add src/features/chat/state/BashOutputStore.ts tests/unit/features/chat/state/BashOutputStore.test.ts
git commit -m "$(cat <<'EOF'
feat(chat): add engine-side BashOutputStore (LRU-50 bang-bash owner)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014VDsSXWHRqZr2EcNgDX2eq
EOF
)"
```

### Task 10: Tab-chrome island files + `StatusPanel.vue` (unwired)

**Files (all Create):**
- `src/features/chat/ui/vue/tabChrome/tabChromeKeys.ts`
- `src/features/chat/ui/vue/tabChrome/tabChromePinia.ts`
- `src/features/chat/ui/vue/tabChrome/stores/tabChromeStore.ts`
- `src/features/chat/ui/vue/tabChrome/tabChromeCallbacks.ts`
- `src/features/chat/ui/vue/tabChrome/useTabChromeEventRouting.ts`
- `src/features/chat/ui/vue/tabChrome/mountTabChromeApp.ts`
- `src/features/chat/ui/vue/tabChrome/TabChromeRoot.vue`
- `src/features/chat/ui/vue/tabChrome/StatusPanel.vue`
- `src/features/chat/tabs/tabChrome.ts`
- Test: `tests/vue/chat/sidePanels/tabChrome.test.ts`, `tests/vue/chat/sidePanels/statusPanel.test.ts`

Nothing mounts these yet; Task 11 wires them.

- [ ] **Step 1: Write the failing projection + StatusPanel tests**

Create `tests/vue/chat/sidePanels/tabChrome.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BashOutputStore } from '@/features/chat/state/BashOutputStore';
import { TabChromeProjection } from '@/features/chat/tabs/tabChrome';
import type { TabData } from '@/features/chat/tabs/types';
import type { TabChromeSnapshot } from '@/features/chat/ui/vue/tabChrome/tabChromeCallbacks';

function makeTab(): TabData {
  const bashOutputs = new BashOutputStore(() => {});
  return { state: { currentTodos: null }, bashOutputs } as unknown as TabData;
}

describe('TabChromeProjection', () => {
  it('pushes the current snapshot immediately on subscribe', () => {
    const tab = makeTab();
    const proj = new TabChromeProjection(tab);
    const seen: TabChromeSnapshot[] = [];
    proj.subscribe((s) => seen.push(s));
    expect(seen).toHaveLength(1);
    expect(seen[0].todos).toBeNull();
    expect(seen[0].bashOutputs).toEqual([]);
  });

  it('re-projects todos + bash on emit', () => {
    const tab = makeTab();
    const proj = new TabChromeProjection(tab);
    let last: TabChromeSnapshot | null = null;
    proj.subscribe((s) => (last = s));
    (tab.state as never as { currentTodos: unknown }).currentTodos = [{ content: 'x', status: 'pending', activeForm: 'X' }];
    tab.bashOutputs!.add({ id: 'a', command: 'ls', status: 'running', output: '' });
    proj.emit();
    expect(last!.todos).toHaveLength(1);
    expect(last!.bashOutputs).toHaveLength(1);
  });
});
```

Create `tests/vue/chat/sidePanels/statusPanel.test.ts`:

```ts
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import StatusPanel from '@/features/chat/ui/vue/tabChrome/StatusPanel.vue';
import { CALLBACKS_KEY } from '@/features/chat/ui/vue/tabChrome/tabChromeKeys';
import { useTabChromeStore } from '@/features/chat/ui/vue/tabChrome/stores/tabChromeStore';

vi.mock('obsidian', () => ({ setIcon: (el: HTMLElement, n: string) => el.setAttribute('data-icon', n), Notice: vi.fn() }));
vi.mock('@/i18n/i18n', () => ({ t: (k: string) => k }));

function mountPanel(cb: Record<string, unknown> = {}) {
  return mount(StatusPanel, { global: { provide: { [CALLBACKS_KEY as symbol]: { onCopyBashOutput: vi.fn(), onClearBashOutputs: vi.fn(), resolveNavHost: () => null, ...cb } } } });
}

describe('StatusPanel.vue', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('renders todos with legacy classes', async () => {
    const store = useTabChromeStore();
    store.setTodos([{ content: 'Do it', status: 'pending', activeForm: 'Doing it' }] as never);
    const w = mountPanel();
    await w.vm.$nextTick();
    expect(w.find('.specorator-status-panel-todos').classes()).not.toContain('specorator-hidden');
    expect(w.find('.specorator-todo-item').exists()).toBe(true);
  });

  it('renders bash outputs and fires clear', async () => {
    const store = useTabChromeStore();
    store.setBashOutputs([{ id: 'a', command: 'ls', status: 'completed', output: 'files' }] as never);
    const onClearBashOutputs = vi.fn();
    const w = mountPanel({ onClearBashOutputs });
    await w.vm.$nextTick();
    expect(w.find('.specorator-status-panel-bash').classes()).not.toContain('specorator-hidden');
    expect(w.find('.specorator-status-panel-bash-entry').exists()).toBe(true);
    await w.find('.specorator-status-panel-bash-action-clear').trigger('click');
    expect(onClearBashOutputs).toHaveBeenCalled();
  });

  it('hides both sections when empty', () => {
    const w = mountPanel();
    expect(w.find('.specorator-status-panel-todos').classes()).toContain('specorator-hidden');
    expect(w.find('.specorator-status-panel-bash').classes()).toContain('specorator-hidden');
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm run test:vue -- tests/vue/chat/sidePanels/tabChrome.test.ts tests/vue/chat/sidePanels/statusPanel.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Create the keys**

`src/features/chat/ui/vue/tabChrome/tabChromeKeys.ts`:

```ts
import type { App, Component } from 'obsidian';
import type { InjectionKey, ShallowRef } from 'vue';

import type SpecoratorPlugin from '../../../../../main';
import type { TabChromeCallbacks } from './tabChromeCallbacks';

export const APP_KEY: InjectionKey<App> = Symbol('specorator.tabChrome.app');
export const COMPONENT_KEY: InjectionKey<Component> = Symbol('specorator.tabChrome.component');
export const PLUGIN_KEY: InjectionKey<SpecoratorPlugin> = Symbol('specorator.tabChrome.plugin');
export const CALLBACKS_KEY: InjectionKey<TabChromeCallbacks> = Symbol('specorator.tabChrome.callbacks');
// Phase 4: NavOverlay reads the transcript scroll host (pushed post-transcript-mount
// via MountedTabChrome.setScrollHost) as a reactive ref, and its teleport target.
export const SCROLL_HOST_KEY: InjectionKey<ShallowRef<HTMLElement | null>> = Symbol('specorator.tabChrome.scrollHost');
export const NAV_HOST_KEY: InjectionKey<() => HTMLElement | null> = Symbol('specorator.tabChrome.navHost');
```

- [ ] **Step 4: Create the pinia + store**

`src/features/chat/ui/vue/tabChrome/tabChromePinia.ts`:

```ts
import type { Pinia } from 'pinia';
import { createPinia } from 'pinia';

// A FRESH Pinia per chat leaf — never a shared singleton. Each tab owns its own
// todos + bash outputs; a shared store would let one tab overwrite another's.
// Mirrors createComposerPinia. GC'd with the app on unmount.
export function createTabChromePinia(): Pinia {
  return createPinia();
}
```

`src/features/chat/ui/vue/tabChrome/stores/tabChromeStore.ts`:

```ts
import { defineStore } from 'pinia';
import { shallowRef } from 'vue';

import type { PanelBashOutput } from '../../../../state/BashOutputStore';
import type { TodoItem } from '../../../../../../core/tools/todo';

/**
 * Reactive read-model over one tab's chrome (todos + bang-bash outputs). Truth
 * + I/O stay in ChatState.currentTodos / BashOutputStore; every setter replaces
 * a whole value/array (shallowRef). Mirrors useComposerStore's contract.
 */
export const useTabChromeStore = defineStore('tab-chrome', () => {
  const todos = shallowRef<TodoItem[] | null>(null);
  const bashOutputs = shallowRef<PanelBashOutput[]>([]);

  function setTodos(next: TodoItem[] | null): void { todos.value = next; }
  function setBashOutputs(next: PanelBashOutput[]): void { bashOutputs.value = next; }

  return { todos, bashOutputs, setTodos, setBashOutputs };
});
```

- [ ] **Step 5: Create the callbacks + snapshot + projection**

`src/features/chat/ui/vue/tabChrome/tabChromeCallbacks.ts`:

```ts
import type { PanelBashOutput } from '../../../state/BashOutputStore';
import type { TodoItem } from '../../../../../core/tools/todo';

/** One projected snapshot pushed on todo change + bash change + conversation switch. */
export interface TabChromeSnapshot {
  todos: TodoItem[] | null;
  bashOutputs: PanelBashOutput[];
}

export type TabChromeSubscribe = (onChange: (s: TabChromeSnapshot) => void) => () => void;

/** Vue → engine seam for the tab-chrome island. Thin delegators; truth stays in
 *  the engine (ChatState / BashOutputStore). `resolveNavHost` returns the
 *  NavOverlay teleport target (Phase 4). */
export interface TabChromeCallbacks {
  subscribe: TabChromeSubscribe;
  /** Copy the latest bang-bash entry to the clipboard (`$ cmd\noutput`). */
  onCopyBashOutput: () => void;
  /** Clear all bang-bash outputs. */
  onClearBashOutputs: () => void;
  /** Teleport target for NavOverlay; null falls back to in-place render. */
  resolveNavHost: () => HTMLElement | null;
}
```

`src/features/chat/tabs/tabChrome.ts`:

```ts
import type { TabChromeSnapshot, TabChromeSubscribe } from '../ui/vue/tabChrome/tabChromeCallbacks';
import type { TabData } from './types';

/**
 * Per-tab projection source for the Vue tab-chrome island. Mirrors
 * `TabComposerProjection`: the engine mutates its own state (ChatState.currentTodos,
 * BashOutputStore); this pushes a fully-projected {@link TabChromeSnapshot} to every
 * observer. Reads the tab lazily at emit time.
 */
export class TabChromeProjection {
  private readonly observers = new Set<(s: TabChromeSnapshot) => void>();

  constructor(private readonly tab: TabData) {}

  readonly subscribe: TabChromeSubscribe = (onChange) => {
    this.observers.add(onChange);
    onChange(this.snapshot());
    return () => { this.observers.delete(onChange); };
  };

  emit(): void {
    if (this.observers.size === 0) return;
    const snapshot = this.snapshot();
    for (const observer of this.observers) observer(snapshot);
  }

  private snapshot(): TabChromeSnapshot {
    return {
      todos: this.tab.state.currentTodos,
      bashOutputs: this.tab.bashOutputs?.list() ?? [],
    };
  }
}
```

> `this.tab.state.currentTodos` returns a fresh array copy (the `ChatState.currentTodos` getter clones), so the shallowRef replacement always triggers Vue.

- [ ] **Step 6: Create the routing + app mount**

`src/features/chat/ui/vue/tabChrome/useTabChromeEventRouting.ts`:

```ts
import { onScopeDispose } from 'vue';

import type { TabChromeSubscribe } from './tabChromeCallbacks';
import { useTabChromeStore } from './stores/tabChromeStore';

/** Routes the tab's chrome-change stream into the Pinia store. Subscribe
 *  SYNCHRONOUSLY during setup (mirror of useComposerEventRouting) so a same-turn
 *  emit is not dropped while observers.size === 0. */
export function useTabChromeEventRouting(subscribe: TabChromeSubscribe): void {
  const store = useTabChromeStore();
  const dispose = subscribe((snapshot) => {
    store.setTodos(snapshot.todos);
    store.setBashOutputs(snapshot.bashOutputs);
  });
  onScopeDispose(() => { dispose(); });
}
```

`src/features/chat/ui/vue/tabChrome/mountTabChromeApp.ts`:

```ts
import type { Component } from 'obsidian';
import { type App as VueApp, createApp, markRaw, shallowRef } from 'vue';

import type SpecoratorPlugin from '../../../../../main';
import { APP_KEY, CALLBACKS_KEY, COMPONENT_KEY, NAV_HOST_KEY, PLUGIN_KEY, SCROLL_HOST_KEY } from './tabChromeKeys';
import { createTabChromePinia } from './tabChromePinia';
import type { TabChromeCallbacks } from './tabChromeCallbacks';
import TabChromeRoot from './TabChromeRoot.vue';

/** Handle to a per-tab mounted tab-chrome island. */
export interface MountedTabChrome {
  app: VueApp;
  unmount: () => void;
  /** Pushes the transcript's live scroll host to NavOverlay (Phase 4), post-transcript-mount. */
  setScrollHost: (el: HTMLElement | null) => void;
}

/**
 * Mounts the Vue tab-chrome island for one chat tab. Per-tab mirror of
 * `mountComposer`: a FRESH per-leaf Pinia, the App/Component/Plugin/Callbacks
 * provides, plus a reactive SCROLL_HOST_KEY ref (NavOverlay watches it) and the
 * NAV_HOST_KEY teleport-target resolver.
 */
export function mountTabChromeApp(
  containerEl: HTMLElement,
  plugin: SpecoratorPlugin,
  component: Component,
  callbacks: TabChromeCallbacks,
): MountedTabChrome {
  const scrollHost = shallowRef<HTMLElement | null>(null);

  const app = createApp(TabChromeRoot);
  app.use(createTabChromePinia());
  app.provide(APP_KEY, markRaw(plugin.app));
  app.provide(COMPONENT_KEY, markRaw(component));
  app.provide(PLUGIN_KEY, markRaw(plugin));
  app.provide(CALLBACKS_KEY, markRaw(callbacks));
  app.provide(SCROLL_HOST_KEY, scrollHost);
  app.provide(NAV_HOST_KEY, callbacks.resolveNavHost);
  app.mount(containerEl);

  return {
    app,
    unmount: () => app.unmount(),
    setScrollHost: (el) => { scrollHost.value = el; },
  };
}
```

- [ ] **Step 7: Create `TabChromeRoot.vue` + `StatusPanel.vue`**

`src/features/chat/ui/vue/tabChrome/TabChromeRoot.vue` (Phase 4 adds `<NavOverlay/>`):

```vue
<script setup lang="ts">
import { inject } from 'vue';

import { CALLBACKS_KEY } from './tabChromeKeys';
import { useTabChromeEventRouting } from './useTabChromeEventRouting';
import StatusPanel from './StatusPanel.vue';

// The tab-chrome island root: StatusPanel in place + (Phase 4) a teleported NavOverlay.
const cb = inject(CALLBACKS_KEY);
if (!cb) throw new Error('TabChromeRoot mounted without CALLBACKS_KEY');

// Subscribe synchronously so a same-turn emit is not dropped.
useTabChromeEventRouting(cb.subscribe);
</script>

<template>
  <StatusPanel />
</template>
```

`src/features/chat/ui/vue/tabChrome/StatusPanel.vue` — todos reuse `TodoListView.vue`; bash entries reuse the generic `.specorator-tool-*` classes; collapse/per-entry-expand are view-local refs:

```vue
<script setup lang="ts">
import { computed, inject, ref } from 'vue';

import { t } from '../../../../../i18n/i18n';
import { getToolIcon } from '../../../../../core/tools/toolIcons';
import { TOOL_TODO_WRITE } from '../../../../../core/tools/toolNames';
import TodoListView from '../transcript/blocks/TodoListView.vue';
import IconSpan from '../transcript/IconSpan.vue';
import { CALLBACKS_KEY } from './tabChromeKeys';
import { useTabChromeStore } from './stores/tabChromeStore';

// Native StatusPanel (replaces the imperative StatusPanel.ts). Todos + bang-bash
// output list; collapse/per-entry-expand are VIEW-LOCAL refs (no engine coupling);
// copy + clear are callbacks. Emits the legacy .specorator-status-panel-* classes.
const cb = inject(CALLBACKS_KEY);
if (!cb) throw new Error('StatusPanel mounted without CALLBACKS_KEY');
const store = useTabChromeStore();

const todos = computed(() => store.todos);
const hasTodos = computed(() => (todos.value?.length ?? 0) > 0);
const completedCount = computed(() => todos.value?.filter((x) => x.status === 'completed').length ?? 0);
const totalCount = computed(() => todos.value?.length ?? 0);
const currentTask = computed(() => todos.value?.find((x) => x.status === 'in_progress') ?? null);
const allComplete = computed(() => totalCount.value > 0 && completedCount.value === totalCount.value);
const todoExpanded = ref(false);

const bash = computed(() => store.bashOutputs);
const hasBash = computed(() => bash.value.length > 0);
const bashExpanded = ref(true);
const entryExpanded = ref<Record<string, boolean>>({});
const latestBash = computed(() => bash.value.at(-1) ?? null);

function truncate(s: string, max = 60): string { return s.length <= max ? s : s.slice(0, max) + '...'; }
function isEntryExpanded(id: string): boolean { return entryExpanded.value[id] ?? true; }
function toggleEntry(id: string): void { entryExpanded.value = { ...entryExpanded.value, [id]: !isEntryExpanded(id) }; }
function todoHeaderIcon(el: unknown): void {
  // Reuse IconSpan for todo status icons; the panel list icon uses the todo tool icon.
  void el;
}
function onKey(e: KeyboardEvent, fn: () => void): void {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); }
}
</script>

<template>
  <div class="specorator-status-panel">
    <div
      class="specorator-status-panel-bash"
      :class="{ 'specorator-hidden': !hasBash }"
    >
      <div
        class="specorator-tool-header specorator-status-panel-bash-header"
        tabindex="0"
        role="button"
        :aria-expanded="bashExpanded ? 'true' : 'false'"
        @click="bashExpanded = !bashExpanded"
        @keydown="onKey($event, () => (bashExpanded = !bashExpanded))"
      >
        <IconSpan
          icon="terminal"
          css-class="specorator-tool-icon"
          :aria-hidden="true"
        />
        <span class="specorator-tool-label">{{ bashExpanded ? t('chat.bangBash.commandPanel') : (latestBash ? truncate(latestBash.command) : t('chat.bangBash.commandPanel')) }}</span>
        <span
          class="specorator-status-panel-bash-actions"
          @click.stop
        >
          <IconSpan
            icon="copy"
            css-class="specorator-status-panel-bash-action specorator-status-panel-bash-action-copy"
            role="button"
            tabindex="0"
            :aria-label="t('chat.bangBash.copyAriaLabel')"
            @click="cb.onCopyBashOutput()"
            @keydown="onKey($event, cb.onCopyBashOutput)"
          />
          <IconSpan
            icon="trash"
            css-class="specorator-status-panel-bash-action specorator-status-panel-bash-action-clear"
            role="button"
            tabindex="0"
            :aria-label="t('chat.bangBash.clearAriaLabel')"
            @click="cb.onClearBashOutputs()"
            @keydown="onKey($event, cb.onClearBashOutputs)"
          />
        </span>
      </div>
      <div
        class="specorator-status-panel-bash-content"
        :class="{ 'specorator-hidden': !bashExpanded }"
      >
        <div
          v-for="info in bash"
          :key="info.id"
          class="specorator-tool-call specorator-status-panel-bash-entry"
        >
          <div
            class="specorator-tool-header"
            tabindex="0"
            role="button"
            :aria-expanded="isEntryExpanded(info.id) ? 'true' : 'false'"
            @click="toggleEntry(info.id)"
            @keydown="onKey($event, () => toggleEntry(info.id))"
          >
            <IconSpan
              icon="dollar-sign"
              css-class="specorator-tool-icon"
              :aria-hidden="true"
            />
            <span class="specorator-tool-label">{{ t('chat.bangBash.commandLabel', { command: truncate(info.command) }) }}</span>
            <IconSpan
              v-if="info.status === 'completed'"
              icon="check"
              :css-class="`specorator-tool-status status-${info.status}`"
            />
            <IconSpan
              v-else-if="info.status === 'error'"
              icon="x"
              :css-class="`specorator-tool-status status-${info.status}`"
            />
            <span
              v-else
              :class="`specorator-tool-status status-${info.status}`"
            />
          </div>
          <div
            class="specorator-tool-content"
            :class="{ 'specorator-hidden': !isEntryExpanded(info.id) }"
          >
            <div class="specorator-tool-result-row">
              <span class="specorator-tool-result-text">{{ info.status === 'running' && !info.output ? t('chat.bangBash.running') : info.output }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div
      class="specorator-status-panel-todos"
      :class="{ 'specorator-hidden': !hasTodos }"
    >
      <div
        class="specorator-status-panel-header"
        tabindex="0"
        role="button"
        :aria-expanded="todoExpanded ? 'true' : 'false'"
        :aria-label="`${todoExpanded ? 'Collapse' : 'Expand'} task list - ${completedCount} of ${totalCount} completed`"
        @click="todoExpanded = !todoExpanded"
        @keydown="onKey($event, () => (todoExpanded = !todoExpanded))"
      >
        <IconSpan
          :icon="getToolIcon(TOOL_TODO_WRITE)"
          css-class="specorator-status-panel-icon"
        />
        <span class="specorator-status-panel-label">Tasks ({{ completedCount }}/{{ totalCount }})</span>
        <IconSpan
          v-if="!todoExpanded && allComplete"
          icon="check"
          css-class="specorator-status-panel-status status-completed"
        />
        <span
          v-if="!todoExpanded && currentTask"
          class="specorator-status-panel-current"
        >{{ currentTask.activeForm }}</span>
      </div>
      <div
        class="specorator-status-panel-content specorator-todo-list-container"
        :class="{ 'specorator-hidden': !todoExpanded }"
      >
        <TodoListView :todos="todos ?? undefined" />
      </div>
    </div>
  </div>
</template>
```

> `IconSpan.vue` is the transcript island's setIcon wrapper; confirm its prop names (`icon`, `css-class`, `aria-hidden`, `role`, `tabindex`) by reading `src/features/chat/ui/vue/transcript/IconSpan.vue`. If `IconSpan` does not forward `@click`/`@keydown`/`role`/`tabindex`, render those action spans as plain `<span :ref>` using `mountIcon` (import from `../mountIcon`) instead — the DOM contract only requires the `.specorator-status-panel-bash-action*` classes + click handler. Adjust to whatever `IconSpan` actually supports; the test asserts classes + the clear click.

- [ ] **Step 8: Run the tests**

Run: `npm run test:vue -- tests/vue/chat/sidePanels/tabChrome.test.ts tests/vue/chat/sidePanels/statusPanel.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
rm -rf coverage
npm run typecheck && npm run typecheck:vue && npm run lint && npm run test:vue && npm run test -- --selectProjects unit && npm run build && npm run check:css && npm run check:loc
rm -rf coverage && npm run check:quality
git config user.email noreply@anthropic.com && git config user.name Claude
git add src/features/chat/ui/vue/tabChrome src/features/chat/tabs/tabChrome.ts tests/vue/chat/sidePanels/tabChrome.test.ts tests/vue/chat/sidePanels/statusPanel.test.ts
git commit -m "$(cat <<'EOF'
feat(chat): scaffold the tab-chrome Vue island + StatusPanel (unwired)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014VDsSXWHRqZr2EcNgDX2eq
EOF
)"
```

### Task 11: Wire the tab-chrome island into the tab lifecycle; delete `StatusPanel.ts`

**Files:**
- Create: `src/features/chat/tabs/tabChromeMount.ts`
- Modify: `src/features/chat/tabs/types.ts`
- Modify: `src/features/chat/tabs/tabFactory.ts` (init the new TabData fields)
- Modify: `src/features/chat/tabs/TabManager.ts` (~328)
- Modify: `src/features/chat/tabs/tabUi.ts` (~160-181, ~507)
- Modify: `src/features/chat/tabs/tabLifecycle.ts` (~196-199, ~226-232)
- Delete: `src/features/chat/ui/StatusPanel.ts`
- Delete: `tests/unit/features/chat/ui/StatusPanel.test.ts`
- Test: `tests/unit/features/chat/tabs/tabChromeMount.test.ts` (create)

- [ ] **Step 1: Write the failing wiring test**

Create `tests/unit/features/chat/tabs/tabChromeMount.test.ts`:

```ts
import { mountTabChrome } from '@/features/chat/tabs/tabChromeMount';
import type { TabData } from '@/features/chat/tabs/types';

jest.mock('@/features/chat/ui/vue/tabChrome/mountTabChromeApp', () => ({
  mountTabChromeApp: jest.fn(() => ({ app: {}, unmount: jest.fn(), setScrollHost: jest.fn() })),
}));

describe('mountTabChrome', () => {
  it('constructs the bash store + projection and mounts the app', () => {
    const tab = {
      dom: { statusPanelContainerEl: {}, navSidebarHostEl: {} },
      state: { currentTodos: null },
    } as unknown as TabData;
    mountTabChrome(tab, { app: {} } as never, {} as never);
    expect(tab.bashOutputs).toBeTruthy();
    expect(tab.tabChrome).toBeTruthy();
    expect(tab.mountedTabChrome).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- --selectProjects unit tests/unit/features/chat/tabs/tabChromeMount.test.ts`
Expected: FAIL — cannot find `mountTabChrome`.

- [ ] **Step 3: Add the TabData fields**

In `src/features/chat/tabs/types.ts`:
- Add imports: `import type { BashOutputStore } from '../state/BashOutputStore';`, `import type { TabChromeProjection } from './tabChrome';`, `import type { MountedTabChrome } from '../ui/vue/tabChrome/mountTabChromeApp';`.
- In `TabUIComponents`, DELETE the `statusPanel: StatusPanel | null;` line (and the `import type { StatusPanel } ...` line at the top). Leave `navigationSidebar` for now (Phase 4 removes it).
- In `TabData` (after `mountedComposer`), add:

```ts
  /** Engine-side owner of this tab's bang-bash outputs (LRU-50). */
  bashOutputs: BashOutputStore | null;
  /** Per-tab Vue tab-chrome projection source (engine → store snapshot fan-out). */
  tabChrome: TabChromeProjection | null;
  /** Handle to the mounted Vue tab-chrome island (unmounted on tab destroy). */
  mountedTabChrome: MountedTabChrome | null;
```

In `src/features/chat/tabs/tabFactory.ts`, in the `createTab` object literal where `statusPanel: null` and `navigationSidebar: null` are set (~135-136 for `ui`, and the `TabData` fields ~near `mountedComposer: null`): delete `statusPanel: null,` from the `ui` object, and add `bashOutputs: null,`, `tabChrome: null,`, `mountedTabChrome: null,` alongside `mountedComposer: null,`.

- [ ] **Step 4: Create the mount orchestrator**

`src/features/chat/tabs/tabChromeMount.ts`:

```ts
import { Notice, type Component } from 'obsidian';

import { t } from '../../../i18n/i18n';
import type SpecoratorPlugin from '../../../main';
import { BashOutputStore } from '../state/BashOutputStore';
import type { TabChromeCallbacks } from '../ui/vue/tabChrome/tabChromeCallbacks';
import { mountTabChromeApp } from '../ui/vue/tabChrome/mountTabChromeApp';
import { TabChromeProjection } from './tabChrome';
import type { TabData } from './types';

/**
 * Mounts the Vue tab-chrome island for one tab and wires the engine↔island seam.
 * Called by `TabManager` BETWEEN `createTab` and `initializeTabUI` (like
 * `mountTabComposer`), so `tab.bashOutputs` exists before the bang-bash manager
 * (built in `initializeTabUI`) closes over it, and `statusPanelContainerEl`
 * (from `buildTabDOM`) is a live mount target. Mirrors `mountTabComposer`.
 */
export function mountTabChrome(
  tab: TabData,
  plugin: SpecoratorPlugin,
  component: Component,
): void {
  // onChange fires the projection emit (mirror of ComposerDropdownCoordinator's
  // `() => tab.composer?.emit()`); tab.tabChrome is set immediately below, and no
  // bash write happens synchronously during construction.
  tab.bashOutputs = new BashOutputStore(() => tab.tabChrome?.emit());
  tab.tabChrome = new TabChromeProjection(tab);

  const callbacks: TabChromeCallbacks = {
    subscribe: tab.tabChrome.subscribe,
    onCopyBashOutput: () => {
      const latest = tab.bashOutputs?.latest();
      if (!latest) return;
      const output = latest.output?.trim() || (latest.status === 'running' ? t('chat.bangBash.running') : '');
      const text = output ? `$ ${latest.command}\n${output}` : `$ ${latest.command}`;
      void navigator.clipboard.writeText(text).catch(() => { new Notice(t('chat.bangBash.copyFailed')); });
    },
    onClearBashOutputs: () => { tab.bashOutputs?.clear(); },
    // Phase 4 wires the real teleport host; until then NavOverlay is not rendered,
    // so a null host is harmless.
    resolveNavHost: () => tab.dom.navSidebarHostEl ?? null,
  };

  tab.mountedTabChrome = mountTabChromeApp(tab.dom.statusPanelContainerEl, plugin, component, callbacks);
}
```

> `tab.dom.navSidebarHostEl` does not exist until Phase 4. To keep this task compiling, add an OPTIONAL field now: in `types.ts` `TabDOMElements`, add `navSidebarHostEl?: HTMLElement | null;` (Phase 4 makes it required + populates it in `buildTabDOM`). The `?? null` above then resolves to `null`.

- [ ] **Step 5: Call it from `TabManager.createTab`**

In `src/features/chat/tabs/TabManager.ts` (~328), add the import `import { mountTabChrome } from './tabChromeMount';` and, immediately after the `mountTabComposer(...)` line, add:

```ts
      mountTabChrome(tab, this.plugin, this.view);
```

- [ ] **Step 6: Rewire bang-bash + todos in `tabUi.ts`; delete StatusPanel construction**

In `src/features/chat/tabs/tabUi.ts`:
- Delete `import { StatusPanel } from '../ui/StatusPanel';`.
- In the bang-bash `onSubmit` (~160-171), replace the `statusPanel` reads with `tab.bashOutputs`:

```ts
          onSubmit: async (command) => {
            const store = tab.bashOutputs;
            if (!store) return;
            const id = `bash-${Date.now()}`;
            store.add({ id, command, status: 'running', output: '' });
            const result = await bashService.execute(command);
            const output = [result.stdout, result.stderr, result.error].filter(Boolean).join('\n').trim();
            const status = result.exitCode === 0 ? 'completed' : 'error';
            store.update(id, { status, output, exitCode: result.exitCode });
          },
```

- Delete the two lines `tab.ui.statusPanel = new StatusPanel();` and `tab.ui.statusPanel.mount(dom.statusPanelContainerEl);` (~179-180).
- In the `state.callbacks` assignment (~507), replace `onTodosChanged: (todos) => tab.ui.statusPanel?.updateTodos(todos),` with `onTodosChanged: () => tab.tabChrome?.emit(),`.

- [ ] **Step 7: Unmount + teardown in `tabLifecycle.ts`**

In `src/features/chat/tabs/tabLifecycle.ts`:
- In `destroyTabUi` (~196-197), delete the `tab.ui.statusPanel?.destroy();` and `tab.ui.statusPanel = null;` lines.
- In the mounted-island teardown (~226-232, beside `mountedComposer?.unmount()`), add:

```ts
  tab.mountedTabChrome?.unmount();
  tab.mountedTabChrome = null;
  tab.tabChrome = null;
  tab.bashOutputs = null;
```

- [ ] **Step 8: Delete the imperative panel + its unit test**

- Delete `src/features/chat/ui/StatusPanel.ts`.
- Delete `tests/unit/features/chat/ui/StatusPanel.test.ts`.
- `git grep -n "StatusPanel\|statusPanel"` — expect only `statusPanelContainerEl` (the DOM host, still used as the mount target) and the new `StatusPanel.vue`. Delete any remaining `getStatusPanel` dep wiring in `tabControllerSetup.ts` if Task 7 missed it (the `getStatusPanel: () => ui.statusPanel` lines at ~149/~277 must be gone).

- [ ] **Step 9: Run tests**

Run: `npm run test -- --selectProjects unit tests/unit/features/chat/tabs/tabChromeMount.test.ts`
Expected: PASS.

Run: `npm run test:vue`
Expected: PASS (full Vue lane).

- [ ] **Step 10: Commit**

```bash
rm -rf coverage
npm run typecheck && npm run typecheck:vue && npm run lint && npm run test:vue && npm run test -- --selectProjects unit && npm run build && npm run check:css && npm run check:loc
rm -rf coverage && npm run check:quality
git config user.email noreply@anthropic.com && git config user.name Claude
git add -A
git commit -m "$(cat <<'EOF'
feat(chat): mount the tab-chrome island into the tab lifecycle; delete StatusPanel.ts

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014VDsSXWHRqZr2EcNgDX2eq
EOF
)"
```

## Phase 4 — NavOverlay + useTabNavigation

Adds the teleport host, the imperative-scroll composable, and the teleported button island; then cuts over the post-transcript-mount scroll-host binding and deletes `NavigationSidebar.ts`.

### Task 12: Teleport host + `useTabNavigation` + `NavOverlay.vue`

**Files:**
- Modify: `src/features/chat/tabs/tabFactory.ts` (add `.specorator-nav-sidebar-host` in `buildTabDOM`)
- Modify: `src/features/chat/tabs/types.ts` (make `navSidebarHostEl` required)
- Create: `src/features/chat/ui/vue/tabChrome/useTabNavigation.ts`
- Create: `src/features/chat/ui/vue/tabChrome/NavOverlay.vue`
- Modify: `src/features/chat/ui/vue/tabChrome/TabChromeRoot.vue` (add `<NavOverlay/>`)
- Test: `tests/vue/chat/sidePanels/navOverlay.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/vue/chat/sidePanels/navOverlay.test.ts`:

```ts
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { shallowRef } from 'vue';

import NavOverlay from '@/features/chat/ui/vue/tabChrome/NavOverlay.vue';
import { NAV_HOST_KEY, SCROLL_HOST_KEY } from '@/features/chat/ui/vue/tabChrome/tabChromeKeys';

vi.mock('obsidian', () => ({ setIcon: (el: HTMLElement, n: string) => el.setAttribute('data-icon', n) }));

function makeScrollEl(userTops: number[], scrollHeight = 2000, clientHeight = 400) {
  const el = document.createElement('div');
  Object.defineProperty(el, 'scrollHeight', { value: scrollHeight, configurable: true });
  Object.defineProperty(el, 'clientHeight', { value: clientHeight, configurable: true });
  el.scrollTop = 0;
  el.scrollTo = vi.fn();
  for (const top of userTops) {
    const m = document.createElement('div');
    m.className = 'specorator-message-user';
    Object.defineProperty(m, 'offsetTop', { value: top, configurable: true });
    el.appendChild(m);
  }
  return el;
}

function mountOverlay(scrollEl: HTMLElement | null) {
  const scrollHost = shallowRef<HTMLElement | null>(scrollEl);
  const w = mount(NavOverlay, {
    global: { provide: { [SCROLL_HOST_KEY as symbol]: scrollHost, [NAV_HOST_KEY as symbol]: () => null } },
  });
  return { w, scrollHost };
}

describe('NavOverlay.vue', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('renders the four nav buttons with legacy classes', () => {
    const { w } = mountOverlay(makeScrollEl([100, 800]));
    expect(w.find('.specorator-nav-sidebar').exists()).toBe(true);
    expect(w.find('.specorator-nav-btn-top').exists()).toBe(true);
    expect(w.find('.specorator-nav-btn-prev').exists()).toBe(true);
    expect(w.find('.specorator-nav-btn-next').exists()).toBe(true);
    expect(w.find('.specorator-nav-btn-bottom').exists()).toBe(true);
  });

  it('scans to the next user message below the scroll position', async () => {
    const scrollEl = makeScrollEl([100, 800, 1500]);
    const { w } = mountOverlay(scrollEl);
    await w.find('.specorator-nav-btn-next').trigger('click');
    expect(scrollEl.scrollTo).toHaveBeenCalledWith({ top: 90, behavior: 'smooth' });
  });

  it('scrolls to top and bottom', async () => {
    const scrollEl = makeScrollEl([100]);
    const { w } = mountOverlay(scrollEl);
    await w.find('.specorator-nav-btn-top').trigger('click');
    expect(scrollEl.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
    await w.find('.specorator-nav-btn-bottom').trigger('click');
    expect(scrollEl.scrollTo).toHaveBeenCalledWith({ top: 2000, behavior: 'smooth' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:vue -- tests/vue/chat/sidePanels/navOverlay.test.ts`
Expected: FAIL — cannot resolve `NavOverlay.vue`.

- [ ] **Step 3: Add the teleport host to `buildTabDOM`**

In `src/features/chat/tabs/tabFactory.ts` `buildTabDOM`, after `const statusPanelContainerEl = ...`, add:

```ts
  // Floating teleport target for the Vue NavOverlay, a sibling of the messages
  // wrapper inside contentEl (where the imperative NavigationSidebar used to
  // createDiv its container).
  const navSidebarHostEl = contentEl.createDiv({ cls: 'specorator-nav-sidebar-host' });
```

Add `navSidebarHostEl,` to the returned `TabDOMElements` object literal.

In `src/features/chat/tabs/types.ts` `TabDOMElements`, change `navSidebarHostEl?: HTMLElement | null;` (added in Task 11) to the required `navSidebarHostEl: HTMLElement;`.

- [ ] **Step 4: Create the composable**

`src/features/chat/ui/vue/tabChrome/useTabNavigation.ts`:

```ts
import { inject, onScopeDispose, ref, watch, type Ref } from 'vue';

import { cancelScheduledAnimationFrame, scheduleAnimationFrame, type ScheduledAnimationFrame } from '../../../../utils/animationFrame';
import { SCROLL_HOST_KEY } from './tabChromeKeys';

/**
 * Imperative scroll geometry for the NavOverlay, bound to the transcript scroll
 * host (received as a reactive ref via SCROLL_HOST_KEY; pushed post-transcript-mount
 * by MountedTabChrome.setScrollHost). Reproduces the deleted NavigationSidebar:
 * rAF-debounced overflow → `visible`; top/bottom smooth scrollTo; prev/next
 * offsetTop scan of `.specorator-message-user`; rebind on the host swap. Popout-safe
 * (`nodeType === 1`, never instanceof HTMLElement).
 */
export function useTabNavigation(): {
  visible: Ref<boolean>;
  scrollTop: () => void;
  scrollBottom: () => void;
  scrollPrev: () => void;
  scrollNext: () => void;
} {
  const scrollHost = inject(SCROLL_HOST_KEY, ref<HTMLElement | null>(null));
  const visible = ref(false);
  let pendingFrame: ScheduledAnimationFrame | null = null;
  let bound: HTMLElement | null = null;
  const onScroll = (): void => scheduleVisibility();
  let resizeObserver: ResizeObserver | null = null;

  function applyVisibility(): void {
    const el = scrollHost.value;
    if (!el || el.nodeType !== 1) { visible.value = false; return; }
    visible.value = el.scrollHeight > el.clientHeight + 50;
  }
  function scheduleVisibility(): void {
    if (pendingFrame !== null) return;
    const view = scrollHost.value?.ownerDocument.defaultView ?? null;
    pendingFrame = scheduleAnimationFrame(() => { pendingFrame = null; applyVisibility(); }, view);
  }

  function bind(el: HTMLElement | null): void {
    if (bound) { bound.removeEventListener('scroll', onScroll); resizeObserver?.disconnect(); resizeObserver = null; }
    bound = el && el.nodeType === 1 ? el : null;
    if (bound) {
      bound.addEventListener('scroll', onScroll, { passive: true });
      const view = bound.ownerDocument.defaultView as (Window & typeof globalThis) | null;
      if (view && 'ResizeObserver' in view) {
        resizeObserver = new view.ResizeObserver(() => scheduleVisibility());
        resizeObserver.observe(bound);
      }
    }
    applyVisibility();
  }

  watch(scrollHost, (el) => bind(el), { immediate: true });

  function scrollTop(): void { scrollHost.value?.scrollTo({ top: 0, behavior: 'smooth' }); }
  function scrollBottom(): void { const el = scrollHost.value; el?.scrollTo({ top: el.scrollHeight, behavior: 'smooth' }); }

  function scan(direction: 'prev' | 'next'): void {
    const el = scrollHost.value;
    if (!el) return;
    const messages = Array.from(el.querySelectorAll<HTMLElement>('.specorator-message-user'));
    if (messages.length === 0) return;
    const scrollTopPos = el.scrollTop;
    const threshold = 30;
    if (direction === 'prev') {
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].offsetTop < scrollTopPos - threshold) { el.scrollTo({ top: messages[i].offsetTop - 10, behavior: 'smooth' }); return; }
      }
      el.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      for (let i = 0; i < messages.length; i++) {
        if (messages[i].offsetTop > scrollTopPos + threshold) { el.scrollTo({ top: messages[i].offsetTop - 10, behavior: 'smooth' }); return; }
      }
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    }
  }

  onScopeDispose(() => {
    if (pendingFrame !== null) cancelScheduledAnimationFrame(pendingFrame);
    if (bound) bound.removeEventListener('scroll', onScroll);
    resizeObserver?.disconnect();
  });

  return { visible, scrollTop, scrollBottom, scrollPrev: () => scan('prev'), scrollNext: () => scan('next') };
}
```

> Confirm `scheduleAnimationFrame`/`cancelScheduledAnimationFrame`/`ScheduledAnimationFrame` signatures by reading `src/utils/animationFrame.ts` (the deleted `NavigationSidebar` imported the same three). `scheduleAnimationFrame(cb, window|null)` returns a `ScheduledAnimationFrame`.

- [ ] **Step 5: Create `NavOverlay.vue`**

`src/features/chat/ui/vue/tabChrome/NavOverlay.vue`:

```vue
<script setup lang="ts">
import { computed, inject } from 'vue';

import { mountIcon } from '../mountIcon';
import { NAV_HOST_KEY } from './tabChromeKeys';
import { useTabNavigation } from './useTabNavigation';

// Teleported 4-button scroll navigator (replaces the imperative NavigationSidebar).
// Vue renders the buttons + `.visible` toggle; useTabNavigation owns the imperative
// scroll geometry bound to the transcript scroll host.
const navHost = inject(NAV_HOST_KEY, () => null);
const target = computed(() => navHost());
const teleportDisabled = computed(() => target.value == null);

const { visible, scrollTop, scrollBottom, scrollPrev, scrollNext } = useTabNavigation();

function topIcon(el: unknown): void { mountIcon(el, 'chevrons-up'); }
function prevIcon(el: unknown): void { mountIcon(el, 'chevron-up'); }
function nextIcon(el: unknown): void { mountIcon(el, 'chevron-down'); }
function bottomIcon(el: unknown): void { mountIcon(el, 'chevrons-down'); }
</script>

<template>
  <Teleport
    :to="target"
    :disabled="teleportDisabled"
  >
    <div
      class="specorator-nav-sidebar"
      :class="{ visible }"
    >
      <div
        :ref="topIcon"
        class="specorator-nav-btn specorator-nav-btn-top"
        aria-label="Scroll to top"
        @click="scrollTop()"
      />
      <div
        :ref="prevIcon"
        class="specorator-nav-btn specorator-nav-btn-prev"
        aria-label="Previous message"
        @click="scrollPrev()"
      />
      <div
        :ref="nextIcon"
        class="specorator-nav-btn specorator-nav-btn-next"
        aria-label="Next message"
        @click="scrollNext()"
      />
      <div
        :ref="bottomIcon"
        class="specorator-nav-btn specorator-nav-btn-bottom"
        aria-label="Scroll to bottom"
        @click="scrollBottom()"
      />
    </div>
  </Teleport>
</template>
```

- [ ] **Step 6: Render it in `TabChromeRoot.vue`**

In `src/features/chat/ui/vue/tabChrome/TabChromeRoot.vue`, add `import NavOverlay from './NavOverlay.vue';` and render it after `<StatusPanel />`:

```vue
<template>
  <StatusPanel />
  <NavOverlay />
</template>
```

- [ ] **Step 7: Run the test**

Run: `npm run test:vue -- tests/vue/chat/sidePanels/navOverlay.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
rm -rf coverage
npm run typecheck && npm run typecheck:vue && npm run lint && npm run test:vue && npm run test -- --selectProjects unit && npm run build && npm run check:css && npm run check:loc
rm -rf coverage && npm run check:quality
git config user.email noreply@anthropic.com && git config user.name Claude
git add -A
git commit -m "$(cat <<'EOF'
feat(chat): add teleported NavOverlay + useTabNavigation composable

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014VDsSXWHRqZr2EcNgDX2eq
EOF
)"
```

### Task 13: Cut over the scroll-host binding; delete `NavigationSidebar.ts`

**Files:**
- Modify: `src/features/chat/tabs/tabControllers.ts` (~265-268)
- Modify: `src/features/chat/tabs/tabUi.ts` (~490-495, ~508, ~517-522)
- Modify: `src/features/chat/tabs/tabLifecycle.ts` (~151, ~198-199)
- Modify: `src/features/chat/tabs/types.ts` (drop `navigationSidebar`)
- Delete: `src/features/chat/ui/NavigationSidebar.ts`
- Delete: `tests/unit/features/chat/ui/NavigationSidebar.test.ts`
- Delete: `tests/perf/navigationSidebar.perf.test.ts`
- Create: `tests/vue/chat/sidePanels/navOverlayScaling.test.ts`

- [ ] **Step 1: Write the migrated scaling guard**

Create `tests/vue/chat/sidePanels/navOverlayScaling.test.ts` (mirrors the deleted `navigationSidebar.perf` scan-cost probe, now over `useTabNavigation` through `NavOverlay`):

```ts
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { shallowRef } from 'vue';

import NavOverlay from '@/features/chat/ui/vue/tabChrome/NavOverlay.vue';
import { NAV_HOST_KEY, SCROLL_HOST_KEY } from '@/features/chat/ui/vue/tabChrome/tabChromeKeys';

vi.mock('obsidian', () => ({ setIcon: (el: HTMLElement, n: string) => el.setAttribute('data-icon', n) }));

/** Builds a scroll host with `mounted` user messages and counts querySelectorAll visits. */
function makeScrollEl(mounted: number) {
  const el = document.createElement('div');
  Object.defineProperty(el, 'scrollHeight', { value: 100000, configurable: true });
  Object.defineProperty(el, 'clientHeight', { value: 500, configurable: true });
  el.scrollTop = 250;
  el.scrollTo = vi.fn();
  let visited = 0;
  const realQSA = el.querySelectorAll.bind(el);
  (el as unknown as { querySelectorAll: typeof el.querySelectorAll }).querySelectorAll = ((sel: string) => {
    const r = realQSA(sel); visited += r.length; return r;
  }) as typeof el.querySelectorAll;
  for (let i = 0; i < mounted; i++) {
    const m = document.createElement('div');
    m.className = 'specorator-message-user';
    Object.defineProperty(m, 'offsetTop', { value: i * 100, configurable: true });
    el.appendChild(m);
  }
  return { el, visited: () => visited };
}

describe('NavOverlay scan scaling (migrated from navigationSidebar.perf)', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('scans O(mounted) user messages, not conversation length', async () => {
    for (const mounted of [10, 50, 100]) {
      const { el, visited } = makeScrollEl(mounted);
      const scrollHost = shallowRef<HTMLElement | null>(el);
      const w = mount(NavOverlay, { global: { provide: { [SCROLL_HOST_KEY as symbol]: scrollHost, [NAV_HOST_KEY as symbol]: () => null } } });
      await w.find('.specorator-nav-btn-next').trigger('click');
      // One scan visits at most the mounted set once.
      expect(visited()).toBeLessThanOrEqual(mounted);
    }
  });
});
```

- [ ] **Step 2: Run it to verify it passes**

Run: `npm run test:vue -- tests/vue/chat/sidePanels/navOverlayScaling.test.ts`
Expected: PASS.

- [ ] **Step 3: Cut over the post-transcript-mount binding**

In `src/features/chat/tabs/tabControllers.ts` (~265-268), replace:

```ts
  if (scrollEl && scrollEl !== wrapperEl) {
    tab.ui.navigationSidebar?.rebindScrollEl(scrollEl);
    tab.controllers.navigationController?.rebindMessagesEl(scrollEl);
  }
```

with:

```ts
  if (scrollEl && scrollEl !== wrapperEl) {
    tab.mountedTabChrome?.setScrollHost(scrollEl);
    tab.controllers.navigationController?.rebindMessagesEl(scrollEl);
  }
```

> Also push the initial host even when `scrollEl === wrapperEl` is false-y is not needed — `setScrollHost` is a no-op-safe reactive set. But to bind on FIRST mount regardless, add right after the `tab.dom.messagesEl = scrollEl ?? wrapperEl;` line: `tab.mountedTabChrome?.setScrollHost(tab.dom.messagesEl);` — this guarantees NavOverlay binds even if the scroll host equals the wrapper. Keep both: the unconditional set binds; the conditional block additionally rebinds the NavigationController.

- [ ] **Step 4: Delete `NavigationSidebar` construction + calls in `tabUi.ts`**

In `src/features/chat/tabs/tabUi.ts`:
- Delete `import { NavigationSidebar } from '../ui/NavigationSidebar';`.
- Delete the block (~490-495):

```ts
  if (dom.messagesEl.parentElement) {
    tab.ui.navigationSidebar = new NavigationSidebar(
      dom.messagesEl.parentElement,
      dom.messagesEl
    );
  }
```

- In the `state.callbacks` assignment, delete `onAutoScrollChanged: () => tab.ui.navigationSidebar?.updateVisibility(),`. (Auto-scroll no longer drives nav visibility; the composable's scroll + ResizeObserver listeners cover overflow changes.)
- Delete the `ResizeObserver` block (~517-522) that observes `dom.messagesEl` for `tab.ui.navigationSidebar?.updateVisibility()` — the composable owns its own ResizeObserver now.

- [ ] **Step 5: Delete nav teardown in `tabLifecycle.ts`**

In `src/features/chat/tabs/tabLifecycle.ts`:
- In `activateTab` (~151), delete `tab.ui.navigationSidebar?.updateVisibility();` (the composable re-evaluates on its own listeners; the tab-chrome island stays mounted across activate/deactivate).
- In `destroyTabUi` (~198-199), delete `tab.ui.navigationSidebar?.destroy();` and `tab.ui.navigationSidebar = null;`.

- [ ] **Step 6: Drop the `navigationSidebar` field + delete the files**

In `src/features/chat/tabs/types.ts`, delete `navigationSidebar: NavigationSidebar | null;` from `TabUIComponents` and the `import type { NavigationSidebar } ...` line.
In `src/features/chat/tabs/tabFactory.ts`, delete `navigationSidebar: null,` from the `ui` object literal.
- Delete `src/features/chat/ui/NavigationSidebar.ts`.
- Delete `tests/unit/features/chat/ui/NavigationSidebar.test.ts`.
- Delete `tests/perf/navigationSidebar.perf.test.ts`.

> `git grep -n "navigationSidebar\|NavigationSidebar\|rebindScrollEl"` — expect zero hits in `src/`. The `RENDER_WINDOW_SIZE` import in the deleted perf test is gone with it. Fix any straggler.

- [ ] **Step 7: Run tests**

Run: `npm run test:vue`
Expected: PASS.

Run: `npm run test:perf`
Expected: PASS (no `navigationSidebar.perf`; `multiTabStreaming.perf` etc. still green).

- [ ] **Step 8: Commit**

```bash
rm -rf coverage
npm run typecheck && npm run typecheck:vue && npm run lint && npm run test:vue && npm run test -- --selectProjects unit && npm run build && npm run check:css && npm run check:loc
rm -rf coverage && npm run check:quality
git config user.email noreply@anthropic.com && git config user.name Claude
git add -A
git commit -m "$(cat <<'EOF'
feat(chat): cut over NavOverlay scroll-host binding; delete NavigationSidebar.ts

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014VDsSXWHRqZr2EcNgDX2eq
EOF
)"
```

## Phase 5 — DOM-contract test + docs + re-lock

### Task 14: Cross-surface DOM-contract test

**Files:**
- Create: `tests/vue/chat/sidePanels/sidePanelsDomContract.test.ts`

- [ ] **Step 1: Write the contract test**

Create `tests/vue/chat/sidePanels/sidePanelsDomContract.test.ts`. It asserts each migrated surface emits its legacy classes over a rich projection, and that NavOverlay reads the transcript's `.specorator-message-user` via the scroll host:

```ts
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { shallowRef } from 'vue';

import GitActionButton from '@/features/chat/ui/vue/components/GitActionButton.vue';
import WorkOrderActivityDropdown from '@/features/chat/ui/vue/components/WorkOrderActivityDropdown.vue';
import ConversationHistoryDropdown from '@/features/chat/ui/vue/components/ConversationHistoryDropdown.vue';
import { CALLBACKS_KEY as SHELL_CB } from '@/features/chat/ui/vue/chatShellKeys';
import { useChatShellStore } from '@/features/chat/ui/vue/stores/chatShellStore';
import StatusPanel from '@/features/chat/ui/vue/tabChrome/StatusPanel.vue';
import NavOverlay from '@/features/chat/ui/vue/tabChrome/NavOverlay.vue';
import { CALLBACKS_KEY as CHROME_CB, NAV_HOST_KEY, SCROLL_HOST_KEY } from '@/features/chat/ui/vue/tabChrome/tabChromeKeys';
import { useTabChromeStore } from '@/features/chat/ui/vue/tabChrome/stores/tabChromeStore';

vi.mock('obsidian', () => ({ setIcon: (el: HTMLElement, n: string) => el.setAttribute('data-icon', n), Notice: vi.fn() }));
vi.mock('@/i18n/i18n', () => ({ t: (k: string) => k }));

const shellCb = () => ({
  onGitCommit: vi.fn(), onOpenWorkOrderItem: vi.fn(), onCloseWorkOrderTab: vi.fn(),
  onOpenHistory: vi.fn(), onSelectConversation: vi.fn(), onOpenConversationInNewTab: vi.fn(),
  onRenameConversation: vi.fn(), onDeleteConversation: vi.fn(), onRegenerateConversationTitle: vi.fn(),
  onConversationContextMenu: vi.fn(),
});

describe('side panels DOM contract', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('GitActionButton emits .specorator-git-action* classes', () => {
    const store = useChatShellStore();
    store.setGit({ isRepo: true, dirtyCount: 2, visible: true });
    const w = mount(GitActionButton, { global: { provide: { [SHELL_CB as symbol]: shellCb() } } });
    for (const c of ['specorator-git-action', 'specorator-git-action-btn', 'specorator-git-action-icon', 'specorator-git-action-label', 'specorator-git-action-badge']) {
      expect(w.find(`.${c}`).exists()).toBe(true);
    }
  });

  it('WorkOrderActivityDropdown emits .specorator-work-order-activity* classes', async () => {
    const store = useChatShellStore();
    store.setWorkOrder({ items: [{ id: 'i', path: 'p', title: 'T', status: 'running', labelKey: 'k', actionHintKey: 'a', sidepanelTabId: null }], closableTabs: [{ tabId: 't', title: 'D' }], runningCount: 1, attentionCount: 1 } as never);
    const w = mount(WorkOrderActivityDropdown, { global: { provide: { [SHELL_CB as symbol]: shellCb() } } });
    await w.find('.specorator-work-order-activity-toggle').trigger('click');
    for (const c of ['specorator-work-order-activity', 'specorator-work-order-activity-toggle', 'specorator-work-order-activity-count', 'specorator-work-order-activity-menu', 'specorator-work-order-activity-item', 'specorator-work-order-activity-close']) {
      expect(w.find(`.${c}`).exists()).toBe(true);
    }
  });

  it('ConversationHistoryDropdown emits .specorator-history-* classes', async () => {
    const store = useChatShellStore();
    store.setConversations({ items: [{ id: 'a', providerId: 'claude', title: 'A', createdAt: 1, updatedAt: 1, lastResponseAt: 1, messageCount: 1, preview: '' }], currentConversationId: 'a', perItem: { a: { openState: 'current' } } } as never);
    const w = mount(ConversationHistoryDropdown, { global: { provide: { [SHELL_CB as symbol]: shellCb() } } });
    await w.find('.specorator-header-btn').trigger('click');
    for (const c of ['specorator-history-container', 'specorator-history-menu', 'specorator-history-header', 'specorator-history-list', 'specorator-history-item', 'specorator-history-item-icon', 'specorator-history-item-content', 'specorator-history-item-title', 'specorator-history-item-date', 'specorator-history-item-actions']) {
      expect(w.find(`.${c}`).exists()).toBe(true);
    }
  });

  it('StatusPanel emits .specorator-status-panel-* classes', async () => {
    const store = useTabChromeStore();
    store.setTodos([{ content: 'x', status: 'pending', activeForm: 'X' }] as never);
    store.setBashOutputs([{ id: 'a', command: 'ls', status: 'completed', output: 'o' }] as never);
    const w = mount(StatusPanel, { global: { provide: { [CHROME_CB as symbol]: { onCopyBashOutput: vi.fn(), onClearBashOutputs: vi.fn(), resolveNavHost: () => null } } } });
    await w.vm.$nextTick();
    for (const c of ['specorator-status-panel', 'specorator-status-panel-bash', 'specorator-status-panel-bash-entry', 'specorator-status-panel-todos', 'specorator-status-panel-header', 'specorator-todo-item']) {
      expect(w.find(`.${c}`).exists()).toBe(true);
    }
  });

  it('NavOverlay reads .specorator-message-user via the scroll host and drives next', async () => {
    const el = document.createElement('div');
    Object.defineProperty(el, 'scrollHeight', { value: 5000, configurable: true });
    Object.defineProperty(el, 'clientHeight', { value: 400, configurable: true });
    el.scrollTop = 0; el.scrollTo = vi.fn();
    const m = document.createElement('div'); m.className = 'specorator-message-user';
    Object.defineProperty(m, 'offsetTop', { value: 900, configurable: true });
    el.appendChild(m);
    const scrollHost = shallowRef<HTMLElement | null>(el);
    const w = mount(NavOverlay, { global: { provide: { [SCROLL_HOST_KEY as symbol]: scrollHost, [NAV_HOST_KEY as symbol]: () => null } } });
    for (const c of ['specorator-nav-sidebar', 'specorator-nav-btn-top', 'specorator-nav-btn-prev', 'specorator-nav-btn-next', 'specorator-nav-btn-bottom']) {
      expect(w.find(`.${c}`).exists()).toBe(true);
    }
    await w.find('.specorator-nav-btn-next').trigger('click');
    expect(el.scrollTo).toHaveBeenCalledWith({ top: 890, behavior: 'smooth' });
  });
});
```

- [ ] **Step 2: Run it**

Run: `npm run test:vue -- tests/vue/chat/sidePanels/sidePanelsDomContract.test.ts`
Expected: PASS. If any class is missing, fix the SFC (the components must emit the legacy classes for CSS parity).

- [ ] **Step 3: Commit**

```bash
rm -rf coverage
npm run typecheck && npm run typecheck:vue && npm run lint && npm run test:vue && npm run test -- --selectProjects unit && npm run build && npm run check:css && npm run check:loc
rm -rf coverage && npm run check:quality
git config user.email noreply@anthropic.com && git config user.name Claude
git add tests/vue/chat/sidePanels/sidePanelsDomContract.test.ts
git commit -m "$(cat <<'EOF'
test(chat): cross-surface side-panels DOM-contract backstop

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014VDsSXWHRqZr2EcNgDX2eq
EOF
)"
```

### Task 15: Docs — CLAUDE.md + ADR 0005

**Files:**
- Modify: `src/features/chat/CLAUDE.md`
- Modify: `docs/adr/0005-chat-shell-vue-migration.md`

- [ ] **Step 1: Update `src/features/chat/CLAUDE.md`**

In the opening paragraph, replace the sentence:

```
Still-imperative: the remaining side panels (status panel, navigation sidebar) — the final sub-project.
```

with:

```
All chat *rendering* surfaces are now Vue islands (ADR 0005 sub-project 4 migrated the status panel, navigation sidebar, conversation-history dropdown, work-order-activity dropdown, and git-action button). The only remaining imperative code is the retained engine widgets (inline-edit's shared `SlashCommandDropdown`) and the truth-owning managers/controllers/providers behind the projection seams.
```

In the "Architecture" tree, under `UI Components`, delete the `StatusPanel`, `ConversationHistoryView`, and `NavigationSidebar` lines. In the "Controllers" table, change the `ConversationController` row to drop "Delegates the history-dropdown list UI to `ConversationHistoryView`…" — reword to: "Session switching, history reload, save, and rewind. The header conversation-history dropdown is now a Vue component (`ConversationHistoryDropdown.vue`) reading the projected `chatShellStore.conversations` slice; `SpecoratorView` owns the async title-regeneration + delete flows."

In the "Chat Shell Vue Island" section, replace the "Still imperative" bullet (the one describing `mountHistoryHost`/`mountWorkOrderHost`/`mountGitActionHost`) with:

```
- **Header widgets now native Vue**: the conversation-history dropdown
  (`ConversationHistoryDropdown.vue`), the work-order-activity dropdown
  (`WorkOrderActivityDropdown.vue`), and the git-action button
  (`GitActionButton.vue`) render directly in `ChatHeader.vue`/`HeaderActions.vue`
  off the projected `chatShellStore` `conversations`/`workOrder`/`git` slices and
  fire the conversation/work-order/git `ChatShellCallbacks` delegators. The
  `mount*Host` callbacks and their host refs were deleted (ADR 0005 sub-project 4).
```

Add a new top-level section after "Composer Vue Island":

```
## Tab-Chrome Vue Island

The per-tab side panels — the StatusPanel (todos + bang-bash outputs) and the
floating NavOverlay (4-button scroll navigator) — are a Vue 3 + Pinia island
under `ui/vue/tabChrome/` (ADR 0005 sub-project 4), mounted by `mountTabChrome`
(`tabs/tabChromeMount.ts`) into each tab's `statusPanelContainerEl`, mirroring
`mountTabComposer`. `StatusPanel.vue` renders in place (reusing `TodoListView.vue`
for todos, the generic `.specorator-tool-*` classes for bash entries; collapse
state is view-local). `NavOverlay.vue` `<Teleport>`s to `.specorator-nav-sidebar-host`
and its scroll geometry stays imperative in `useTabNavigation`, bound to the
transcript scroll host pushed post-mount via `MountedTabChrome.setScrollHost`.

- **Store**: `ui/vue/tabChrome/stores/tabChromeStore.ts` (`useTabChromeStore`) —
  `todos` + `bashOutputs`, both `shallowRef`. Truth stays in
  `ChatState.currentTodos` + the engine-side `BashOutputStore` (LRU-50, the one
  state relocation: the bang-bash `onSubmit` writes it, surviving conversation
  switch + Vue remount).
- **Projection seam**: `tabs/tabChrome.ts`'s `TabChromeProjection` (mirror of
  `TabComposerProjection`) fans `{ todos, bashOutputs }` on todo change + bash
  start/finish; `onTodosChanged` and `BashOutputStore.onChange` call `emit()`.
- **Callbacks**: `TabChromeCallbacks` — `onCopyBashOutput` / `onClearBashOutputs`
  (bash truth stays engine-side) and `resolveNavHost` (NavOverlay teleport target).
- **DOM contract**: `tests/vue/chat/sidePanels/sidePanelsDomContract.test.ts` locks
  the legacy `.specorator-status-panel-*` / `.specorator-nav-*` / `.specorator-history-*`
  / `.specorator-work-order-activity-*` / `.specorator-git-action*` classes plus
  NavOverlay's cross-surface read of the transcript's `.specorator-message-user`.
```

- [ ] **Step 2: Update ADR 0005**

In `docs/adr/0005-chat-shell-vue-migration.md`, under "## Status", update the implemented line to note sub-project 4 landed. Then add a new section after "## Sub-project 3 — Composer (2026-07-16)":

```
## Sub-project 4 — Side panels + header remnants (2026-07-17)

The final chat rendering migration: the status panel + navigation sidebar (per-tab)
and the conversation-history dropdown + work-order-activity dropdown + git-action
button (per-view header) became Vue. Two homes reused the established seams:

1. **Shell island extension (Home 1).** The three header widgets became native Vue
   components (`GitActionButton.vue`, `WorkOrderActivityDropdown.vue`,
   `ConversationHistoryDropdown.vue`) reading three new projected `chatShellStore`
   slices (`conversations`/`workOrder`/`git`) and firing new `ChatShellCallbacks`
   delegators. The `mountHistoryHost`/`mountWorkOrderHost`/`mountGitActionHost`
   callbacks + host refs + `ConversationHistoryView`/`WorkOrderActivityDropdown`/
   `GitActionButton` imperative widgets were deleted; `ConversationController` shed
   its list-presentation role (the async title-regeneration + delete flows moved to
   `SpecoratorView`). The perf-locked history windowing (chunk-50 + Show-more +
   active-pin) was reproduced in the Vue component and its assertion moved from
   `tests/perf/conversationHistory.perf.test.ts` to the Vitest lane
   (`conversationHistoryWindow.test.ts`); the `loadConversations` activation proxy
   stayed in the Jest perf lane.
2. **New per-tab tab-chrome island (Home 2).** `mountTabChrome` +
   `createTabChromePinia` + `TabChromeProjection` (`{ todos, bashOutputs }`) +
   `useTabChromeStore`, mirroring `mountTabComposer`, mounted at
   `statusPanelContainerEl`. `StatusPanel.vue` renders in place; `NavOverlay.vue`
   `<Teleport>`s to a new `.specorator-nav-sidebar-host`, with imperative scroll
   geometry in `useTabNavigation` bound to the transcript scroll host via
   `MountedTabChrome.setScrollHost` (post-transcript-mount, popout-safe
   `nodeType === 1`). The panel-local bash-output LRU-50 map was lifted to an
   engine-side `BashOutputStore` so it survives conversation switch + remount.
   `navigationSidebar.perf`'s scan-scaling guard moved to the Vitest lane
   (`navOverlayScaling.test.ts`).

After this sub-project the chat feature has NO imperative rendering surface: shell,
transcript, composer, side panels, and header widgets are all Vue islands. The only
imperative code is the retained engine widgets (inline-edit's `SlashCommandDropdown`)
and the truth-owning managers/controllers/providers behind the projection seams.

- Spec (sub-project 4): `docs/superpowers/specs/2026-07-17-side-panels-vue-migration-design.md`
- Plan (sub-project 4): `docs/superpowers/plans/2026-07-17-side-panels-vue-migration.md`
```

- [ ] **Step 3: Commit**

```bash
rm -rf coverage
npm run typecheck && npm run typecheck:vue && npm run lint && npm run test:vue && npm run test -- --selectProjects unit && npm run build && npm run check:css && npm run check:loc
rm -rf coverage && npm run check:quality
git config user.email noreply@anthropic.com && git config user.name Claude
git add src/features/chat/CLAUDE.md docs/adr/0005-chat-shell-vue-migration.md
git commit -m "$(cat <<'EOF'
docs(chat): record side-panels Vue migration (ADR 0005 sub-project 4)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014VDsSXWHRqZr2EcNgDX2eq
EOF
)"
```

### Task 16: Re-lock the LOC + quality ratchets (net shrink)

**Files:**
- Modify: `scripts/loc-baseline.json`
- Modify: `scripts/quality-baseline.json`

- [ ] **Step 1: Confirm the current LOC guard state**

Run: `rm -rf coverage && npm run check:loc`
Expected: PASS. `SpecoratorView.ts` and `ConversationController.ts` shrank (deleted history/work-order/git wiring); the LOC guard is shrink-only and does NOT auto-tighten grandfathered ceilings, so re-lock them down.

- [ ] **Step 2: Re-lock the two shrunk entries**

Run `node -e "const fs=require('fs');for(const f of ['src/features/chat/SpecoratorView.ts','src/features/chat/controllers/ConversationController.ts']){const n=fs.readFileSync(f,'utf8').split('\n').filter(l=>l.trim()).length;console.log(f,n);}"` to read the current nonblank LOC of each (the guard counts nonblank lines; if `scripts/check-loc.mjs` uses a different definition, read it first and match). Then, in `scripts/loc-baseline.json`, lower the `loc` for `src/features/chat/SpecoratorView.ts` and `src/features/chat/controllers/ConversationController.ts` to the current values, and append to each `reason` string (preserve the existing text):

For `SpecoratorView.ts`, append:
```
 Re-locked down (2026-07-17, ADR 0005 sub-project 4): deleted the history/work-order host plumbing (mountHistoryHost/mountWorkOrderHost/mountGitActionHost, toggleHistoryDropdown/updateHistoryDropdown/openHistoryConversation*, mountWorkOrderActivityDropdown) in favor of native Vue header components reading projected chatShellStore slices; added the projection builders + async title-regen/delete flows.
```

For `ConversationController.ts`, append:
```
 Re-locked down (2026-07-17, ADR 0005 sub-project 4): shed the history-dropdown list presentation (renderHistoryDropdown/updateHistoryDropdown/toggleHistoryDropdown/regenerateTitle/formatDate + the ConversationHistoryView field/deps) now that the dropdown is a Vue component; the async title-regen + delete flows moved to SpecoratorView.
```

> If `check:loc` reports a NEW oversized file that is not grandfathered (unlikely — all new files are small SFCs/stores), the guard will fail; split or justify per `docs/build-ci/quality-gates.md`. Do not add new grandfather entries without cause.

- [ ] **Step 3: Re-lock the quality baseline (no coverage dir)**

Run:
```bash
rm -rf coverage && npm run check:quality
```
If it fails because a counter DROPPED (net shrink is expected — deleted `StatusPanel.ts` 470 + `ConversationHistoryView.ts` 413 + `NavigationSidebar.ts` 144 + `GitActionButton.ts` + `WorkOrderActivityDropdown.ts`, minus the new SFCs), regenerate the baseline:

```bash
rm -rf coverage && npm run check:quality -- --update
```

Then edit the `description` field in `scripts/quality-baseline.json` to append a dated note (preserve the existing text):

```
2026-07-17 (side panels Vue migration, ADR 0005 sub-project 4, re-lock): net shrink after deleting StatusPanel.ts, ConversationHistoryView.ts, NavigationSidebar.ts, GitActionButton.ts, and WorkOrderActivityDropdown.ts in favor of Vue islands (tabChrome + native header components); the projection/callback island-seam mirroring is offset by the deleted imperative render code.
```

Verify the regenerated counters only shrank (or maintainability only rose):

```bash
git diff scripts/quality-baseline.json
```

- [ ] **Step 4: Final full-suite gate**

```bash
rm -rf coverage
npm run typecheck && npm run typecheck:vue && npm run lint && npm run test:vue && npm run test -- --selectProjects unit && npm run test:perf && npm run build && npm run check:css && npm run check:loc
rm -rf coverage && npm run check:quality
```
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git config user.email noreply@anthropic.com && git config user.name Claude
git add scripts/loc-baseline.json scripts/quality-baseline.json
git commit -m "$(cat <<'EOF'
chore(chat): re-lock loc + quality baselines after side-panels Vue migration

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014VDsSXWHRqZr2EcNgDX2eq
EOF
)"
```

---

## Self-Review

**Spec coverage** — every spec section maps to a task:
- Home 1 shell store slices (`conversations`/`workOrder`/`git`) → Tasks 1-3. New `ChatShellCallbacks` delegators → Task 4. Native header components + cutover + `ConversationController` sheds list presentation → Tasks 5-7. Perf window preserved + migrated → Tasks 7-8. Obsidian `Menu` context menu (imperative, invoked from Vue) → Task 4 (`showHistoryContextMenu`) + Task 7 (`onConversationContextMenu`). Inline rename `<input>` → Task 7.
- Home 2 tab-chrome island (`mountTabChrome`/`createTabChromePinia`/`TabChromeProjection`/`useTabChromeStore`/`tabChromeKeys`) → Tasks 9-11. Bash-output engine owner (LRU-50) → Task 9. StatusPanel reusing `TodoListView.vue` + view-local collapse → Task 10. Wire into tab lifecycle mirroring `mountTabComposer` ordering → Task 11.
- NavOverlay teleport + `useTabNavigation` (rAF overflow, offsetTop scan, smooth scrollTo, scroll-host handle key, popout-safe `nodeType===1`, post-mount rebind) + `.specorator-nav-sidebar-host` in `buildTabDOM` → Tasks 12-13.
- DOM-contract test → Task 14. Docs (CLAUDE.md + ADR) → Task 15. Re-lock `check:loc` + `check:quality` (no coverage dir) → Task 16.

**Type/name consistency (verified across tasks):**
- Store slices: `conversations` / `workOrder` / `git`; setters `setConversations` / `setWorkOrder` / `setGit` (Tasks 1, 2, 3, 5, 6, 7).
- `TabChromeProjection` snapshot field names: `todos`, `bashOutputs` — identical in `tabChrome.ts`, `tabChromeStore.ts`, `tabChromeCallbacks.ts`, `useTabChromeEventRouting.ts`, `StatusPanel.vue`, and every test (Tasks 9-11, 14).
- Element-handle / injection key names: `SCROLL_HOST_KEY`, `NAV_HOST_KEY`, `CALLBACKS_KEY` (tab-chrome) — consistent in `tabChromeKeys.ts`, `mountTabChromeApp.ts`, `useTabNavigation.ts`, `NavOverlay.vue`, tests (Tasks 10, 12, 13, 14).
- Bash-output engine owner: `BashOutputStore` with `add`/`update`/`clear`/`list`/`latest` and `PanelBashOutput` — consistent in `BashOutputStore.ts`, `tabChrome.ts`, `tabChromeMount.ts`, `tabUi.ts`, `tabChromeStore.ts` (Tasks 9, 10, 11).
- Teleport-host class: `.specorator-nav-sidebar-host` — `buildTabDOM` (Task 12), `resolveNavHost` (Task 11/12), NavOverlay teleport target (Task 12).
- Callback delegator names: `onSelectConversation` / `onOpenConversationInNewTab` / `onRenameConversation` / `onDeleteConversation` / `onRegenerateConversationTitle` / `onConversationContextMenu` / `onOpenWorkOrderItem` / `onCloseWorkOrderTab` / `onGitCommit` — consistent in `chatShellCallbacks.ts`, `SpecoratorView.buildChatShellCallbacks`, and every Vue component + test (Tasks 4-7, 14).
- Mount function names: ui-level `mountTabChromeApp` (in `ui/vue/tabChrome/`), tabs-level orchestrator `mountTabChrome` (in `tabs/tabChromeMount.ts`) — distinct, consistent (Tasks 10, 11).

**Placeholder scan:** No "TBD"/"similar to Task N"/"add error handling" — every code step carries full code. Cross-references to sibling files (e.g. "confirm `IconSpan` prop names") are grounding instructions with a concrete fallback, not deferred work.

**Resolved spec ambiguities:**
- The spec's `perItem: { openState, titleGenerationStatus }` — `titleGenerationStatus` already lives on `ConversationMeta`, so `perItem` carries only the computed `openState` and the component reads `titleGenerationStatus` off the item directly (no duplication). Recorded in Task 1.
- The spec wrote nav button classes as `.specorator-nav-btn--{top,prev,next,bottom}`; the real imperative DOM + CSS use single-dash `specorator-nav-btn-top`/`-prev`/`-next`/`-bottom`. The Vue port emits the REAL single-dash classes for CSS parity (Task 12/14).
- "History fresh at open": there is no global conversation-list change event (only `conversation:renamed`). The imperative dropdown re-read `getConversationList()` on each open; the Vue component preserves this by calling `cb.onOpenHistory()` (re-purposed to `emitChatShellChange()`) on toggle-open, so the projected list is fresh (Tasks 4, 7).
- Regenerate-title + delete async flows: relocated from `ConversationHistoryView` to `SpecoratorView` (`regenerateHistoryTitle`/`deleteHistoryConversation`/`showHistoryContextMenu`) rather than the controller, since they now drive the header re-projection (`emitChatShellChange`) the view owns (Task 4).
