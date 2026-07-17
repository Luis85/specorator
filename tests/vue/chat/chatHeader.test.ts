import { fireEvent, render } from '@testing-library/vue';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { markRaw, nextTick } from 'vue';

import type { AgentPersona } from '@/features/agents/agentTypes';
import type { TabBarItem } from '@/features/chat/tabs/types';
import type { ChatShellCallbacks } from '@/features/chat/ui/vue/chatShellCallbacks';
import { CALLBACKS_KEY } from '@/features/chat/ui/vue/chatShellKeys';
import ChatHeader from '@/features/chat/ui/vue/components/ChatHeader.vue';
import type { ChatShellHeader } from '@/features/chat/ui/vue/stores/chatShellStore';
import { useChatShellStore } from '@/features/chat/ui/vue/stores/chatShellStore';

const PERSONA: AgentPersona = { id: 'reviewer', name: 'Reviewer', color: 'var(--color-purple)', initials: 'RV' };

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
    tabBarVisible: false, metaRowVisible: false,
    tabBarPosition: 'input', logoProviderId: null, logoVisible: false,
    titleVisible: true, canCreateTab: true,
    ...overrides,
  };
}

function fakeCallbacks(overrides: Partial<ChatShellCallbacks> = {}): ChatShellCallbacks {
  return {
    subscribe: vi.fn(() => () => {}),
    onTabClick: vi.fn(),
    onTabClose: vi.fn(),
    onNewTab: vi.fn(),
    onNewConversation: vi.fn(),
    onOpenHistory: vi.fn(),
    onOpenWorkOrders: vi.fn(),
    onQuickActions: vi.fn(),
    onQuickActionsHover: vi.fn(),
    onRename: vi.fn(),
    onOpenSettings: vi.fn(),
    mountHistoryHost: vi.fn(),
    mountWorkOrderHost: vi.fn(),
    // Defaulting to null preserves the pre-6a in-place render for every
    // existing test below: a null target disables the Teleport.
    resolveNavRowEl: vi.fn(() => null),
    renderProviderLogo: vi.fn(),
    onSelectConversation: vi.fn(),
    onOpenConversationInNewTab: vi.fn(),
    onRenameConversation: vi.fn(),
    onDeleteConversation: vi.fn(),
    onRegenerateConversationTitle: vi.fn(),
    onConversationContextMenu: vi.fn(),
    onOpenWorkOrderItem: vi.fn(),
    onCloseWorkOrderTab: vi.fn(),
    onGitCommit: vi.fn(),
    ...overrides,
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

  it('shows the bound-agent chip (persona avatar + name) only when boundAgent is set', () => {
    const store = useChatShellStore();
    store.setHeader(hdr());
    const { container, rerender } = mountHeader(fakeCallbacks());
    expect(container.querySelector('.specorator-bound-agent-chip')).toBeNull();

    store.setHeader(hdr({ boundAgent: { name: 'Reviewer', persona: PERSONA }, metaRowVisible: true }));
    return rerender({}).then(() => {
      const chip = container.querySelector('.specorator-bound-agent-chip');
      expect(chip).toBeTruthy();
      // renderAgentAvatar mounts the colored persona badge into the chip.
      expect(chip?.querySelector('.specorator-agent-avatar')).toBeTruthy();
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

  it('Enter and Space on a header button fire its handler (wireHeaderButton keyboard parity)', async () => {
    const store = useChatShellStore();
    store.setHeader(hdr());
    const cb = fakeCallbacks();
    const { container } = mountHeader(cb);
    const historyBtn = container.querySelector('.specorator-history-container .specorator-header-btn') as HTMLElement;
    await fireEvent.keyDown(historyBtn, { key: 'Enter' });
    expect(cb.onOpenHistory).toHaveBeenCalledTimes(1);
    await fireEvent.keyDown(historyBtn, { key: ' ' });
    expect(cb.onOpenHistory).toHaveBeenCalledTimes(2);
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

  it('mountHistoryHost and mountWorkOrderHost were each called once with an element on mount', () => {
    const store = useChatShellStore();
    store.setHeader(hdr());
    const cb = fakeCallbacks();
    mountHeader(cb);
    expect(cb.mountHistoryHost).toHaveBeenCalledTimes(1);
    expect((cb.mountHistoryHost as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBeInstanceOf(HTMLElement);
    expect(cb.mountWorkOrderHost).toHaveBeenCalledTimes(1);
    expect((cb.mountWorkOrderHost as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBeInstanceOf(HTMLElement);
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

  describe('dual-mode header layout (tabBarPosition)', () => {
    it('header mode: TabStrip renders in the title slot; HeaderActions renders in the meta-row actions slot; the resolved nav-row element stays empty', () => {
      const store = useChatShellStore();
      store.setTabs([item('a', { isActive: true })]);
      store.setHeader(hdr({ tabBarPosition: 'header', tabBarVisible: true }));
      const navRow = document.createElement('div');
      const cb = fakeCallbacks({ resolveNavRowEl: vi.fn(() => navRow) });
      const { container } = mountHeader(cb);

      const titleSlot = container.querySelector('.specorator-title-slot');
      expect(titleSlot?.querySelector('.specorator-tab-badges')).toBeTruthy();

      const actionsSlot = container.querySelector('.specorator-header-actions-slot');
      expect(actionsSlot?.querySelector('.specorator-header-btn')).toBeTruthy();

      // resolveNavRowEl is never consulted in header mode (headerMode forces disabled).
      expect(navRow.childElementCount).toBe(0);
    });

    it("input mode: TabStrip + HeaderActions teleport into the resolved nav-row element, not the title slot / meta-row actions slot; the git action button stays in the meta row", () => {
      const store = useChatShellStore();
      store.setTabs([item('a', { isActive: true })]);
      store.setHeader(hdr({ tabBarPosition: 'input', tabBarVisible: true }));
      const navA = document.createElement('div');
      const cb = fakeCallbacks({ resolveNavRowEl: vi.fn(() => navA) });
      const { container } = mountHeader(cb);

      expect(navA.querySelector('.specorator-tab-badges')).toBeTruthy();
      expect(navA.querySelector('.specorator-header-btn')).toBeTruthy();

      const titleSlot = container.querySelector('.specorator-title-slot');
      expect(titleSlot?.querySelector('.specorator-tab-badges')).toBeNull();

      const actionsSlot = container.querySelector('.specorator-header-actions-slot');
      expect(actionsSlot?.querySelector('.specorator-header-btn')).toBeNull();

      // GitActionButton is now a native Vue component rendered directly in the
      // actions slot (not hosted via a mount callback); it stays present even
      // hidden (store.git.visible defaults to false).
      expect(actionsSlot?.querySelector('.specorator-git-action')).toBeTruthy();
    });

    it('tab switch re-targets the Teleport: content moves from one nav row to the other', async () => {
      const store = useChatShellStore();
      store.setTabs([item('t1', { isActive: true }), item('t2')]);
      store.setHeader(hdr({ tabBarPosition: 'input', tabBarVisible: true }));
      store.setActiveTabId('t1');

      const navA = document.createElement('div');
      const navB = document.createElement('div');
      const resolveNavRowEl = vi.fn((tabId: string | null) => {
        if (tabId === 't1') return navA;
        if (tabId === 't2') return navB;
        return null;
      });
      const cb = fakeCallbacks({ resolveNavRowEl });
      mountHeader(cb);

      expect(navA.querySelector('.specorator-tab-badges')).toBeTruthy();
      expect(navB.querySelector('.specorator-tab-badges')).toBeNull();

      store.setActiveTabId('t2');
      await nextTick();

      expect(navA.querySelector('.specorator-tab-badges')).toBeNull();
      expect(navB.querySelector('.specorator-tab-badges')).toBeTruthy();
    });
  });

  describe('provider logo', () => {
    it('ChatLogo receives logoProviderId and logoVisible from the header, and is visible when logoVisible is true', async () => {
      const store = useChatShellStore();
      store.setHeader(hdr({ logoProviderId: 'claude', logoVisible: true }));
      const cb = fakeCallbacks();
      const { container } = mountHeader(cb);
      const logo = container.querySelector('.specorator-logo') as HTMLElement;
      expect(logo).toBeTruthy();
      expect(logo.style.display).not.toBe('none');
      await nextTick();
      expect(cb.renderProviderLogo).toHaveBeenCalledWith(logo, 'claude');
    });

    it('ChatLogo is hidden (display:none) when logoVisible is false', () => {
      const store = useChatShellStore();
      store.setHeader(hdr({ logoProviderId: 'claude', logoVisible: false }));
      const cb = fakeCallbacks();
      const { container } = mountHeader(cb);
      const logo = container.querySelector('.specorator-logo') as HTMLElement;
      expect(logo.style.display).toBe('none');
    });
  });

  describe('title visibility (header-mode branding parity)', () => {
    it('hides the title text (display:none) when titleVisible is false and shows it when true', async () => {
      const store = useChatShellStore();
      store.setHeader(hdr({ titleVisible: false }));
      const { container, rerender } = mountHeader(fakeCallbacks());
      const title = container.querySelector('.specorator-title-text') as HTMLElement;
      expect(title.style.display).toBe('none');

      store.setHeader(hdr({ titleVisible: true }));
      await rerender({});
      expect(title.style.display).not.toBe('none');
    });
  });

  describe('new-tab button capacity gating (updateNewTabButtonVisibility parity)', () => {
    it('hides + disables the new-tab button when canCreateTab is false', async () => {
      const store = useChatShellStore();
      store.setHeader(hdr({ canCreateTab: false }));
      const { container, rerender } = mountHeader(fakeCallbacks());
      const newTabBtn = container.querySelector('.specorator-new-tab-btn') as HTMLElement;
      expect(newTabBtn.classList.contains('specorator-hidden')).toBe(true);
      expect(newTabBtn.getAttribute('aria-disabled')).toBe('true');
      expect(newTabBtn.getAttribute('aria-hidden')).toBe('true');

      store.setHeader(hdr({ canCreateTab: true }));
      await rerender({});
      expect(newTabBtn.classList.contains('specorator-hidden')).toBe(false);
      expect(newTabBtn.getAttribute('aria-disabled')).toBeNull();
      expect(newTabBtn.getAttribute('aria-hidden')).toBeNull();
    });
  });

  describe('quick-actions hover prewarm', () => {
    it('mouseenter on the quick-actions button fires onQuickActionsHover', async () => {
      const store = useChatShellStore();
      store.setHeader(hdr());
      const cb = fakeCallbacks();
      const { container } = mountHeader(cb);
      // First header button in the actions cluster is Quick Actions (see order test).
      const quickBtn = container.querySelector('.specorator-header-actions > .specorator-header-btn') as HTMLElement;
      await fireEvent.mouseEnter(quickBtn);
      expect(cb.onQuickActionsHover).toHaveBeenCalledTimes(1);
    });
  });
});
