import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CALLBACKS_KEY } from '@/features/chat/ui/vue/chatShellKeys';
import ConversationHistoryDropdown from '@/features/chat/ui/vue/components/ConversationHistoryDropdown.vue';
import { useChatShellStore } from '@/features/chat/ui/vue/stores/chatShellStore';

import { conversationMeta, shellCallbacks } from './helpers';

vi.mock('obsidian', () => ({ setIcon: (el: HTMLElement, n: string) => el.setAttribute('data-icon', n) }));
vi.mock('@/i18n/i18n', () => ({ t: (k: string) => k }));

const conv = conversationMeta;

function mountDd(cb: Record<string, unknown> = {}) {
  return mount(ConversationHistoryDropdown, {
    global: { provide: { [CALLBACKS_KEY as symbol]: shellCallbacks(cb) } },
  });
}

describe('ConversationHistoryDropdown.vue', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('renders legacy history classes and marks the current row active', async () => {
    const store = useChatShellStore();
    store.setConversations({ items: [conv('a'), conv('b')], currentConversationId: 'b' });
    const w = mountDd();
    await w.find('.specorator-header-btn').trigger('click');
    expect(w.findAll('.specorator-history-item')).toHaveLength(2);
    expect(w.find('.specorator-history-item.active .specorator-history-item-title').text()).toBe('Title b');
    expect(w.find('.specorator-history-header').exists()).toBe(true);
  });

  it('opens a non-current row in a (new-or-existing) tab, never replacing the active tab', async () => {
    const store = useChatShellStore();
    store.setConversations({ items: [conv('a'), conv('b')], currentConversationId: 'b' });
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
    store.setConversations({ items: [conv('b')], currentConversationId: 'b' });
    const onOpenConversationInNewTab = vi.fn();
    const w = mountDd({ onOpenConversationInNewTab });
    await w.find('.specorator-header-btn').trigger('click');
    await w.find('.specorator-history-item.active .specorator-history-item-content').trigger('click');
    expect(onOpenConversationInNewTab).not.toHaveBeenCalled();
  });

  it('commits an inline rename on Enter', async () => {
    const store = useChatShellStore();
    store.setConversations({ items: [conv('a')], currentConversationId: null });
    const onRenameConversation = vi.fn();
    const w = mountDd({ onRenameConversation });
    await w.find('.specorator-header-btn').trigger('click');
    await w.find('.specorator-action-btn[aria-label="Rename"]').trigger('click');
    const input = w.find('input.specorator-rename-input');
    await input.setValue('New name');
    await input.trigger('keydown', { key: 'Enter' });
    expect(onRenameConversation).toHaveBeenCalledWith('a', 'New name');
  });

  it('swaps the row icon when the current conversation changes (memoized refs stay live)', async () => {
    const store = useChatShellStore();
    store.setConversations({ items: [conv('a'), conv('b')], currentConversationId: 'b' });
    const w = mountDd();
    await w.find('.specorator-header-btn').trigger('click');
    const iconByTitle = (title: string) => w.findAll('.specorator-history-item')
      .find((row) => row.find('.specorator-history-item-title').text() === title)!
      .find('.specorator-history-item-icon').attributes('data-icon');
    expect(iconByTitle('Title b')).toBe('message-square-dot');
    expect(iconByTitle('Title a')).toBe('message-square');
    // Current flips to 'a': both rows' cached refs change identity, so Vue
    // rebinds and setIcon swaps the glyphs (the cache keys include is-current).
    store.setConversations({ items: [conv('a'), conv('b')], currentConversationId: 'a' });
    await w.vm.$nextTick();
    expect(iconByTitle('Title a')).toBe('message-square-dot');
    expect(iconByTitle('Title b')).toBe('message-square');
  });

  it('closes on an outside click but stays open for inside clicks', async () => {
    const store = useChatShellStore();
    store.setConversations({ items: [conv('a')], currentConversationId: null });
    const w = mountDd();
    await w.find('.specorator-header-btn').trigger('click');
    expect(w.find('.specorator-history-menu').classes()).toContain('visible');
    // Inside click (the list) does not close.
    w.find('.specorator-history-list').element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await w.vm.$nextTick();
    expect(w.find('.specorator-history-menu').classes()).toContain('visible');
    // Outside click (the document) closes.
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await w.vm.$nextTick();
    expect(w.find('.specorator-history-menu').classes()).not.toContain('visible');
    w.unmount();
  });

  it('Escape cancels an inline rename without committing', async () => {
    const store = useChatShellStore();
    store.setConversations({ items: [conv('a')], currentConversationId: null });
    const onRenameConversation = vi.fn();
    const w = mountDd({ onRenameConversation });
    await w.find('.specorator-header-btn').trigger('click');
    await w.find('.specorator-action-btn[aria-label="Rename"]').trigger('click');
    const input = w.find('input.specorator-rename-input');
    await input.setValue('Discarded edit');
    await input.trigger('keydown', { key: 'Escape' });
    expect(onRenameConversation).not.toHaveBeenCalled();
    expect(w.find('input.specorator-rename-input').exists()).toBe(false);
    // The follow-on blur (the input unmounting) must not commit either.
    await w.vm.$nextTick();
    expect(onRenameConversation).not.toHaveBeenCalled();
  });

  it('shows a regenerate button for failed title generation', async () => {
    const store = useChatShellStore();
    store.setConversations({ items: [conv('a', { titleGenerationStatus: 'failed' })], currentConversationId: null });
    const onRegenerateConversationTitle = vi.fn();
    const w = mountDd({ onRegenerateConversationTitle });
    await w.find('.specorator-header-btn').trigger('click');
    await w.find('.specorator-action-btn[aria-label="Regenerate title"]').trigger('click');
    expect(onRegenerateConversationTitle).toHaveBeenCalledWith('a');
  });
});
