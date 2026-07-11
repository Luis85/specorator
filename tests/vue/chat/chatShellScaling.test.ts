import { render } from '@testing-library/vue';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { markRaw, nextTick } from 'vue';

import type { TabBarItem } from '@/features/chat/tabs/types';
import type { ChatShellCallbacks, ChatShellSnapshot } from '@/features/chat/ui/vue/chatShellCallbacks';
import { CALLBACKS_KEY, PLUGIN_KEY } from '@/features/chat/ui/vue/chatShellKeys';
import ChatShellRoot from '@/features/chat/ui/vue/ChatShellRoot.vue';
import type { ChatShellHeader } from '@/features/chat/ui/vue/stores/chatShellStore';
import { useChatShellStore } from '@/features/chat/ui/vue/stores/chatShellStore';

/**
 * Chat-shell Vue-surface scaling + isolation guard rails (the blocking perf gate
 * after the Task 6b cutover, mirroring tests/vue/tasks/agentBoardScaling.test.ts).
 *
 * Only the Vitest lane compiles SFCs, so the shell's perf gate lives here. Like
 * the board spec these are SCALING / STRUCTURE assertions, never wall-clock
 * timings, so they stay stable on noisy shared runners:
 *
 *   (a) the rendered badge count is O(N) and per-badge DOM cost stays flat, so a
 *       bigger strip is linear, never super-linear.
 *   (b) flipping one tab's `isStreaming` (new array, one changed reference)
 *       re-renders ONLY that tab's badge and marks exactly that one badge working.
 */

function item(id: string, overrides: Partial<TabBarItem> = {}): TabBarItem {
  return {
    id,
    index: 1,
    title: id,
    providerId: 'claude',
    isActive: false,
    isStreaming: false,
    needsAttention: false,
    canClose: true,
    kind: 'chat',
    ...overrides,
  } as TabBarItem;
}

function header(overrides: Partial<ChatShellHeader> = {}): ChatShellHeader {
  return {
    title: 'Specorator',
    boundAgent: null,
    activeProviderId: 'claude',
    tabBarVisible: true,
    metaRowVisible: false,
    tabBarPosition: 'header',
    logoProviderId: 'claude',
    logoVisible: false,
    ...overrides,
  };
}

/** A ChatShellCallbacks whose `subscribe` replays a pre-built snapshot. */
function seededCallbacks(snapshot: ChatShellSnapshot): ChatShellCallbacks {
  return {
    subscribe: vi.fn((onChange: (s: ChatShellSnapshot) => void) => {
      onChange(snapshot);
      return () => {};
    }),
    onTabClick: vi.fn(),
    onTabClose: vi.fn(),
    onNewTab: vi.fn(),
    onNewConversation: vi.fn(),
    onOpenHistory: vi.fn(),
    onOpenWorkOrders: vi.fn(),
    onQuickActions: vi.fn(),
    onRename: vi.fn(),
    onOpenSettings: vi.fn(),
    mountHistoryHost: vi.fn(),
    mountWorkOrderHost: vi.fn(),
    mountGitActionHost: vi.fn(),
    resolveNavRowEl: vi.fn(() => null),
    renderProviderLogo: vi.fn(),
  };
}

interface RenderEntry {
  name: string;
  id?: string;
}

/** Logs every component instance that re-renders (updated hook), tagged with its
 *  SFC name + the tab id it renders — the render-counter technique. */
function renderTracker(log: RenderEntry[]) {
  return {
    updated(this: unknown) {
      const inst = this as { $: { type: { __name?: string; name?: string } }; $props?: Record<string, unknown> };
      const props = inst.$props ?? {};
      const tabItem = props.item as TabBarItem | undefined;
      log.push({ name: inst.$.type.__name ?? inst.$.type.name ?? 'unknown', id: tabItem?.id });
    },
  };
}

