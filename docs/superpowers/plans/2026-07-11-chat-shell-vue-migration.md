# Chat Shell Vue Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `SpecoratorView`'s imperative outer frame (header + tab-badge strip + tab-content container) with a Vue 3 + Pinia island over the untouched chat engine, with the still-imperative per-tab transcript/composer DOM hosted inside a Vue-owned "leave-me-alone" container.

**Architecture:** ADR 0004 (Agent Board) seam applied to chat. `TabManager`, controllers, `ChatState`, and per-tab DOM stay imperative and untouched. `SpecoratorView` mounts `ChatShellRoot.vue`; a Pinia `useChatShellStore` is a reactive projection over `TabManager.getTabBarItems()` + header state; `useChatShellEventRouting` maps the existing `TabManager` callbacks to store setters. Vue→engine goes through a `markRaw`'d callbacks object behind an inject key. The `specorator-tab-content-container` is rendered once by Vue and its children are owned by the imperative tab layer.

**Tech Stack:** Vue 3 (SFC, `<script setup>`), Pinia (setup stores), Vitest + @testing-library/vue (`tests/vue/chat/`), Obsidian API, esbuild. Reuse the shipped island harness: `src/features/tasks/ui/vue/globalPinia.ts` pattern, `.specorator-vue` style baseline + `--sp-*` tokens.

**Spec:** `docs/superpowers/specs/2026-07-11-chat-shell-vue-migration-design.md`

**Reference implementation to mirror:** the Agent Board island — `src/features/tasks/ui/vue/` (`globalPinia.ts`, `boardKeys.ts`, `stores/agentBoardStore.ts`, `useBoardEventRouting.ts`, `AgentBoardRoot.vue`), tests under `tests/vue/tasks/`.

---

## File Structure

**Create:**
- `src/features/chat/ui/vue/globalPinia.ts` — one module-global Pinia for the chat leaf (mirror of the board's; a chat-scoped copy keeps the two islands' stores from colliding).
- `src/features/chat/ui/vue/chatShellKeys.ts` — inject keys: `PLUGIN_KEY`, `CALLBACKS_KEY`, `CONTENT_HOST_KEY`.
- `src/features/chat/ui/vue/chatShellCallbacks.ts` — the `ChatShellCallbacks` interface (Vue→engine seam), data-only.
- `src/features/chat/ui/vue/stores/chatShellStore.ts` — `useChatShellStore` projection.
- `src/features/chat/ui/vue/useChatShellEventRouting.ts` — `TabManager` callbacks → store setters.
- `src/features/chat/ui/vue/ChatShellRoot.vue` — frame; mounts store + routing; exposes the content-host ref.
- `src/features/chat/ui/vue/components/ChatHeader.vue`
- `src/features/chat/ui/vue/components/ChatTitle.vue`
- `src/features/chat/ui/vue/components/BoundAgentChip.vue`
- `src/features/chat/ui/vue/components/TabStrip.vue`
- `src/features/chat/ui/vue/components/TabBadge.vue`
- `src/features/chat/ui/vue/components/HeaderActions.vue`
- `src/features/chat/ui/vue/components/TabContentHost.vue`
- `src/features/chat/ui/vue/components/ChatEmptyState.vue`
- Tests under `tests/vue/chat/`.

**Modify:**
- `src/features/chat/SpecoratorView.ts` — mount `ChatShellRoot`; delete `buildHeader`/`updateTabBar`/imperative frame; host dropdowns into Vue refs; wire the content-host.
- `jest.config.js` — exclude `src/features/chat/ui/vue/**` from coverage.
- `vitest.config.mts` — add `src/features/chat/ui/vue/**` to `coverage.include`.
- `src/features/chat/CLAUDE.md`, root `CLAUDE.md` — document the island.
- `docs/adr/` — new ADR for the chat shell island.

**Delete (Task 6):**
- `src/features/chat/tabs/TabBar.ts` and its imperative call sites.

**Style:**
- `src/style/vue/` — chat-shell component styles on the `.specorator-vue` baseline (or a `chat-shell.css` fork), reusing `--sp-*` tokens.

---

## Task 1: `useChatShellStore` projection (unwired)

**Files:**
- Create: `src/features/chat/ui/vue/globalPinia.ts`
- Create: `src/features/chat/ui/vue/stores/chatShellStore.ts`
- Test: `tests/vue/chat/chatShellStore.test.ts`

- [ ] **Step 1: Create the chat Pinia singleton**

`src/features/chat/ui/vue/globalPinia.ts`:

```ts
import type { Pinia } from 'pinia';
import { createPinia } from 'pinia';

// One Pinia for the chat leaf: the shell store is view-global for this leaf.
// Module scope is safe — the plugin bundle's module registry is discarded on
// plugin unload/reload. Mirrors src/features/tasks/ui/vue/globalPinia.ts.
let pinia: Pinia | null = null;

export function getChatShellPinia(): Pinia {
  pinia ??= createPinia();
  return pinia;
}

/** Test-only: drop the singleton so each test starts from clean store state. */
export function resetChatShellPinia(): void {
  pinia = null;
}
```

- [ ] **Step 2: Write the failing store test**

`tests/vue/chat/chatShellStore.test.ts`:

```ts
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';

import type { TabBarItem } from '@/features/chat/tabs/types';
import { useChatShellStore } from '@/features/chat/ui/vue/stores/chatShellStore';

function item(id: string, overrides: Partial<TabBarItem> = {}): TabBarItem {
  return {
    id, index: 1, title: id, providerId: 'claude',
    isActive: false, isStreaming: false, needsAttention: false,
    canClose: true, kind: 'chat', ...overrides,
  } as TabBarItem;
}

describe('useChatShellStore', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('defaults to empty tabs, null header fields, and no active tab', () => {
    const store = useChatShellStore();
    expect(store.tabs).toEqual([]);
    expect(store.activeTabId).toBeNull();
    expect(store.header).toEqual({ title: 'Specorator', boundAgent: null, activeProviderId: null, tabBarVisible: false });
  });

  it('setTabs replaces the array with a NEW reference (shallowRef watch fires)', () => {
    const store = useChatShellStore();
    const before = store.tabs;
    store.setTabs([item('a', { isActive: true })]);
    expect(store.tabs).not.toBe(before);
    expect(store.tabs[0].id).toBe('a');
  });

  it('setHeader merges the projected header chrome', () => {
    const store = useChatShellStore();
    store.setHeader({ title: 'Fix bug', boundAgent: { name: 'Reviewer', avatar: null }, activeProviderId: 'codex', tabBarVisible: true });
    expect(store.header.title).toBe('Fix bug');
    expect(store.header.boundAgent?.name).toBe('Reviewer');
    expect(store.header.tabBarVisible).toBe(true);
  });

  it('setActiveTabId records the active selection', () => {
    const store = useChatShellStore();
    store.setActiveTabId('t2');
    expect(store.activeTabId).toBe('t2');
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run tests/vue/chat/chatShellStore.test.ts`
Expected: FAIL — cannot resolve `chatShellStore`.

- [ ] **Step 4: Implement the store**

`src/features/chat/ui/vue/stores/chatShellStore.ts`:

```ts
import { defineStore } from 'pinia';
import { shallowRef } from 'vue';

import type { ProviderId } from '../../../../../core/types/provider';
import type { TabBarItem, TabId } from '../../../tabs/types';

/** Bound-agent chip projection (name + optional avatar data URI/icon). */
export interface ChatBoundAgent {
  name: string;
  avatar: string | null;
}

/** Header chrome the shell renders — projected off TabManager + the active tab. */
export interface ChatShellHeader {
  title: string;
  boundAgent: ChatBoundAgent | null;
  activeProviderId: ProviderId | null;
  /** Drives the tab-strip show/hide (mirrors updateTabBarVisibility). */
  tabBarVisible: boolean;
}

const DEFAULT_HEADER: ChatShellHeader = Object.freeze({
  title: 'Specorator', boundAgent: null, activeProviderId: null, tabBarVisible: false,
});

/**
 * Reactive read-model over the chat shell: the tab-badge strip + header chrome +
 * active selection. I/O and truth stay in TabManager; every setter replaces a
 * whole value/array (shallowRef) so a change fires the watch without deep proxy
 * overhead. Mirrors useAgentBoardStore's projection contract.
 */
export const useChatShellStore = defineStore('chat-shell', () => {
  const tabs = shallowRef<TabBarItem[]>([]);
  const header = shallowRef<ChatShellHeader>(DEFAULT_HEADER);
  const activeTabId = shallowRef<TabId | null>(null);

  function setTabs(next: TabBarItem[]): void {
    tabs.value = next;
  }
  function setHeader(next: ChatShellHeader): void {
    header.value = next;
  }
  function setActiveTabId(id: TabId | null): void {
    activeTabId.value = id;
  }

  return { tabs, header, activeTabId, setTabs, setHeader, setActiveTabId };
});
```

