import { fireEvent, render, screen, waitFor } from '@testing-library/vue';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';

import { PLUGIN_KEY, TAB_GUARD_KEY } from '@/features/library/vue/libraryKeys';
import AgentsPanel from '@/features/library/vue/panels/AgentsPanel.vue';
import { useRosterStore } from '@/features/library/vue/stores/rosterStore';

// NOTE: AgentDetailEditor is deliberately NOT mocked here (the sibling
// agentsPanel.test.ts stubs it). This drives the REAL editor mounted inside the
// REAL panel — the one seam the wiring bug lives in and the stubbed test can't
// see: clicking the editor's actual footer Delete button.
vi.mock('@/features/agents/agentAvatar', () => ({ renderAgentAvatar: vi.fn() }));
vi.mock('@/shared/modals/ConfirmModal', () => ({
  confirm: vi.fn().mockResolvedValue(true),
  confirmDelete: vi.fn(),
}));
vi.mock('@/core/providers/ProviderRegistry', () => ({
  ProviderRegistry: {
    isEnabled: vi.fn().mockReturnValue(true),
    resolveSettingsProviderId: vi.fn().mockReturnValue('claude'),
    getEnabledProviderIds: vi.fn().mockReturnValue(['claude']),
    getChatUIConfig: vi.fn().mockReturnValue({
      getModelOptions: vi.fn().mockReturnValue([]),
    }),
  },
}));

const agent = {
  id: 'roster:a', name: 'Alice', description: 'router', prompt: '', disallowedTools: [],
  skills: [] as string[], roles: ['worker'] as Array<'worker' | 'verifier'>, tags: ['t'],
  createdAt: 1, updatedAt: 2,
};

function setup() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const tabGuard = ref<(() => Promise<boolean>) | null>(null);
  // Realistic backing store: delete(id) actually removes the agent, so list()
  // reflects the deletion the way the real AgentRosterStore does.
  const backing = new Map([[agent.id, agent]]);
  const plugin = {
    app: {},
    settings: {},
    // Agents panel subscribes to `roster:changed` on mount; `on` returns a
    // disposer (the real EventBus contract).
    events: { on: vi.fn(() => vi.fn()) },
    logger: { scope: () => ({ error: vi.fn(), warn: vi.fn(), debug: vi.fn() }) },
    agentRosterStore: {
      list: vi.fn().mockImplementation(async () => [...backing.values()]),
      save: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockImplementation(async (id: string) => { backing.delete(id); }),
    },
    removeRosterAgentProjection: vi.fn().mockResolvedValue(undefined),
    vaultSkillAggregator: { listAll: vi.fn().mockResolvedValue([]) },
  } as never;
  useRosterStore().init(plugin);
  const utils = render(AgentsPanel, {
    global: {
      plugins: [pinia],
      provide: { [PLUGIN_KEY as symbol]: plugin, [TAB_GUARD_KEY as symbol]: tabGuard },
    },
  });
  return { plugin: plugin as never as {
    agentRosterStore: { delete: ReturnType<typeof vi.fn> };
    removeRosterAgentProjection: ReturnType<typeof vi.fn>;
  }, ...utils };
}

describe('AgentsPanel detail-page Delete (real editor, e2e)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('the detail footer Delete button removes the agent through the store', async () => {
    const { plugin } = setup();
    await screen.findByText('Alice');
    // Open the detail editor for the agent.
    await fireEvent.click(screen.getByRole('button', { name: 'Alice' }));
    // The real editor renders its footer AFTER an async skills read; wait for
    // its footer Delete button to exist in the detail host.
    const del = await waitFor(() => {
      const btn = document.querySelector(
        '.specorator-roster-detail-footer .specorator-library-card-delete',
      );
      if (!btn) throw new Error('detail footer delete button not yet rendered');
      return btn as HTMLButtonElement;
    });
    await fireEvent.click(del);
    await waitFor(() => expect(plugin.agentRosterStore.delete).toHaveBeenCalledWith('roster:a'));
    expect(plugin.removeRosterAgentProjection).toHaveBeenCalled();
    // Full user-visible outcome: the detail page closes and the card is gone.
    await waitFor(() => expect(document.querySelector('.specorator-roster-detail-footer')).toBeNull());
    expect(screen.queryByText('Alice')).toBeNull();
  });
});
