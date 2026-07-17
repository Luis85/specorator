import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { shallowRef } from 'vue';

import { CALLBACKS_KEY as SHELL_CB } from '@/features/chat/ui/vue/chatShellKeys';
import ConversationHistoryDropdown from '@/features/chat/ui/vue/components/ConversationHistoryDropdown.vue';
import GitActionButton from '@/features/chat/ui/vue/components/GitActionButton.vue';
import WorkOrderActivityDropdown from '@/features/chat/ui/vue/components/WorkOrderActivityDropdown.vue';
import { useChatShellStore } from '@/features/chat/ui/vue/stores/chatShellStore';
import NavOverlay from '@/features/chat/ui/vue/tabChrome/NavOverlay.vue';
import StatusPanel from '@/features/chat/ui/vue/tabChrome/StatusPanel.vue';
import { useTabChromeStore } from '@/features/chat/ui/vue/tabChrome/stores/tabChromeStore';
import { CALLBACKS_KEY as CHROME_CB, NAV_HOST_KEY, SCROLL_HOST_KEY } from '@/features/chat/ui/vue/tabChrome/tabChromeKeys';

import { chromeCallbacks, shellCallbacks } from './helpers';

vi.mock('obsidian', () => ({ setIcon: (el: HTMLElement, n: string) => el.setAttribute('data-icon', n), Notice: vi.fn() }));
vi.mock('@/i18n/i18n', () => ({ t: (k: string) => k }));

const shellCb = shellCallbacks;

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
    for (const c of ['specorator-work-order-activity', 'specorator-work-order-activity-toggle', 'specorator-work-order-activity-count', 'specorator-work-order-activity-menu', 'specorator-work-order-activity-item', 'specorator-work-order-activity-close', 'specorator-work-order-activity-title', 'specorator-work-order-activity-status', 'specorator-work-order-activity-action']) {
      expect(w.find(`.${c}`).exists()).toBe(true);
    }
  });

  it('ConversationHistoryDropdown emits .specorator-history-* classes', async () => {
    const store = useChatShellStore();
    store.setConversations({ items: [{ id: 'a', providerId: 'claude', title: 'A', createdAt: 1, updatedAt: 1, lastResponseAt: 1, messageCount: 1, preview: '' }], currentConversationId: 'a' } as never);
    const w = mount(ConversationHistoryDropdown, { global: { provide: { [SHELL_CB as symbol]: shellCb() } } });
    await w.find('.specorator-header-btn').trigger('click');
    for (const c of ['specorator-history-container', 'specorator-history-menu', 'specorator-history-header', 'specorator-history-list', 'specorator-history-item', 'specorator-history-item-icon', 'specorator-history-item-content', 'specorator-history-item-title', 'specorator-history-item-date', 'specorator-history-item-actions', 'specorator-action-btn', 'specorator-delete-btn']) {
      expect(w.find(`.${c}`).exists()).toBe(true);
    }
  });

  it('StatusPanel emits .specorator-status-panel-* classes', async () => {
    const store = useTabChromeStore();
    store.setTodos([{ content: 'x', status: 'pending', activeForm: 'X' }, { content: 'y', status: 'in_progress', activeForm: 'Y' }] as never);
    store.setBashOutputs([{ id: 'a', command: 'ls', status: 'completed', output: 'o' }] as never);
    const w = mount(StatusPanel, { global: { provide: { [CHROME_CB as symbol]: chromeCallbacks() } } });
    await w.vm.$nextTick();
    for (const c of ['specorator-status-panel', 'specorator-status-panel-bash', 'specorator-status-panel-bash-entry', 'specorator-status-panel-todos', 'specorator-status-panel-header', 'specorator-status-panel-current', 'specorator-todo-item']) {
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