> Note: confirm the `ProviderId` import path against an existing chat file (e.g. `src/features/chat/tabs/types.ts` imports it) and match it exactly.

- [ ] **Step 5: Run it to verify it passes**

Run: `npx vitest run tests/vue/chat/chatShellStore.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Typecheck + commit**

Run: `npm run typecheck && npm run typecheck:vue`
Expected: exit 0.

```bash
git add src/features/chat/ui/vue/globalPinia.ts src/features/chat/ui/vue/stores/chatShellStore.ts tests/vue/chat/chatShellStore.test.ts
git commit -m "feat(chat): useChatShellStore projection + chat Pinia singleton (unwired)"
```

---

## Task 2: `useChatShellEventRouting` composable (unwired)

**Files:**
- Create: `src/features/chat/ui/vue/chatShellKeys.ts`
- Create: `src/features/chat/ui/vue/useChatShellEventRouting.ts`
- Test: `tests/vue/chat/useChatShellEventRouting.test.ts`

**Context:** `SpecoratorView` builds `TabManager` with a callbacks object (`SpecoratorView:277–314`): `onTabCreated`, `onTabSwitched`, `onTabClosed`, `onTabStreamingChanged`, `onTabTitleChanged`, `onTabAttentionChanged`, `onTabConversationChanged`, `onTabProviderChanged`. Each currently calls `this.updateTabBar()` (and some do more). The composable subscribes an **observer** the view feeds these callbacks into, and on any change re-projects `TabManager.getTabBarItems()` + header state into the store. To avoid inventing new events, the view exposes a `subscribeChatShell(observer)` seam (Task 6 wires it) returning an unsubscribe fn; the composable calls it on mount and disposes on unmount.

- [ ] **Step 1: Create inject keys**

`src/features/chat/ui/vue/chatShellKeys.ts`:

```ts
import type { InjectionKey } from 'vue';

import type SpecoratorPlugin from '../../../main';
import type { ChatShellCallbacks } from './chatShellCallbacks';

export const PLUGIN_KEY: InjectionKey<SpecoratorPlugin> = Symbol('chat-shell-plugin');
export const CALLBACKS_KEY: InjectionKey<ChatShellCallbacks> = Symbol('chat-shell-callbacks');
/** A callback the shell invokes once with the content-host element so the
 *  imperative tab layer can mount per-tab DOM into it. */
export const CONTENT_HOST_KEY: InjectionKey<(el: HTMLElement) => void> = Symbol('chat-shell-content-host');
```

- [ ] **Step 2: Create the callbacks + observer contract**

`src/features/chat/ui/vue/chatShellCallbacks.ts`:

```ts
import type { TabBarItem, TabId } from '../../tabs/types';
import type { ChatShellHeader } from './stores/chatShellStore';

/** A single projected snapshot the view pushes on every TabManager change. */
export interface ChatShellSnapshot {
  tabs: TabBarItem[];
  header: ChatShellHeader;
  activeTabId: TabId | null;
}

/** The view-owned subscription seam: fires `onChange` on every relevant
 *  TabManager callback, returns an unsubscribe fn. */
export type ChatShellSubscribe = (onChange: (snapshot: ChatShellSnapshot) => void) => () => void;

/** Vue → engine actions. Thin delegators to SpecoratorView/TabManager methods. */
export interface ChatShellCallbacks {
  subscribe: ChatShellSubscribe;
  onTabClick: (id: TabId) => void;
  onTabClose: (id: TabId) => void;
  onNewTab: () => void;
  onOpenHistory: () => void;
  onOpenWorkOrders: () => void;
  onQuickActions: () => void;
  onRename: (title: string) => void;
  /** Hosts the imperative history + work-order dropdowns into the header. */
  mountHistoryHost: (el: HTMLElement) => void;
  mountWorkOrderHost: (el: HTMLElement) => void;
}
```

- [ ] **Step 3: Write the failing routing test**

`tests/vue/chat/useChatShellEventRouting.test.ts`:

```ts
import { render } from '@testing-library/vue';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent } from 'vue';

import type { ChatShellSnapshot } from '@/features/chat/ui/vue/chatShellCallbacks';
import { useChatShellEventRouting } from '@/features/chat/ui/vue/useChatShellEventRouting';
import { useChatShellStore } from '@/features/chat/ui/vue/stores/chatShellStore';

function snap(overrides: Partial<ChatShellSnapshot> = {}): ChatShellSnapshot {
  return {
    tabs: [], activeTabId: null,
    header: { title: 'Specorator', boundAgent: null, activeProviderId: null, tabBarVisible: false },
    ...overrides,
  };
}

function mountRouting() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const store = useChatShellStore();
  let push: ((s: ChatShellSnapshot) => void) | null = null;
  const unsubscribe = vi.fn();
  const subscribe = vi.fn((onChange: (s: ChatShellSnapshot) => void) => {
    push = onChange;
    return unsubscribe;
  });
  const utils = render(
    defineComponent({
      setup() {
        useChatShellEventRouting(subscribe);
        return () => null;
      },
    }),
    { global: { plugins: [pinia] } },
  );
  return { store, subscribe, unsubscribe, push: (s: ChatShellSnapshot) => push!(s), ...utils };
}

