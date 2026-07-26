import { ProviderRegistry } from '@/core/providers/ProviderRegistry';
import type { ProviderId, ProviderRegistration } from '@/core/providers/types';
import type { PluginContext } from '@/core/types/PluginContext';
import {
  completeOnboarding,
  ensureOnboardingFolders,
  isOnboardingComplete,
  ONBOARDING_FOLDER_KEYS,
  readOnboardingFolders,
  setAppSetting,
  setDefaultModel,
  setFolderSetting,
  setProviderCliPathForHost,
  setProviderEnabled,
} from '@/features/onboarding/onboardingSettings';

interface Harness {
  plugin: PluginContext;
  settings: Record<string, unknown>;
  saves: number;
}

function makeHarness(initial: Record<string, unknown> = {}): Harness {
  const settings: Record<string, unknown> = { ...initial };
  const harness = {
    settings,
    saves: 0,
    plugin: {
      settings,
      saveSettings: async () => {
        harness.saves += 1;
      },
    } as unknown as PluginContext,
  };
  return harness;
}

/**
 * Registration stub carrying the FULL `ProviderChatUIConfig` surface the settings
 * coordinator touches (it calls `applyModelDefaults` / `normalizeModelVariant` /
 * `isDefaultModel` while projecting), so a stub registered here stays safe for
 * every describe — registrations live in a process-wide registry.
 */
function registerInertProvider(
  id: string,
  options: { models?: string[]; extra?: Record<string, unknown> } = {},
): void {
  const models = options.models ?? [];
  ProviderRegistry.register(id as ProviderId, {
    displayName: id,
    firstRunBlurb: `${id} CLI`,
    cliCommand: id,
    isEnabled: (settings: Record<string, unknown>) => Boolean(
      (settings.providerConfigs as Record<string, { enabled?: boolean }> | undefined)?.[id]?.enabled,
    ),
    // Every REQUIRED member of ProviderChatUIConfig (the optional `?` ones are
    // called with `?.`). Complete on purpose: the coordinator walks this surface
    // while projecting, and stubbing it member-by-member as each failure appears
    // is how a fixture rots.
    chatUIConfig: {
      getModelOptions: () => models.map((model) => ({ value: model, label: model })),
      ownsModel: (candidate: string) => models.includes(candidate),
      isAdaptiveReasoningModel: () => false,
      getReasoningOptions: () => [],
      getDefaultReasoningValue: () => '',
      getContextWindowSize: () => 200_000,
      isDefaultModel: (candidate: string) => models.includes(candidate),
      applyModelDefaults: () => {},
      normalizeModelVariant: (candidate: string) => candidate,
      getCustomModelIds: () => [],
    },
    ...options.extra,
  } as unknown as ProviderRegistration);
}

// The writers route through ProviderRegistry (an unregistered id is a hard error
// by design), so every id this file passes must exist in the registry — and in
// the TOP-LEVEL hook, since a describe-scoped beforeAll runs only for its own
// tests.
beforeAll(() => {
  registerInertProvider('claude', { models: ['haiku'] });
  registerInertProvider('codex');
  registerInertProvider('model-alpha', { models: ['alpha-1'] });
  registerInertProvider('model-beta', { models: ['beta-1'] });
});

function makeAdapter(existing: string[] = []) {
  const folders = new Set(existing);
  const created: string[] = [];
  return {
    created,
    exists: jest.fn(async (path: string) => folders.has(path)),
    ensureFolder: jest.fn(async (path: string) => {
      folders.add(path);
      created.push(path);
    }),
  };
}

