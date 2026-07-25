import { fireEvent, render } from '@testing-library/vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { markRaw, reactive } from 'vue';

// Namespace type import: `typeof import(...)` annotations are lint-forbidden.
import type * as SettingsModule from '@/features/onboarding/onboardingSettings';
import type { OnboardingFolderState } from '@/features/onboarding/onboardingSettings';
import { CLOSE_VIEW_KEY, PLUGIN_KEY } from '@/features/onboarding/vue/onboardingKeys';

const hoisted = vi.hoisted(() => ({ store: null as unknown }));
vi.mock('@/features/onboarding/vue/stores/onboardingStore', () => ({
  useOnboardingStore: () => hoisted.store,
}));
vi.mock('@/core/providers/ProviderRegistry', () => ({
  ProviderRegistry: {
    getProviderDisplayName: (id: string) => (id === 'alpha' ? 'Alpha' : id),
    getChatUIConfig: () => ({ getModelOptions: () => [] }),
  },
}));
vi.mock('@/features/onboarding/onboardingSettings', async (importOriginal) => {
  const actual = await importOriginal<typeof SettingsModule>();
  return { ...actual, setDefaultModel: vi.fn(async () => {}) };
});
vi.mock('@/features/marketplace/activateMarketplace', () => ({
  activateMarketplace: vi.fn(async () => {}),
}));
vi.mock('@/features/marketplace/marketplaceNetworkGate', () => ({
  maybeWarnMarketplaceNetwork: vi.fn(async () => {}),
}));

import { activateMarketplace } from '@/features/marketplace/activateMarketplace';
import { maybeWarnMarketplaceNetwork } from '@/features/marketplace/marketplaceNetworkGate';
import { setDefaultModel } from '@/features/onboarding/onboardingSettings';
import DefaultsStep from '@/features/onboarding/vue/components/DefaultsStep.vue';
import FinishStep from '@/features/onboarding/vue/components/FinishStep.vue';
import FoldersStep from '@/features/onboarding/vue/components/FoldersStep.vue';
import MarketplaceStep from '@/features/onboarding/vue/components/MarketplaceStep.vue';
import WorkspaceStep from '@/features/onboarding/vue/components/WorkspaceStep.vue';

/** The setting writers await a save, so a handler's tail runs a microtask later. */
async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function folder(overrides: Partial<OnboardingFolderState> = {}): OnboardingFolderState {
  return { key: 'agentBoardWorkOrderFolder', path: 'Board/tasks', exists: true, ...overrides };
}

function makeStore(overrides: Record<string, unknown> = {}) {
  return reactive({
    folders: [] as OnboardingFolderState[],
    creatingFolders: false,
    folderError: null as string | null,
    enabledProviderIds: [] as string[],
    modelOptions: [] as Array<{ providerId: string; value: string; label: string; group: string }>,
    settingsProviderId: 'alpha',
    setFolder: vi.fn(async () => {}),
    createFolders: vi.fn(async () => {}),
    finish: vi.fn(async () => {}),
    ...overrides,
  });
}

function makePlugin(settings: Record<string, unknown> = {}) {
  return markRaw({
    settings,
    saveSettings: vi.fn(async () => {}),
    activateView: vi.fn(async () => {}),
    getAllViews: vi.fn(() => [{ refreshTabControls: vi.fn() }]),
  });
}

function mount(
  component: unknown,
  store: ReturnType<typeof makeStore>,
  plugin = makePlugin(),
  closeView = vi.fn(),
) {
  hoisted.store = store;
  return {
    plugin,
    closeView,
    ...render(component as never, {
      global: { provide: { [PLUGIN_KEY as symbol]: plugin, [CLOSE_VIEW_KEY as symbol]: closeView } },
    }),
  };
}

beforeEach(() => {
  hoisted.store = null;
  vi.mocked(activateMarketplace).mockClear();
  vi.mocked(maybeWarnMarketplaceNetwork).mockClear();
  vi.mocked(setDefaultModel).mockClear();
});

