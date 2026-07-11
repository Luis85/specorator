import { setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AgentBoardView } from '@/features/tasks/ui/AgentBoardView';
import { getAgentBoardPinia, resetAgentBoardPinia } from '@/features/tasks/ui/vue/globalPinia';
import { useAgentBoardStore } from '@/features/tasks/ui/vue/stores/agentBoardStore';

// Regression: the card assignee persona resolves off the view's NON-reactive
// `rosterAgents` cache, which refresh() reloads asynchronously. The store's
// rosterVersion bump — the reactive "personas changed" signal — must fire AFTER
// that awaited reload, not from the composable's synchronous roster:changed
// handler (which ran before the cache was fresh, re-resolving against stale
// agents with nothing to re-trigger).
describe('AgentBoardView.refresh roster invalidation', () => {
  beforeEach(() => resetAgentBoardPinia());

  it('bumps store.rosterVersion AFTER refreshing the non-reactive persona cache', async () => {
    const pinia = getAgentBoardPinia();
    setActivePinia(pinia);
    const store = useAgentBoardStore(pinia);
    const order: string[] = [];
    const bump = vi.spyOn(store, 'bumpRoster').mockImplementation(() => {
      order.push('bump');
    });

    const view = Object.create(AgentBoardView.prototype) as unknown as {
      plugin: unknown;
      indexer: unknown;
      loopCatalog: unknown;
      syncRunner: () => void;
      refresh: () => Promise<void>;
    };
    view.plugin = {
      settings: {},
      app: { vault: {} },
      agentRosterStore: {
        list: vi.fn(async () => {
          order.push('roster-cache');
          return [];
        }),
      },
    };
    view.indexer = { indexVaultFolder: vi.fn(async () => ({ tasks: [], invalidNotes: [] })) };
    view.loopCatalog = { listLoops: vi.fn(async () => []) };
    view.syncRunner = vi.fn();

    await view.refresh();

    expect(bump).toHaveBeenCalledTimes(1);
    expect(order).toEqual(['roster-cache', 'bump']);
  });
});
