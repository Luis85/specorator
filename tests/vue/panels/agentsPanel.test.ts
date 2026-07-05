import { fireEvent, render, screen, waitFor, within } from '@testing-library/vue';
import { Notice } from 'obsidian';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick, ref } from 'vue';

import { PLUGIN_KEY, TAB_GUARD_KEY } from '@/features/library/vue/libraryKeys';
import AgentsPanel from '@/features/library/vue/panels/AgentsPanel.vue';
import { useRosterStore } from '@/features/library/vue/stores/rosterStore';

// The imperative detail editor renders into a Vue-owned host div; stub it so
// panel tests assert the handoff, not the editor internals. vi.hoisted is
// REQUIRED: vi.mock factories are hoisted above imports, so a plain top-level
// const would still be in the temporal dead zone when the factory runs.
const { renderSpy, isDirtySpy } = vi.hoisted(() => ({
  renderSpy: vi.fn().mockResolvedValue(undefined),
  isDirtySpy: vi.fn().mockReturnValue(false),
}));
vi.mock('@/features/agents/roster/view/AgentDetailEditor', () => ({
  // Function expression: tinyspy constructs the implementation with `new`,
  // and arrows are not constructible.
  AgentDetailEditor: vi.fn(function () {
    return { render: renderSpy, isDirty: isDirtySpy };
  }),
}));
vi.mock('@/features/agents/agentAvatar', () => ({ renderAgentAvatar: vi.fn() }));
vi.mock('@/shared/modals/ConfirmModal', () => ({
  confirm: vi.fn().mockResolvedValue(true),
  confirmDelete: vi.fn(),
}));
vi.mock('@/features/agents/roster/presetAgents', () => ({
  installPresetAgents: vi.fn().mockResolvedValue({ installed: ['a'], skipped: [] }),
}));
vi.mock('@/core/providers/ProviderRegistry', () => ({
  ProviderRegistry: {
    isEnabled: vi.fn().mockReturnValue(true),
    resolveSettingsProviderId: vi.fn().mockReturnValue('claude'),
    getChatUIConfig: vi.fn().mockReturnValue({
      getModelOptions: vi.fn().mockReturnValue([{ value: 'model-1', label: 'Model One' }]),
    }),
  },
}));
import { installPresetAgents } from '@/features/agents/roster/presetAgents';
import { AgentDetailEditor } from '@/features/agents/roster/view/AgentDetailEditor';
import { confirm } from '@/shared/modals/ConfirmModal';

const agent = {
  id: 'roster:a', name: 'Alice', description: 'router', prompt: '', disallowedTools: [],
  skills: [], roles: ['worker'] as Array<'worker' | 'verifier'>, tags: ['t'],
  createdAt: 1, updatedAt: 2,
};

function makePlugin() {
  return {
    agentRosterStore: { list: vi.fn().mockResolvedValue([agent]) },
    settings: {},
    logger: { scope: () => ({ error: vi.fn() }) },
  } as never;
}

describe('AgentsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isDirtySpy.mockReturnValue(false);
    setActivePinia(createPinia());
  });

  it('renders agent cards with description and role + user tags', async () => {
    const plugin = makePlugin();
    useRosterStore().init(plugin);
    render(AgentsPanel, { global: { provide: { [PLUGIN_KEY as symbol]: plugin } } });
    expect(await screen.findByText('Alice')).toBeTruthy();
    expect(screen.getByText('router')).toBeTruthy();
    // Role labels + tags also appear as toolbar filter chips — scope to the card.
    expect(within(screen.getByRole('button', { name: 'Alice' })).getByText('t')).toBeTruthy();
  });

  it('cloning opens the detail editor on the returned clone (legacy parity)', async () => {
    const plugin = makePlugin();
    const store = useRosterStore();
    store.init(plugin);
    vi.spyOn(store, 'clone').mockResolvedValue({ ...agent, id: 'roster:a-copy', name: 'Alice copy' } as never);
    render(AgentsPanel, { global: { provide: { [PLUGIN_KEY as symbol]: plugin } } });
    await screen.findByText('Alice');
    await fireEvent.click(screen.getByRole('button', { name: 'Duplicate' }));
    await waitFor(() => expect(renderSpy).toHaveBeenCalledWith(
      expect.any(HTMLElement), expect.objectContaining({ id: 'roster:a-copy' }), undefined,
    ));
  });

  it('activating a card hands off to the imperative AgentDetailEditor', async () => {
    const plugin = makePlugin();
    useRosterStore().init(plugin);
    render(AgentsPanel, { global: { provide: { [PLUGIN_KEY as symbol]: plugin } } });
    await screen.findByText('Alice');
    await fireEvent.click(screen.getByRole('button', { name: 'Alice' }));
    expect(renderSpy).toHaveBeenCalledWith(expect.any(HTMLElement), expect.objectContaining({ id: 'roster:a' }), undefined);
  });
});