describe('DefaultsStep', () => {
  it('asks for a provider before offering a default model', () => {
    const { container } = mount(DefaultsStep, makeStore());

    expect(container.querySelector('[data-state="needs-provider"]')).not.toBeNull();
    expect(container.querySelector('[data-field="model"]')).toBeNull();
  });

  it('groups model options by provider once one is enabled', () => {
    const store = makeStore({
      enabledProviderIds: ['alpha'],
      modelOptions: [{ providerId: 'alpha', value: 'm1', label: 'Model One', group: 'Alpha' }],
    });
    const { container } = mount(DefaultsStep, store);

    expect(container.querySelector('optgroup')?.getAttribute('label')).toBe('Alpha');
    expect(container.querySelector('option')?.textContent).toContain('Model One');
  });

  it('commits the chosen model to its owning provider, not just the top level', async () => {
    // Writing `settings.model` alone is reverted by the owning provider's
    // projection when several providers are enabled — see setDefaultModel.
    const store = makeStore({
      enabledProviderIds: ['alpha'],
      modelOptions: [
        { providerId: 'alpha', value: 'm1', label: 'Model One', group: 'Alpha' },
        { providerId: 'alpha', value: 'm2', label: 'Model Two', group: 'Alpha' },
      ],
    });
    const { container, plugin } = mount(DefaultsStep, store, makePlugin({ model: 'm1' }));

    await fireEvent.update(
      container.querySelector('[data-field="model"]')!,
      'alpha\u0000m2',
    );
    await flushMicrotasks();

    expect(setDefaultModel).toHaveBeenCalledWith(plugin, 'm2', 'alpha');
  });

  it('commits a shared model id to the provider whose option was picked', async () => {
    // Two providers advertising the same custom id: the pick must go to the one
    // the user selected, not to whichever `resolveProviderForModel` prefers.
    const store = makeStore({
      enabledProviderIds: ['alpha', 'beta'],
      settingsProviderId: 'alpha',
      modelOptions: [
        { providerId: 'alpha', value: 'shared', label: 'Shared', group: 'Alpha' },
        { providerId: 'beta', value: 'shared', label: 'Shared', group: 'Beta' },
      ],
    });
    const { container, plugin } = mount(DefaultsStep, store, makePlugin({ model: 'shared' }));

    // Both options survive — no dedup-by-value collapsing them into one entry.
    expect(container.querySelectorAll('[data-field="model"] option')).toHaveLength(2);

    await fireEvent.update(
      container.querySelector('[data-field="model"]')!,
      'beta\u0000shared',
    );
    await flushMicrotasks();

    expect(setDefaultModel).toHaveBeenCalledWith(plugin, 'shared', 'beta');
  });

  it('performs exactly one save for a model pick', async () => {
    // `saveSettings` re-runs persistProjectedProviderState for the CURRENT
    // provider, so a second unordered save could stamp the pick onto the
    // outgoing provider's projection.
    const store = makeStore({
      enabledProviderIds: ['alpha'],
      modelOptions: [
        { providerId: 'alpha', value: 'm1', label: 'Model One', group: 'Alpha' },
        { providerId: 'alpha', value: 'm2', label: 'Model Two', group: 'Alpha' },
      ],
    });
    const { container, plugin } = mount(DefaultsStep, store, makePlugin({ model: 'm1' }));

    await fireEvent.update(
      container.querySelector('[data-field="model"]')!,
      'alpha\u0000m2',
    );
    await flushMicrotasks();

    // The only persistence is setDefaultModel's own (mocked here), so the
    // component itself must not have written settings.
    expect(plugin.saveSettings).not.toHaveBeenCalled();
  });

  it('offers only the approval modes a wizard may set — never the bypass mode (SEC-1)', () => {
    const { container } = mount(DefaultsStep, makeStore());

    const values = [...container.querySelectorAll('[data-field="permission-mode"] option')]
      .map((option) => (option as HTMLOptionElement).value);
    expect(values).toEqual(['normal', 'plan']);
  });

  it('persists the auto-title toggle', async () => {
    const { container, plugin } = mount(
      DefaultsStep,
      makeStore(),
      makePlugin({ enableAutoTitleGeneration: true }),
    );

    await fireEvent.click(container.querySelector('[data-field="auto-titles"]')!);

    expect(plugin.settings.enableAutoTitleGeneration).toBe(false);
  });
});

describe('FoldersStep', () => {
  it('badges each folder as existing, pending creation, or unconfigured', () => {
    const store = makeStore({
      folders: [
        folder(),
        folder({ key: 'agentBoardLoopFolder', path: 'Board/loops', exists: false }),
        folder({ key: 'quickActionsFolder', path: '', exists: false }),
      ],
    });
    const { container } = mount(FoldersStep, store);

    const rows = [...container.querySelectorAll('[data-folder]')] as HTMLElement[];
    expect(rows.map((row) => row.dataset.exists)).toEqual(['true', 'false', 'false']);
    expect(rows[2].textContent).toContain('Not configured');
  });

  it('disables Create when nothing is missing', () => {
    const { container } = mount(FoldersStep, makeStore({ folders: [folder()] }));

    expect(container.querySelector<HTMLButtonElement>('[data-action="create-folders"]')!.disabled)
      .toBe(true);
  });

  it('creates the missing folders on click', async () => {
    const store = makeStore({ folders: [folder({ exists: false })] });
    const { container } = mount(FoldersStep, store);

    await fireEvent.click(container.querySelector('[data-action="create-folders"]')!);

    expect(store.createFolders).toHaveBeenCalled();
  });

  it('editing a path writes it through the store', async () => {
    const store = makeStore({ folders: [folder()] });
    const { container } = mount(FoldersStep, store);

    const input = container.querySelector<HTMLInputElement>('[data-folder] input')!;
    input.value = 'Ops/tasks';
    // `change`, not `input`: the field commits on blur/Enter so a half-typed
    // path never lands in settings.
    await fireEvent.change(input);

    expect(store.setFolder).toHaveBeenCalledWith('agentBoardWorkOrderFolder', 'Ops/tasks');
  });

  it('surfaces a creation failure rather than failing silently', () => {
    const { container } = mount(FoldersStep, makeStore({ folderError: 'read-only vault' }));

    expect(container.querySelector('[data-state="error"]')?.textContent).toContain('read-only vault');
  });
});

