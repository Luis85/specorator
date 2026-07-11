import { fireEvent, render } from '@testing-library/vue';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { markRaw } from 'vue';

import type { TabBarItem } from '@/features/chat/tabs/types';
import type { ChatShellCallbacks } from '@/features/chat/ui/vue/chatShellCallbacks';
import { CALLBACKS_KEY } from '@/features/chat/ui/vue/chatShellKeys';
import ChatHeader from '@/features/chat/ui/vue/components/ChatHeader.vue';
import type { ChatShellHeader } from '@/features/chat/ui/vue/stores/chatShellStore';
import { useChatShellStore } from '@/features/chat/ui/vue/stores/chatShellStore';

function item(id: string, overrides: Partial<TabBarItem> = {}): TabBarItem {
  return {
    id, index: 1, title: id, providerId: 'claude',
    isActive: false, isStreaming: false, needsAttention: false,
    canClose: true, kind: 'chat', ...overrides,
  } as TabBarItem;
}

function hdr(overrides: Partial<ChatShellHeader> = {}): ChatShellHeader {
  return {
    title: 'Specorator', boundAgent: null, activeProviderId: null,
    tabBarVisible: false, metaRowVisible: false, ...overrides,
  };
}

function fakeCallbacks(): ChatShellCallbacks {
  return {
    subscribe: vi.fn(() => () => {}),
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
  };
}

function mountHeader(cb: ChatShellCallbacks) {
  return render(ChatHeader, {
    global: { provide: { [CALLBACKS_KEY as symbol]: markRaw(cb) } },
  });
}

describe('ChatHeader', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('renders the title from store.header.title', () => {
    const store = useChatShellStore();
    store.setHeader(hdr({ title: 'Fix the bug', activeProviderId: 'claude' }));
    const { getByText } = mountHeader(fakeCallbacks());
    expect(getByText('Fix the bug')).toBeTruthy();
  });

  it('shows the bound-agent chip only when boundAgent is set', () => {
    const store = useChatShellStore();
    store.setHeader(hdr());
    const { container, rerender } = mountHeader(fakeCallbacks());
    expect(container.querySelector('.specorator-bound-agent-chip')).toBeNull();

    store.setHeader(hdr({ boundAgent: { name: 'Reviewer', avatar: null }, metaRowVisible: true }));
    return rerender({}).then(() => {
      expect(container.querySelector('.specorator-bound-agent-chip')).toBeTruthy();
      expect(container.querySelector('.specorator-bound-agent-chip-label')?.textContent).toBe('Reviewer');
    });
  });

  it('meta row is hidden when metaRowVisible is false and shown when true (independent of boundAgent)', async () => {
    const store = useChatShellStore();
    // metaRowVisible false + no chip → row hidden.
    store.setHeader(hdr({ metaRowVisible: false }));
    const { container, rerender } = mountHeader(fakeCallbacks());
    const metaRow = container.querySelector('.specorator-header-meta-row');
    expect(metaRow?.classList.contains('specorator-hidden')).toBe(true);

    // metaRowVisible true with NO bound agent (e.g. only the git slot has
    // content) → row shows; the chip stays absent. Mirrors updateHeaderMetaRow's
    // OR-condition where the git button alone keeps the row visible.
    store.setHeader(hdr({ metaRowVisible: true }));
    await rerender({});
    expect(metaRow?.classList.contains('specorator-hidden')).toBe(false);
    expect(container.querySelector('.specorator-bound-agent-chip')).toBeNull();
  });

  it('TabStrip receives store.tabs (a badge renders per tab); a badge click calls cb.onTabClick(id)', async () => {
    const store = useChatShellStore();
    store.setTabs([item('a'), item('b', { isActive: true })]);
    store.setHeader(hdr({ tabBarVisible: true }));
    const cb = fakeCallbacks();
    const { container } = mountHeader(cb);
    const badges = container.querySelectorAll('.specorator-tab-badge');
    expect(badges.length).toBe(2);
    await fireEvent.click(badges[0]);
    expect(cb.onTabClick).toHaveBeenCalledWith('a');
  });

  it('a badge close (Delete key) calls cb.onTabClose(id)', async () => {
    const store = useChatShellStore();
    store.setTabs([item('a', { isActive: true })]);
    store.setHeader(hdr({ tabBarVisible: true }));
    const cb = fakeCallbacks();
    const { container } = mountHeader(cb);
    const badge = container.querySelector('.specorator-tab-badge') as HTMLElement;
    await fireEvent.keyDown(badge, { key: 'Delete' });
    expect(cb.onTabClose).toHaveBeenCalledWith('a');
  });

  it('a header button click calls the right callback (history)', async () => {
    const store = useChatShellStore();
    store.setHeader(hdr());
    const cb = fakeCallbacks();
    const { container } = mountHeader(cb);
    const historyBtn = container.querySelector('.specorator-history-container .specorator-header-btn') as HTMLElement;
    await fireEvent.click(historyBtn);
    expect(cb.onOpenHistory).toHaveBeenCalledTimes(1);
  });

  it('quick actions, new tab, and new conversation buttons call their respective callbacks', async () => {
    const store = useChatShellStore();
    store.setHeader(hdr());
    const cb = fakeCallbacks();
    const { container } = mountHeader(cb);
    const btns = container.querySelectorAll('.specorator-header-actions > .specorator-header-btn');
    // Order: quick actions, new tab, new conversation.
    await fireEvent.click(btns[0]);
    expect(cb.onQuickActions).toHaveBeenCalledTimes(1);
    await fireEvent.click(btns[1]);
    expect(cb.onNewTab).toHaveBeenCalledTimes(1);
    await fireEvent.click(btns[2]);
    expect(cb.onNewConversation).toHaveBeenCalledTimes(1);
  });

  it('mountHistoryHost, mountWorkOrderHost, and mountGitActionHost were each called once with an element on mount', () => {
    const store = useChatShellStore();
    store.setHeader(hdr());
    const cb = fakeCallbacks();
    mountHeader(cb);
    expect(cb.mountHistoryHost).toHaveBeenCalledTimes(1);
    expect((cb.mountHistoryHost as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBeInstanceOf(HTMLElement);
    expect(cb.mountWorkOrderHost).toHaveBeenCalledTimes(1);
    expect((cb.mountWorkOrderHost as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBeInstanceOf(HTMLElement);
    expect(cb.mountGitActionHost).toHaveBeenCalledTimes(1);
    expect((cb.mountGitActionHost as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBeInstanceOf(HTMLElement);
  });

  it('TabStrip is hidden (v-show) when tabBarVisible is false and shown when true', async () => {
    const store = useChatShellStore();
    store.setTabs([item('a', { isActive: true })]);
    store.setHeader(hdr({ tabBarVisible: false }));
    const { container, rerender } = mountHeader(fakeCallbacks());
    const strip = container.querySelector('.specorator-tab-badges') as HTMLElement;
    expect(strip.style.display).toBe('none');

    store.setHeader(hdr({ tabBarVisible: true }));
    await rerender({});
    expect(strip.style.display).not.toBe('none');
  });
});
