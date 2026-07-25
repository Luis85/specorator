import type { PluginContext } from '@/core/types/PluginContext';
import {
  completeOnboarding,
  ensureOnboardingFolders,
  isOnboardingComplete,
  ONBOARDING_FOLDER_KEYS,
  readOnboardingFolders,
  setAppSetting,
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
