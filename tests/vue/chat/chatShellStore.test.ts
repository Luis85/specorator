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
