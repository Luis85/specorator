import { ProviderRegistry } from '../../../core/providers/ProviderRegistry';
import type { ChatRuntime } from '../../../core/runtime/ChatRuntime';
import type { Conversation } from '../../../core/types';
import type SpecoratorPlugin from '../../../main';
import { cleanupThinkingBlock } from '../rendering/ThinkingBlockRenderer';
import { getTabProviderId } from './providerResolution';
import { createTabRuntimeHost } from './tabRuntimeHost';
import { isConversationLike } from './tabShared';
import type { TabData } from './types';

/**
 * Initializes the tab's chat runtime for the send path.
 *
 * This is the ONLY place a runtime is created. Called from:
 * - ensureServiceInitialized() in InputController.sendMessage()
 *
 * Session sync is passive (state update only). The runtime is started
 * on demand by query() inside the send path.
 */
export async function initializeTabService(
  tab: TabData,
  plugin: SpecoratorPlugin,
  conversationOverride?: Conversation | null,
): Promise<void>;
export async function initializeTabService(
  tab: TabData,
  plugin: SpecoratorPlugin,
  _legacyArg: unknown,
  conversationOverride?: Conversation | null,
): Promise<void>;
export async function initializeTabService(
  tab: TabData,
  plugin: SpecoratorPlugin,
  argOrOverride?: unknown,
  maybeOverride?: Conversation | null,
): Promise<void> {
  if (tab.lifecycleState === 'closing') {
    return;
  }

  // Support legacy 4-arg call sites (3rd arg was previously an MCP manager)
  const conversationOverride = isConversationLike(argOrOverride)
    ? argOrOverride
    : (argOrOverride === null ? null : maybeOverride);

  const conversation = conversationOverride ?? (
    tab.conversationId
      ? await plugin.getConversationById(tab.conversationId)
      : null
  );
  const providerId = getTabProviderId(tab, plugin, conversation);

  if (tab.serviceInitialized && tab.service?.providerId === providerId) {
    return;
  }

  if (tab.runtimeInitPromise) {
    await tab.runtimeInitPromise.catch(() => {});
    if (tab.serviceInitialized && tab.service?.providerId === providerId) {
      return;
    }
  }

  const initGeneration = (tab.runtimeInitGeneration ?? 0) + 1;
  tab.runtimeInitGeneration = initGeneration;
  const isStaleInit = (): boolean =>
    tab.lifecycleState === 'closing' || tab.runtimeInitGeneration !== initGeneration;

  const runInit = async (): Promise<void> => {
    let service: ChatRuntime | null = null;
    let unsubscribeReadyState: (() => void) | null = null;
    const previousService = tab.service;

    try {
      tab.service = null;
      tab.serviceInitialized = false;
      if (typeof previousService?.cleanup === 'function') {
        const cleanupPromise = Promise.resolve(previousService.cleanup()).finally(() => {
          if (tab.pendingRuntimeCleanup === cleanupPromise) {
            tab.pendingRuntimeCleanup = null;
          }
        });
        tab.pendingRuntimeCleanup = cleanupPromise;
        await cleanupPromise;
      }
      if (tab.pendingRuntimeCleanup) {
        await tab.pendingRuntimeCleanup;
      }
      if (isStaleInit()) {
        return;
      }

      const runtime = ProviderRegistry.createChatRuntime({
        plugin,
        providerId,
        host: createTabRuntimeHost(tab, plugin),
      });
      service = runtime;
      unsubscribeReadyState = runtime.onReadyStateChange(() => {});
      tab.dom.eventCleanups.push(() => unsubscribeReadyState?.());

      if (conversation) {
        const hasMessages = conversation.messages.length > 0;
        const externalContextPaths = hasMessages
          ? conversation.externalContextPaths || []
          : (plugin.settings.persistentExternalContextPaths || []);

        runtime.syncConversationState(conversation, externalContextPaths);
      }

      if (isStaleInit()) {
        unsubscribeReadyState?.();
        await service?.cleanup();
        return;
      }

      tab.providerId = providerId;
      tab.service = service;
      tab.serviceInitialized = true;

      if (tab.lifecycleState === 'blank') {
        tab.draftModel = null;
      }
      tab.lifecycleState = 'bound_active';
    } catch (error) {
      unsubscribeReadyState?.();
      await service?.cleanup();
      tab.service = null;
      tab.serviceInitialized = false;
      throw error;
    }
  };

  tab.runtimeInitPromise = runInit().finally(() => {
    if (tab.runtimeInitGeneration === initGeneration) {
      tab.runtimeInitPromise = null;
    }
  });
  await tab.runtimeInitPromise;
}

