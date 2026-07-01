/**
 * @jest-environment jsdom
 */
import '../../../../../../tests/setup/obsidianDom';

import type { RosterAgent } from '../../../../../../src/features/agents/roster/rosterTypes';
import { AgentRosterView, VIEW_TYPE_AGENT_ROSTER } from '../../../../../../src/features/agents/roster/view/AgentRosterView';

// ── Module mocks ─────────────────────────────────────────────────────────────

const detailRenderMock = jest.fn().mockResolvedValue(undefined);
jest.mock('../../../../../../src/features/agents/roster/view/AgentDetailEditor', () => ({
  AgentDetailEditor: jest.fn().mockImplementation(() => ({ render: detailRenderMock })),
}));

// renderAgentAvatar uses canvas/setIcon — stub it out entirely
jest.mock('../../../../../../src/features/agents/agentAvatar', () => ({
  renderAgentAvatar: jest.fn(),
}));

// personaRegistry is called by renderCard via rosterAgentToPersona
jest.mock('../../../../../../src/features/agents/personaRegistry', () => ({
  rosterAgentToPersona: jest.fn().mockReturnValue({ name: 'T', color: undefined, initials: undefined }),
}));

// libraryNav needs openLeafView on the host
jest.mock('../../../../../../src/shared/libraryNav', () => ({
  renderLibraryNav: jest.fn(),
}));

// ProviderRegistry is called when startChatWithAgent resolves the provider;
// stub the methods used in AgentRosterView
jest.mock('../../../../../../src/core/providers/ProviderRegistry', () => ({
  ProviderRegistry: {
    isEnabled: jest.fn().mockReturnValue(true),
    resolveSettingsProviderId: jest.fn().mockReturnValue('claude'),
    getEnabledProviderIds: jest.fn().mockReturnValue(['claude']),
  },
}));

// asSettingsBag is a simple cast; return the input unchanged
jest.mock('../../../../../../src/core/types/settings', () => ({
  asSettingsBag: (s: unknown) => s,
}));

// resolveAgentProvider — return a stable provider id
jest.mock('../../../../../../src/features/agents/roster/resolveAgentProvider', () => ({
  resolveAgentProvider: jest.fn().mockReturnValue('claude'),
  agentPreferredProviderId: jest.fn().mockReturnValue('claude'),
}));

// confirm modal — default decline so deletions don't cascade
const confirmMock = jest.fn().mockResolvedValue(false);
jest.mock('../../../../../../src/shared/modals/ConfirmModal', () => ({
  confirm: (...args: unknown[]) => confirmMock(...args),
}));

// installPresetAgents — stub so the install button doesn't throw
jest.mock('../../../../../../src/features/agents/roster/presetAgents', () => ({
  installPresetAgents: jest.fn().mockResolvedValue({ installed: [], skipped: [] }),
}));

// ── Fixtures ─────────────────────────────────────────────────────────────────

function makeAgent(overrides: Partial<RosterAgent> = {}): RosterAgent {
  return {
    id: 'roster:agent-a',
    name: 'Agent Alpha',
    description: 'Does alpha things.',
    prompt: 'You are Alpha.',
    disallowedTools: [],
    skills: [],
    roles: ['worker'],
    tags: ['fast', 'reliable'],
    createdAt: 1000,
    updatedAt: 2000,
    ...overrides,
  };
}

const AGENT_A = makeAgent();
const AGENT_B = makeAgent({
  id: 'roster:agent-b',
  name: 'Agent Beta',
  description: 'Does beta things.',
  roles: [],
  tags: [],
  skills: [],
});

