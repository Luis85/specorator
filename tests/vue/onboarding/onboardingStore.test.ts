import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ProviderCliInstallMethod } from '@/core/providers/types';
// Namespace type imports: `typeof import(...)` annotations are lint-forbidden,
// so the partial mocks below reference these instead.
import type * as InstallRunnerModule from '@/features/onboarding/cliInstallRunner';
import type { CliInstallHandle, CliInstallResult } from '@/features/onboarding/cliInstallRunner';
import type * as SettingsModule from '@/features/onboarding/onboardingSettings';
import type { ProviderCliDetection } from '@/features/onboarding/providerDetection';

vi.mock('@/shared/settings/cliPathSetting', () => ({
  broadcastCliPathRuntimeCleanup: vi.fn(async () => {}),
}));
vi.mock('@/features/onboarding/providerDetection', () => ({
  detectProviderClis: vi.fn(() => []),
}));
vi.mock('@/core/providers/ProviderRegistry', () => ({
  ProviderRegistry: {
    getProviderDisplayName: (id: string) => `Name:${id}`,
    // Both stub providers advertise a shared id so the dedup path is exercised.
    getChatUIConfig: (id: string) => ({
      getModelOptions: () => [
        { value: 'shared', label: 'Shared' },
        { value: `${id}-only`, label: `${id} only` },
      ],
    }),
  },
}));
vi.mock('@/features/onboarding/cliInstallRunner', async (importOriginal) => {
  const actual = await importOriginal<typeof InstallRunnerModule>();
  return { ...actual, runCliInstall: vi.fn() };
});
vi.mock('@/features/onboarding/onboardingSettings', async (importOriginal) => {
  const actual = await importOriginal<typeof SettingsModule>();
  return {
    ...actual,
    setProviderEnabled: vi.fn(async () => {}),
    setProviderCliPathForHost: vi.fn(async () => {}),
    setFolderSetting: vi.fn(async () => {}),
    completeOnboarding: vi.fn(async () => {}),
    readOnboardingFolders: vi.fn(async () => []),
    ensureOnboardingFolders: vi.fn(async () => []),
  };
});

import { runCliInstall } from '@/features/onboarding/cliInstallRunner';
import {
  completeOnboarding,
  ensureOnboardingFolders,
  readOnboardingFolders,
  setFolderSetting,
  setProviderCliPathForHost,
  setProviderEnabled,
} from '@/features/onboarding/onboardingSettings';
import { detectProviderClis } from '@/features/onboarding/providerDetection';
import { useOnboardingStore } from '@/features/onboarding/vue/stores/onboardingStore';
import { broadcastCliPathRuntimeCleanup } from '@/shared/settings/cliPathSetting';

const method: ProviderCliInstallMethod = {
  id: 'npm',
  label: 'npm',
  displayCommand: 'npm install -g alpha',
  argv: { command: 'npm', args: ['install', '-g', 'alpha'] },
};

function detection(overrides: Partial<ProviderCliDetection> = {}): ProviderCliDetection {
  return {
    providerId: 'alpha',
    displayName: 'Alpha',
    blurb: 'Alpha CLI',
    cliCommand: 'alpha',
    status: 'missing',
    cliPath: null,
    enabled: false,
    ...overrides,
  };
}

/** A controllable install handle so the test drives completion timing. */
function deferredHandle(): { handle: CliInstallHandle; finish: (r: CliInstallResult) => void; emit: (t: string) => void } {
  let resolveDone: (result: CliInstallResult) => void = () => {};
  const done = new Promise<CliInstallResult>((resolve) => { resolveDone = resolve; });
  let onOutput: (text: string) => void = () => {};
  vi.mocked(runCliInstall).mockImplementation((_method, events) => {
    onOutput = events.onOutput;
    return { done, cancel: vi.fn() };
  });
  return {
    handle: { done, cancel: vi.fn() },
    finish: (result) => resolveDone(result),
    emit: (text) => onOutput(text),
  };
}

/** A view handle pair, so the post-enable refresh can be asserted. */
function makeView() {
  return {
    refreshModelSelector: vi.fn(),
    refreshProviderAvailability: vi.fn().mockResolvedValue(undefined),
  };
}

const views = [makeView()];
const plugin = { settings: {}, app: {}, getAllViews: () => views } as never;

