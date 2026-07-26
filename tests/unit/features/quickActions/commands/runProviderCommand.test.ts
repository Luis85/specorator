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

function makeTab(opts: {
  id?: string;
  providerId?: string;
  lifecycleState?: string;
  draftText?: string;
  streaming?: boolean;
  queued?: boolean;
} = {}) {
  return {
    id: opts.id ?? 'tab-1',
    providerId: opts.providerId ?? 'claude',
    lifecycleState: opts.lifecycleState ?? 'blank',
    kind: 'chat',
    dom: { inputEl: { value: opts.draftText ?? '' } },
    state: {
      isStreaming: opts.streaming ?? false,
      queuedMessage: opts.queued ? {} : null,
    },
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
  it('sends an argument-less command into the active tab of the same provider', async () => {
    const activeTab = makeTab();
    const { plugin, tabManager } = makePlugin({ activeTab });

    await runProviderCommand(plugin as never, makeEntry(), null);

    // Already the right conversation — no create, and no switch to re-run the
    // welcome reset on the tab we are about to send into.
    expect(tabManager.createTab).not.toHaveBeenCalled();
    expect(tabManager.switchToTab).not.toHaveBeenCalled();
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

  it('steps aside to a fresh tab rather than seed over an unsent draft', async () => {
    // seedComposerDraft overwrites the textarea, so seeding an argument-taking
    // command into a draft-bearing tab would silently destroy the user's text.
    // `keepExisting` is not the fix — it appends BELOW, and an invocation that
    // isn't the leading token no longer reads as a command.
    const activeTab = makeTab({ lifecycleState: 'bound', draftText: 'half-written thought' });
    const newTab = makeTab({ id: 'tab-2' });
    const { plugin, tabManager } = makePlugin({ activeTab, newTab });

    await runProviderCommand(
      plugin as never,
      makeEntry({ argumentHint: '[pr-url]' }),
      null,
    );

    expect(activeTab.controllers.inputController.seedComposerDraft).not.toHaveBeenCalled();
    expect(activeTab.dom.inputEl.value).toBe('half-written thought');
    expect(tabManager.createTab).toHaveBeenCalled();
    expect(newTab.controllers.inputController.seedComposerDraft).toHaveBeenCalledWith('/review ');
  });

  it('still sends an argument-less command into a draft-bearing active tab', async () => {
    // Sending is non-destructive: `sendMessage({ content })` neither folds the
    // draft in nor clears it, so there is no reason to leave the conversation.
    const activeTab = makeTab({ lifecycleState: 'bound', draftText: 'half-written thought' });
    const { plugin, tabManager } = makePlugin({ activeTab });

    await runProviderCommand(plugin as never, makeEntry({ name: 'compact' }), null);

    expect(tabManager.createTab).not.toHaveBeenCalled();
    expect(activeTab.controllers.inputController.sendMessage).toHaveBeenCalledWith({
      content: '/compact',
    });
    expect(activeTab.dom.inputEl.value).toBe('half-written thought');
  });

  it('declines rather than let an occupied queue slot swallow the invocation', async () => {
    // mergeQueuedChatTurns joins as `queued text\n\n/compact`, which stops being
    // a leading-token command — the row would silently post prose.
    const activeTab = makeTab({ lifecycleState: 'bound', streaming: true, queued: true });
    const { plugin } = makePlugin({ activeTab });

    await runProviderCommand(plugin as never, makeEntry({ name: 'compact' }), null);

    expect(activeTab.controllers.inputController.sendMessage).not.toHaveBeenCalled();
    expect(Notice).toHaveBeenCalledWith('quickActions.commands.queueBusy');
  });

  it('declines while streaming even with an EMPTY queue slot', async () => {
    // An empty slot is no safer: the queued `/compact` gets merged by the
    // user's next send into `/compact\n\ntheir message`, running the command
    // with their message as arguments and swallowing it.
    const activeTab = makeTab({ lifecycleState: 'bound', streaming: true });
    const { plugin } = makePlugin({ activeTab });

    await runProviderCommand(plugin as never, makeEntry({ name: 'compact' }), null);

    expect(activeTab.controllers.inputController.sendMessage).not.toHaveBeenCalled();
    expect(Notice).toHaveBeenCalledWith('quickActions.commands.queueBusy');
  });

  it('still seeds an argument-taking command while streaming', async () => {
    // Seeding writes the composer instead of enqueuing, so the queue is
    // irrelevant to it.
    const activeTab = makeTab({ streaming: true, queued: true });
    const { plugin } = makePlugin({ activeTab });

    await runProviderCommand(
      plugin as never,
      makeEntry({ argumentHint: '[pr-url]' }),
      null,
    );

    expect(activeTab.controllers.inputController.seedComposerDraft)
      .toHaveBeenCalledWith('/review ');
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

  it('stays on a BOUND active tab of the same provider instead of routing to a blank one', async () => {
    // A command is a turn IN a conversation: `/compact` compacts the transcript
    // it lands on, so hijacking a blank tab would compact an empty conversation.
    const activeTab = makeTab({ lifecycleState: 'bound' });
    const newTab = makeTab({ id: 'tab-2' });
    const { plugin, tabManager } = makePlugin({ activeTab, newTab });

    await runProviderCommand(plugin as never, makeEntry({ name: 'compact' }), null);

    expect(tabManager.createTab).not.toHaveBeenCalled();
    expect(tabManager.switchToTab).not.toHaveBeenCalled();
    expect(activeTab.controllers.inputController.sendMessage).toHaveBeenCalledWith({
      content: '/compact',
    });
    expect(newTab.controllers.inputController.sendMessage).not.toHaveBeenCalled();
  });

  it('attaches the picked file to the bound active tab without switching', async () => {
    const activeTab = makeTab({ lifecycleState: 'bound' });
    const { plugin, tabManager } = makePlugin({ activeTab });
    const file = new TFile();
    file.path = 'notes/spec.md';

    await runProviderCommand(plugin as never, makeEntry(), file);

    expect(activeTab.ui.fileContextManager.attachFileAsPill).toHaveBeenCalledWith('notes/spec.md');
    expect(tabManager.switchToTab).not.toHaveBeenCalled();
  });

  it('never hijacks a work-order run tab, routing to a fresh chat tab instead', async () => {
    const activeTab = { ...makeTab({ lifecycleState: 'bound' }), kind: 'work-order' };
    const newTab = makeTab({ id: 'tab-2' });
    const { plugin, tabManager } = makePlugin({ activeTab, newTab });

    await runProviderCommand(plugin as never, makeEntry(), null);

    expect(tabManager.createTab).toHaveBeenCalled();
    expect(activeTab.controllers.inputController.sendMessage).not.toHaveBeenCalled();
    expect(newTab.controllers.inputController.sendMessage).toHaveBeenCalled();
  });

  it('creates a provider-matched tab when the active tab is another provider, attaching the pill after the switch', async () => {
    const activeTab = makeTab({ providerId: 'codex', lifecycleState: 'bound' });
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
    const activeTab = makeTab({ providerId: 'codex', lifecycleState: 'bound' });
    const { plugin, tabManager } = makePlugin({ activeTab, canCreate: false });

    await runProviderCommand(plugin as never, makeEntry(), null);

    expect(Notice).toHaveBeenCalledWith('quickActions.contextMenu.tabLimitReached');
    expect(tabManager.switchToTab).not.toHaveBeenCalled();
  });
});