describe('provider writes', () => {
  it('sets the enabled flag inside providerConfigs and persists', async () => {
    const harness = makeHarness();

    await setProviderEnabled(harness.plugin, 'claude', true);

    expect((harness.settings.providerConfigs as Record<string, { enabled: boolean }>).claude.enabled)
      .toBe(true);
    expect(harness.saves).toBe(1);
  });

  it('aligns the top-level model with the provider selection when enabling', async () => {
    // A fresh vault starts on Claude's `haiku`. Enabling a non-Claude provider
    // first must not leave that foreign model as the default: the blank-tab
    // factory routes by MODEL, so the first chat would open on the wrong
    // provider once Claude is enabled too.
    const harness = makeHarness({ model: 'haiku', settingsProvider: 'claude' });

    await setProviderEnabled(harness.plugin, 'model-beta' as ProviderId, true);


    expect(harness.settings.settingsProvider).toBe('model-beta');
    expect(harness.settings.model).toBe('beta-1');
  });

  it('re-projects when a provider is disabled, so its model is not left behind', async () => {
    const harness = makeHarness({
      model: 'beta-1',
      settingsProvider: 'model-beta',
      providerConfigs: { 'model-beta': { enabled: true } },
    });

    await setProviderEnabled(harness.plugin, 'model-beta' as ProviderId, false);

    expect(harness.settings.model).not.toBe('beta-1');
  });

  it('preserves other provider config fields when toggling enabled', async () => {
    const harness = makeHarness({ providerConfigs: { claude: { enabled: false, safeMode: 'auto' } } });

    await setProviderEnabled(harness.plugin, 'claude', true);

    expect((harness.settings.providerConfigs as Record<string, Record<string, unknown>>).claude)
      .toEqual({ enabled: true, safeMode: 'auto' });
  });

  it('pins a CLI path under the host key, not the legacy flat field', async () => {
    const harness = makeHarness();

    await setProviderCliPathForHost(harness.plugin, 'codex', 'laptop', ' /opt/bin/codex ');

    const config = (harness.settings.providerConfigs as Record<string, Record<string, unknown>>).codex;
    expect(config.cliPathsByHost).toEqual({ laptop: '/opt/bin/codex' });
    expect(config.cliPath).toBeUndefined();
  });

  it('lets the provider invalidate state the path change staled, before the save', async () => {
    // OpenCode drops its discovered model/mode catalog: a different binary may
    // not support the old models. The hook must run BEFORE saveSettings so one
    // write persists both.
    const cleared: Array<Record<string, unknown>> = [];
    registerInertProvider('hook-provider', {
      extra: {
        onCliPathChanged: (settings: Record<string, unknown>) => {
          settings.hookRan = true;
          cleared.push(settings);
          return true;
        },
      },
    });
    const harness = makeHarness();
    const savedSnapshots: boolean[] = [];
    const plugin = {
      settings: harness.settings,
      saveSettings: async () => { savedSnapshots.push(harness.settings.hookRan === true); },
    } as unknown as PluginContext;

    await setProviderCliPathForHost(plugin, 'hook-provider' as ProviderId, 'laptop', '/opt/hook');

    expect(cleared).toHaveLength(1);
    expect(savedSnapshots).toEqual([true]);
  });

  it('a provider with no invalidation hook still persists the path', async () => {
    const harness = makeHarness();

    await setProviderCliPathForHost(harness.plugin, 'claude', 'laptop', '/opt/claude');

    expect(harness.saves).toBe(1);
  });

  it('a blank path clears the pin so auto-detection resumes', async () => {
    const harness = makeHarness({
      providerConfigs: { codex: { cliPathsByHost: { laptop: '/old/codex', desktop: '/keep' } } },
    });

    await setProviderCliPathForHost(harness.plugin, 'codex', 'laptop', '   ');

    const config = (harness.settings.providerConfigs as Record<string, Record<string, unknown>>).codex;
    expect(config.cliPathsByHost).toEqual({ desktop: '/keep' });
  });
});

describe('folder setup', () => {
  it('reports existence per configured folder without creating anything', async () => {
    const harness = makeHarness({
      agentBoardWorkOrderFolder: 'Board/tasks',
      agentBoardTemplateFolder: 'Board/templates',
      agentBoardLoopFolder: 'Board/loops',
      agentBoardArchiveFolder: 'Board/archive',
      quickActionsFolder: 'Quick Actions',
    });
    const adapter = makeAdapter(['Board/tasks']);

    const states = await readOnboardingFolders(harness.plugin, adapter);

    expect(states.map((state) => state.exists)).toEqual([true, false, false, false, false]);
    expect(adapter.ensureFolder).not.toHaveBeenCalled();
  });

  it('creates only the missing folders', async () => {
    const harness = makeHarness({
      agentBoardWorkOrderFolder: 'Board/tasks',
      agentBoardTemplateFolder: 'Board/templates',
      agentBoardLoopFolder: 'Board/loops',
      agentBoardArchiveFolder: 'Board/archive',
      quickActionsFolder: 'Quick Actions',
    });
    const adapter = makeAdapter(['Board/tasks']);

    const states = await ensureOnboardingFolders(harness.plugin, adapter);

    expect(adapter.ensureFolder).toHaveBeenCalledTimes(4);
    expect(adapter.ensureFolder).not.toHaveBeenCalledWith('Board/tasks');
    expect(states.every((state) => state.exists)).toBe(true);
  });

  it('skips a blank folder rather than materializing a default the Library never scans', async () => {
    const harness = makeHarness({ quickActionsFolder: '' });
    const adapter = makeAdapter();

    const states = await ensureOnboardingFolders(harness.plugin, adapter);

    expect(adapter.ensureFolder).not.toHaveBeenCalled();
    const quickActions = states.find((state) => state.key === 'quickActionsFolder');
    expect(quickActions).toEqual({ key: 'quickActionsFolder', path: '', exists: false });
  });

  it('covers every folder the Board and Quick Actions surfaces read', () => {
    expect([...ONBOARDING_FOLDER_KEYS]).toEqual([
      'agentBoardWorkOrderFolder',
      'agentBoardTemplateFolder',
      'agentBoardLoopFolder',
      'agentBoardArchiveFolder',
      'quickActionsFolder',
    ]);
  });

  it('trims a folder setting on write', async () => {
    const harness = makeHarness();

    await setFolderSetting(harness.plugin, 'agentBoardLoopFolder', '  Board/loops  ');

    expect(harness.settings.agentBoardLoopFolder).toBe('Board/loops');
    expect(harness.saves).toBe(1);
  });
});