describe('WorkspaceStep', () => {
  it('persists the chat placement', async () => {
    const { container, plugin } = mount(
      WorkspaceStep,
      makeStore(),
      makePlugin({ chatViewPlacement: 'right-sidebar' }),
    );

    await fireEvent.update(container.querySelector('[data-field="placement"]')!, 'main-tab');

    expect(plugin.settings.chatViewPlacement).toBe('main-tab');
  });

  it('persists the tab cap and refreshes open chat views so the cap takes effect', async () => {
    const view = { refreshTabControls: vi.fn() };
    const plugin = makePlugin({ maxChatTabs: 3 });
    plugin.getAllViews = vi.fn(() => [view]);
    const { container } = mount(WorkspaceStep, makeStore(), plugin);

    await fireEvent.update(container.querySelector('[data-field="max-tabs"]')!, '5');
    await flushMicrotasks();

    expect(plugin.settings.maxChatTabs).toBe(5);
    expect(view.refreshTabControls).toHaveBeenCalled();
  });

  it('offers only caps within the General tab slider bounds', () => {
    const { container } = mount(WorkspaceStep, makeStore());

    const values = [...container.querySelectorAll('[data-field="max-tabs"] option')]
      .map((option) => Number((option as HTMLOptionElement).value));
    expect(Math.min(...values)).toBeGreaterThanOrEqual(3);
    expect(Math.max(...values)).toBeLessThanOrEqual(10);
  });
});

describe('MarketplaceStep', () => {
  it('opting in shows the same one-time network warning the other surfaces use', async () => {
    const { container, plugin } = mount(
      MarketplaceStep,
      makeStore(),
      makePlugin({ marketplaceNetworkEnabled: false }),
    );

    await fireEvent.click(container.querySelector('[data-field="marketplace-network"]')!);
    await flushMicrotasks();

    expect(plugin.settings.marketplaceNetworkEnabled).toBe(true);
    expect(maybeWarnMarketplaceNetwork).toHaveBeenCalledWith(plugin);
  });

  it('opting out does not re-warn', async () => {
    const { container } = mount(
      MarketplaceStep,
      makeStore(),
      makePlugin({ marketplaceNetworkEnabled: true }),
    );

    await fireEvent.click(container.querySelector('[data-field="marketplace-network"]')!);
    await flushMicrotasks();

    expect(maybeWarnMarketplaceNetwork).not.toHaveBeenCalled();
  });

  it('keeps Browse disabled until the network gate is on', async () => {
    const { container } = mount(
      MarketplaceStep,
      makeStore(),
      makePlugin({ marketplaceNetworkEnabled: false }),
    );
    const browse = container.querySelector<HTMLButtonElement>('[data-action="browse-marketplace"]')!;
    expect(browse.disabled).toBe(true);

    await fireEvent.click(container.querySelector('[data-field="marketplace-network"]')!);
    expect(browse.disabled).toBe(false);

    await fireEvent.click(browse);
    expect(activateMarketplace).toHaveBeenCalled();
  });
});

describe('FinishStep', () => {
  it('names the enabled providers', () => {
    const { container } = mount(FinishStep, makeStore({ enabledProviderIds: ['alpha'] }));

    expect(container.querySelector('[data-state="providers"]')?.textContent).toContain('Alpha');
  });

  it('warns when nothing is enabled', () => {
    const { container } = mount(FinishStep, makeStore());

    expect(container.querySelector('[data-state="providers"]')?.textContent)
      .toContain('No provider is enabled');
  });

  it('completes the flow, closes the leaf, and opens chat', async () => {
    const store = makeStore({ enabledProviderIds: ['alpha'] });
    const closeView = vi.fn();
    const { container, plugin } = mount(FinishStep, store, makePlugin(), closeView);

    await fireEvent.click(container.querySelector('[data-action="finish-open-chat"]')!);
    await Promise.resolve();
    await Promise.resolve();

    expect(store.finish).toHaveBeenCalled();
    expect(closeView).toHaveBeenCalled();
    expect(plugin.activateView).toHaveBeenCalled();
  });
});
