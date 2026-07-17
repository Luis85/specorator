import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CALLBACKS_KEY } from '@/features/chat/ui/vue/chatShellKeys';
import ConversationHistoryDropdown from '@/features/chat/ui/vue/components/ConversationHistoryDropdown.vue';
import { useChatShellStore } from '@/features/chat/ui/vue/stores/chatShellStore';

vi.mock('obsidian', () => ({ setIcon: (el: HTMLElement, n: string) => el.setAttribute('data-icon', n) }));
vi.mock('@/i18n/i18n', () => ({ t: (k: string) => k }));

function conv(id: string, extra: Record<string, unknown> = {}) {
  return { id, providerId: 'claude', title: `Title ${id}`, createdAt: 1, updatedAt: 1, lastResponseAt: 1, messageCount: 2, preview: '', ...extra };
}

function mountDd(cb: Record<string, unknown> = {}) {
  return mount(ConversationHistoryDropdown, {
    global: { provide: { [CALLBACKS_KEY as symbol]: {
      onOpenHistory: vi.fn(), onSelectConversation: vi.fn(), onOpenConversationInNewTab: vi.fn(),
      onRenameConversation: vi.fn(), onDeleteConversation: vi.fn(), onRegenerateConversationTitle: vi.fn(),
      onConversationContextMenu: vi.fn(), ...cb,
    } } },
  });
}

describe('ConversationHistoryDropdown.vue', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('renders legacy history classes and marks the current row active', async () => {
    const store = useChatShellStore();
    store.setConversations({ items: [conv('a'), conv('b')], currentConversationId: 'b', perItem: { a: { openState: 'closed' }, b: { openState: 'current' } } });
    const w = mountDd();
    await w.find('.specorator-header-btn').trigger('click');
    expect(w.findAll('.specorator-history-item')).toHaveLength(2);
    expect(w.find('.specorator-history-item.active .specorator-history-item-title').text()).toBe('Title b');
    expect(w.find('.specorator-history-header').exists()).toBe(true);
  });

  it('opens a non-current row in a (new-or-existing) tab, never replacing the active tab', async () => {
    const store = useChatShellStore();
    store.setConversations({ items: [conv('a'), conv('b')], currentConversationId: 'b', perItem: { a: { openState: 'closed' }, b: { openState: 'current' } } });
    const onOpenConversationInNewTab = vi.fn();
    const onSelectConversation = vi.fn();
    const w = mountDd({ onOpenConversationInNewTab, onSelectConversation });
    await w.find('.specorator-header-btn').trigger('click');
    await w.findAll('.specorator-history-item')[0].find('.specorator-history-item-content').trigger('click');
    expect(onOpenConversationInNewTab).toHaveBeenCalledWith('a', true);
    expect(onSelectConversation).not.toHaveBeenCalled();
  });

  it('takes no action when clicking the loaded current row', async () => {
    const store = useChatShellStore();
    store.setConversations({ items: [conv('b')], currentConversationId: 'b', perItem: { b: { openState: 'current' } } });
    const onOpenConversationInNewTab = vi.fn();
    const w = mountDd({ onOpenConversationInNewTab });
    await w.find('.specorator-header-btn').trigger('click');
    await w.find('.specorator-history-item.active .specorator-history-item-content').trigger('click');
    expect(onOpenConversationInNewTab).not.toHaveBeenCalled();
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
