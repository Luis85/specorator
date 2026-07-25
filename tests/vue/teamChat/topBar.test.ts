import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { RosterAgent } from '@/features/agents/roster/rosterTypes';
import type { ComposerEditedFile } from '@/features/chat/ui/vue/composer/stores/composerStore';
import TeamChatTopBar from '@/features/teamChat/ui/vue/components/TeamChatTopBar.vue';
import { CALLBACKS_KEY } from '@/features/teamChat/ui/vue/keys';
import { useTeamChatStore } from '@/features/teamChat/ui/vue/stores/teamChatStore';

// Avatar rendering is imperative (setIcon/createSpan); stub it so assertions are
// about the identity header + files strip, not avatar internals. The host span
// still renders from TeamRosterAvatar's template.
vi.mock('@/features/agents/agentAvatar', () => ({ renderAgentAvatar: vi.fn() }));

const ENTRIES: ComposerEditedFile[] = [
  { path: 'src/new.ts', changeKind: 'created', name: 'new.ts', dir: 'src' },
  { path: 'docs/readme.md', changeKind: 'edited', name: 'readme.md', dir: 'docs' },
];

function agent(overrides: Partial<RosterAgent> = {}): RosterAgent {
  return {
    id: 'roster:a', name: 'Ada', description: 'router',
    prompt: '', disallowedTools: [], skills: [],
    roles: ['worker'], createdAt: 1, updatedAt: 2,
    ...overrides,
  };
}

function mountTopBar(cb: { onOpenEditedFile: ReturnType<typeof vi.fn> }) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const wrapper = mount(TeamChatTopBar, {
    global: { plugins: [pinia], provide: { [CALLBACKS_KEY as symbol]: cb } },
  });
  return { wrapper, store: useTeamChatStore() };
}

describe('TeamChatTopBar.vue (Phase 4b: identity + edited-files strip)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
  });

  it('self-hides until an agent is selected', () => {
    const { wrapper } = mountTopBar({ onOpenEditedFile: vi.fn() });
    expect(wrapper.find('.specorator-team-chat-top-bar').exists()).toBe(false);
  });

  it('renders the active agent identity: avatar host + name + voice summary', async () => {
    const { wrapper, store } = mountTopBar({ onOpenEditedFile: vi.fn() });
    store.setAgents([agent({ voice: 'Terse and precise.' })]);
    store.setSelected('roster:a');
    await wrapper.vm.$nextTick();

    expect(wrapper.find('.specorator-team-chat-top-bar').exists()).toBe(true);
    expect(wrapper.find('.specorator-team-roster-avatar').exists()).toBe(true);
    expect(wrapper.find('.specorator-team-chat-top-bar-name').text()).toBe('Ada');
    expect(wrapper.find('.specorator-team-chat-top-bar-voice').text()).toBe('Terse and precise.');
  });

  it('falls back to the description as the one-liner when the agent has no voice', async () => {
    const { wrapper, store } = mountTopBar({ onOpenEditedFile: vi.fn() });
    store.setAgents([agent({ voice: undefined, description: 'ships features' })]);
    store.setSelected('roster:a');
    await wrapper.vm.$nextTick();

    expect(wrapper.find('.specorator-team-chat-top-bar-voice').text()).toBe('ships features');
  });

  it('renders the active DM edited-files rows and opens one on click', async () => {
    const cb = { onOpenEditedFile: vi.fn() };
    const { wrapper, store } = mountTopBar(cb);
    store.setAgents([agent({ voice: 'Terse.' })]);
    store.setSelected('roster:a');
    store.setEditedFiles(ENTRIES);
    await wrapper.vm.$nextTick();

    // The badge summarises the kind-split count of the active DM's files.
    expect(wrapper.find('.specorator-edited-files-badge-count').text()).toBe('1 created · 1 edited');

    // Open the popover, assert both rows, then activate one → routes through the view.
    await wrapper.find('.specorator-edited-files-badge').trigger('click');
    const items = wrapper.findAll('.specorator-edited-files-item');
    expect(items).toHaveLength(2);
    await items[1].trigger('click');
    expect(cb.onOpenEditedFile).toHaveBeenCalledWith('docs/readme.md');
  });

  it('shows no files strip badge when the active DM has no edited files', async () => {
    const { wrapper, store } = mountTopBar({ onOpenEditedFile: vi.fn() });
    store.setAgents([agent({ voice: 'Terse.' })]);
    store.setSelected('roster:a');
    await wrapper.vm.$nextTick();

    // Identity still renders; the strip self-hides with no entries.
    expect(wrapper.find('.specorator-team-chat-top-bar-name').text()).toBe('Ada');
    expect(wrapper.find('.specorator-edited-files-badge').exists()).toBe(false);
    expect(wrapper.find('.specorator-edited-files-row').classes()).toContain('specorator-hidden');
  });
});
