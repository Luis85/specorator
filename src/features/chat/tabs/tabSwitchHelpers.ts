/**
 * Specorator - Tab-switch post-activation helpers.
 *
 * Extracted from TabManager.switchToTab to keep it below the complexity
 * thresholds. The branch-heavy decision of what to do after a tab becomes
 * active (hydrate, passively sync, or initialize a welcome greeting) is pure
 * and depends only on tab state, so it lives here as a classifier.
 */

import type SpecoratorPlugin from '../../../main';
import { deactivateTab } from './Tab';
import type { TabData, TabId } from './types';

export type PostActivateAction = 'hydrate' | 'passive-sync' | 'init-welcome' | 'none';

/** Deactivates the outgoing tab when switching away from it to a different tab. */
export function deactivatePreviousTab(
  tabs: Map<TabId, TabData>,
  previousTabId: TabId | null,
  nextTabId: TabId,
): void {
  if (!previousTabId || previousTabId === nextTabId) return;
  const currentTab = tabs.get(previousTabId);
  if (currentTab) {
    deactivateTab(currentTab);
  }
}

/**
 * Decides what to do once a tab has been activated.
 *
 * `isHydrating` covers the window between the instant tab swap + spinner render
 * in `switchTo` and the async transcript load resolving — without this guard a
 * re-activation in that window would restart the hydration mid-flight. Passive
 * sync is only safe once local tab state has been persisted.
 */
export function classifyPostActivateAction(tab: TabData): PostActivateAction {
  const { state } = tab;
  const isEmpty = state.messages.length === 0;

  if (!tab.conversationId) {
    return isEmpty ? 'init-welcome' : 'none';
  }
  if (isEmpty) {
    // Always re-hydrate an empty transcript. `switchTo` aborts any in-flight
    // hydration, so a stuck `isHydrating` flag must not block history reload
    // when the user re-opens the same conversation or switches back to a tab
    // whose Phase-B load never landed.
    return 'hydrate';
  }

  const canPassiveSync = tab.service && !state.isStreaming && !state.hasPendingConversationSave;
  return canPassiveSync ? 'passive-sync' : 'none';
}

/**
 * Pushes the latest persisted conversation snapshot into an already-loaded
 * tab's runtime. No-op when the conversation is missing from the cache.
 */
export function passiveSyncTabConversation(plugin: SpecoratorPlugin, tab: TabData): void {
  if (!tab.conversationId || !tab.service) return;
  const conversation = plugin.getConversationSync(tab.conversationId);
  if (!conversation) return;

  const hasMessages = conversation.messages.length > 0;
  const externalContextPaths = hasMessages
    ? conversation.externalContextPaths || []
    : (plugin.settings.persistentExternalContextPaths || []);

  tab.service.syncConversationState(conversation, externalContextPaths);
}

/** Runs the post-activation action classified for `tab` (see {@link classifyPostActivateAction}). */
export async function applyPostActivateAction(plugin: SpecoratorPlugin, tab: TabData): Promise<void> {
  switch (classifyPostActivateAction(tab)) {
    case 'hydrate':
      await tab.controllers.conversationController?.switchTo(tab.conversationId!);
      break;
    case 'passive-sync':
      passiveSyncTabConversation(plugin, tab);
      break;
    case 'init-welcome':
      tab.controllers.conversationController?.initializeWelcome();
      break;
    default:
      break;
  }
}

/**
 * Activates an already-open conversation tab and waits for hydration to settle.
 * Retries once when the transcript is still empty after Phase B (stuck bind or a
 * prior switch that only completed Phase A).
 */
export async function activateOpenConversationTab(
  switchToTab: (tabId: TabId) => Promise<void>,
  tab: TabData,
  conversationId: string,
): Promise<void> {
  await switchToTab(tab.id);
  const controller = tab.controllers.conversationController;
  await controller?.whenHydrated?.();
  if (tab.state.messages.length === 0) {
    await controller?.switchTo(conversationId);
    await controller?.whenHydrated?.();
  }
}
