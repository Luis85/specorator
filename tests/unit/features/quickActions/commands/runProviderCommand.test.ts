import { Notice, TFile } from 'obsidian';

import { ProviderRegistry } from '@/core/providers/ProviderRegistry';
import { runProviderCommand } from '@/features/quickActions/commands/runProviderCommand';
import type { CommandTabEntry } from '@/features/quickActions/commands/types';

jest.mock('obsidian', () => ({
  Notice: jest.fn(),
  TFile: class TFile { path = ''; },
  TFolder: class TFolder { path = ''; },
}));

jest.mock('@/i18n/i18n', () => ({
  t: (key: string, params?: Record<string, string>) =>
    params ? `${key}:${JSON.stringify(params)}` : key,
}));

jest.mock('@/features/chat/tabs/providerResolution', () => ({
  getTabProviderId: jest.fn((tab: { providerId?: string }) => tab.providerId ?? 'claude'),
}));

jest.mock('@/core/providers/ProviderRegistry', () => ({
  ProviderRegistry: { isEnabled: jest.fn(() => true) },
}));

jest.mock('@/core/types/settings', () => ({
  asSettingsBag: (s: unknown) => s as Record<string, unknown>,
}));

function makeEntry(overrides: Partial<CommandTabEntry> = {}): CommandTabEntry {
  return {
    id: 'claude:cmd-review',
    providerId: 'claude',
    providerDisplayName: 'Claude',
    name: 'review',
    description: 'Review a pull request',
    insertPrefix: '/',
    scope: 'vault',
    providerEnabled: true,
    ...overrides,
  };
}

function makeTab(opts: { id?: string; providerId?: string; lifecycleState?: string } = {}) {
  return {
    id: opts.id ?? 'tab-1',
    providerId: opts.providerId ?? 'claude',
    lifecycleState: opts.lifecycleState ?? 'blank',
    kind: 'chat',
    dom: { inputEl: { value: '' } },
    ui: {
      fileContextManager: {
        attachFileAsPill: jest.fn(),
        attachFolderAsPill: jest.fn(),
        getAttachedFiles: jest.fn(() => new Set<string>()),
        getAttachedFolders: jest.fn(() => new Set<string>()),
      },
      imageContextManager: { hasImages: jest.fn(() => false) },
    },
    controllers: {
      inputController: {
        sendMessage: jest.fn().mockResolvedValue(undefined),
        seedComposerDraft: jest.fn(),
      },
    },
  };
}

function makePlugin(opts: {
  activeTab?: ReturnType<typeof makeTab> | null;
  newTab?: ReturnType<typeof makeTab> | null;
  canCreate?: boolean;
} = {}) {
  const tabManager = {
    getActiveTab: jest.fn(() => opts.activeTab ?? null),
    getAllTabs: jest.fn(() => (opts.activeTab ? [opts.activeTab] : [])),
    canCreateTab: jest.fn(() => opts.canCreate ?? true),
    createTab: jest.fn().mockResolvedValue(opts.newTab ?? null),
    switchToTab: jest.fn().mockResolvedValue(undefined),
  };
  const view = { getTabManager: jest.fn(() => tabManager) };
  return {
    plugin: {
      app: {},
      settings: {},
      events: { emit: jest.fn() },
      getView: jest.fn(() => view),
      activateView: jest.fn().mockResolvedValue(undefined),
    },
    tabManager,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  (ProviderRegistry.isEnabled as jest.Mock).mockReturnValue(true);
});

describe('runProviderCommand', () => {
  it('sends an argument-less command into a reusable blank tab of the same provider', async () => {
    const activeTab = makeTab();
    const { plugin, tabManager } = makePlugin({ activeTab });

    await runProviderCommand(plugin as never, makeEntry(), null);

    expect(tabManager.createTab).not.toHaveBeenCalled();
    expect(tabManager.switchToTab).toHaveBeenCalledWith('tab-1');
    expect(activeTab.controllers.inputController.sendMessage).toHaveBeenCalledWith({
      content: '/review',
    });
  });

  it('seeds — never sends — a command that declares an argument hint', async () => {
    const activeTab = makeTab();
    const { plugin } = makePlugin({ activeTab });

    await runProviderCommand(
      plugin as never,
      makeEntry({ argumentHint: '[pr-url]' }),
      null,
    );

    const input = activeTab.controllers.inputController;
    expect(input.seedComposerDraft).toHaveBeenCalledWith('/review ');
    expect(input.sendMessage).not.toHaveBeenCalled();
  });

  it('honors the provider-native prefix rather than assuming a slash', async () => {
    const activeTab = makeTab({ providerId: 'codex' });
    const { plugin } = makePlugin({ activeTab });

    await runProviderCommand(
      plugin as never,
      makeEntry({ providerId: 'codex', insertPrefix: '$', name: 'compact' }),
      null,
    );

    expect(activeTab.controllers.inputController.sendMessage).toHaveBeenCalledWith({
      content: '$compact',
    });
  });

  it('re-checks provider enablement at run time and refuses a disabled provider', async () => {
    (ProviderRegistry.isEnabled as jest.Mock).mockReturnValue(false);
    const activeTab = makeTab();
    const { plugin, tabManager } = makePlugin({ activeTab });

    // providerEnabled was cached true when the modal listed the row.
    await runProviderCommand(plugin as never, makeEntry(), null);

    expect(Notice).toHaveBeenCalledWith(
      'quickActions.commands.providerDisabled:{"provider":"Claude"}',
    );
    expect(tabManager.switchToTab).not.toHaveBeenCalled();
    expect(activeTab.controllers.inputController.sendMessage).not.toHaveBeenCalled();
  });

  it('creates a provider-matched tab when the active tab is bound, and attaches the pill after the switch', async () => {
    const activeTab = makeTab({ lifecycleState: 'bound' });
    const newTab = makeTab({ id: 'tab-2' });
    const { plugin, tabManager } = makePlugin({ activeTab, newTab });
    const file = new TFile();
    file.path = 'notes/spec.md';

    await runProviderCommand(plugin as never, makeEntry(), file);

    expect(tabManager.createTab).toHaveBeenCalledWith(null, undefined, {
      activate: false,
      defaultProviderId: 'claude',
    });
    const attach = newTab.ui.fileContextManager.attachFileAsPill;
    expect(attach).toHaveBeenCalledWith('notes/spec.md');
    expect(tabManager.switchToTab.mock.invocationCallOrder[0])
      .toBeLessThan(attach.mock.invocationCallOrder[0]);
  });

  it('notices the tab limit instead of dispatching when no tab can be resolved', async () => {
    const activeTab = makeTab({ lifecycleState: 'bound' });
    const { plugin, tabManager } = makePlugin({ activeTab, canCreate: false });

    await runProviderCommand(plugin as never, makeEntry(), null);

    expect(Notice).toHaveBeenCalledWith('quickActions.contextMenu.tabLimitReached');
    expect(tabManager.switchToTab).not.toHaveBeenCalled();
  });
});
