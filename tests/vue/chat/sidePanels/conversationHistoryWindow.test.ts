import { mount } from '@vue/test-utils';
import { createPinia,setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CALLBACKS_KEY } from '@/features/chat/ui/vue/chatShellKeys';
import ConversationHistoryDropdown from '@/features/chat/ui/vue/components/ConversationHistoryDropdown.vue';
import { useChatShellStore } from '@/features/chat/ui/vue/stores/chatShellStore';

vi.mock('obsidian', () => ({ setIcon: (el: HTMLElement, n: string) => el.setAttribute('data-icon', n) }));
vi.mock('@/i18n/i18n', () => ({ t: (k: string) => k }));

const HISTORY_RENDER_WINDOW_SIZE = 50;

function metas(n: number, currentId: string | null = null) {
  const items = Array.from({ length: n }, (_, i) => ({
    id: `conv-${i}`, providerId: 'claude', title: `Conversation ${i}`,
    createdAt: i * 1000, updatedAt: i * 1000, lastResponseAt: i * 1000, messageCount: 4, preview: '',
  }));
  const perItem: Record<string, { openState: 'closed' | 'open' | 'current' }> = {};
  for (const c of items) perItem[c.id] = { openState: c.id === currentId ? 'current' : 'closed' };
  return { items, currentConversationId: currentId, perItem };
}

function mountOpen(store: ReturnType<typeof useChatShellStore>) {
  const w = mount(ConversationHistoryDropdown, {
    global: { provide: { [CALLBACKS_KEY as symbol]: {
      onOpenHistory: vi.fn(), onSelectConversation: vi.fn(), onOpenConversationInNewTab: vi.fn(),
      onRenameConversation: vi.fn(), onDeleteConversation: vi.fn(), onRegenerateConversationTitle: vi.fn(),
      onConversationContextMenu: vi.fn(),
    } } },
  });
  return w.find('.specorator-header-btn').trigger('click').then(() => w);
}

describe('conversation history window (migrated from conversationHistory.perf)', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('mounts min(n, 50) rows regardless of conversation count', async () => {
    for (const n of [50, 200, 800, 2000]) {
      setActivePinia(createPinia());
      const store = useChatShellStore();
      store.setConversations(metas(n) as never);
      const w = await mountOpen(store);
      expect(w.findAll('.specorator-history-item')).toHaveLength(Math.min(n, HISTORY_RENDER_WINDOW_SIZE));
    }
  });

  it('reveals the next chunk on "Show more" click', async () => {
    const store = useChatShellStore();
    store.setConversations(metas(120) as never);
    const w = await mountOpen(store);
    expect(w.findAll('.specorator-history-item')).toHaveLength(50);
    await w.find('.specorator-history-show-more-btn').trigger('click');
    expect(w.findAll('.specorator-history-item')).toHaveLength(100);
    await w.find('.specorator-history-show-more-btn').trigger('click');
    expect(w.findAll('.specorator-history-item')).toHaveLength(120);
  });

  it('pins the active conversation to the top when it sorts past the window', async () => {
    const store = useChatShellStore();
    // conv-119 is current but sorts at index 119 (past the 50-item window), so
    // the pin logic must splice it to the front and mark it active.
    store.setConversations(metas(120, 'conv-119') as never);
    const w = await mountOpen(store);
    const first = w.findAll('.specorator-history-item')[0];
    expect(first.classes()).toContain('active');
    expect(first.find('.specorator-history-item-title').text()).toBe('Conversation 119');
  });
});