function makePlugin(agents: RosterAgent[]) {
  return {
    app: {},
    settings: {},
    logger: { scope: () => ({ error: jest.fn(), warn: jest.fn() }) },
    events: { emit: jest.fn() },
    agentRosterStore: {
      list: jest.fn().mockResolvedValue(agents),
      save: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
    },
    vaultSkillAggregator: { listAll: jest.fn().mockResolvedValue([]) },
    createConversation: jest.fn().mockResolvedValue({ id: 'conv-1' }),
    openConversation: jest.fn().mockResolvedValue(undefined),
    removeRosterAgentProjection: jest.fn().mockResolvedValue(undefined),
    syncRosterAgentsToProviders: jest.fn().mockResolvedValue({ written: 0, failed: [], providers: [] }),
    quickActionLastUsedStore: null,
  } as any;
}

function makeView(plugin: any): { view: AgentRosterView; contentEl: HTMLElement } {
  const view = new AgentRosterView({} as any, plugin);
  const contentEl = document.createElement('div');
  (view as unknown as { contentEl: HTMLElement }).contentEl = contentEl;
  return { view, contentEl };
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  detailRenderMock.mockClear();
  confirmMock.mockReset();
  confirmMock.mockResolvedValue(false);
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AgentRosterView', () => {
  it('exposes the stable view type and metadata', () => {
    const { view } = makeView(makePlugin([]));
    expect(VIEW_TYPE_AGENT_ROSTER).toBe('specorator-agent-roster');
    expect(view.getViewType()).toBe(VIEW_TYPE_AGENT_ROSTER);
    expect(view.getIcon()).toBe('users');
    expect(view.getDisplayText()).toBeTruthy();
  });

  it('renders one card per agent', async () => {
    const { view, contentEl } = makeView(makePlugin([AGENT_A, AGENT_B]));
    await view.onOpen();
    await flush();
    const cards = contentEl.querySelectorAll('.specorator-library-card');
    expect(cards.length).toBe(2);
  });

  it('card name is a plain span — NOT a standalone button', async () => {
    const { view, contentEl } = makeView(makePlugin([AGENT_A]));
    await view.onOpen();
    await flush();
    const nameRow = contentEl.querySelector('.specorator-library-card-name');
    expect(nameRow).not.toBeNull();
    const nameSpan = nameRow!.querySelector('span');
    expect(nameSpan).not.toBeNull();
    expect(nameSpan!.textContent).toBe('Agent Alpha');
    expect(nameRow!.querySelector('button')).toBeNull();
  });

  it('card has role=button with tabindex=0', async () => {
    const { view, contentEl } = makeView(makePlugin([AGENT_A]));
    await view.onOpen();
    await flush();
    const card = contentEl.querySelector('.specorator-library-card');
    expect(card).not.toBeNull();
    expect(card!.getAttribute('role')).toBe('button');
    expect(card!.getAttribute('tabindex')).toBe('0');
  });

  it('renders role chips and freeform tag chips for an agent with both', async () => {
    const { view, contentEl } = makeView(makePlugin([AGENT_A]));
    await view.onOpen();
    await flush();
    const caps = contentEl.querySelector('.specorator-library-card-caps');
    expect(caps).not.toBeNull();
    const roleChips = Array.from(caps!.querySelectorAll('.specorator-roster-chip-role'));
    expect(roleChips.length).toBeGreaterThan(0);
    const tagChips = Array.from(caps!.querySelectorAll('.specorator-library-chip')).map((c) => c.textContent);
    expect(tagChips).toContain('fast');
    expect(tagChips).toContain('reliable');
  });

  it('an agent with no roles, no tags, and no skills has no empty caps div', async () => {
    const { view, contentEl } = makeView(makePlugin([AGENT_B]));
    await view.onOpen();
    await flush();
    const allCaps = contentEl.querySelectorAll('.specorator-library-card-caps');
    for (const c of allCaps) {
      expect(c.childElementCount).toBeGreaterThan(0);
    }
  });

  it('renders Start chat (mod-cta), Duplicate icon, and Delete buttons on each card', async () => {
    const { view, contentEl } = makeView(makePlugin([AGENT_A]));
    await view.onOpen();
    await flush();
    const actions = contentEl.querySelector('.specorator-library-card-actions');
    expect(actions).not.toBeNull();

    const startBtn = actions!.querySelector('.mod-cta');
    expect(startBtn).not.toBeNull();

    const iconBtn = actions!.querySelector('.specorator-library-card-icon');
    expect(iconBtn).not.toBeNull();

    const deleteBtn = actions!.querySelector('.specorator-library-card-delete');
    expect(deleteBtn).not.toBeNull();
  });

  it('cloning an agent appends " copy" to the display name', async () => {
    const plugin = makePlugin([AGENT_A]);
    const { view } = makeView(plugin);
    await (view as any).cloneAgent(AGENT_A);
    expect(plugin.agentRosterStore.save).toHaveBeenCalledTimes(1);
    expect(plugin.agentRosterStore.save.mock.calls[0][0]).toEqual(
      expect.objectContaining({ name: 'Agent Alpha copy' }),
    );
  });

  it('cloning again when "X copy" already exists yields a unique "X copy 2" name', async () => {
    // The roster/search/chat chrome shows agent.name, so a second clone must not
    // reuse "Agent Alpha copy" — it probes existing names and bumps the suffix.
    const existingCopy = makeAgent({ id: 'roster:agent-a-copy', name: 'Agent Alpha copy' });
    const plugin = makePlugin([AGENT_A, existingCopy]);
    const { view } = makeView(plugin);
    await (view as any).cloneAgent(AGENT_A);
    expect(plugin.agentRosterStore.save.mock.calls[0][0]).toEqual(
      expect.objectContaining({ name: 'Agent Alpha copy 2' }),
    );
  });

  it('clicking the card opens the detail editor (AgentDetailEditor.render fires)', async () => {
    const { view, contentEl } = makeView(makePlugin([AGENT_A]));
    await view.onOpen();
    await flush();
    const card = contentEl.querySelector('.specorator-library-card') as HTMLElement;
    card.click();
    await flush();
    expect(detailRenderMock).toHaveBeenCalledTimes(1);
    expect(detailRenderMock.mock.calls[0][1]).toEqual(expect.objectContaining({ id: AGENT_A.id }));
  });

  it('toolbar search input renders', async () => {
    const { view, contentEl } = makeView(makePlugin([AGENT_A]));
    await view.onOpen();
    await flush();
    const searchInput = contentEl.querySelector('.specorator-library-search');
    expect(searchInput).not.toBeNull();
  });

  it('renders the empty state when there are no agents', async () => {
    const { view, contentEl } = makeView(makePlugin([]));
    await view.onOpen();
    await flush();
    const empty = contentEl.querySelector('.specorator-library-empty');
    expect(empty).not.toBeNull();
    expect(contentEl.querySelectorAll('.specorator-library-card').length).toBe(0);
  });

  it('New agent and Install starter and Sync provider buttons are in the header', async () => {
    const { view, contentEl } = makeView(makePlugin([]));
    await view.onOpen();
    await flush();
    const headerBtns = Array.from(
      contentEl.querySelectorAll('.specorator-library-header-actions button'),
    );
    expect(headerBtns.some((b) => b.classList.contains('mod-cta'))).toBe(true);
    expect(headerBtns.length).toBeGreaterThanOrEqual(3);
  });

  it('skill count chip only appears when agent.skills is non-empty', async () => {
    const withSkills = makeAgent({ skills: ['tdd', 'review'], tags: [] });
    const { view, contentEl } = makeView(makePlugin([withSkills]));
    await view.onOpen();
    await flush();
    const caps = contentEl.querySelector('.specorator-library-card-caps');
    expect(caps).not.toBeNull();
    const skillChip = Array.from(caps!.querySelectorAll('.specorator-roster-chip'))
      .find((c) => !c.classList.contains('specorator-roster-chip-role'));
    expect(skillChip).not.toBeNull();
  });
});
