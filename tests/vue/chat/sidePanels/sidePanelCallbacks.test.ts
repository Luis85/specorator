import { Menu } from 'obsidian';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { buildSidePanelCallbacks, type SidePanelCallbackHost } from '@/features/chat/ui/vue/sidePanelCallbacks';

// The published `obsidian.d.ts` doesn't expose the mock's `instances` capture
// static; this is the repo's established cast idiom for reaching it (see
// tests/unit/features/tasks/ui/WorkOrderContextMenu.test.ts).
type MockMenuItem = { title?: string; clickHandler?: () => void };
type MockMenu = Menu & { items: MockMenuItem[] };
const MenuMock = Menu as typeof Menu & { instances: MockMenu[] };

/** Minimal host double. Overrides per test via the returned mutable refs. */
function makeHost(overrides: Partial<{
  tabManager: unknown;
  plugin: Record<string, unknown>;
  emitChatShellChange: () => void;
  getHistoryConversationOpenState: (id: string) => 'closed' | 'open' | 'current';
  sendGitCommitPromptToActiveTab: () => void;
}> = {}): SidePanelCallbackHost {
  return {
    plugin: (overrides.plugin ?? {}) as unknown as SidePanelCallbackHost['plugin'],
    tabManager: (overrides.tabManager ?? null) as SidePanelCallbackHost['tabManager'],
    emitChatShellChange: overrides.emitChatShellChange ?? vi.fn(),
    getHistoryConversationOpenState: overrides.getHistoryConversationOpenState ?? (() => 'closed'),
    sendGitCommitPromptToActiveTab: overrides.sendGitCommitPromptToActiveTab ?? vi.fn(),
  };
}

beforeEach(() => {
  MenuMock.instances = [];
});

describe('buildSidePanelCallbacks — git + work order', () => {
  it('onGitCommit delegates to host.sendGitCommitPromptToActiveTab', () => {
    const sendGitCommitPromptToActiveTab = vi.fn();
    const host = makeHost({ sendGitCommitPromptToActiveTab });
    buildSidePanelCallbacks(host).onGitCommit();
    expect(sendGitCommitPromptToActiveTab).toHaveBeenCalledTimes(1);
  });

  it('onOpenWorkOrderItem delegates to plugin.workOrderActivity.openItem', () => {
    const openItem = vi.fn();
    const host = makeHost({ plugin: { workOrderActivity: { openItem } } });
    buildSidePanelCallbacks(host).onOpenWorkOrderItem('wo-1');
    expect(openItem).toHaveBeenCalledWith('wo-1');
  });

  it('onCloseWorkOrderTab delegates to plugin.workOrderActivity.closeTab', () => {
    const closeTab = vi.fn();
    const host = makeHost({ plugin: { workOrderActivity: { closeTab } } });
    buildSidePanelCallbacks(host).onCloseWorkOrderTab('tab-1');
    expect(closeTab).toHaveBeenCalledWith('tab-1');
  });

  it('onOpenWorkOrderItem/onCloseWorkOrderTab no-op when workOrderActivity is absent', () => {
    const host = makeHost({ plugin: {} });
    expect(() => {
      buildSidePanelCallbacks(host).onOpenWorkOrderItem('wo-1');
      buildSidePanelCallbacks(host).onCloseWorkOrderTab('tab-1');
    }).not.toThrow();
  });
});

describe('buildSidePanelCallbacks — conversation selection', () => {
  it('onSelectConversation delegates to tabManager.openConversation(id)', () => {
    const openConversation = vi.fn().mockResolvedValue(undefined);
    const host = makeHost({ tabManager: { openConversation } });
    buildSidePanelCallbacks(host).onSelectConversation('c1');
    expect(openConversation).toHaveBeenCalledWith('c1');
  });

  it('onOpenConversationInNewTab requests a new tab with the given activate flag', () => {
    const openConversation = vi.fn().mockResolvedValue(undefined);
    const host = makeHost({ tabManager: { openConversation } });
    buildSidePanelCallbacks(host).onOpenConversationInNewTab('c1', false);
    expect(openConversation).toHaveBeenCalledWith('c1', { requireNewTab: true, activate: false });
  });

  it('onSelectConversation swallows a rejected openConversation', async () => {
    const openConversation = vi.fn().mockRejectedValue(new Error('nope'));
    const host = makeHost({ tabManager: { openConversation } });
    expect(() => buildSidePanelCallbacks(host).onSelectConversation('c1')).not.toThrow();
    await Promise.resolve().then(() => Promise.resolve());
  });
});

describe('buildSidePanelCallbacks — rename', () => {
  it('onRenameConversation renames then re-projects', async () => {
    const renameConversation = vi.fn().mockResolvedValue(undefined);
    const emitChatShellChange = vi.fn();
    const host = makeHost({ plugin: { renameConversation }, emitChatShellChange });
    buildSidePanelCallbacks(host).onRenameConversation('c1', 'New Title');
    await Promise.resolve().then(() => Promise.resolve());
    expect(renameConversation).toHaveBeenCalledWith('c1', 'New Title');
    expect(emitChatShellChange).toHaveBeenCalledTimes(1);
  });

  it('falls back to the original title when the trimmed title is empty', () => {
    const renameConversation = vi.fn().mockResolvedValue(undefined);
    const host = makeHost({ plugin: { renameConversation } });
    buildSidePanelCallbacks(host).onRenameConversation('c1', '   ');
    expect(renameConversation).toHaveBeenCalledWith('c1', '   ');
  });
});