/**
 * Activates a tab (shows it and starts services).
 */
export function activateTab(tab: TabData): void {
  tab.dom.contentEl.removeClass('specorator-hidden');
  tab.controllers.selectionController?.start();
  tab.controllers.browserSelectionController?.start();
  tab.controllers.canvasSelectionController?.start();
  // Refresh navigation sidebar visibility (dimensions now available after display)
  tab.ui.navigationSidebar?.updateVisibility();
}

/**
 * Deactivates a tab (hides it and stops services).
 */
export function deactivateTab(tab: TabData): void {
  tab.dom.contentEl.addClass('specorator-hidden');
  tab.controllers.selectionController?.stop();
  tab.controllers.browserSelectionController?.stop();
  tab.controllers.canvasSelectionController?.stop();
}

/**
 * Stops selection/navigation controllers and disposes the conversation controller.
 */
function stopTabControllers(tab: TabData): void {
  tab.controllers.conversationController?.dispose();
  tab.controllers.selectionController?.stop();
  tab.controllers.selectionController?.clear();
  tab.controllers.browserSelectionController?.stop();
  tab.controllers.browserSelectionController?.clear();
  tab.controllers.canvasSelectionController?.stop();
  tab.controllers.canvasSelectionController?.clear();
  tab.controllers.navigationController?.dispose();
}

/** Tears down tab UI widgets and auxiliary services before DOM removal. */
function destroyTabUi(tab: TabData): void {
  tab.controllers.inputController?.dismissPendingApproval();
  tab.controllers.inputController?.destroyResumeDropdown();
  tab.ui.fileContextManager?.destroy();
  tab.ui.editedFilesView?.destroy();
  tab.ui.editedFilesView = null;
  tab.ui.chatDropController?.destroy();
  tab.ui.chatDropController = undefined;
  tab.ui.slashCommandDropdown?.destroy();
  tab.ui.slashCommandDropdown = null;
  tab.ui.instructionModeManager?.destroy();
  tab.ui.instructionModeManager = null;
  tab.ui.bangBashModeManager?.destroy();
  tab.ui.bangBashModeManager = null;
  tab.services.instructionRefineService?.cancel();
  tab.services.instructionRefineService?.resetConversation();
  tab.services.instructionRefineService = null;
  tab.services.titleGenerationService?.cancel();
  tab.services.titleGenerationService = null;
  tab.ui.statusPanel?.destroy();
  tab.ui.statusPanel = null;
  tab.ui.navigationSidebar?.destroy();
  tab.ui.navigationSidebar = null;
}

/**
 * Cleans up a tab and releases all resources.
 * Made async to ensure proper cleanup ordering.
 */
export async function destroyTab(tab: TabData): Promise<void> {
  tab.lifecycleState = 'closing';

  stopTabControllers(tab);

  cleanupThinkingBlock(tab.state.currentThinkingState);
  tab.state.currentThinkingState = null;

  destroyTabUi(tab);

  tab.services.subagentManager.orphanAllActive();
  tab.services.subagentManager.clear();

  for (const cleanup of tab.dom.eventCleanups) {
    cleanup();
  }
  tab.dom.eventCleanups.length = 0;

  // Unmount the Vue transcript island (runs its onUnmounted routing disposer)
  // before the host DOM is removed.
  tab.mountedTranscript?.unmount();
  tab.mountedTranscript = null;
  tab.transcript = null;

  // Unmount the Vue composer island before the host DOM is removed.
  tab.mountedComposer?.unmount();
  tab.mountedComposer = null;
  tab.composer = null;

  // Clean up runtime before removing DOM. Await so the provider subprocess is
  // actually killed before teardown completes (prevents orphaned CLI processes).
  if (tab.pendingRuntimeCleanup) {
    await tab.pendingRuntimeCleanup.catch(() => {});
  }
  await tab.service?.cleanup();
  tab.service = null;
  tab.dom.contentEl.remove();
}
