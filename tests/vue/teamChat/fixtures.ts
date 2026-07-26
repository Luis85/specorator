import { findByRole, render, screen, within } from '@testing-library/vue';
import { createPinia, setActivePinia } from 'pinia';
import { vi } from 'vitest';

import type { RosterAgent } from '@/features/agents/roster/rosterTypes';
import type { TeamChatThreadMeta } from '@/features/teamChat/teamChatThreadMeta';
import { CALLBACKS_KEY, CONTENT_HOST_KEY, PLUGIN_KEY } from '@/features/teamChat/ui/vue/keys';
import { DEFAULT_RAIL_WIDTH } from '@/features/teamChat/ui/vue/stores/teamChatStore';
import type { TeamChatCallbacks } from '@/features/teamChat/ui/vue/teamChatCallbacks';
import TeamChatRoot from '@/features/teamChat/ui/vue/TeamChatRoot.vue';

/**
 * Shared Team Chat island fixtures. Consolidated here because the callbacks contract now
 * carries eight members: three test files each keeping their own partial literal meant
 * every contract addition broke them all with a `not a function` at mount, which says
 * nothing about the behavior under test.
 */

export function agent(id: string, name: string, overrides: Partial<RosterAgent> = {}): RosterAgent {
  return {
    id,
    name,
    description: 'desc',
    prompt: '',
    disallowedTools: [],
    skills: [],
    roles: ['worker'],
    createdAt: 1,
    updatedAt: 2,
    ...overrides,
  };
}

/** A plugin fake whose DM-open paths are spies: if merely RENDERING the roster ever
 *  wired an interaction, one of these would fire (asserted by the mount tests). */
export function makePlugin(agents: RosterAgent[]) {
  return {
    agentRosterStore: { list: vi.fn().mockResolvedValue(agents) },
    events: { on: vi.fn(() => vi.fn()) },
    logger: { scope: () => ({ error: vi.fn() }) },
    createConversation: vi.fn(),
    openConversation: vi.fn(),
  } as never;
}

/** Every callback stubbed, so a test opts in only to the ones it asserts. */
export function makeCallbacks(): TeamChatCallbacks & Record<string, ReturnType<typeof vi.fn>> {
  return {
    subscribe: vi.fn(() => vi.fn()),
    onSelectAgent: vi.fn(),
    onOpenEditedFile: vi.fn(),
    onEditAgent: vi.fn(),
    onCloseDm: vi.fn(),
    onFillComposer: vi.fn(),
    getRailGeometry: vi.fn(() => ({ collapsed: false, width: DEFAULT_RAIL_WIDTH })),
    onRailGeometryChange: vi.fn(),
  } as never;
}

export function thread(updatedAt: number, preview = ''): TeamChatThreadMeta {
  return { conversationId: `conv-${updatedAt}`, preview, updatedAt };
}

/**
 * The roster ROW for an agent, scoped to the listbox.
 *
 * Scoping is required, not stylistic: an agent's name now also appears in the empty pane's
 * quick-picks, so an unscoped `getByText(name)` matches two nodes and throws. Queries that
 * mean "the roster row" have to say so.
 */
export async function rosterRow(name: string): Promise<HTMLElement> {
  const list = await screen.findByRole('listbox');
  const row = within(list).getByText(name).closest('.specorator-team-roster-row');
  if (!row) throw new Error(`no roster row for ${name}`);
  return row as HTMLElement;
}

/** Waits for the roster list to render at all (the async `rosterStore.load`). */
export function awaitRoster(): Promise<HTMLElement> {
  return screen.findByRole('listbox');
}

export { findByRole, within };

export function mountRoot(plugin: unknown, callbacks: unknown) {
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