describe('useChatShellEventRouting', () => {
  beforeEach(() => vi.clearAllMocks());

  it('subscribes on mount and pushes snapshots into the store', () => {
    const { store, subscribe, push } = mountRouting();
    expect(subscribe).toHaveBeenCalledTimes(1);
    push(snap({ activeTabId: 't1', header: { title: 'Fix', boundAgent: null, activeProviderId: 'claude', tabBarVisible: true } }));
    expect(store.activeTabId).toBe('t1');
    expect(store.header.title).toBe('Fix');
    expect(store.header.tabBarVisible).toBe(true);
  });

  it('disposes the subscription on unmount', () => {
    const { unsubscribe, unmount } = mountRouting();
    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 4: Run it to verify it fails**

Run: `npx vitest run tests/vue/chat/useChatShellEventRouting.test.ts`
Expected: FAIL — cannot resolve `useChatShellEventRouting`.

- [ ] **Step 5: Implement the composable**

`src/features/chat/ui/vue/useChatShellEventRouting.ts`:

```ts
import { onMounted, onUnmounted } from 'vue';

import type { ChatShellSubscribe } from './chatShellCallbacks';
import { useChatShellStore } from './stores/chatShellStore';

/**
 * Routes the view's TabManager-change stream into the Pinia shell store. The
 * view owns the actual TabManager callbacks and pushes a fully-projected
 * ChatShellSnapshot on every change; this composable just fans it into the
 * store's setters and disposes the subscription on unmount. Mirrors
 * useBoardEventRouting's mount/unmount ownership.
 */
export function useChatShellEventRouting(subscribe: ChatShellSubscribe): void {
  const store = useChatShellStore();
  let dispose: (() => void) | null = null;

  onMounted(() => {
    dispose = subscribe((snapshot) => {
      store.setTabs(snapshot.tabs);
      store.setHeader(snapshot.header);
      store.setActiveTabId(snapshot.activeTabId);
    });
  });

  onUnmounted(() => {
    dispose?.();
    dispose = null;
  });
}
```

- [ ] **Step 6: Run it to verify it passes**

Run: `npx vitest run tests/vue/chat/useChatShellEventRouting.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 7: Typecheck + commit**

Run: `npm run typecheck && npm run typecheck:vue && npm run lint`
Expected: exit 0.

```bash
git add src/features/chat/ui/vue/chatShellKeys.ts src/features/chat/ui/vue/chatShellCallbacks.ts src/features/chat/ui/vue/useChatShellEventRouting.ts tests/vue/chat/useChatShellEventRouting.test.ts
git commit -m "feat(chat): useChatShellEventRouting + shell keys/callbacks contract (unwired)"
```

---

## Task 3: Characterize `TabBar` behavior (lock before touching)

**Files:**
- Test: `tests/vue/chat/tabBarCharacterization.test.ts`

**Context:** Before deleting `TabBar.ts` (Task 6), pin its exact behavior so the Vue `TabStrip`/`TabBadge` (Task 4) reproduce it. `TabBar` is imperative (Obsidian `createDiv`/`setIcon`); test it directly against a jsdom container. `setIcon` is the vitest obsidian mock. These assertions become the acceptance criteria for Task 4.

- [ ] **Step 1: Write the characterization test**

`tests/vue/chat/tabBarCharacterization.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';

import { TabBar } from '@/features/chat/tabs/TabBar';
import type { TabBarItem } from '@/features/chat/tabs/types';

function item(id: string, o: Partial<TabBarItem> = {}): TabBarItem {
  return {
    id, index: 1, title: id, providerId: 'claude',
    isActive: false, isStreaming: false, needsAttention: false,
    canClose: true, kind: 'chat', ...o,
  } as TabBarItem;
}

function mountBar(items: TabBarItem[], cbs: Partial<Parameters<typeof TabBar.prototype.constructor>[1]> = {}) {
  const el = document.createElement('div');
  const bar = new TabBar(el, {
    onTabClick: vi.fn(), onTabClose: vi.fn(), onNewTab: vi.fn(), ...cbs,
  });
  bar.update(items);
  return { el, bar };
}
function badges(el: HTMLElement): HTMLElement[] {
  return [...el.querySelectorAll<HTMLElement>('.specorator-tab-badge')];
}

describe('TabBar characterization (parity target for the Vue TabStrip)', () => {
  it('a plain chat badge shows its 1-based index as text and carries state/aria attrs', () => {
    const { el } = mountBar([item('a', { index: 2, isActive: true, providerId: 'codex' })]);
    const b = badges(el)[0];
    expect(b.textContent).toBe('2');
    expect(b.classList.contains('specorator-tab-badge-active')).toBe(true);
    expect(b.getAttribute('role')).toBe('tab');
    expect(b.getAttribute('aria-selected')).toBe('true');
    expect(b.getAttribute('tabindex')).toBe('0'); // active is the roving tab stop
    expect(b.getAttribute('data-provider')).toBe('codex');
    expect(b.getAttribute('data-kind')).toBe('chat');
    expect(b.getAttribute('aria-label')).toBe('a');
  });

  it('idle vs working vs attention state classes are mutually exclusive on the idle fallback', () => {
    const { el } = mountBar([
      item('idle'),
      item('work', { isStreaming: true }),
      item('attn', { needsAttention: true }),
    ]);
    const [idle, work, attn] = badges(el);
    expect(idle.classList.contains('specorator-tab-badge-idle')).toBe(true);
    expect(work.classList.contains('specorator-tab-badge-working')).toBe(true);
    expect(work.getAttribute('aria-busy')).toBe('true');
    expect(work.getAttribute('data-working')).toBe('true');
    expect(work.getAttribute('aria-label')).toBe('work (working)');
    expect(attn.classList.contains('specorator-tab-badge-attention')).toBe(true);
    expect(idle.classList.contains('specorator-tab-badge-idle')).toBe(true);
    expect(work.classList.contains('specorator-tab-badge-idle')).toBe(false);
  });

  it('a work-order badge renders a wrench glyph (no number), the work-order class, and the aria suffix', () => {
    const { el } = mountBar([item('c', { title: 'Ship it', index: 5 }), item('wo', { kind: 'work-order', title: 'Run', canClose: false })]);
    const wo = badges(el)[1];
    expect(wo.classList.contains('specorator-tab-badge--work-order')).toBe(true);
    expect(wo.querySelector('.specorator-tab-badge-icon')).toBeTruthy();
    expect(wo.textContent).toBe('');
    expect(wo.getAttribute('aria-label')).toBe('Run (work order)');
  });

  it('the first work-order badge after a chat group gets the --work-order-first margin class', () => {
    const { el } = mountBar([item('c'), item('wo1', { kind: 'work-order' }), item('wo2', { kind: 'work-order' })]);
    const [, wo1, wo2] = badges(el);
    expect(wo1.classList.contains('specorator-tab-badge--work-order-first')).toBe(true);
    expect(wo2.classList.contains('specorator-tab-badge--work-order-first')).toBe(false);
  });

  it('an agent-bound chat badge prepends a user glyph before the number and gets the --agent class', () => {
    const { el } = mountBar([item('a', { isAgentBound: true, index: 3 })]);
    const b = badges(el)[0];
    expect(b.classList.contains('specorator-tab-badge--agent')).toBe(true);
    expect(b.querySelector('.specorator-tab-badge-agent-icon')).toBeTruthy();
    expect(b.querySelector('.specorator-tab-badge-number')?.textContent).toBe('3');
    expect(b.getAttribute('aria-label')).toBe('a (agent)');
  });

  it('click and Enter fire onTabClick; right-click and Delete fire onTabClose only when canClose', () => {
    const onTabClick = vi.fn();
    const onTabClose = vi.fn();
    const { el } = mountBar([item('a'), item('locked', { canClose: false })], { onTabClick, onTabClose });
    const [a, locked] = badges(el);
    a.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onTabClick).toHaveBeenCalledWith('a');
    a.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    expect(onTabClose).toHaveBeenCalledWith('a');
    onTabClose.mockClear();
    locked.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    expect(onTabClose).not.toHaveBeenCalled(); // canClose:false → no close binding
    expect(locked.hasAttribute('aria-keyshortcuts')).toBe(false);
  });

  it('roving tabindex: exactly one badge is tabindex 0; ArrowRight moves the tab stop', () => {
    const { el } = mountBar([item('a', { isActive: true }), item('b'), item('c')]);
    const bs = badges(el);
    expect(bs.map((b) => b.getAttribute('tabindex'))).toEqual(['0', '-1', '-1']);
    bs[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(bs[1].getAttribute('tabindex')).toBe('0');
    expect(bs[0].getAttribute('tabindex')).toBe('-1');
  });
});
```

- [ ] **Step 2: Run it to verify it PASSES against the current TabBar**

Run: `npx vitest run tests/vue/chat/tabBarCharacterization.test.ts`
Expected: PASS. (If any assertion fails, the assertion is wrong about current behavior — fix the test to match `TabBar.ts`, never the reverse.)

- [ ] **Step 3: Commit**

```bash
git add tests/vue/chat/tabBarCharacterization.test.ts
git commit -m "test(chat): characterize TabBar behavior before the Vue migration"
```

---

## Task 4: `TabStrip` + `TabBadge` Vue components (parity)

**Files:**
- Create: `src/features/chat/ui/vue/components/TabBadge.vue`
- Create: `src/features/chat/ui/vue/components/TabStrip.vue`
- Create: `src/features/chat/ui/vue/mountIcon.ts` (popout-safe `setIcon` host — reuse the mountLucide idiom)
- Test: `tests/vue/chat/tabStrip.test.ts`

**Context:** Reproduce every Task 3 assertion in Vue. The badge glyph uses `setIcon` via a **popout-safe** function ref guarded on `nodeType === 1` (never `instanceof HTMLElement` — the mountLucide/IconButton lesson). Roving-tabindex arrow navigation reads the live badge set from the strip container at keydown time, same as `TabBar.handleRovingKey`.

- [ ] **Step 1: Create the popout-safe icon host**

`src/features/chat/ui/vue/mountIcon.ts`:

```ts
import { setIcon } from 'obsidian';

/** setIcon host guarded on nodeType (not instanceof HTMLElement): in an Obsidian
 *  popout the element belongs to the popout window, whose HTMLElement is a
 *  different constructor. nodeType === 1 is an Element in any window. */
export function mountIcon(el: unknown, icon: string): void {
  if (el == null || (el as Partial<Node>).nodeType !== 1) return;
  setIcon(el as HTMLElement, icon);
}
```

- [ ] **Step 2: Write the failing parity test**

`tests/vue/chat/tabStrip.test.ts` — port every assertion from Task 3 to a mounted `TabStrip`:

```ts
import { fireEvent, render } from '@testing-library/vue';
import { describe, expect, it, vi } from 'vitest';

import type { TabBarItem } from '@/features/chat/tabs/types';
import TabStrip from '@/features/chat/ui/vue/components/TabStrip.vue';

function item(id: string, o: Partial<TabBarItem> = {}): TabBarItem {
  return {
    id, index: 1, title: id, providerId: 'claude',
    isActive: false, isStreaming: false, needsAttention: false,
    canClose: true, kind: 'chat', ...o,
  } as TabBarItem;
}
function mountStrip(items: TabBarItem[], props: Record<string, unknown> = {}) {
  const onTabClick = vi.fn();
  const onTabClose = vi.fn();
  const { container } = render(TabStrip, { props: { items, onTabClick, onTabClose, ...props } });
  return { container, onTabClick, onTabClose };
}
function badges(c: Element): HTMLElement[] {
  return [...c.querySelectorAll<HTMLElement>('.specorator-tab-badge')];
}

describe('TabStrip (Vue parity with TabBar)', () => {
  it('plain chat badge: index text + active class + role/aria/tabindex/data attrs', () => {
    const { container } = mountStrip([item('a', { index: 2, isActive: true, providerId: 'codex' })]);
    const b = badges(container)[0];
    expect(b.textContent?.trim()).toBe('2');
    expect(b.classList.contains('specorator-tab-badge-active')).toBe(true);
    expect(b.getAttribute('role')).toBe('tab');
    expect(b.getAttribute('aria-selected')).toBe('true');
    expect(b.getAttribute('tabindex')).toBe('0');
    expect(b.getAttribute('data-provider')).toBe('codex');
    expect(b.getAttribute('data-kind')).toBe('chat');
    expect(b.getAttribute('aria-label')).toBe('a');
  });

  it('idle/working/attention classes + working aria', () => {
    const { container } = mountStrip([item('idle'), item('work', { isStreaming: true }), item('attn', { needsAttention: true })]);
    const [idle, work, attn] = badges(container);
    expect(idle.classList.contains('specorator-tab-badge-idle')).toBe(true);
    expect(work.classList.contains('specorator-tab-badge-working')).toBe(true);
    expect(work.getAttribute('aria-busy')).toBe('true');
    expect(work.getAttribute('aria-label')).toBe('work (working)');
    expect(attn.classList.contains('specorator-tab-badge-attention')).toBe(true);
  });

  it('work-order badge: wrench glyph host, no number, --work-order + aria suffix; first-of-group margin', () => {
    const { container } = mountStrip([item('c'), item('wo1', { kind: 'work-order', title: 'Run' }), item('wo2', { kind: 'work-order' })]);
    const [, wo1, wo2] = badges(container);
    expect(wo1.classList.contains('specorator-tab-badge--work-order')).toBe(true);
    expect(wo1.querySelector('.specorator-tab-badge-icon')).toBeTruthy();
    expect(wo1.getAttribute('aria-label')).toBe('Run (work order)');
    expect(wo1.classList.contains('specorator-tab-badge--work-order-first')).toBe(true);
    expect(wo2.classList.contains('specorator-tab-badge--work-order-first')).toBe(false);
  });

  it('agent-bound badge: user glyph + number span + --agent + aria suffix', () => {
    const { container } = mountStrip([item('a', { isAgentBound: true, index: 3 })]);
    const b = badges(container)[0];
    expect(b.classList.contains('specorator-tab-badge--agent')).toBe(true);
    expect(b.querySelector('.specorator-tab-badge-agent-icon')).toBeTruthy();
    expect(b.querySelector('.specorator-tab-badge-number')?.textContent).toBe('3');
    expect(b.getAttribute('aria-label')).toBe('a (agent)');
  });

  it('click + Enter → onTabClick; contextmenu + Delete → onTabClose only when canClose', async () => {
    const { container, onTabClick, onTabClose } = mountStrip([item('a'), item('locked', { canClose: false })]);
    const [a, locked] = badges(container);
    await fireEvent.click(a);
    expect(onTabClick).toHaveBeenCalledWith('a');
    await fireEvent.keyDown(a, { key: 'Enter' });
    expect(onTabClick).toHaveBeenCalledTimes(2);
    await fireEvent(a, new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    expect(onTabClose).toHaveBeenCalledWith('a');
    onTabClose.mockClear();
    await fireEvent(locked, new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    expect(onTabClose).not.toHaveBeenCalled();
  });

  it('roving tabindex: one tab stop; ArrowRight moves it', async () => {
    const { container } = mountStrip([item('a', { isActive: true }), item('b'), item('c')]);
    const bs = badges(container);
    expect(bs.map((b) => b.getAttribute('tabindex'))).toEqual(['0', '-1', '-1']);
    await fireEvent.keyDown(bs[0], { key: 'ArrowRight' });
    expect(bs[1].getAttribute('tabindex')).toBe('0');
    expect(bs[0].getAttribute('tabindex')).toBe('-1');
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run tests/vue/chat/tabStrip.test.ts`
Expected: FAIL — cannot resolve `TabStrip.vue`.

- [ ] **Step 4: Implement `TabBadge.vue`**

`src/features/chat/ui/vue/components/TabBadge.vue`:

```vue
<script setup lang="ts">
import { computed } from 'vue';

import type { TabBarItem } from '../../../tabs/types';
import { mountIcon } from '../mountIcon';

import { ref } from 'vue';

const props = defineProps<{ item: TabBarItem; isFirstWorkOrder: boolean; isTabStop: boolean }>();
const emit = defineEmits<{ click: [id: string]; close: [id: string]; roving: [event: KeyboardEvent, el: HTMLElement] }>();

// The badge's own root, so roving navigation can locate this badge in the live
// strip without the parent guessing which element fired.
const rootEl = ref<HTMLElement | null>(null);

const isWorkOrder = computed(() => props.item.kind === 'work-order');
const isAgent = computed(() => props.item.kind !== 'work-order' && props.item.isAgentBound === true);

const stateClass = computed(() => {
  const i = props.item;
  return {
    'specorator-tab-badge-active': i.isActive,
    'specorator-tab-badge-attention': i.needsAttention,
    'specorator-tab-badge-working': i.isStreaming,
    'specorator-tab-badge-idle': !i.isActive && !i.needsAttention && !i.isStreaming,
    'specorator-tab-badge--work-order': isWorkOrder.value,
    'specorator-tab-badge--agent': isAgent.value,
    'specorator-tab-badge--work-order-first': props.isFirstWorkOrder,
  };
});

const ariaLabel = computed(() => {
  const q: string[] = [];
  if (isWorkOrder.value) q.push('work order');
  if (isAgent.value) q.push('agent');
  if (props.item.isStreaming) q.push('working');
  return q.length ? `${props.item.title} (${q.join(', ')})` : props.item.title;
});

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); emit('click', props.item.id); return; }
  if (props.item.canClose && (e.key === 'Delete' || e.key === 'Backspace')) { e.preventDefault(); emit('close', props.item.id); return; }
  if (rootEl.value) emit('roving', e, rootEl.value);
}
function onContextmenu(e: MouseEvent): void {
  if (!props.item.canClose) return;
  e.preventDefault();
  emit('close', props.item.id);
}
// Popout-safe glyph host: Vue calls this ref fn with the icon span element.
function wrenchHost(el: unknown): void { mountIcon(el, 'wrench'); }
function userHost(el: unknown): void { mountIcon(el, 'user'); }
</script>

<template>
  <div
    ref="rootEl"
    class="specorator-tab-badge"
    :class="stateClass"
    role="tab"
    :tabindex="isTabStop ? 0 : -1"
    :aria-selected="String(item.isActive)"
    :aria-busy="item.isStreaming ? 'true' : undefined"
    :data-working="item.isStreaming ? 'true' : undefined"
    :data-provider="item.providerId"
    :data-kind="item.kind"
    :aria-label="ariaLabel"
    :aria-keyshortcuts="item.canClose ? 'Delete' : undefined"
    @click="emit('click', item.id)"
    @contextmenu="onContextmenu"
    @keydown="onKeydown"
  >
    <span v-if="isWorkOrder" class="specorator-tab-badge-icon" aria-hidden="true" :ref="wrenchHost" />
    <template v-else-if="isAgent">
      <span class="specorator-tab-badge-agent-icon" aria-hidden="true" :ref="userHost" />
      <span class="specorator-tab-badge-number">{{ item.index }}</span>
    </template>
    <template v-else>{{ item.index }}</template>
  </div>
</template>
```

- [ ] **Step 5: Implement `TabStrip.vue`** (owns roving navigation over the live badge set)

`src/features/chat/ui/vue/components/TabStrip.vue`:

```vue
<script setup lang="ts">
import { computed, ref } from 'vue';

import type { TabBarItem, TabId } from '../../../tabs/types';
import TabBadge from './TabBadge.vue';

const props = defineProps<{ items: TabBarItem[]; onTabClick: (id: TabId) => void; onTabClose: (id: TabId) => void }>();

const stripEl = ref<HTMLElement | null>(null);

// Roving tab stop: the active badge, else the first (parity with TabBar.update).
const rovingIndex = computed(() => Math.max(props.items.findIndex((i) => i.isActive), 0));

// First work-order badge after a chat group gets the extra-gap modifier.
const firstWorkOrderId = computed(() => {
  let sawChat = false;
  for (const i of props.items) {
    if (i.kind === 'work-order') { if (sawChat) return i.id; }
    else sawChat = true;
  }
  return null;
});

// currentEl is the badge that fired (emitted by TabBadge). Read the live badge
// set from the strip at keydown time so it never holds stale refs — same as
// TabBar.handleRovingKey.
function onRoving(e: KeyboardEvent, currentEl: HTMLElement): void {
  const badges = Array.from(stripEl.value?.querySelectorAll<HTMLElement>('.specorator-tab-badge') ?? []);
  const current = badges.indexOf(currentEl);
  if (current === -1 || badges.length === 0) return;
  let target: number;
  switch (e.key) {
    case 'ArrowRight': target = (current + 1) % badges.length; break;
    case 'ArrowLeft': target = (current - 1 + badges.length) % badges.length; break;
    case 'Home': target = 0; break;
    case 'End': target = badges.length - 1; break;
    default: return;
  }
  e.preventDefault();
  if (target === current) return;
  badges[current].setAttribute('tabindex', '-1');
  badges[target].setAttribute('tabindex', '0');
  badges[target].focus();
}
</script>

<template>
  <div ref="stripEl" class="specorator-tab-badges" role="tablist">
    <TabBadge
      v-for="(item, i) in items"
      :key="item.id"
      :item="item"
      :is-first-work-order="item.id === firstWorkOrderId"
      :is-tab-stop="i === rovingIndex"
      @click="onTabClick"
      @close="onTabClose"
      @roving="onRoving"
    />
  </div>
</template>
```

- [ ] **Step 6: Run it to verify it passes**

Run: `npx vitest run tests/vue/chat/tabStrip.test.ts tests/vue/chat/tabBarCharacterization.test.ts`
Expected: PASS (both files — parity holds).

- [ ] **Step 7: Typecheck + lint + commit**

Run: `npm run typecheck:vue && npm run lint`
Expected: exit 0.

```bash
git add src/features/chat/ui/vue/mountIcon.ts src/features/chat/ui/vue/components/TabBadge.vue src/features/chat/ui/vue/components/TabStrip.vue tests/vue/chat/tabStrip.test.ts
git commit -m "feat(chat): TabStrip + TabBadge Vue components at parity with TabBar"
```

---

## Task 5: Header chrome + content host + empty state components

**Files:**
- Create: `src/features/chat/ui/vue/components/ChatTitle.vue`, `BoundAgentChip.vue`, `HeaderActions.vue`, `ChatHeader.vue`, `TabContentHost.vue`, `ChatEmptyState.vue`
- Test: `tests/vue/chat/chatHeader.test.ts`, `tests/vue/chat/tabContentHost.test.ts`

**Context:** `ChatHeader` composes title + bound-agent chip + `TabStrip` + `HeaderActions`, reading from `useChatShellStore` and calling the injected `ChatShellCallbacks`. `TabContentHost` is the **opaque "leave-me-alone" host**: it renders one element, invokes the injected `CONTENT_HOST_KEY` callback once with that element, and NEVER re-renders its children — the imperative tab layer owns them. This is the novel-risk component; its test is the seam contract.

- [ ] **Step 1: Write the failing content-host seam test**

`tests/vue/chat/tabContentHost.test.ts`:

```ts
import { render } from '@testing-library/vue';
import { describe, expect, it, vi } from 'vitest';
import { h } from 'vue';

import { CONTENT_HOST_KEY } from '@/features/chat/ui/vue/chatShellKeys';
import TabContentHost from '@/features/chat/ui/vue/components/TabContentHost.vue';

describe('TabContentHost (opaque leave-me-alone host)', () => {
  it('invokes the CONTENT_HOST callback once with its element, and imperative children survive a parent re-render', async () => {
    const mount = vi.fn();
    const { container, rerender } = render(
      { setup: () => () => h(TabContentHost), },
      { global: { provide: { [CONTENT_HOST_KEY as symbol]: mount } } },
    );
    expect(mount).toHaveBeenCalledTimes(1);
    const hostEl = mount.mock.calls[0][0] as HTMLElement;
    expect(hostEl).toBe(container.querySelector('.specorator-tab-content-container'));

    // Imperatively append a child + listener, like the tab layer does.
    const child = hostEl.ownerDocument.createElement('div');
    child.className = 'imperative-tab-content';
    const onClick = vi.fn();
    child.addEventListener('click', onClick);
    hostEl.appendChild(child);

    // Force a parent re-render; the host must not clear/replace its children.
    await rerender({});
    const survivor = hostEl.querySelector('.imperative-tab-content') as HTMLElement;
    expect(survivor).toBe(child);
    survivor.dispatchEvent(new MouseEvent('click'));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(mount).toHaveBeenCalledTimes(1); // callback fires once, not per render
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/vue/chat/tabContentHost.test.ts`
Expected: FAIL — cannot resolve `TabContentHost.vue`.

- [ ] **Step 3: Implement `TabContentHost.vue`**

```vue
<script setup lang="ts">
import { inject, onMounted, ref } from 'vue';

import { CONTENT_HOST_KEY } from '../chatShellKeys';

// The opaque host: Vue owns this element but NOT its children — the imperative
// tab layer createDiv's each tab's specorator-tab-content into it and toggles
// specorator-hidden on switch. No v-for, no reactive children: Vue never
// touches what lives inside, so all tab subtrees + live streaming DOM persist
// across shell re-renders. Same contract as MarkdownHost / the board lane host.
const hostEl = ref<HTMLElement | null>(null);
const mountHost = inject(CONTENT_HOST_KEY);
onMounted(() => {
  if (hostEl.value && mountHost) mountHost(hostEl.value);
});
</script>

<template>
  <div ref="hostEl" class="specorator-tab-content-container" />
</template>
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run tests/vue/chat/tabContentHost.test.ts`
Expected: PASS.

- [ ] **Step 5: Implement the header components**

`ChatTitle.vue` (title text; rename via a blur/enter on a contenteditable or a simple display for now — keep parity with current `specorator-title-text`):

```vue
<script setup lang="ts">
defineProps<{ title: string }>();
</script>

<template>
  <div class="specorator-title-slot">
    <h4 class="specorator-title-text">{{ title }}</h4>
  </div>
</template>
```

`BoundAgentChip.vue`:

```vue
<script setup lang="ts">
import type { ChatBoundAgent } from '../stores/chatShellStore';
import { mountIcon } from '../mountIcon';

defineProps<{ agent: ChatBoundAgent }>();
function avatarHost(el: unknown): void { mountIcon(el, 'user'); }
</script>

<template>
  <div class="specorator-bound-agent-chip">
    <div class="specorator-bound-agent-chip-avatar">
      <img v-if="agent.avatar" :src="agent.avatar" :alt="agent.name" >
      <span v-else aria-hidden="true" :ref="avatarHost" />
    </div>
    <span class="specorator-bound-agent-chip-name">{{ agent.name }}</span>
  </div>
</template>
```

`HeaderActions.vue` (buttons + the two imperative dropdown hosts):

```vue
<script setup lang="ts">
import { inject, onMounted, ref } from 'vue';

import { CALLBACKS_KEY } from '../chatShellKeys';
import { mountIcon } from '../mountIcon';

const cb = inject(CALLBACKS_KEY);
if (!cb) throw new Error('HeaderActions mounted without CALLBACKS_KEY');

const historyHost = ref<HTMLElement | null>(null);
const workOrderHost = ref<HTMLElement | null>(null);
onMounted(() => {
  if (historyHost.value) cb.mountHistoryHost(historyHost.value);
  if (workOrderHost.value) cb.mountWorkOrderHost(workOrderHost.value);
});
function icon(name: string) { return (el: unknown) => mountIcon(el, name); }
</script>

<template>
  <div class="specorator-header-actions">
    <div ref="workOrderHost" class="specorator-work-order-activity-slot" />
    <div class="specorator-header-btn" role="button" tabindex="0" aria-label="Quick actions" :ref="icon('zap')" @click="cb.onQuickActions()" />
    <div class="specorator-header-btn specorator-new-tab-btn" role="button" tabindex="0" aria-label="New tab" :ref="icon('plus')" @click="cb.onNewTab()" />
    <div class="specorator-history-container">
      <div class="specorator-header-btn" role="button" tabindex="0" aria-label="History" :ref="icon('history')" @click="cb.onOpenHistory()" />
      <div ref="historyHost" class="specorator-history-menu" />
    </div>
  </div>
</template>
```

> Match the exact button set + icons + aria-labels to the current `buildHeader` in `SpecoratorView.ts` (read it before implementing — the plan lists the shape; the source is the contract). Preserve every existing `specorator-header-btn` and its handler.

`ChatHeader.vue`:

```vue
<script setup lang="ts">
import { useChatShellStore } from '../stores/chatShellStore';
import { inject } from 'vue';
import { CALLBACKS_KEY } from '../chatShellKeys';
import BoundAgentChip from './BoundAgentChip.vue';
import ChatTitle from './ChatTitle.vue';
import HeaderActions from './HeaderActions.vue';
import TabStrip from './TabStrip.vue';

const store = useChatShellStore();
const cb = inject(CALLBACKS_KEY);
if (!cb) throw new Error('ChatHeader mounted without CALLBACKS_KEY');
</script>

<template>
  <div class="specorator-header">
    <div class="specorator-header-title-row">
      <ChatTitle :title="store.header.title" />
      <HeaderActions />
    </div>
    <div class="specorator-header-meta-row" :class="{ 'specorator-hidden': !store.header.boundAgent }">
      <div class="specorator-bound-agent-chip-slot">
        <BoundAgentChip v-if="store.header.boundAgent" :agent="store.header.boundAgent" />
      </div>
    </div>
    <TabStrip
      v-show="store.header.tabBarVisible"
      :items="store.tabs"
      :on-tab-click="cb.onTabClick"
      :on-tab-close="cb.onTabClose"
    />
  </div>
</template>
```

`ChatEmptyState.vue` — port the current empty state (`SpecoratorView:419–447`): heading, paragraph, 3-step `ol`, and the CTA button calling `cb.onNewTab()`.

- [ ] **Step 6: Write + run the header test**

`tests/vue/chat/chatHeader.test.ts` — mount `ChatHeader` with a seeded store + a fake callbacks provide; assert: title renders; bound-agent chip shows only when `header.boundAgent` set; meta row gets `specorator-hidden` when unbound; `TabStrip` receives `store.tabs`; a badge click calls `cb.onTabClick`; the history button click calls `cb.onOpenHistory`; `mountHistoryHost`/`mountWorkOrderHost` were each called once with an element.

Run: `npx vitest run tests/vue/chat/chatHeader.test.ts`
Expected: PASS.

- [ ] **Step 7: Typecheck + lint + commit**

```bash
git add src/features/chat/ui/vue/components/ tests/vue/chat/chatHeader.test.ts tests/vue/chat/tabContentHost.test.ts
git commit -m "feat(chat): header chrome + content host + empty state Vue components"
```

---

## Task 6a: Dual-mode header layout + provider logo + nav-row Teleport (unwired)

**Files:**
- Modify: `src/features/chat/ui/vue/stores/chatShellStore.ts` (extend `ChatShellHeader`)
- Modify: `src/features/chat/ui/vue/chatShellCallbacks.ts` (add `resolveNavRowEl`, `renderProviderLogo`)
- Create: `src/features/chat/ui/vue/components/ChatLogo.vue`
- Modify: `src/features/chat/ui/vue/components/ChatHeader.vue` (restructure for both modes + logo)
- Test: `tests/vue/chat/chatHeader.test.ts` (extend), `tests/vue/chat/chatLogo.test.ts`

**Why:** `tabBarPosition` defaults to `'input'`, and `SpecoratorView.updateNavRowLocation` reflows the header by mode: in **`'header'`** mode the tab badges go to the **title slot** (after the logo) and the action cluster goes to the **meta row** (`headerActionsEl`); in **`'input'`** mode the badges AND the action cluster both move into the **active tab's `navRowEl`** (`specorator-input-nav-row`, `tab.dom.navRowEl`, re-targeted on every tab switch), while the git button stays in the meta row. Plus `syncHeaderLogo` renders a per-provider SVG in the title slot, hidden when `tabBarVisible && header-mode`. The current `ChatHeader` fixed layout matches neither mode. This task makes `ChatHeader` faithful to both, still UNWIRED (Task 6b projects the real values). READ `SpecoratorView.buildHeader`/`updateNavRowLocation`/`syncHeaderLogo` first — the source is the contract.

- [ ] **Step 1: Extend `ChatShellHeader`** (`stores/chatShellStore.ts`). Add fields:
  - `tabBarPosition: 'header' | 'input'` — the layout mode.
  - `logoProviderId: ProviderId | null` — which provider's SVG the logo shows (null → no logo).
  - `logoVisible: boolean` — the logo's show/hide (engine computes `!(tabBarVisible && headerMode)`; store just holds it).
  `DEFAULT_HEADER` gains `tabBarPosition: 'input'` (matches `defaultSettings.tabBarPosition`), `logoProviderId: null`, `logoVisible: false`. Update the default-header `toEqual` in `chatShellStore.test.ts` and the `snap()` helper in `useChatShellEventRouting.test.ts` accordingly.

- [ ] **Step 2: Extend `ChatShellCallbacks`** (`chatShellCallbacks.ts`):
  - `resolveNavRowEl: (tabId: TabId | null) => HTMLElement | null` — returns the active tab's `navRowEl` (input-mode Teleport target); null when no active tab.
  - `renderProviderLogo: (el: HTMLElement, providerId: ProviderId) => void` — imperative SVG render (owns `ProviderRegistry.getChatUIConfig(id).getProviderIcon()` + `createProviderIconSvg`); empties `el` then appends the 18×18 SVG, mirroring `syncHeaderLogo`.

- [ ] **Step 3: `ChatLogo.vue`** — `v-show="visible"` on a `specorator-logo` span host; `watchEffect` calls `cb.renderProviderLogo(host, providerId)` when `providerId` changes (skip when null). Props: `{ providerId: ProviderId | null; visible: boolean }`. Test `chatLogo.test.ts`: renders the SVG via a fake `renderProviderLogo` (called with the host + providerId); hidden via `v-show` when `visible=false`; re-renders when providerId changes.

- [ ] **Step 4: Restructure `ChatHeader.vue`** to reproduce both modes. Target structure (match the real DOM):
  ```
  specorator-header
    specorator-header-title-row
      specorator-title-slot
        ChatLogo(:provider-id="header.logoProviderId" :visible="header.logoVisible")
        ChatTitle(:title="header.title")
        <Teleport :to="navRowTarget" :disabled="headerMode || !navRowTarget">
          TabStrip(v-show="header.tabBarVisible", :items, :on-tab-click, :on-tab-close)
        </Teleport>
    specorator-header-meta-row (:class specorator-hidden = !header.metaRowVisible)
      specorator-bound-agent-chip-slot > BoundAgentChip(v-if header.boundAgent)
      specorator-header-actions specorator-header-actions-slot
        <div ref=gitActionHost> (cb.mountGitActionHost on mount — KEEP from Task 5)
        <Teleport :to="navRowTarget" :disabled="headerMode || !navRowTarget">
          HeaderActions
        </Teleport>
  ```
  where `headerMode = computed(() => store.header.tabBarPosition === 'header')` and `navRowTarget = computed(() => headerMode.value ? null : cb.resolveNavRowEl(store.activeTabId))`. Two Teleports share `navRowTarget`: in header mode both are `:disabled` → TabStrip renders in the title slot and HeaderActions in the meta-row actions slot (the real header-mode placement); in input mode both teleport into the active tab's `navRowEl` (the real input-mode placement), re-targeting reactively when `store.activeTabId` changes. Guard `:disabled` on `!navRowTarget` so a null target (no active tab yet) falls back to in-place rendering instead of erroring.

  > Note: `resolveNavRowEl` reads `store.activeTabId`, so the `navRowTarget` computed must depend on `store.activeTabId` to re-run on tab switch. Confirm the git host stays in the meta row in BOTH modes (only the main cluster teleports).

- [ ] **Step 5: Extend `chatHeader.test.ts`** — provide a fake `resolveNavRowEl` returning a test element. Assert:
  - **header mode** (`tabBarPosition:'header'`): `TabStrip` renders inside `specorator-title-slot`; `HeaderActions` renders inside the meta-row `specorator-header-actions-slot`; the provided nav-row element is EMPTY.
  - **input mode** (`tabBarPosition:'input'`): `TabStrip` + `HeaderActions` render INSIDE the provided nav-row element (teleported); they are NOT in the title slot / meta row; the git host stays in the meta row.
  - **tab switch**: with `resolveNavRowEl` returning element A for tab 1 and B for tab 2, changing `store.activeTabId` moves the teleported content from A to B.
  - logo: `ChatLogo` shows/hides per `header.logoVisible`.

- [ ] **Step 6: Gates + commit.** `npx vitest run tests/vue/chat`; `npm run typecheck && npm run typecheck:vue && npm run lint` (exit 0). Commit:
  ```
  git commit -m "feat(chat): dual-mode header layout + provider logo + nav-row teleport (unwired)"
  ```
  (trailers as in prior tasks).

- [ ] **Constraints:** still UNWIRED — no `SpecoratorView` changes, no imperative deletions. The store fields are pure projection holders (defaults only); the engine sets them in Task 6b.

---

## Task 6b: `ChatShellRoot` + cutover in `SpecoratorView`

**Files:**
- Create: `src/features/chat/ui/vue/ChatShellRoot.vue`
- Modify: `src/features/chat/SpecoratorView.ts`
- Delete: `src/features/chat/tabs/TabBar.ts`
- Test: `tests/vue/chat/chatShellScaling.test.ts`

**Context:** This is the cutover. `ChatShellRoot` assembles `ChatHeader` + `TabContentHost` + `ChatEmptyState` and owns the store init + `useChatShellEventRouting`. `SpecoratorView` mounts it, builds the `ChatShellCallbacks` (thin delegators to existing methods), implements the `subscribe` seam (fire the observer from the eight `TabManager` callbacks, projecting `getTabBarItems()` + header state each time), and hands the content-host element back to the imperative tab layer as the `tabContentEl`. Delete `buildHeader`, `updateTabBar`, `updateTabBarVisibility`'s imperative DOM writes (fold the visibility rule into the projected `tabBarVisible`), and `TabBar.ts`.

- [ ] **Step 1: Implement `ChatShellRoot.vue`**

```vue
<script setup lang="ts">
import { inject } from 'vue';

import { CALLBACKS_KEY, PLUGIN_KEY } from './chatShellKeys';
import ChatEmptyState from './components/ChatEmptyState.vue';
import ChatHeader from './components/ChatHeader.vue';
import TabContentHost from './components/TabContentHost.vue';
import { useChatShellStore } from './stores/chatShellStore';
import { useChatShellEventRouting } from './useChatShellEventRouting';

const plugin = inject(PLUGIN_KEY);
if (!plugin) throw new Error('ChatShellRoot mounted without PLUGIN_KEY');
const cb = inject(CALLBACKS_KEY);
if (!cb) throw new Error('ChatShellRoot mounted without CALLBACKS_KEY');

const store = useChatShellStore();
useChatShellEventRouting(cb.subscribe);
</script>

<template>
  <div class="specorator-container">
    <ChatHeader />
    <TabContentHost />
    <ChatEmptyState v-if="store.tabs.length === 0" />
  </div>
</template>
```

> The empty-state visibility rule must match the current one (`SpecoratorView` shows it when there are no chat tabs). Confirm against `SpecoratorView` and adjust the `v-if` to the projected condition (may be `store.tabs.length === 0`, or a dedicated `header` flag if work-order-only state must hide it).

- [ ] **Step 2: Wire the mount + callbacks + subscribe seam in `SpecoratorView`**

Replace the imperative frame build with a Vue mount (mirror `AgentBoardView.mountVue`). Sketch:

```ts
private vueApp: import('vue').App | null = null;
private chatShellObservers = new Set<(s: ChatShellSnapshot) => void>();

private mountChatShell(): void {
  this.vueApp?.unmount();
  this.viewContainerEl.empty();
  this.viewContainerEl.addClass('specorator-vue');
  const app = createApp(ChatShellRoot);
  app.use(getChatShellPinia());
  app.provide(PLUGIN_KEY, markRaw(this.plugin));
  app.provide(CALLBACKS_KEY, markRaw(this.buildChatShellCallbacks()));
  app.provide(CONTENT_HOST_KEY, (el: HTMLElement) => { this.tabContentEl = el; this.onContentHostReady(); });
  app.mount(this.viewContainerEl);
  this.vueApp = app;
}

private buildChatShellCallbacks(): ChatShellCallbacks {
  return {
    subscribe: (onChange) => {
      this.chatShellObservers.add(onChange);
      onChange(this.projectChatShell()); // seed immediately
      return () => this.chatShellObservers.delete(onChange);
    },
    onTabClick: (id) => this.handleTabClick(id),
    onTabClose: (id) => this.tabManager?.closeTab(id),
    onNewTab: () => this.handleNewTab(),
    onOpenHistory: () => this.toggleHistoryDropdown(),
    onOpenWorkOrders: () => this.toggleWorkOrderDropdown(),
    onQuickActions: () => this.openQuickActions(),
    onNewConversation: () => this.tabManager?.createNewConversation(),
    onOpenSettings: () => this.openPluginSettings(),
    onRename: (title) => this.renameActiveTab(title),
    mountHistoryHost: (el) => this.mountHistoryDropdownInto(el),
    mountWorkOrderHost: (el) => this.mountWorkOrderDropdownInto(el),
    mountGitActionHost: (el) => this.mountGitActionInto(el),
    // Input-mode Teleport target: the active tab's imperative nav row.
    resolveNavRowEl: (tabId) => (tabId ? this.tabManager?.getTab(tabId)?.dom.navRowEl ?? null : null),
    // Provider logo SVG (owns ProviderRegistry + createProviderIconSvg), mirrors syncHeaderLogo.
    renderProviderLogo: (el, providerId) => this.renderProviderLogoInto(el, providerId),
  };
}

private projectChatShell(): ChatShellSnapshot {
  const tm = this.tabManager;
  return {
    tabs: tm?.getTabBarItems() ?? [],
    activeTabId: tm?.getActiveTab()?.id ?? null,
    header: this.projectChatShellHeader(),
  };
}

private emitChatShellChange(): void {
  const snapshot = this.projectChatShell();
  for (const observer of this.chatShellObservers) observer(snapshot);
}
```

Then in the `TabManager` callbacks object (`SpecoratorView:277–314`), replace each `this.updateTabBar()` with `this.emitChatShellChange()` (and keep any non-tab-bar side effects those callbacks already do). ALSO call `this.emitChatShellChange()` from the settings path that changes `tabBarPosition` (the old `updateLayoutForPosition`) so a mode switch re-projects.

`projectChatShellHeader()` computes the FULL `ChatShellHeader` — port each field from the imperative source it replaces:
- `title` — the title source (`titleTextEl` text).
- `boundAgent` — `null` when unbound, else `{ name, persona: rosterAgentToPersona(agent) }` (the derivation in `syncBoundAgentChip` ~930–947). `ChatBoundAgent` carries a persona (Task 5 model), NOT an image.
- `activeProviderId` — the active tab's provider.
- `tabBarVisible` — the `updateTabBarVisibility` rule (`tabCount >= 2 || (activeIsWorkOrder && tabCount >= 1)`).
- `metaRowVisible` — the `updateHeaderMetaRow` OR-condition (bound-agent chip present OR the header-actions/git slot has visible content).
- `tabBarPosition` — `plugin.settings.tabBarPosition`.
- `logoProviderId` — the active provider (drives `renderProviderLogo`); `logoVisible` — `!(tabBarVisible && tabBarPosition === 'header')` (the `syncHeaderLogo`/`hideBranding` rule).

Add the imperative helpers the new callbacks delegate to (thin wrappers over existing behavior): `mountGitActionInto(el)` (move the existing `GitActionButton` DOM into `el`, or construct it there — match `buildHeader`'s git wiring), `renderProviderLogoInto(el, providerId)` (the `syncHeaderLogo` body: `getProviderIcon()` → `createProviderIconSvg` → append), and confirm `tabManager.getTab(id)`/`createNewConversation()` + `openPluginSettings()` exist (they're referenced above).

- [ ] **Step 3: Delete the imperative frame**

Remove the imperative frame builders now replaced by the Vue shell + projection: `buildHeader`/`buildNavRowContent`, `updateTabBar`, `updateTabBarVisibility`, `updateNavRowLocation`/`updateLayoutForPosition` (the mode reflow is now `ChatHeader`'s Teleport driven by projected `tabBarPosition`), `updateHeaderMetaRow` (now `metaRowVisible`), `syncHeaderLogo` (now `renderProviderLogoInto` called via the callback), and the fields they own (`tabBar`, `tabBarContainerEl`, `headerActionsContent`, `navRowContent`, `logoEl`, `titleSlotEl`, `headerActionsEl`, `pendingTabBarUpdate`, the rAF debounce), and `import { TabBar }`. Delete `src/features/chat/tabs/TabBar.ts`. KEEP the imperative history + work-order dropdown components and the `GitActionButton` (now mounted via `mountHistoryDropdownInto`/`mountWorkOrderDropdownInto`/`mountGitActionInto` into the Vue-provided refs). Verify no other caller references the deleted methods (e.g. settings' `updateLayoutForPosition` call site → point it at `emitChatShellChange`; `InlineAskUserQuestion.renderTabBar` → see Step 6 audit).

- [ ] **Step 4: Update `SpecoratorView.onClose`**

Ensure `this.vueApp?.unmount(); this.vueApp = null;` runs (disposes routing + observers) alongside the existing abort/dispose. Clear `chatShellObservers`.

- [ ] **Step 5: Add the scaling guard test**

`tests/vue/chat/chatShellScaling.test.ts`: mount `ChatShellRoot` with a seeded store of N tabs; assert the DOM badge count is O(rendered tabs); flip one tab's `isStreaming` via `store.setTabs` (new array, one item changed) and assert only that badge gains `specorator-tab-badge-working`/`aria-busy` (one-badge update, mirrors `agentBoardScaling`).

Run: `npx vitest run tests/vue/chat/chatShellScaling.test.ts`
Expected: PASS.

- [ ] **Step 6: Full gate**

Run: `npm run typecheck && npm run typecheck:vue && npm run lint && npx vitest run tests/vue && npm run test -- --selectProjects unit`
Expected: exit 0; the deleted `TabBar` has no remaining importers (fix any that surface — e.g. `InlineAskUserQuestion.renderTabBar`: if it constructs `TabBar`, either point it at `TabStrip` via a tiny mount or leave its mini-bar imperative with its own inlined badge builder — decide by reading that file; keep its behavior identical).

- [ ] **Step 7: Build + manual smoke**

Run: `npm run build && npm run check:artifacts`
Then the manual vault checklist from the spec (open/switch/close tabs, streaming badge, needs-attention, work-order tabs hidden from strip, history + work-order dropdowns, bound-agent chip, empty state, keyboard nav).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(chat): cut the chat shell over to a Vue island; delete imperative TabBar/frame"
```

---

## Task 7: Guardrails, docs, ratchets, sweep

**Files:**
- Modify: `jest.config.js`, `vitest.config.mts`, `scripts/loc-baseline.json` (if needed), `src/features/chat/CLAUDE.md`, root `CLAUDE.md`
- Create: `docs/adr/0005-chat-shell-vue-migration.md`

- [ ] **Step 1: Coverage-lane accounting**

In `jest.config.js` `collectCoverageFrom`, add `'!src/features/chat/ui/vue/**'` (mirrors the `!src/features/tasks/ui/vue/**` exclusion — the tree is Vitest-tested). In `vitest.config.mts` `coverage.include`, add `'src/features/chat/ui/vue/**/*.{ts,vue}'`.

Run: `npm run test -- --selectProjects unit` and confirm global coverage floors still pass (net deletion of `TabBar.ts` + frame should not drop them; if it does, it is a lane-accounting artifact — verify the exclusion took).

- [ ] **Step 2: Re-lock ratchets**

Run: `npm run check:loc` (update `scripts/loc-baseline.json` only if a grandfathered hotspot legitimately grew; `SpecoratorView.ts` should SHRINK). Run coverage-free `npm run check:quality`; if a metric improved, re-lock the baseline in the same commit.

- [ ] **Step 3: Docs**

Update `src/features/chat/CLAUDE.md`: the shell is now a Vue island (`ui/vue/`) over the untouched engine; document the store/routing/callbacks seam and the content-host contract; note the two dropdowns are imperative-hosted pending the side-panels sub-project. Update root `CLAUDE.md`'s `features/chat` row. Write `docs/adr/0005-chat-shell-vue-migration.md` (mirror ADR 0004's structure: decision, the island seam, the content-host contract, what stays imperative, follow-up sub-projects).

- [ ] **Step 4: Final full gate**

Run: `npm run typecheck && npm run typecheck:vue && npm run lint && npm run test && npx vitest run tests/vue && npm run build && npm run check:artifacts && npm run check:quality`
Expected: all exit 0.

- [ ] **Step 5: Commit + push + PR**

```bash
git add -A
git commit -m "docs(chat): ADR + CLAUDE updates + coverage/ratchet re-lock for the chat shell island"
git push -u origin claude/frontend-vue3-pinia-refactor-2ptqlt
```

Open a PR (ready for review) describing the chat shell island, the content-host seam, what stays imperative, and the manual smoke results.

---

## Self-review notes (for the executor)

- **Spec coverage:** architecture (Tasks 1–2, 6), component tree (Tasks 4–6), data flow (Task 6 subscribe/project), content-hosting seam (Task 5 host + test, Task 6 wiring), cutover (Task 6), testing incl. characterization + seam + perf (Tasks 3, 5, 6), guardrails (Task 7), the `InlineAskUserQuestion.renderTabBar` risk (Task 6 Step 6). All spec sections map to a task.
- **Roving navigation** flows `TabBadge` → emits `roving [event, el]` → `TabStrip.onRoving` reads the live badge set from the strip container (parity with `TabBar.handleRovingKey`); the Task 3 arrow test is the acceptance gate.
- **Match the source, not this plan, for exact DOM** in `HeaderActions`/`ChatEmptyState` (button set, icons, aria-labels, empty-state copy): read `SpecoratorView.buildHeader`/empty-state before implementing; the plan gives the shape, the source is the contract.
- **`ProviderId` import path** (Task 1) and the bound-agent derivation (Task 6) must be confirmed against existing chat code and matched exactly.