/** Mutation flows need the full plugin surface the panel's actions touch. */
function setupMutable(agents: unknown[], opts: { list?: ReturnType<typeof vi.fn> } = {}) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const errorLog = vi.fn();
  const tabGuard = ref<(() => Promise<boolean>) | null>(null);
  const plugin = {
    app: {},
    settings: {},
    logger: { scope: () => ({ error: errorLog, warn: vi.fn() }) },
    agentRosterStore: {
      list: opts.list ?? vi.fn().mockResolvedValue(agents),
      save: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    },
    removeRosterAgentProjection: vi.fn().mockResolvedValue(undefined),
    syncRosterAgentsToProviders: vi.fn().mockResolvedValue({ written: 2, failed: [], providers: ['claude'] }),
    createConversation: vi.fn().mockResolvedValue({ id: 'conv-1' }),
    openConversation: vi.fn().mockResolvedValue(undefined),
  } as never;
  const store = useRosterStore();
  store.init(plugin);
  const utils = render(AgentsPanel, {
    global: {
      plugins: [pinia],
      provide: { [PLUGIN_KEY as symbol]: plugin, [TAB_GUARD_KEY as symbol]: tabGuard },
    },
  });
  const p = plugin as {
    agentRosterStore: { list: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> };
    removeRosterAgentProjection: ReturnType<typeof vi.fn>;
    syncRosterAgentsToProviders: ReturnType<typeof vi.fn>;
    createConversation: ReturnType<typeof vi.fn>;
    openConversation: ReturnType<typeof vi.fn>;
    app: unknown;
  };
  return { store, plugin, p, tabGuard, errorLog, ...utils };
}

/** Callbacks the panel handed to the (mocked) detail editor's constructor. */
function editorCallbacks(callIndex = 0) {
  return vi.mocked(AgentDetailEditor).mock.calls[callIndex][1] as {
    onBack: () => void;
    onStartChat: (a: typeof agent) => void;
    onDeleted: (a: typeof agent) => void;
    onSaved?: (a: typeof agent) => void;
  };
}

