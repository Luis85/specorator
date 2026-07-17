import { createPinia,setActivePinia } from 'pinia';
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
