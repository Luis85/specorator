import { fireEvent, render, screen } from '@testing-library/vue';
import { describe, expect, it, vi } from 'vitest';

import type { RosterAgent } from '@/features/agents/roster/rosterTypes';
import AgentCard from '@/features/library/vue/components/AgentCard.vue';
import { PLUGIN_KEY } from '@/features/library/vue/libraryKeys';

vi.mock('@/features/agents/agentAvatar', () => ({ renderAgentAvatar: vi.fn() }));
vi.mock('@/core/providers/ProviderRegistry', () => ({
  ProviderRegistry: {
    getChatUIConfig: vi.fn().mockReturnValue({ getModelOptions: vi.fn().mockReturnValue([]) }),
  },
}));

const agent: RosterAgent = {
  id: 'roster:a', name: 'Alice', description: 'router', prompt: '', disallowedTools: [],
  skills: [], roles: ['worker'], tags: ['t'], createdAt: 1, updatedAt: 2,
};

function mount(overrides: Partial<RosterAgent> = {}, busy = false) {
  return render(AgentCard, {
    props: { agent: { ...agent, ...overrides }, busy },
    global: { provide: { [PLUGIN_KEY as symbol]: { settings: {} } } },
  });
}

describe('AgentCard', () => {
  it('renders the description and forwards row-action events with the agent in scope', async () => {
    const { emitted } = mount();
    expect(screen.getByText('router')).toBeTruthy();
    await fireEvent.click(screen.getByRole('button', { name: 'Start chat' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(emitted()['start-chat']).toHaveLength(1);
    expect(emitted().delete).toHaveLength(1);
  });

  it('activates from the card row (opens detail) but not from a nested action button', async () => {
    const { emitted } = mount();
    await fireEvent.click(screen.getByRole('button', { name: 'Alice' }));
    expect(emitted().activate).toHaveLength(1);
    // The action button bubbles its own event, never the card activate.
    await fireEvent.click(screen.getByRole('button', { name: 'Duplicate' }));
    expect(emitted().activate).toHaveLength(1);
  });

  it('falls back to an em dash when the agent has no description', () => {
    mount({ description: '' });
    expect(screen.getByText('—')).toBeTruthy();
  });
});