function mountShell(tabs: TabBarItem[], log?: RenderEntry[]) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const store = useChatShellStore();
  const snapshot: ChatShellSnapshot = {
    tabs,
    activeTabId: tabs.find((t) => t.isActive)?.id ?? null,
    header: header(),
  };
  // Seed the store from the same snapshot the subscribe replays, so the badges
  // are in the initial render (the subscribe's on-mount onChange then re-sets
  // identical refs — no extra churn to count).
  store.setTabs(snapshot.tabs);
  store.setHeader(snapshot.header);
  store.setActiveTabId(snapshot.activeTabId);
  const utils = render(ChatShellRoot, {
    global: {
      plugins: [pinia],
      provide: {
        [PLUGIN_KEY as symbol]: markRaw({}),
        [CALLBACKS_KEY as symbol]: markRaw(seededCallbacks(snapshot)),
      },
      mixins: log ? [renderTracker(log)] : [],
    },
  });
  return { store, ...utils };
}

function makeTabs(n: number): TabBarItem[] {
  return Array.from({ length: n }, (_, i) => item(`t${i}`, i === 0 ? { isActive: true } : {}));
}

describe('Chat shell Vue scaling', () => {
  beforeEach(() => vi.clearAllMocks());

  it('keeps per-badge DOM cost flat as the strip grows (rendered badge count is O(N))', () => {
    const SCALES = [10, 50, 200];
    const metrics = SCALES.map((n) => {
      const addSpy = vi.spyOn(HTMLElement.prototype, 'addEventListener');
      const { container } = mountShell(makeTabs(n));
      const listeners = addSpy.mock.calls.length;
      addSpy.mockRestore();
      const badges = container.querySelectorAll('.specorator-tab-badge').length;
      const nodes = container.querySelectorAll('*').length;
      return { n, badges, nodes, listeners };
    });

    // Every tab renders a badge.
    for (const m of metrics) expect(m.badges).toBe(m.n);

    const small = metrics[0];
    const large = metrics[metrics.length - 1];

    // Per-badge cost must be flat: amortized nodes/listeners per badge cannot
    // grow with strip size (fixed header overhead only shrinks per-badge as N grows).
    expect(large.nodes / large.badges).toBeLessThanOrEqual(small.nodes / small.badges + 1);
    expect(large.listeners / large.badges).toBeLessThanOrEqual(small.listeners / small.badges + 0.5);

    // Absolute totals stay ~linear — a 20x strip must not cost super-linearly more.
    const factor = large.n / small.n;
    expect(large.nodes).toBeLessThan(small.nodes * factor * 1.25);
  }, 30_000);

  it('PERF: flipping one tab\'s isStreaming re-renders only that badge and marks only it working', async () => {
    const log: RenderEntry[] = [];
    const tabs = makeTabs(4);
    const { store, container } = mountShell(tabs, log);
    await nextTick();
    expect(container.querySelectorAll('.specorator-tab-badge').length).toBe(4);
    // No badge is working initially.
    expect(container.querySelectorAll('.specorator-tab-badge-working').length).toBe(0);

    log.length = 0;
    // New array with a single changed reference (t2 now streaming); every other
    // badge keeps its object identity so v-for :key diffing must skip it.
    const next = tabs.map((t) => (t.id === 't2' ? { ...t, isStreaming: true } : t));
    store.setTabs(next);
    await nextTick();

    // Exactly one badge is marked working (class + aria-busy).
    const working = container.querySelectorAll('.specorator-tab-badge-working');
    expect(working.length).toBe(1);
    expect(working[0].getAttribute('aria-busy')).toBe('true');
    expect(working[0].getAttribute('data-working')).toBe('true');

    // Per-badge isolation: among badge re-renders, only t2's fired — the three
    // unchanged tab objects keep their identity, so v-for keying skips their
    // badges. (The list owners — ChatShellRoot/ChatHeader/TabStrip — do re-render
    // on a whole-array swap by design; the shallowRef array is one dependency.
    // The badge is the O(1) axis the plan pins.)
    const badgeRenders = log.filter((entry) => entry.name === 'TabBadge');
    expect(badgeRenders.length).toBeGreaterThan(0);
    expect(badgeRenders.every((entry) => entry.id === 't2')).toBe(true);
  }, 30_000);
});
