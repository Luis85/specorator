/**
 * Conversation-list scaling guard (plugin activation).
 *
 * `ConversationStore.loadConversations` runs at plugin load; maps + sorts
 * every session metadata record. A proxy for activation time vs. vault size.
 *
 * The history-dropdown render-window guard (formerly here, driven through
 * `ConversationController.updateHistoryDropdown`) moved with the dropdown's
 * Vue migration — the windowing math now lives in
 * `ConversationHistoryDropdown.vue` and its scaling guard is
 * `tests/vue/chat/sidePanels/conversationHistoryWindow.test.ts` (Vitest lane),
 * not the imperative controller.
 */
import { ConversationStore } from '@/app/conversations/ConversationStore';
import type { SharedAppStorage } from '@/core/bootstrap/storage';
import type { AppSessionStorage } from '@/core/providers/types';
import type { SessionMetadata } from '@/core/types';

import { reportMetrics } from './perfReport';

jest.mock('@/utils/imageEmbed', () => ({ replaceImageEmbedsWithHtml: (md: string) => md }));
jest.mock('@/utils/fileLink', () => ({ processFileLinks: jest.fn(), registerFileLinkHandler: jest.fn() }));

const SCALES = [50, 200, 800, 2000];

describe('ConversationStore.loadConversations (activation proxy)', () => {
  function createStore(metas: SessionMetadata[]): ConversationStore {
    const sessions = {
      listMetadata: jest.fn().mockResolvedValue(metas),
      saveMetadata: jest.fn(),
      deleteMetadata: jest.fn(),
      toSessionMetadata: jest.fn(),
    } as unknown as AppSessionStorage;
    const storage = { sessions } as unknown as SharedAppStorage;
    return new ConversationStore({
      storage,
      getVaultPath: () => '/vault',
      repairViewsAfterDelete: async () => undefined,
      quiesceViewsForDelete: async () => undefined,
      events: { emit: jest.fn(), on: jest.fn(), off: jest.fn(), setErrorSink: jest.fn() } as any,
    });
  }

  function sessionMetas(n: number): SessionMetadata[] {
    // lastResponseAt decreases with i, so conv-0 is the most recent. Input order
    // is already ascending-by-i, i.e. descending-by-recency-reversed, forcing the
    // recency sort to actually reorder rather than no-op.
    return Array.from({ length: n }, (_, i) => ({
      id: `conv-${i}`,
      providerId: 'claude',
      title: `Conversation ${i}`,
      createdAt: i * 1000,
      updatedAt: i * 1000,
      lastResponseAt: (n - i) * 1000,
    })) as unknown as SessionMetadata[];
  }

  it('keeps load+sort cost tracking conversation count', async () => {
    const metrics: { n: number; values: Record<string, number> }[] = [];
    for (const n of SCALES) {
      const store = createStore(sessionMetas(n));
      const start = performance.now();
      await store.loadConversations();
      const ms = performance.now() - start;
      metrics.push({ n, values: { loaded: store.getConversations().length, loadMs: Math.round(ms * 100) / 100 } });
      expect(store.getConversations()).toHaveLength(n);
      // Sorted by recency descending: conv-0 has the largest lastResponseAt.
      expect(store.getConversations()[0].id).toBe('conv-0');
    }

    reportMetrics('ConversationStore.loadConversations — load+sort vs count', metrics);
  });
});