beforeEach(() => {
  setActivePinia(createPinia());
  vi.mocked(detectProviderClis).mockReset().mockReturnValue([]);
  vi.mocked(runCliInstall).mockReset();
  vi.mocked(setProviderEnabled).mockClear();
  vi.mocked(setProviderCliPathForHost).mockClear();
  vi.mocked(completeOnboarding).mockClear();
  vi.mocked(ensureOnboardingFolders).mockReset().mockResolvedValue([]);
  vi.mocked(readOnboardingFolders).mockReset().mockResolvedValue([]);
  vi.mocked(setFolderSetting).mockClear();
  vi.mocked(broadcastCliPathRuntimeCleanup).mockClear();
  for (const view of views) {
    view.refreshModelSelector.mockClear();
    view.refreshProviderAvailability.mockClear();
  }
});

describe('onboarding store', () => {
  it('probes providers on init', () => {
    vi.mocked(detectProviderClis).mockReturnValue([detection()]);
    const store = useOnboardingStore();

    store.init(plugin);

    expect(store.detections).toHaveLength(1);
  });

  it('enabling a provider persists then re-probes so the card reflects live settings', async () => {
    vi.mocked(detectProviderClis).mockReturnValue([detection()]);
    const store = useOnboardingStore();
    store.init(plugin);
    vi.mocked(detectProviderClis).mockReturnValue([detection({ enabled: true })]);

    await store.setEnabled('alpha', true);

    expect(setProviderEnabled).toHaveBeenCalledWith(plugin, 'alpha', true);
    expect(store.enabledProviderIds).toEqual(['alpha']);
  });

  it('enabling refreshes open chat views so a no-provider placeholder leaf promotes', async () => {
    // Parity with the canonical toggle in settings/ui/GeneralTabSections.ts:
    // Finish reveals an EXISTING leaf, so without this the leaf stays unusable.
    const store = useOnboardingStore();
    store.init(plugin);

    await store.setEnabled('alpha', true);

    expect(views[0].refreshModelSelector).toHaveBeenCalled();
    expect(views[0].refreshProviderAvailability).toHaveBeenCalled();
  });

  it('a manual path write goes through the host-scoped setter and re-probes', async () => {
    const store = useOnboardingStore();
    store.init(plugin);

    await store.setCliPath('alpha', '/opt/alpha');

    expect(setProviderCliPathForHost).toHaveBeenCalledWith(
      plugin,
      'alpha',
      expect.any(String),
      '/opt/alpha',
    );
  });

  it('recycles live runtimes after a path change, like the provider CLI-path widgets', async () => {
    // A persistent Codex/Cursor/OpenCode process holds the OLD executable, so
    // without this the card reads "detected" while chats spawn the previous one.
    const store = useOnboardingStore();
    store.init(plugin);

    await store.setCliPath('alpha', '/opt/alpha');

    expect(broadcastCliPathRuntimeCleanup).toHaveBeenCalledWith(plugin);
  });

  it('streams install output into the per-provider run state', async () => {
    const controlled = deferredHandle();
    const store = useOnboardingStore();
    store.init(plugin);

    store.startInstall('alpha', method);
    expect(store.runFor('alpha').phase).toBe('running');

    controlled.emit('added 1 package\n');
    expect(store.runFor('alpha').lines[0]).toBe('added 1 package');

    controlled.finish({ ok: true, exitCode: 0 });
    await Promise.resolve();
    await Promise.resolve();

    expect(store.runFor('alpha').phase).toBe('succeeded');
  });

  it('re-probes after a completed install — the resolver cache would otherwise stay stale', async () => {
    const controlled = deferredHandle();
    const store = useOnboardingStore();
    store.init(plugin);
    const probesBefore = vi.mocked(detectProviderClis).mock.calls.length;

    store.startInstall('alpha', method);
    controlled.finish({ ok: true, exitCode: 0 });
    await Promise.resolve();
    await Promise.resolve();

    expect(vi.mocked(detectProviderClis).mock.calls.length).toBeGreaterThan(probesBefore);
  });

  it('records a failure with its error text', async () => {
    const controlled = deferredHandle();
    const store = useOnboardingStore();
    store.init(plugin);

    store.startInstall('alpha', method);
    controlled.finish({ ok: false, exitCode: 1, error: 'EACCES' });
    await Promise.resolve();
    await Promise.resolve();

    expect(store.runFor('alpha')).toMatchObject({ phase: 'failed', error: 'EACCES' });
  });

  it('records a cancellation distinctly from a failure', async () => {
    const controlled = deferredHandle();
    const store = useOnboardingStore();
    store.init(plugin);

    store.startInstall('alpha', method);
    controlled.finish({ ok: false, exitCode: null, cancelled: true });
    await Promise.resolve();
    await Promise.resolve();

    expect(store.runFor('alpha').phase).toBe('cancelled');
  });

  it('ignores a second start while one install is already running', () => {
    deferredHandle();
    const store = useOnboardingStore();
    store.init(plugin);

    store.startInstall('alpha', method);
    store.startInstall('alpha', method);

    expect(runCliInstall).toHaveBeenCalledTimes(1);
  });

  it('dispose cancels in-flight installs so a closed leaf leaves no orphan child', () => {
    const cancel = vi.fn();
    const done = new Promise<CliInstallResult>(() => {});
    vi.mocked(runCliInstall).mockReturnValue({ done, cancel });
    const store = useOnboardingStore();
    store.init(plugin);

    store.startInstall('alpha', method);
    store.dispose();

    expect(cancel).toHaveBeenCalled();
  });

  it('creating folders surfaces a failure instead of throwing into the view', async () => {
    vi.mocked(ensureOnboardingFolders).mockRejectedValue(new Error('read-only vault'));
    const store = useOnboardingStore();
    store.init(plugin);

    await store.createFolders();

    expect(store.folderError).toBe('read-only vault');
    expect(store.creatingFolders).toBe(false);
  });

  it('advance is clamped at both ends of the flow', () => {
    const store = useOnboardingStore();
    store.init(plugin);

    store.advance(-1);
    expect(store.step).toBe('providers');

    for (let i = 0; i < 20; i += 1) store.advance(1);
    expect(store.step).toBe('finish');
  });

  it('goTo jumps straight to any step (the rail is free-navigable)', () => {
    const store = useOnboardingStore();
    store.init(plugin);

    store.goTo('marketplace');

    expect(store.step).toBe('marketplace');
  });

  it('collects model options from every enabled provider, deduped and provider-grouped', () => {
    vi.mocked(detectProviderClis).mockReturnValue([
      detection({ providerId: 'alpha', enabled: true }),
      detection({ providerId: 'beta', enabled: true }),
    ]);
    const store = useOnboardingStore();
    store.init(plugin);

    expect(store.modelOptions).toEqual([
      { value: 'shared', label: 'Shared', group: 'Name:alpha' },
      { value: 'alpha-only', label: 'alpha only', group: 'Name:alpha' },
      // 'shared' is NOT repeated for beta — first provider wins the entry.
      { value: 'beta-only', label: 'beta only', group: 'Name:beta' },
    ]);
  });

  it('offers no model options while no provider is enabled', () => {
    vi.mocked(detectProviderClis).mockReturnValue([detection()]);
    const store = useOnboardingStore();
    store.init(plugin);

    expect(store.modelOptions).toEqual([]);
  });

  it('editing a folder persists it and re-reads existence', async () => {
    const store = useOnboardingStore();
    store.init(plugin);
    vi.mocked(readOnboardingFolders).mockResolvedValue([
      { key: 'agentBoardLoopFolder', path: 'Ops/loops', exists: false },
    ]);

    await store.setFolder('agentBoardLoopFolder', 'Ops/loops');

    expect(setFolderSetting).toHaveBeenCalledWith(plugin, 'agentBoardLoopFolder', 'Ops/loops');
    expect(store.folders).toEqual([
      { key: 'agentBoardLoopFolder', path: 'Ops/loops', exists: false },
    ]);
  });

  it('creating folders replaces the folder state with the post-create truth', async () => {
    vi.mocked(ensureOnboardingFolders).mockResolvedValue([
      { key: 'agentBoardLoopFolder', path: 'Ops/loops', exists: true },
    ]);
    const store = useOnboardingStore();
    store.init(plugin);

    await store.createFolders();

    expect(store.folderError).toBeNull();
    expect(store.folders[0].exists).toBe(true);
  });

  it('finish marks the flow complete', async () => {
    const store = useOnboardingStore();
    store.init(plugin);

    await store.finish();

    expect(completeOnboarding).toHaveBeenCalledWith(plugin);
  });
});
