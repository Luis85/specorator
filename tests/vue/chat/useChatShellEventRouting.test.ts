import { render } from '@testing-library/vue';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent } from 'vue';

import type { ChatShellSnapshot } from '@/features/chat/ui/vue/chatShellCallbacks';
import { useChatShellStore } from '@/features/chat/ui/vue/stores/chatShellStore';
import { useChatShellEventRouting } from '@/features/chat/ui/vue/useChatShellEventRouting';

function snap(overrides: Partial<ChatShellSnapshot> = {}): ChatShellSnapshot {
  return {
    tabs: [], activeTabId: null,
    header: {
      title: 'Specorator', boundAgent: null, activeProviderId: null, tabBarVisible: false, metaRowVisible: false,
      tabBarPosition: 'input', logoProviderId: null, logoVisible: false, titleVisible: true, canCreateTab: true,
    },
    conversations: { items: [], currentConversationId: null, perItem: {} },
    workOrder: { items: [], closableTabs: [], runningCount: 0, attentionCount: 0 },
    git: { isRepo: false, dirtyCount: 0, visible: false },
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
    push(snap({
      activeTabId: 't1',
      header: {
        title: 'Fix', boundAgent: null, activeProviderId: 'claude', tabBarVisible: true, metaRowVisible: false,
        tabBarPosition: 'input', logoProviderId: null, logoVisible: false, titleVisible: true, canCreateTab: true,
      },
    }));
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
