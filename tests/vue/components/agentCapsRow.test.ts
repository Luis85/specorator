import { render, screen } from '@testing-library/vue';
import { describe, expect, it, vi } from 'vitest';

import type { RosterAgent } from '@/features/agents/roster/rosterTypes';
import AgentCapsRow from '@/features/library/vue/components/AgentCapsRow.vue';
import { PLUGIN_KEY } from '@/features/library/vue/libraryKeys';

vi.mock('@/core/providers/ProviderRegistry', () => ({
  ProviderRegistry: {
    getChatUIConfig: vi.fn().mockReturnValue({
      getModelOptions: vi.fn().mockReturnValue([{ value: 'model-1', label: 'Model One' }]),
    }),
  },
}));

const base: RosterAgent = {
  id: 'roster:a', name: 'Alice', description: '', prompt: '', disallowedTools: [],
  skills: [], roles: [], tags: [], createdAt: 1, updatedAt: 2,
};

function mount(agent: RosterAgent) {
  return render(AgentCapsRow, {
    props: { agent },
    global: { provide: { [PLUGIN_KEY as symbol]: { settings: {} } } },
  });
}

describe('AgentCapsRow', () => {
  it('renders no caps row at all when the agent has no chips (legacy parity)', () => {
    mount({ ...base });
    expect(document.querySelector('.specorator-vue-card-caps')).toBeNull();
  });

  it('renders role chips (labelled) and plain tag chips', () => {
    mount({ ...base, roles: ['worker'], tags: ['alpha', 'beta'] });
    expect(document.querySelector('.specorator-vue-card-caps')).not.toBeNull();
    expect(screen.getByText('Worker')).toBeTruthy();
    expect(document.querySelectorAll('.specorator-vue-agent-chip-role')).toHaveLength(1);
    expect(document.querySelectorAll('.specorator-vue-chip')).toHaveLength(2);
  });

  it('resolves the model chip label through the active provider UI config', () => {
    mount({ ...base, modelSelection: { modelId: 'model-1', providerId: 'claude' } });
    expect(screen.getByText('Model One')).toBeTruthy();
    expect(document.querySelector('.specorator-vue-agent-chip-model')).not.toBeNull();
  });

  it('shows a skills-count chip only when the agent has skills', () => {
    mount({ ...base, skills: ['s1', 's2'] });
    expect(document.querySelector('.specorator-vue-card-caps')).not.toBeNull();
    // Skills present but no roles/tags/model: exactly one (skills) chip.
    expect(document.querySelectorAll('.specorator-vue-agent-chip')).toHaveLength(1);
  });

  it('treats an explicit modelSelection:null as "no chip" (!= null vs !== undefined guard)', () => {
    // A raw `"modelSelection": null` in roster JSON must not open the caps row.
    mount({ ...base, modelSelection: null } as unknown as RosterAgent);
    expect(document.querySelector('.specorator-vue-card-caps')).toBeNull();
  });
});