describe('buildSidePanelCallbacks — delete', () => {
  function activeTab(overrides: Partial<{ isStreaming: boolean; conversationId: string | null; loadActive: () => Promise<void> }> = {}) {
    const loadActive = overrides.loadActive ?? vi.fn().mockResolvedValue(undefined);
    return {
      state: { isStreaming: overrides.isStreaming ?? false },
      conversationId: overrides.conversationId ?? null,
      controllers: { conversationController: { loadActive } },
      loadActive,
    };
  }

  it('deletes and re-projects when the active tab is not streaming', async () => {
    const deleteConversation = vi.fn().mockResolvedValue(undefined);
    const emitChatShellChange = vi.fn();
    const tab = activeTab({ conversationId: 'other' });
    const host = makeHost({
      plugin: { deleteConversation },
      emitChatShellChange,
      tabManager: { getActiveTab: () => tab },
    });
    buildSidePanelCallbacks(host).onDeleteConversation('c1');
    await Promise.resolve().then(() => Promise.resolve()).then(() => Promise.resolve());
    expect(deleteConversation).toHaveBeenCalledWith('c1');
    expect(emitChatShellChange).toHaveBeenCalled();
    expect(tab.loadActive).not.toHaveBeenCalled();
  });

  it('reloads the active conversation when the deleted id was the current one', async () => {
    const deleteConversation = vi.fn().mockResolvedValue(undefined);
    const tab = activeTab({ conversationId: 'c1' });
    const host = makeHost({
      plugin: { deleteConversation },
      tabManager: { getActiveTab: () => tab },
    });
    buildSidePanelCallbacks(host).onDeleteConversation('c1');
    await Promise.resolve().then(() => Promise.resolve()).then(() => Promise.resolve());
    expect(tab.loadActive).toHaveBeenCalledTimes(1);
  });

  it('does nothing while the active tab is streaming', async () => {
    const deleteConversation = vi.fn().mockResolvedValue(undefined);
    const tab = activeTab({ isStreaming: true });
    const host = makeHost({
      plugin: { deleteConversation },
      tabManager: { getActiveTab: () => tab },
    });
    buildSidePanelCallbacks(host).onDeleteConversation('c1');
    await Promise.resolve();
    expect(deleteConversation).not.toHaveBeenCalled();
  });
});

