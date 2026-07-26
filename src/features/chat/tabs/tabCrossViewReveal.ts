import type { Workspace } from 'obsidian';

import type { ChatViewHandle } from '../../../core/types/PluginContext';
import { revealWorkspaceLeaf } from '../../../utils/obsidianCompat';

/** The cross-view conversation location `findConversationAcrossViews` returns. */
export interface CrossViewConversation {
  view: ChatViewHandle;
  tabId: string;
}

/**
 * Reveals the leaf that owns a conversation opened in ANOTHER Specorator leaf and
 * switches to its tab. Shared by TabManager's pre-tail fast path and its post-tail
 * raced-open reveal (Round-63): a conversation that races into another leaf AFTER the
 * pre-tail check must still surface the winning leaf, or the user's open resolves with
 * nothing shown. Called only OUTSIDE our own mutation tail — it awaits the winning
 * leaf's queued switchToTab, which must never nest under ours (the Round-61 deadlock).
 */
export async function revealCrossViewConversation(
  workspace: Workspace,
  cross: CrossViewConversation,
): Promise<void> {
  await revealWorkspaceLeaf(workspace, cross.view.leaf);
  await cross.view.getTabManager()?.switchToTab(cross.tabId);
}
