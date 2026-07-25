import { fireEvent, render, screen } from '@testing-library/vue';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { RosterAgent } from '@/features/agents/roster/rosterTypes';
import { CALLBACKS_KEY, CONTENT_HOST_KEY, PLUGIN_KEY } from '@/features/teamChat/ui/vue/keys';
import TeamChatRoot from '@/features/teamChat/ui/vue/TeamChatRoot.vue';

// Avatar rendering is imperative (setIcon/createSpan); stub it so the assertions
// are about row interaction, not avatar internals.
vi.mock('@/features/agents/agentAvatar', () => ({ renderAgentAvatar: vi.fn() }));

function agent(id: string, name: string): RosterAgent {
  return {
    id, name, description: 'desc',
    prompt: '', disallowedTools: [], skills: [],
    roles: ['worker'], createdAt: 1, updatedAt: 2,
  };
}

function makePlugin(agents: RosterAgent[]) {
  return {
    agentRosterStore: { list: vi.fn().mockResolvedValue(agents) },
    events: { on: vi.fn(() => vi.fn()) },
    logger: { scope: () => ({ error: vi.fn() }) },
  } as never;
}

function makeCallbacks() {
  return { subscribe: vi.fn(() => vi.fn()), onSelectAgent: vi.fn() };
}

function mountRoot(plugin: unknown, callbacks: unknown) {
  const pinia = createPinia();
  setActivePinia(pinia);
  return render(TeamChatRoot, {
    global: {
      plugins: [pinia],
      provide: {
        [PLUGIN_KEY as symbol]: plugin,
        [CALLBACKS_KEY as symbol]: callbacks,
        [CONTENT_HOST_KEY as symbol]: vi.fn(),
      },
    },
  });
}

function rowFor(name: string): HTMLElement {
  const label = screen.getByText(name);
  const row = label.closest('.specorator-team-roster-row');
  if (!row) throw new Error(`no roster row for ${name}`);
  return row as HTMLElement;
}

describe('TeamRoster (Phase 4b: interactive roster → DM)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
  });

  it('fires onSelectAgent(agentId) when a roster row is clicked', async () => {
    const callbacks = makeCallbacks();
    mountRoot(makePlugin([agent('roster:a', 'Ada')]), callbacks);
    await screen.findByText('Ada');

    await fireEvent.click(rowFor('Ada'));

    expect(callbacks.onSelectAgent).toHaveBeenCalledWith('roster:a');
  });

  it('fires onSelectAgent on Enter and Space for keyboard access', async () => {
    const callbacks = makeCallbacks();
    mountRoot(makePlugin([agent('roster:a', 'Ada')]), callbacks);
    await screen.findByText('Ada');
    const row = rowFor('Ada');

    await fireEvent.keyDown(row, { key: 'Enter' });
    await fireEvent.keyDown(row, { key: ' ' });

    expect(callbacks.onSelectAgent).toHaveBeenNthCalledWith(1, 'roster:a');
    expect(callbacks.onSelectAgent).toHaveBeenNthCalledWith(2, 'roster:a');
  });

  it('exposes each row as a keyboard-focusable button for a11y', async () => {
    mountRoot(makePlugin([agent('roster:a', 'Ada')]), makeCallbacks());
    await screen.findByText('Ada');
    const row = rowFor('Ada');
    expect(row.getAttribute('role')).toBe('button');
    expect(row.getAttribute('tabindex')).toBe('0');
  });

  it('subscribes the store projection seam exactly once on mount', () => {
    const callbacks = makeCallbacks();
    mountRoot(makePlugin([agent('roster:a', 'Ada')]), callbacks);
    expect(callbacks.subscribe).toHaveBeenCalledTimes(1);
  });

  it('does not open any DM on mere render (interaction is click/keyboard only)', async () => {
    const callbacks = makeCallbacks();
    mountRoot(makePlugin([agent('roster:a', 'Ada')]), callbacks);
    await screen.findByText('Ada');
    expect(callbacks.onSelectAgent).not.toHaveBeenCalled();
  });
});
