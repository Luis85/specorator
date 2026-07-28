import { render, screen } from '@testing-library/vue';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CALLBACKS_KEY, CONTENT_HOST_KEY, PLUGIN_KEY } from '@/features/teamChat/ui/vue/keys';
import TeamChatRoot from '@/features/teamChat/ui/vue/TeamChatRoot.vue';

import { agent as baseAgent, awaitRoster, makeCallbacks, makePlugin, within } from './fixtures';

// The avatar renderer is imperative (setIcon/createSpan); stub it so the mount
// assertions are about rows + read-only, not avatar internals.
vi.mock('@/features/agents/agentAvatar', () => ({ renderAgentAvatar: vi.fn() }));

/** This file's agents carry a per-case description (the rows render it as the
 *  subtitle fallback when the agent has no DM thread yet). */
function agent(id: string, name: string, description: string) {
  return baseAgent(id, name, { description });
}

function mountRoot(
  plugin: unknown,
  mountHost: (el: HTMLElement) => void = vi.fn(),
  callbacks: unknown = makeCallbacks(),
) {
  const pinia = createPinia();
  setActivePinia(pinia);
  return render(TeamChatRoot, {
    global: {
      plugins: [pinia],
      provide: {
        [PLUGIN_KEY as symbol]: plugin,
        [CALLBACKS_KEY as symbol]: callbacks,
        [CONTENT_HOST_KEY as symbol]: mountHost,
      },
    },
  });
}

describe('TeamChatRoot (Phase 4a: read-only roster mount)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
  });

  it('provides the content host exactly once with its element', () => {
    const mountHost = vi.fn();
    mountRoot(makePlugin([]), mountHost);
    expect(mountHost).toHaveBeenCalledTimes(1);
    expect(mountHost.mock.calls[0][0]).toBeInstanceOf(HTMLElement);
    expect((mountHost.mock.calls[0][0] as HTMLElement).classList.contains(
      'specorator-team-chat-content-host',
    )).toBe(true);
    // Layout fix (Round-25): the DM host must also carry the sidebar's shared
    // tab-content-container class (flex column + overflow:hidden + min-height:0)
    // so a tall transcript scrolls INSIDE the host instead of pushing the
    // composer past the visible pane.
    expect((mountHost.mock.calls[0][0] as HTMLElement).classList.contains(
      'specorator-tab-content-container',
    )).toBe(true);
  });

  it('renders roster rows (name + description) from the roster store, read-only', async () => {
    const plugin = makePlugin([
      agent('roster:a', 'Ada', 'router'),
      agent('roster:b', 'Bruno', 'verifier'),
    ]);
    mountRoot(plugin);

    // Scoped to the listbox: agent names also appear in the empty pane's quick-picks,
    // so an unscoped text query would match two nodes.
    const list = within(await awaitRoster());
    expect(list.getByText('Ada')).toBeTruthy();
    expect(list.getByText('Bruno')).toBeTruthy();
    // Description is the subtitle fallback for an agent with no DM thread yet.
    expect(list.getByText('router')).toBeTruthy();

    // Read-only: rendering a roster row must not open/create any DM conversation.
    const p = plugin as unknown as { createConversation: ReturnType<typeof vi.fn>; openConversation: ReturnType<typeof vi.fn> };
    expect(p.createConversation).not.toHaveBeenCalled();
    expect(p.openConversation).not.toHaveBeenCalled();
  });

  it('shows the roster empty state when there are no agents', async () => {
    mountRoot(makePlugin([]));
    // teamChat.rosterEmpty
    expect(await screen.findByText('No agents in your team yet.')).toBeTruthy();
  });

  it('shows the right-pane empty state while no agent is selected', () => {
    mountRoot(makePlugin([agent('roster:a', 'Ada', 'router')]));
    // teamChat.emptyState
    expect(screen.getByText('Select an agent to start chatting.')).toBeTruthy();
  });
});
