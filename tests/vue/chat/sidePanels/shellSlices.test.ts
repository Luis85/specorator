import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { defineComponent, h } from 'vue';

import type { ChatShellSnapshot } from '@/features/chat/ui/vue/chatShellCallbacks';
import { DEFAULT_HEADER_FOR_TEST,useChatShellStore } from '@/features/chat/ui/vue/stores/chatShellStore';
import { useChatShellEventRouting } from '@/features/chat/ui/vue/useChatShellEventRouting';

describe('chatShellStore — side-panel slices', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('defaults the three new slices to empty', () => {
    const store = useChatShellStore();
    expect(store.conversations).toEqual({ items: [], currentConversationId: null });
    expect(store.workOrder.items).toEqual([]);
    expect(store.git).toEqual({ isRepo: false, dirtyCount: 0, visible: false });
  });

  it('replaces whole values through the setters', () => {
    const store = useChatShellStore();
    store.setConversations({ items: [{ id: 'c1' } as never], currentConversationId: 'c1' });
    store.setWorkOrder({ items: [], closableTabs: [], runningCount: 0, attentionCount: 0 });
    store.setGit({ isRepo: true, dirtyCount: 3, visible: true });
    expect(store.conversations.currentConversationId).toBe('c1');
    expect(store.git.dirtyCount).toBe(3);
  });
});

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
      conversations: { items: [], currentConversationId: 'x' },
      workOrder: { items: [], closableTabs: [], runningCount: 0, attentionCount: 0 },
      git: { isRepo: true, dirtyCount: 2, visible: true },
    });
    expect(store.conversations.currentConversationId).toBe('x');
    expect(store.git.dirtyCount).toBe(2);
  });
});