describe('setDefaultModel', () => {
  // Two stub providers so a cross-provider pick is exercised: writing only the
  // top-level `model` would be reverted by the owning provider's projection.
  const OWNER = 'model-beta' as ProviderId;

  /** Both model providers enabled — the wizard only offers enabled providers' models. */
  function makeModelHarness(): Harness {
    return makeHarness({
      settingsProvider: 'model-alpha',
      model: 'alpha-1',
      providerConfigs: {
        'model-alpha': { enabled: true },
        'model-beta': { enabled: true },
      },
    });
  }

  it('records the model against the provider that owns it, not just the top level', async () => {
    const harness = makeModelHarness();

    await setDefaultModel(harness.plugin, 'beta-1');

    expect(harness.settings.model).toBe('beta-1');
    expect((harness.settings.savedProviderModel as Record<string, string>)[OWNER]).toBe('beta-1');
    expect(harness.saves).toBe(1);
  });

  it('points the active provider at the owner, so a blank chat prefers it', async () => {
    const harness = makeModelHarness();

    await setDefaultModel(harness.plugin, 'beta-1');

    expect(harness.settings.settingsProvider).toBe(OWNER);
  });

  it('writes the projection entry the coordinator resolves from (the regression)', async () => {
    // `resolveProjectionModel` prefers `savedProviderModel[provider]` over the
    // provider's first option — that entry is precisely what stops a later
    // projection from replacing the pick with a foreign-provider fallback.
    // Asserted at that contract rather than by driving the real coordinator,
    // which would need a full ProviderChatUIConfig stub for every branch it
    // touches (reasoning options, variants, tier/budget toggles).
    const harness = makeModelHarness();

    await setDefaultModel(harness.plugin, 'beta-1');

    expect(harness.settings.savedProviderModel).toEqual({ [OWNER]: 'beta-1' });
  });

  it('applies the chosen model\'s own reasoning defaults', async () => {
    const applied: string[] = [];
    registerInertProvider('model-beta', {
      models: ['beta-1'],
      extra: {
        chatUIConfig: {
          getModelOptions: () => [{ value: 'beta-1', label: 'beta-1' }],
          getCustomModelIds: () => [],
          ownsModel: (candidate: string) => candidate === 'beta-1',
          isDefaultModel: (candidate: string) => candidate === 'beta-1',
          isAdaptiveReasoningModel: () => false,
          getReasoningOptions: () => [],
          normalizeModelVariant: (candidate: string) => candidate,
          applyModelDefaults: (model: string) => applied.push(model),
        },
      },
    });
    const harness = makeModelHarness();

    await setDefaultModel(harness.plugin, 'beta-1');

    expect(applied).toContain('beta-1');
  });
});

describe('completion', () => {
  it('completing reuses firstRunDismissed so the settings banner retires too', async () => {
    const harness = makeHarness({ firstRunDismissed: false });

    expect(isOnboardingComplete(harness.plugin)).toBe(false);
    await completeOnboarding(harness.plugin);

    expect(harness.settings.firstRunDismissed).toBe(true);
    expect(isOnboardingComplete(harness.plugin)).toBe(true);
    expect(harness.saves).toBe(1);
  });

  it('writes a scalar setting through the save path', async () => {
    const harness = makeHarness();

    await setAppSetting(harness.plugin, 'maxChatTabs', 5);

    expect(harness.settings.maxChatTabs).toBe(5);
    expect(harness.saves).toBe(1);
  });
});
