import { render, screen } from '@testing-library/vue';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';

import PresenceDot from '@/features/teamChat/ui/vue/components/PresenceDot.vue';
import { CALLBACKS_KEY, CONTENT_HOST_KEY, PLUGIN_KEY } from '@/features/teamChat/ui/vue/keys';
import { useTeamChatStore } from '@/features/teamChat/ui/vue/stores/teamChatStore';
import TeamChatRoot from '@/features/teamChat/ui/vue/TeamChatRoot.vue';

import { agent, awaitRoster, makeCallbacks, makePlugin, within } from './fixtures';

// Avatar rendering is imperative (setIcon/createSpan); stub it so the assertions
// are about the presence dot, not avatar internals.
vi.mock('@/features/agents/agentAvatar', () => ({ renderAgentAvatar: vi.fn() }));

function mountRoot(plugin: unknown) {
  const pinia = createPinia();
  setActivePinia(pinia);
  render(TeamChatRoot, {
    global: {
      plugins: [pinia],
      provide: {
        [PLUGIN_KEY as symbol]: plugin,
        [CALLBACKS_KEY as symbol]: makeCallbacks(),
        [CONTENT_HOST_KEY as symbol]: vi.fn(),
      },
    },
  });
  return useTeamChatStore();
}

// Scoped to the listbox: an agent's name also appears in the empty pane's quick-picks,
// so an unscoped text query matches two nodes.
function dotFor(name: string): HTMLElement {
  const list = screen.getByRole('listbox');
  const row = within(list).getByText(name).closest('.specorator-team-roster-row');
  const dot = row?.querySelector('.specorator-team-presence-dot');
  if (!dot) throw new Error(`no presence dot for ${name}`);
  return dot as HTMLElement;
}

describe('PresenceDot.vue (idle / busy)', () => {
  it('renders the idle state: a faint static dot labelled Idle', () => {
    const wrapper = mount(PresenceDot, { props: { state: 'idle' } });
    const dot = wrapper.find('.specorator-team-presence-dot');
    expect(dot.classes()).toContain('specorator-team-presence-dot--idle');
    expect(dot.attributes('role')).toBe('img');
    expect(dot.attributes('aria-label')).toBe('Idle');
    expect(dot.attributes('title')).toBe('Idle');
  });

  it('renders the busy state: an accented pulsing dot labelled Busy', () => {
    const wrapper = mount(PresenceDot, { props: { state: 'busy' } });
    const dot = wrapper.find('.specorator-team-presence-dot');
    expect(dot.classes()).toContain('specorator-team-presence-dot--busy');
    expect(dot.attributes('aria-label')).toBe('Busy');
  });
});

describe('TeamRoster presence dots (bound to the store presence map)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
  });

  it('renders a dot on every roster row, idle by default (no open DM)', async () => {
    mountRoot(makePlugin([agent('roster:a', 'Ada')]));
    await awaitRoster();
    expect(dotFor('Ada').classList.contains('specorator-team-presence-dot--idle')).toBe(true);
  });

  it('flips a row to busy when the store marks that agent busy', async () => {
    const store = mountRoot(makePlugin([agent('roster:a', 'Ada'), agent('roster:b', 'Bruno')]));
    await awaitRoster();

    store.setPresence({ 'roster:a': 'busy' });
    await nextTick();

    // The streaming agent shows busy; the other stays idle (absent from the map).
    expect(dotFor('Ada').classList.contains('specorator-team-presence-dot--busy')).toBe(true);
    expect(dotFor('Ada').getAttribute('aria-label')).toBe('Busy');
    expect(dotFor('Bruno').classList.contains('specorator-team-presence-dot--idle')).toBe(true);
  });

  it('drops a row back to idle when the agent leaves the presence map', async () => {
    const store = mountRoot(makePlugin([agent('roster:a', 'Ada')]));
    await awaitRoster();

    store.setPresence({ 'roster:a': 'busy' });
    await nextTick();
    expect(dotFor('Ada').classList.contains('specorator-team-presence-dot--busy')).toBe(true);

    store.setPresence({});
    await nextTick();
    expect(dotFor('Ada').classList.contains('specorator-team-presence-dot--idle')).toBe(true);
  });
});
