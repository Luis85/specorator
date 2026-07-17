import { Menu, Notice } from 'obsidian';

import { t } from '../../../../i18n/i18n';
import type SpecoratorPlugin from '../../../../main';
import type { TabManager } from '../../tabs/TabManager';
import type { ChatShellCallbacks } from './chatShellCallbacks';
import type { HistoryConversationOpenState } from './stores/chatShellStore';

/**
 * The view-owned surface `buildSidePanelCallbacks` needs, satisfied by
 * `SpecoratorView` passed as `this`. Kept minimal so the delegators/module-local
 * methods below don't need the whole view.
 */
export interface SidePanelCallbackHost {
  readonly plugin: SpecoratorPlugin;
  readonly tabManager: TabManager | null;
  emitChatShellChange(): void;
  getHistoryConversationOpenState(id: string): HistoryConversationOpenState;
  sendGitCommitPromptToActiveTab(): void;
}

/**
 * Builds the side-panel slice of `ChatShellCallbacks` — conversation history
 * (select/rename/delete/regenerate-title/context-menu), work-order activity
 * (open/close), and the git-commit action. Extracted from `SpecoratorView` so
 * the view stays under its LOC ceiling; these started as independent copies of
 * the now-deleted imperative `ConversationHistoryView`'s private methods,
 * ported to read through `host` instead of `this` — they are now the single
 * source of truth these behaviors, consumed by `ConversationHistoryDropdown.vue`.
 */
export function buildSidePanelCallbacks(
  host: SidePanelCallbackHost,
): Pick<
  ChatShellCallbacks,
  | 'onSelectConversation'
  | 'onOpenConversationInNewTab'
  | 'onRenameConversation'
  | 'onDeleteConversation'
  | 'onRegenerateConversationTitle'
  | 'onConversationContextMenu'
  | 'onOpenWorkOrderItem'
  | 'onCloseWorkOrderTab'
  | 'onGitCommit'
> {
  return {
    onSelectConversation: (id) => {
      void host.tabManager?.openConversation(id).catch(() => new Notice(t('chat.history.loadFailed')));
    },
    onOpenConversationInNewTab: (id, activate) => {
      void host.tabManager?.openConversation(id, { requireNewTab: true, activate })
        .catch(() => new Notice(t('chat.history.loadFailed')));
    },
    onRenameConversation: (id, title) => {
      void host.plugin.renameConversation(id, title.trim() || title)
        .then(() => host.emitChatShellChange())
        .catch(() => new Notice(t('chat.history.renameFailed')));
    },
    onDeleteConversation: (id) => { void deleteHistoryConversation(host, id); },
    onRegenerateConversationTitle: (id) => {
      void regenerateHistoryTitle(host, id).catch(() => new Notice(t('chat.history.regenerateFailed')));
    },
    onConversationContextMenu: (id, event, startRename, closeDropdown) =>
      showHistoryContextMenu(host, id, event, startRename, closeDropdown),
    onOpenWorkOrderItem: (id) => { void host.plugin.workOrderActivity?.openItem(id); },
    onCloseWorkOrderTab: (tabId) => { void host.plugin.workOrderActivity?.closeTab(tabId); },
    onGitCommit: () => host.sendGitCommitPromptToActiveTab(),
  };
}

async function deleteHistoryConversation(host: SidePanelCallbackHost, conversationId: string): Promise<void> {
  const activeTab = host.tabManager?.getActiveTab();
  if (activeTab?.state.isStreaming) return;
  try {
    await host.plugin.deleteConversation(conversationId);
    host.emitChatShellChange();
    if (conversationId === activeTab?.conversationId) {
      await activeTab.controllers.conversationController?.loadActive();
    }
  } catch {
    new Notice(t('chat.history.deleteFailed'));
  }
}

async function regenerateHistoryTitle(host: SidePanelCallbackHost, conversationId: string): Promise<void> {
  if (!host.plugin.settings.enableAutoTitleGeneration) return;
  const fullConv = await host.plugin.getConversationById(conversationId);
  if (!fullConv || fullConv.messages.length < 1) return;
  const titleService = host.tabManager?.getActiveTab()?.services.titleGenerationService ?? null;
  if (!titleService) return;
  const firstUserMsg = fullConv.messages.find((m) => m.role === 'user');
  if (!firstUserMsg) return;
  const userContent = firstUserMsg.displayContent || firstUserMsg.content;
  const expectedTitle = fullConv.title;
  await host.plugin.updateConversation(conversationId, { titleGenerationStatus: 'pending' });
  host.emitChatShellChange();
  await titleService.generateTitle(conversationId, userContent, async (convId, result) => {
    const currentConv = await host.plugin.getConversationById(convId);
    if (!currentConv) return;
    const userManuallyRenamed = currentConv.title !== expectedTitle;
    if (result.success && !userManuallyRenamed) {
      await host.plugin.renameConversation(convId, result.title);
      await host.plugin.updateConversation(convId, { titleGenerationStatus: 'success' });
    } else if (!userManuallyRenamed) {
      await host.plugin.updateConversation(convId, { titleGenerationStatus: 'failed' });
    } else {
      await host.plugin.updateConversation(convId, { titleGenerationStatus: undefined });
    }
    host.emitChatShellChange();
  });
}

function showHistoryContextMenu(
  host: SidePanelCallbackHost,
  conversationId: string,
  event: MouseEvent,
  startRename: () => void,
  closeDropdown: () => void,
): void {
  const activeTab = host.tabManager?.getActiveTab();
  const isCurrent = activeTab?.conversationId === conversationId;
  const openState = host.getHistoryConversationOpenState(conversationId);
  const menu = new Menu();
  // The navigation items close the history panel after dispatching, matching the
  // deleted view's openHistoryConversation*/closeHistoryDropdown pairing (the
  // Rename/Delete items keep it open — rename edits in-place, delete re-projects).
  if (!isCurrent) {
    if (openState === 'closed') {
      menu.addItem((mi) => mi.setTitle('Open in new tab').onClick(() => {
        closeDropdown();
        void host.tabManager?.openConversation(conversationId, { requireNewTab: true, activate: true })
          .catch(() => new Notice(t('chat.history.loadFailed')));
      }));
      menu.addItem((mi) => mi.setTitle('Open in background tab').onClick(() => {
        closeDropdown();
        void host.tabManager?.openConversation(conversationId, { requireNewTab: true, activate: false })
          .catch(() => new Notice(t('chat.history.loadFailed')));
      }));
    } else if (openState === 'open') {
      menu.addItem((mi) => mi.setTitle('Switch to open session').onClick(() => {
        closeDropdown();
        void host.tabManager?.openConversation(conversationId).catch(() => new Notice(t('chat.history.loadFailed')));
      }));
    }
  }
  menu.addItem((mi) => mi.setTitle('Rename').onClick(() => startRename()));
  menu.addItem((mi) => mi.setTitle('Delete').onClick(() => { void deleteHistoryConversation(host, conversationId); }));
  menu.showAtMouseEvent(event);
}