describe('AgentsPanel mutation flows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isDirtySpy.mockReturnValue(false);
  });

  it('shows the loading indicator only on the first/empty load, never on a background mutation reload', async () => {
    const { store } = setupMutable([agent]);
    await screen.findByText('Alice');
    // A mutation reload flips loading true while the rows are still present —
    // the indicator must NOT flash over the existing cards.
    store.loading = true;
    await nextTick();
    expect(document.querySelector('.specorator-vue-panel-loading')).toBeNull();
    // First/empty load (no rows yet): the indicator DOES show.
    store.agents = [];
    await nextTick();
    expect(document.querySelector('.specorator-vue-panel-loading')).toBeTruthy();
  });

  it('renders the model chip from the provider model options', async () => {
    const withModel = { ...agent, modelSelection: { modelId: 'model-1', providerId: 'claude' } };
    setupMutable([withModel]);
    const card = await screen.findByRole('button', { name: 'Alice' });
    expect(within(card).getByText('Model One')).toBeTruthy();
  });

  it('Start chat resolves the provider and opens the conversation in a new tab', async () => {
    const { p } = setupMutable([agent]);
    await screen.findByText('Alice');
    await fireEvent.click(screen.getByRole('button', { name: 'Start chat' }));
    await waitFor(() => expect(p.createConversation).toHaveBeenCalledWith({
      providerId: 'claude',
      boundAgentId: 'roster:a',
    }));
    expect(p.openConversation).toHaveBeenCalledWith('conv-1', { requireNewTab: true });
  });

  it('Delete confirms, removes through the store (projection cleared), and reloads', async () => {
    const { p } = setupMutable([agent]);
    await screen.findByText('Alice');
    await fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(p.agentRosterStore.delete).toHaveBeenCalledWith('roster:a'));
    expect(confirm).toHaveBeenCalled();
    expect(p.removeRosterAgentProjection).toHaveBeenCalled();
    await waitFor(() => expect(Notice).toHaveBeenCalled());
    // Multi-leaf staleness contract: remove() must reload the shared store.
    await waitFor(() => expect(p.agentRosterStore.list.mock.calls.length).toBeGreaterThan(1));
  });

  it('Delete keeps the agent when the confirm is declined', async () => {
    vi.mocked(confirm).mockResolvedValueOnce(false);
    const { p } = setupMutable([agent]);
    await screen.findByText('Alice');
    await fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(confirm).toHaveBeenCalled());
    expect(p.agentRosterStore.delete).not.toHaveBeenCalled();
  });

  it('New Agent opens the editor on an in-memory draft (NOT pre-saved)', async () => {
    const { plugin } = setupMutable([agent]);
    await screen.findByText('Alice');
    await fireEvent.click(screen.getByRole('button', { name: 'New Agent' }));
    await waitFor(() => expect(renderSpy).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining({ name: 'New Agent' }),
      { isNew: true },
    ));
    const p = plugin as { agentRosterStore: { save: ReturnType<typeof vi.fn> } };
    expect(p.agentRosterStore.save).not.toHaveBeenCalled();
  });

  it('Install starter agents runs the preset installer against the plugin store, then reloads', async () => {
    const { plugin, p } = setupMutable([agent]);
    await screen.findByText('Alice');
    await fireEvent.click(screen.getByRole('button', { name: 'Install starter agents' }));
    await waitFor(() => expect(installPresetAgents).toHaveBeenCalledWith(
      (plugin as { agentRosterStore: unknown }).agentRosterStore,
    ));
    expect(Notice).toHaveBeenCalled();
    await waitFor(() => expect(p.agentRosterStore.list.mock.calls.length).toBeGreaterThan(1));
  });

  it('Sync to providers routes through the plugin service and notices the result', async () => {
    const { p } = setupMutable([agent]);
    await screen.findByText('Alice');
    await fireEvent.click(screen.getByRole('button', { name: 'Sync to providers' }));
    await waitFor(() => expect(p.syncRosterAgentsToProviders).toHaveBeenCalled());
    expect(Notice).toHaveBeenCalledWith('Synced agents to claude (2 files).');
  });

  it('empty state CTA starts the new-agent flow', async () => {
    setupMutable([]);
    // DOM cycles empty → loading → empty during the mount-time load(); a
    // macrotask tick lets it settle before we grab the CTA.
    await new Promise((r) => setTimeout(r));
    const cta = document.querySelector('.specorator-vue-empty-action');
    expect(cta).toBeTruthy();
    await fireEvent.click(cta as Element);
    await waitFor(() => expect(renderSpy).toHaveBeenCalledWith(
      expect.any(HTMLElement), expect.objectContaining({ name: 'New Agent' }), { isNew: true },
    ));
  });

  it('registers a tab guard while the detail editor is open and clears it on close', async () => {
    const { tabGuard, p } = setupMutable([agent]);
    await screen.findByText('Alice');
    expect(tabGuard.value).toBeNull();
    await fireEvent.click(screen.getByRole('button', { name: 'Alice' }));
    await waitFor(() => expect(tabGuard.value).toBeTypeOf('function'));
    const listCalls = p.agentRosterStore.list.mock.calls.length;
    // Clean editor: the guard allows the switch and closes the detail page.
    await expect(tabGuard.value!()).resolves.toBe(true);
    expect(tabGuard.value).toBeNull();
    expect(confirm).not.toHaveBeenCalled();
    // closeDetail reloads so the list reflects any editor saves.
    expect(p.agentRosterStore.list.mock.calls.length).toBeGreaterThan(listCalls);
  });

  it('tab guard on a dirty editor prompts with the SAME strings as the editor Back path', async () => {
    const { tabGuard, plugin } = setupMutable([agent]);
    await screen.findByText('Alice');
    await fireEvent.click(screen.getByRole('button', { name: 'Alice' }));
    await waitFor(() => expect(tabGuard.value).toBeTypeOf('function'));
    isDirtySpy.mockReturnValue(true);
    vi.mocked(confirm).mockResolvedValueOnce(false);
    await expect(tabGuard.value!()).resolves.toBe(false);
    // Same strings as AgentDetailEditor.handleBack (AgentDetailEditor.ts:74).
    expect(confirm).toHaveBeenCalledWith(
      (plugin as { app: unknown }).app, 'Discard unsaved changes?', 'Discard',
    );
    // Declined: the guard stays registered and the detail page stays open.
    expect(tabGuard.value).toBeTypeOf('function');
    vi.mocked(confirm).mockResolvedValueOnce(true);
    await expect(tabGuard.value!()).resolves.toBe(true);
    expect(tabGuard.value).toBeNull();
  });

  it('clears the tab guard when the panel unmounts', async () => {
    const { tabGuard, unmount } = setupMutable([agent]);
    await screen.findByText('Alice');
    await fireEvent.click(screen.getByRole('button', { name: 'Alice' }));
    await waitFor(() => expect(tabGuard.value).toBeTypeOf('function'));
    unmount();
    expect(tabGuard.value).toBeNull();
  });

  it('arms the tab guard before editor.render resolves (slow skill catalog)', async () => {
    // render() shows editable fields before its skill-catalog await resolves,
    // so the guard must be armed as soon as the render starts — otherwise a
    // slow vault read leaves a window where a tab switch discards edits.
    let resolveRender!: () => void;
    renderSpy.mockReturnValueOnce(new Promise<void>((r) => { resolveRender = r; }));
    const { tabGuard } = setupMutable([agent]);
    await screen.findByText('Alice');
    await fireEvent.click(screen.getByRole('button', { name: 'Alice' }));
    await waitFor(() => expect(renderSpy).toHaveBeenCalled());
    expect(tabGuard.value).toBeTypeOf('function');
    resolveRender();
  });

  it('does not re-arm the guard when render resolves after unmount', async () => {
    // The tabGuard ref outlives the panel (it belongs to the view). A render
    // continuation landing after unmount must not leave a stale guard armed.
    let resolveRender!: () => void;
    renderSpy.mockReturnValueOnce(new Promise<void>((r) => { resolveRender = r; }));
    const { tabGuard, unmount } = setupMutable([agent]);
    await screen.findByText('Alice');
    await fireEvent.click(screen.getByRole('button', { name: 'Alice' }));
    await waitFor(() => expect(renderSpy).toHaveBeenCalled());
    unmount();
    expect(tabGuard.value).toBeNull();
    resolveRender();
    await Promise.resolve();
    await Promise.resolve();
    expect(tabGuard.value).toBeNull();
  });

  it('editor onSaved reloads the shared store so other leaves re-derive', async () => {
    const { p } = setupMutable([agent]);
    await screen.findByText('Alice');
    await fireEvent.click(screen.getByRole('button', { name: 'Alice' }));
    await waitFor(() => expect(renderSpy).toHaveBeenCalled());
    const listCalls = p.agentRosterStore.list.mock.calls.length;
    editorCallbacks().onSaved?.(agent);
    await waitFor(() => expect(p.agentRosterStore.list.mock.calls.length).toBeGreaterThan(listCalls));
  });

  it('editor onBack closes the detail host and reloads the list', async () => {
    const { p, container } = setupMutable([agent]);
    await screen.findByText('Alice');
    await fireEvent.click(screen.getByRole('button', { name: 'Alice' }));
    await waitFor(() => expect(document.querySelector('.specorator-roster-detail')).toBeTruthy());
    // Structural contract for the sticky-footer fix in vue/library-host.css:
    // `.specorator-library-vue-root:has(> .specorator-roster-detail)` requires
    // the detail host to be a DIRECT child of the mount root (AgentsPanel and
    // LibraryRoot are both multi-root fragments — no wrapper in between).
    expect(document.querySelector('.specorator-roster-detail')?.parentElement).toBe(container);
    const listCalls = p.agentRosterStore.list.mock.calls.length;
    editorCallbacks().onBack();
    await waitFor(() => expect(document.querySelector('.specorator-roster-detail')).toBeNull());
    expect(p.agentRosterStore.list.mock.calls.length).toBeGreaterThan(listCalls);
  });

  it('editor onDeleted routes through the shared confirmedDelete and closes the detail page', async () => {
    const { p } = setupMutable([agent]);
    await screen.findByText('Alice');
    await fireEvent.click(screen.getByRole('button', { name: 'Alice' }));
    await waitFor(() => expect(renderSpy).toHaveBeenCalled());
    editorCallbacks().onDeleted(agent);
    await waitFor(() => expect(p.agentRosterStore.delete).toHaveBeenCalledWith('roster:a'));
    expect(confirm).toHaveBeenCalled();
    await waitFor(() => expect(document.querySelector('.specorator-roster-detail')).toBeNull());
  });

  it('editor onStartChat opens a bound conversation in a new tab', async () => {
    const { p } = setupMutable([agent]);
    await screen.findByText('Alice');
    await fireEvent.click(screen.getByRole('button', { name: 'Alice' }));
    await waitFor(() => expect(renderSpy).toHaveBeenCalled());
    editorCallbacks().onStartChat(agent);
    await waitFor(() => expect(p.createConversation).toHaveBeenCalledWith({
      providerId: 'claude',
      boundAgentId: 'roster:a',
    }));
    expect(p.openConversation).toHaveBeenCalledWith('conv-1', { requireNewTab: true });
  });

  it('query filters cards (incl. no-matches text)', async () => {
    const agentB = { ...agent, id: 'roster:b', name: 'Bob', description: 'other' };
    setupMutable([agent, agentB]);
    await screen.findByText('Alice');
    await fireEvent.update(screen.getByRole('searchbox'), 'router');
    expect(screen.getByText('Alice')).toBeTruthy();
    expect(screen.queryByText('Bob')).toBeNull();
    await fireEvent.update(screen.getByRole('searchbox'), 'zzz');
    expect(screen.getByText('No items match your search.')).toBeTruthy();
  });

  it('surfaces a load failure via the error logger (withErrorNotice path)', async () => {
    const { errorLog } = setupMutable([], { list: vi.fn().mockRejectedValue(new Error('boom')) });
    await waitFor(() => expect(errorLog).toHaveBeenCalled());
  });

  it('Duplicate marks the row busy (all actions disabled + aria-busy), fires ONE clone on double-click, re-enables on resolve', async () => {
    const { store } = setupMutable([agent]);
    await screen.findByText('Alice');
    let resolveClone!: (a: typeof agent) => void;
    const cloneSpy = vi.spyOn(store, 'clone')
      .mockReturnValue(new Promise((r) => { resolveClone = r; }) as never);
    const dup = screen.getByRole('button', { name: 'Duplicate' }) as HTMLButtonElement;
    const del = screen.getByRole('button', { name: 'Delete' }) as HTMLButtonElement;
    const start = screen.getByRole('button', { name: 'Start chat' }) as HTMLButtonElement;
    await fireEvent.click(dup);
    await waitFor(() => expect(dup.disabled).toBe(true));
    // One busy bit per row gates ALL of that row's actions.
    expect(del.disabled).toBe(true);
    expect(start.disabled).toBe(true);
    expect(dup.getAttribute('aria-busy')).toBe('true');
    const actions = document.querySelector('.specorator-vue-card-actions');
    expect(actions?.classList.contains('is-busy')).toBe(true);
    // The double-clone bug: a second click during the vault write must not
    // fire a second clone.
    await fireEvent.click(dup);
    expect(cloneSpy).toHaveBeenCalledTimes(1);
    resolveClone({ ...agent, id: 'roster:a-copy', name: 'Alice copy' });
    await waitFor(() => expect(dup.disabled).toBe(false));
    expect(actions?.classList.contains('is-busy')).toBe(false);
  });

  it('Start chat shares the row busy gate: single fire, other actions blocked, re-enables on resolve', async () => {
    const { store, p } = setupMutable([agent]);
    await screen.findByText('Alice');
    let resolveCreate!: (v: unknown) => void;
    p.createConversation.mockReturnValue(new Promise((r) => { resolveCreate = r; }));
    const cloneSpy = vi.spyOn(store, 'clone');
    const start = screen.getByRole('button', { name: 'Start chat' }) as HTMLButtonElement;
    const dup = screen.getByRole('button', { name: 'Duplicate' }) as HTMLButtonElement;
    await fireEvent.click(start);
    await waitFor(() => expect(start.disabled).toBe(true));
    expect(start.getAttribute('aria-busy')).toBe('true');
    // Double-click on Start chat: exactly one conversation.
    await fireEvent.click(start);
    expect(p.createConversation).toHaveBeenCalledTimes(1);
    // The busy row blocks its OTHER actions too (no clone-during-start race).
    await fireEvent.click(dup);
    expect(cloneSpy).not.toHaveBeenCalled();
    resolveCreate({ id: 'conv-1' });
    await waitFor(() => expect(start.disabled).toBe(false));
    expect(p.openConversation).toHaveBeenCalledWith('conv-1', { requireNewTab: true });
  });

  // Spec DoD 5: snapshot ONE card (small stable sub-tree), never the whole
  // panel — locale strings are deterministic ('en' in tests), the avatar
  // renderer is mocked, and fixtures carry no timestamps/ids that reach the DOM.
  it('card structure snapshot (small, stable sub-tree)', async () => {
    setupMutable([agent]);
    await screen.findByText('Alice');
    expect(document.querySelector('.specorator-vue-card')).toMatchSnapshot();
  });
});