describe('buildSidePanelCallbacks — regenerate title', () => {
  function conv(overrides: Partial<{ messages: Array<{ role: string; content: string; displayContent?: string }>; title: string }> = {}) {
    return {
      title: overrides.title ?? 'Old Title',
      messages: overrides.messages ?? [{ role: 'user', content: 'hi' }],
    };
  }

  it('no-ops when auto title generation is disabled', async () => {
    const getConversationById = vi.fn();
    const host = makeHost({ plugin: { settings: { enableAutoTitleGeneration: false }, getConversationById } });
    buildSidePanelCallbacks(host).onRegenerateConversationTitle('c1');
    await Promise.resolve();
    expect(getConversationById).not.toHaveBeenCalled();
  });

  it('no-ops when there is no title service on the active tab', async () => {
    const getConversationById = vi.fn().mockResolvedValue(conv());
    const host = makeHost({
      plugin: { settings: { enableAutoTitleGeneration: true }, getConversationById, updateConversation: vi.fn() },
      tabManager: { getActiveTab: () => ({ services: { titleGenerationService: null } }) },
    });
    buildSidePanelCallbacks(host).onRegenerateConversationTitle('c1');
    await Promise.resolve().then(() => Promise.resolve());
    expect(host.plugin.updateConversation).not.toHaveBeenCalled();
  });

  it('generates a title and applies it when the user has not manually renamed', async () => {
    const fullConv = conv({ title: 'Old Title' });
    const getConversationById = vi.fn().mockResolvedValue(fullConv);
    const updateConversation = vi.fn().mockResolvedValue(undefined);
    const renameConversation = vi.fn().mockResolvedValue(undefined);
    const emitChatShellChange = vi.fn();
    const generateTitle = vi.fn(async (_id: string, _content: string, onDone: (id: string, result: { success: boolean; title: string }) => Promise<void>) => {
      await onDone('c1', { success: true, title: 'New Title' });
    });
    const host = makeHost({
      plugin: { settings: { enableAutoTitleGeneration: true }, getConversationById, updateConversation, renameConversation },
      tabManager: { getActiveTab: () => ({ services: { titleGenerationService: { generateTitle } } }) },
      emitChatShellChange,
    });
    buildSidePanelCallbacks(host).onRegenerateConversationTitle('c1');
    await Promise.resolve().then(() => Promise.resolve()).then(() => Promise.resolve()).then(() => Promise.resolve());
    expect(updateConversation).toHaveBeenCalledWith('c1', { titleGenerationStatus: 'pending' });
    expect(renameConversation).toHaveBeenCalledWith('c1', 'New Title');
    expect(updateConversation).toHaveBeenCalledWith('c1', { titleGenerationStatus: 'success' });
    expect(emitChatShellChange).toHaveBeenCalled();
  });

  it('marks failed when generation fails and the title was not manually changed', async () => {
    const fullConv = conv({ title: 'Old Title' });
    const getConversationById = vi.fn().mockResolvedValue(fullConv);
    const updateConversation = vi.fn().mockResolvedValue(undefined);
    const generateTitle = vi.fn(async (_id: string, _content: string, onDone: (id: string, result: { success: boolean; title: string }) => Promise<void>) => {
      await onDone('c1', { success: false, title: '' });
    });
    const host = makeHost({
      plugin: { settings: { enableAutoTitleGeneration: true }, getConversationById, updateConversation, renameConversation: vi.fn() },
      tabManager: { getActiveTab: () => ({ services: { titleGenerationService: { generateTitle } } }) },
    });
    buildSidePanelCallbacks(host).onRegenerateConversationTitle('c1');
    await Promise.resolve().then(() => Promise.resolve()).then(() => Promise.resolve()).then(() => Promise.resolve());
    expect(updateConversation).toHaveBeenCalledWith('c1', { titleGenerationStatus: 'failed' });
  });

  it('clears status when the user manually renamed during generation', async () => {
    const getConversationById = vi.fn()
      .mockResolvedValueOnce(conv({ title: 'Old Title' }))
      .mockResolvedValueOnce(conv({ title: 'User Renamed' }));
    const updateConversation = vi.fn().mockResolvedValue(undefined);
    const generateTitle = vi.fn(async (_id: string, _content: string, onDone: (id: string, result: { success: boolean; title: string }) => Promise<void>) => {
      await onDone('c1', { success: true, title: 'New Title' });
    });
    const host = makeHost({
      plugin: { settings: { enableAutoTitleGeneration: true }, getConversationById, updateConversation, renameConversation: vi.fn() },
      tabManager: { getActiveTab: () => ({ services: { titleGenerationService: { generateTitle } } }) },
    });
    buildSidePanelCallbacks(host).onRegenerateConversationTitle('c1');
    await Promise.resolve().then(() => Promise.resolve()).then(() => Promise.resolve()).then(() => Promise.resolve());
    expect(updateConversation).toHaveBeenCalledWith('c1', { titleGenerationStatus: undefined });
  });
});

describe('buildSidePanelCallbacks — context menu', () => {
  const event = {} as MouseEvent;
  const anchorEl = {} as HTMLElement;

  it('omits open/switch items for the current conversation, keeps rename/delete', () => {
    const host = makeHost({
      tabManager: { getActiveTab: () => ({ conversationId: 'c1' }) },
      getHistoryConversationOpenState: () => 'current',
    });
    const startRename = vi.fn();
    buildSidePanelCallbacks(host).onConversationContextMenu('c1', event, anchorEl, startRename);
    const menu = MenuMock.instances[0];
    expect(menu.items.map((i) => i.title)).toEqual(['Rename', 'Delete']);
  });

  it('offers open-in-new-tab and open-in-background for a closed conversation', () => {
    const host = makeHost({
      tabManager: { getActiveTab: () => ({ conversationId: 'other' }) },
      getHistoryConversationOpenState: () => 'closed',
    });
    buildSidePanelCallbacks(host).onConversationContextMenu('c1', event, anchorEl, vi.fn());
    const menu = MenuMock.instances[0];
    expect(menu.items.map((i) => i.title)).toEqual([
      'Open in new tab', 'Open in background tab', 'Rename', 'Delete',
    ]);
  });

  it('offers switch-to-open-session for a conversation open in another tab', () => {
    const host = makeHost({
      tabManager: { getActiveTab: () => ({ conversationId: 'other' }) },
      getHistoryConversationOpenState: () => 'open',
    });
    buildSidePanelCallbacks(host).onConversationContextMenu('c1', event, anchorEl, vi.fn());
    const menu = MenuMock.instances[0];
    expect(menu.items.map((i) => i.title)).toEqual(['Switch to open session', 'Rename', 'Delete']);
  });

  it('Rename item invokes startRename; Delete item deletes the conversation', () => {
    const deleteConversation = vi.fn().mockResolvedValue(undefined);
    const startRename = vi.fn();
    const host = makeHost({
      plugin: { deleteConversation },
      tabManager: { getActiveTab: () => ({ conversationId: 'c1', state: { isStreaming: false } }) },
      getHistoryConversationOpenState: () => 'current',
    });
    buildSidePanelCallbacks(host).onConversationContextMenu('c1', event, anchorEl, startRename);
    const menu = MenuMock.instances[0];
    const [renameItem, deleteItem] = menu.items;
    renameItem.clickHandler?.();
    expect(startRename).toHaveBeenCalledTimes(1);
    deleteItem.clickHandler?.();
    expect(deleteConversation).toHaveBeenCalledWith('c1');
  });
});
