import { type App, Notice } from 'obsidian';
import { nextTick } from 'vue';

import type { ProviderCommandDropdownConfig } from '../../../core/providers/commands/ProviderCommandCatalog';
import type { ProviderCommandEntry } from '../../../core/providers/commands/ProviderCommandEntry';
import { getEnabledProviderForModel, getProviderForModel } from '../../../core/providers/modelRouting';
import { ProviderRegistry } from '../../../core/providers/ProviderRegistry';
import type { ProviderChatUIConfig, ProviderId } from '../../../core/providers/types';
import { DEFAULT_CHAT_PROVIDER_ID } from '../../../core/providers/types';
import { t } from '../../../i18n/i18n';
import type SpecoratorPlugin from '../../../main';
import { SlashCommandDropdown } from '../../../shared/components/SlashCommandDropdown';
import { getEnhancedPath } from '../../../utils/env';
import { resolveOpenableVaultPath } from '../../../utils/fileLink';
import { getVaultPath } from '../../../utils/path';
import { resolveModelContextWindow } from '../../settings/customModels/resolveModelContextWindow';
import { ChatDropController } from '../controllers/ChatDropController';
import type { DragManagerLike } from '../controllers/dropPayloadDetection';
import { BangBashService } from '../services/BangBashService';
import { BangBashModeManager as BangBashModeManagerClass } from '../ui/BangBashModeManager';
import { FileContextManager } from '../ui/FileContext';
import { ImageContextManager } from '../ui/ImageContext';
import { InstructionModeManager as InstructionModeManagerClass } from '../ui/InstructionModeManager';
import { autoResizeTextarea } from '../ui/textareaResize';
import { ExternalContextSelector } from '../ui/toolbar/ExternalContextSelector';
import { McpServerSelector } from '../ui/toolbar/McpServerSelector';
import type { ToolbarCallbacks, ToolbarSettings } from '../ui/toolbar/shared';
import { recalculateUsageForModel } from '../utils/usageInfo';
import { getTabProviderId } from './providerResolution';
import { getBlankTabModelOptions } from './tabModelPolicy';
import {
  applyProviderUIGating,
  cleanupTabRuntime,
  commitModelPickToProviderSettings,
  ensureTitleGenerationService,
  getProviderMcpManager,
  getTabCapabilities,
  getTabChatUIConfig,
  getTabHiddenCommands,
  getTabPermissionMode,
  getTabSettingsSnapshot,
  type ProviderCatalogInfo,
  refreshTabProviderUI,
  resolveBoundAgentDisplayModel,
  syncSlashCommandDropdownForProvider,
  syncTabProviderServices,
  updatePlanModeUI,
  updateTabProviderSettings,
} from './tabShared';
import type { TabData } from './types';

function initializeContextManagers(tab: TabData, plugin: SpecoratorPlugin): void {
  const { dom } = tab;
  const app = plugin.app;

  // Chip/image mutations happen through the engine (mention selection, drop,
  // paste); re-project so the Vue composer's chip slice stays live. Emit FIRST,
  // then recompute context-row visibility (+ resize) on Vue's NEXT tick, where
  // the chip visibility classes land — a synchronous read would toggle
  // .has-content off STALE pre-patch DOM (first chip hidden, last-chip left empty).
  const onContextChanged = (): void => {
    tab.composer?.emit();
    void nextTick(() => {
      tab.controllers.selectionController?.updateContextRowVisibility();
      tab.controllers.browserSelectionController?.updateContextRowVisibility();
      tab.controllers.canvasSelectionController?.updateContextRowVisibility();
      autoResizeTextarea(dom.inputEl);
    });
  };

  // File context manager - chips in contextRowEl, dropdown in inputContainerEl
  tab.ui.fileContextManager = new FileContextManager(
    app,
    dom.contextRowEl,
    dom.inputEl,
    {
      getExcludedTags: () => plugin.settings.excludedTags,
      onChipsChanged: onContextChanged,
      getExternalContexts: () => tab.ui.externalContextSelector?.getExternalContexts() || [],
    },
    dom.inputContainerEl, tab.controllers.composerDropdownCoordinator ?? undefined,
  );
  tab.ui.fileContextManager.setMcpManager(getProviderMcpManager(getTabProviderId(tab, plugin)));

  // Image context manager - drag/drop uses inputContainerEl; the preview strip is
  // now Vue-owned (ImageChips.vue in the context row), so no preview container.
  tab.ui.imageContextManager = new ImageContextManager(
    dom.inputContainerEl,
    dom.inputEl,
    { onImagesChanged: onContextChanged }
  );

  tab.ui.chatDropController = new ChatDropController(dom.inputContainerEl, {
    fileContext: tab.ui.fileContextManager,
    imageContext: tab.ui.imageContextManager,
    getVaultPath: () => getVaultPath(app) ?? '',
    getExternalContexts: () => tab.ui.externalContextSelector?.getExternalContexts() || [],
    getDragManager: () => {
      const dragMgr = (app as unknown as { dragManager?: unknown }).dragManager;
      return (dragMgr as DragManagerLike | null) ?? null;
    },
    inputEl: dom.inputEl,
  });
  tab.ui.chatDropController.init();
}

function initializeSlashCommands(
  tab: TabData,
  getHiddenCommands?: () => Set<string>,
  catalogInfo?: { config: ProviderCommandDropdownConfig; getEntries: () => Promise<ProviderCommandEntry[]> } | null,
): void {
  const { dom } = tab;

  tab.ui.slashCommandDropdown = new SlashCommandDropdown(
    dom.inputContainerEl,
    dom.inputEl,
    {
      onSelect: () => {},
      onHide: () => {},
    },
    {
      hiddenCommands: getHiddenCommands?.() ?? new Set(),
      providerConfig: catalogInfo?.config,
      getProviderEntries: catalogInfo?.getEntries, coordinator: tab.controllers.composerDropdownCoordinator ?? undefined,
    }
  );
}

/**
 * Initializes instruction mode and todo panel for a tab.
 */
function initializeInstructionAndTodo(tab: TabData, plugin: SpecoratorPlugin): void {
  const { dom } = tab;

  syncTabProviderServices(tab, plugin);
  ensureTitleGenerationService(tab, plugin);
  tab.ui.instructionModeManager = new InstructionModeManagerClass(
    dom.inputEl,
    {
      onSubmit: async (rawInstruction) => {
        await tab.controllers.inputController?.handleInstructionSubmit(rawInstruction);
      },
      getInputWrapper: () => dom.inputWrapper,
      onModeChanged: () => tab.composer?.emit(),
    }
  );

  // Bang bash mode (! command execution)
  if (isBangBashEnabled(plugin.settings)) {
    const vaultPath = getVaultPath(plugin.app);
    if (vaultPath) {
      const enhancedPath = getEnhancedPath();
      const bashService = new BangBashService(vaultPath, enhancedPath);

      tab.ui.bangBashModeManager = new BangBashModeManagerClass(
        dom.inputEl,
        {
          onSubmit: async (command) => {
            const store = tab.bashOutputs;
            if (!store) return;

            const id = `bash-${Date.now()}`;
            store.add({ id, command, status: 'running', output: '' });

            const result = await bashService.execute(command);
            const output = [result.stdout, result.stderr, result.error].filter(Boolean).join('\n').trim();
            const status = result.exitCode === 0 ? 'completed' : 'error';
            store.update(id, { status, output, exitCode: result.exitCode });
          },
          getInputWrapper: () => dom.inputWrapper,
          onModeChanged: () => tab.composer?.emit(),
        }
      );
    }
  }
}

function isBangBashEnabled(settings: Record<string, unknown>): boolean {
  return ProviderRegistry.getEnabledProviderIds(settings).some((providerId) => (
    ProviderRegistry.getChatUIConfig(providerId).isBangBashEnabled?.(settings) ?? false
  ));
}

/**
 * On a bound-agent conversation the per-turn model resolves live from the agent,
 * so a manual pick must become a real per-tab override (`pinnedModel`) or the
 * send would silently run on the agent's saved model while the selector shows
 * the pick. No-op for unbound conversations. Re-evaluated on every pick because
 * `onModelChange` clears any prior pin first.
 */
async function pinModelIfBoundAgentConversation(
  tab: TabData,
  plugin: SpecoratorPlugin,
  model: string,
): Promise<void> {
  if (!tab.conversationId) return;
  const conversation = await plugin.getConversationById(tab.conversationId);
  if (await resolveBoundAgentDisplayModel(plugin, conversation)) {
    tab.pinnedModel = model;
  }
}

/**
 * Creates and wires the input toolbar for a tab.
 */
async function applyBlankTabModelChange(
  tab: TabData,
  plugin: SpecoratorPlugin,
  model: string,
  pickedProvider: ProviderId,
  getProviderCatalogConfig?: () => ProviderCatalogInfo,
  onProviderChanged?: (providerId: ProviderId) => void | Promise<void>,
): Promise<void> {
  commitModelPickToProviderSettings(plugin, pickedProvider, model);
  const previousProvider = tab.providerId;
  tab.draftModel = model;
  const didProviderChange = pickedProvider !== previousProvider;
  if (tab.service) {
    // Await so the outgoing runtime's CLI process exits before the next
    // send constructs a replacement for the newly selected provider.
    await cleanupTabRuntime(tab);
  }
  tab.providerId = pickedProvider;
  if (didProviderChange) {
    syncTabProviderServices(tab, plugin);
  }
  syncSlashCommandDropdownForProvider(tab, plugin, getProviderCatalogConfig);

  const uiConfig = ProviderRegistry.getChatUIConfig(pickedProvider);
  await updateTabProviderSettings(tab, plugin, (settings) => {
    settings.model = model;
    uiConfig.applyModelDefaults(model, settings);
  });
  if (didProviderChange) {
    await onProviderChanged?.(pickedProvider);
  }
  await uiConfig.prepareModelMetadata?.(model, plugin.settings, { plugin });
  // The toolbar is Vue; applyProviderUIGating re-projects (tab.composer.emit).
  applyProviderUIGating(tab, plugin);
}

// Resolves the ToolbarSettings the model selector displays: pinned model >
// blank-tab draft > conversation-keyed bound-agent display seed > provider
// snapshot. Shared by the imperative toolbar callbacks and the Vue composer
// toolbar projection so both surfaces read the SAME model.
export function getComposerToolbarSettings(tab: TabData, plugin: SpecoratorPlugin): ToolbarSettings {
  const snapshot = getTabSettingsSnapshot(tab, plugin);
  if (typeof tab.pinnedModel === 'string' && tab.pinnedModel.trim()) {
    return { ...snapshot, model: tab.pinnedModel.trim() };
  }
  if (tab.lifecycleState === 'blank' && typeof tab.draftModel === 'string' && tab.draftModel.trim()) {
    return { ...snapshot, model: tab.draftModel.trim() };
  }
  if (tab.displayModel && tab.displayModel.conversationId === tab.conversationId && tab.displayModel.model.trim()) {
    return { ...snapshot, model: tab.displayModel.model.trim() };
  }
  return snapshot;
}

// Builds the toolbar action callbacks. Truth + I/O stay in these closures; the
// Vue toolbar widgets (via the composer delegators) fire the SAME callbacks, so
// a widget mutation is indistinguishable from a programmatic one to the engine.
export function buildToolbarActionCallbacks(
  tab: TabData,
  plugin: SpecoratorPlugin,
  getProviderCatalogConfig?: () => ProviderCatalogInfo,
  onProviderChanged?: (providerId: ProviderId) => void | Promise<void>,
): ToolbarCallbacks {
  // Blank-tab UI config wrapper that returns mixed model options
  const blankTabUIConfigProxy = (): ProviderChatUIConfig => {
    const draftProvider = tab.draftModel
      ? getEnabledProviderForModel(tab.draftModel, plugin.settings)
      : DEFAULT_CHAT_PROVIDER_ID;
    const baseConfig = ProviderRegistry.getChatUIConfig(draftProvider);
    return {
      ...baseConfig,
      getModelOptions: (settings: Record<string, unknown>) =>
        getBlankTabModelOptions(settings),
    };
  };

  return {
    getUIConfig: () => {
      if (tab.lifecycleState === 'blank') {
        return blankTabUIConfigProxy();
      }
      return getTabChatUIConfig(tab, plugin);
    },
    getCapabilities: () => getTabCapabilities(tab, plugin),
    getSettings: () => getComposerToolbarSettings(tab, plugin),
    getEnvironmentVariables: () => plugin.getActiveEnvironmentVariables(),
    onModelChange: async (model: string) => {
      const isBlank = tab.lifecycleState === 'blank';
      const pickedProvider = isBlank
        ? getEnabledProviderForModel(model, plugin.settings)
        : getTabProviderId(tab, plugin);
      if (!isBlank && getProviderForModel(model, plugin.settings) !== pickedProvider) {
        new Notice(t('chat.tab.providerSwitchBlocked'));
        // Re-project so the Vue ModelSelector snaps back to the current model.
        tab.composer?.emit();
        return;
      }

      // Manual model pick on a task-run tab overrides the work-order pin.
      // Cleared before the provider/draft branches so the new value takes effect
      // on every subsequent turn rather than getting shadowed by the old pin.
      if (typeof tab.pinnedModel === 'string' && tab.pinnedModel.trim() !== model) {
        tab.pinnedModel = null;
      }

      // An explicit pick supersedes the bound-agent display seed on the SAME
      // conversation (the key wouldn't invalidate it), so clear it outright. On a
      // bound conversation the pick is then re-pinned below so it actually wins;
      // otherwise the selector falls back to settings.model.
      if (tab.displayModel) {
        tab.displayModel = null;
      }

      // For blank tabs, update draft model and derive provider
      if (isBlank) {
        await applyBlankTabModelChange(
          tab,
          plugin,
          model,
          pickedProvider,
          getProviderCatalogConfig,
          onProviderChanged,
        );
        return;
      }

      // Turn an explicit pick on a bound-agent conversation into a real per-tab
      // override so the send uses it instead of the agent's live model.
      await pinModelIfBoundAgentConversation(tab, plugin, model);

      const uiConfig: ProviderChatUIConfig = getTabChatUIConfig(tab, plugin);
      const providerSettings = await updateTabProviderSettings(tab, plugin, (settings) => {
        settings.model = model;
        uiConfig.applyModelDefaults(model, settings);
      });
      await uiConfig.prepareModelMetadata?.(model, plugin.settings, { plugin });

      // Recalculate context usage percentage for the new model's context window
      const currentUsage = tab.state.usage;
      if (currentUsage) {
        const newContextWindow = resolveModelContextWindow(
          uiConfig,
          providerSettings,
          model,
          providerSettings.customContextLimits,
        );
        tab.state.usage = recalculateUsageForModel(currentUsage, model, newContextWindow);
      }
    },
    onModeChange: async (mode: string) => {
      await updateTabProviderSettings(tab, plugin, (settings) => {
        getTabChatUIConfig(tab, plugin).applyModeSelection?.(mode, settings);
      });
      tab.composer?.emit();
    },
    onThinkingBudgetChange: async (budget: string) => {
      await updateTabProviderSettings(tab, plugin, (settings) => {
        settings.thinkingBudget = budget;
        getTabChatUIConfig(tab, plugin).applyReasoningSelection?.(settings.model, budget, settings);
      });
    },
    onEffortLevelChange: async (effort: string) => {
      await updateTabProviderSettings(tab, plugin, (settings) => {
        settings.effortLevel = effort;
        getTabChatUIConfig(tab, plugin).applyReasoningSelection?.(settings.model, effort, settings);
      });
    },
    onServiceTierChange: async (serviceTier: string) => {
      await updateTabProviderSettings(tab, plugin, (settings) => {
        settings.serviceTier = serviceTier;
      });
      tab.composer?.emit();
    },
    onPermissionModeChange: async (mode: string) => {
      await updateTabProviderSettings(tab, plugin, (settings) => {
        const uiConfig = getTabChatUIConfig(tab, plugin);
        if (uiConfig.applyPermissionMode) {
          uiConfig.applyPermissionMode(mode, settings);
        } else {
          settings.permissionMode = mode;
        }
      });
      await maybeWarnYoloMode(plugin, mode);
      // Vue owns the permission/plan-mode widgets; re-project so they repaint.
      tab.composer?.emit();
    },
    onPlanModeToggle: async () => {
      const planValue = getTabChatUIConfig(tab, plugin).getPermissionModeToggle?.()?.planValue;
      if (!planValue || !getTabCapabilities(tab, plugin).supportsPlanMode) {
        return;
      }
      const current = getTabPermissionMode(tab, plugin);
      if (current === planValue) {
        const restoreMode = tab.state.prePlanPermissionMode ?? 'normal';
        tab.state.prePlanPermissionMode = null;
        updatePlanModeUI(tab, plugin, restoreMode);
      } else {
        tab.state.prePlanPermissionMode = current;
        updatePlanModeUI(tab, plugin, planValue);
      }
    },
  };
}

function initializeInputToolbar(
  tab: TabData,
  plugin: SpecoratorPlugin,
): void {
  // The toolbar is now fully Vue (ComposerToolbar.vue renders the nine widgets
  // from the projected store). Only the two non-visual engine objects that own
  // the truth the engine reads/mutates outside the toolbar are constructed here;
  // their DOM-render layer was stripped in the Phase 2 cutover.
  tab.ui.externalContextSelector = new ExternalContextSelector();
  tab.ui.mcpServerSelector = new McpServerSelector();

  tab.ui.mcpServerSelector.setMcpManager(getProviderMcpManager(getTabProviderId(tab, plugin)));

  // Sync @-mentions to UI selector
  tab.ui.fileContextManager?.setOnMcpMentionChange((servers) => {
    tab.ui.mcpServerSelector?.addMentionedServers(servers);
    tab.composer?.emit();
  });

  // Wire external context changes. Fires AFTER the async folder picker resolves
  // and on every remove/persistence change, so it is the async-safe re-projection
  // driver for the composer's external-context slice (never emits the stale list).
  tab.ui.externalContextSelector.setOnChange(() => {
    tab.ui.fileContextManager?.preScanExternalContexts();
    tab.composer?.emit();
  });

  // Initialize persistent paths
  tab.ui.externalContextSelector.setPersistentPaths(
    plugin.settings.persistentExternalContextPaths || []
  );

  // Wire persistence changes
  tab.ui.externalContextSelector.setOnPersistenceChange((paths) => {
    plugin.settings.persistentExternalContextPaths = paths;
    void plugin.saveSettings();
    // Re-project so the composer's external-context lock state repaints.
    tab.composer?.emit();
  });

  refreshTabProviderUI(tab, plugin);

  // Gate provider-specific UI elements
  applyProviderUIGating(tab, plugin);
}

export interface InitializeTabUIOptions {
  getProviderCatalogConfig?: () => ProviderCatalogInfo;
}

/**
 * Initializes the tab's UI components.
 * Call this after the tab is created and before it becomes active.
 */
export function initializeTabUI(
  tab: TabData,
  plugin: SpecoratorPlugin,
  options: InitializeTabUIOptions = {}
): void {
  const { dom, state } = tab;

  // Initialize context managers (file/image)
  initializeContextManagers(tab, plugin);

  // The editor/browser/canvas selection indicators are now Vue-rendered
  // (SelectionIndicators.vue) and their raw nodes are registered to `dom.*`
  // by mountTabComposer, which runs before this. The engine only reads them.

  const catalogInfo = options.getProviderCatalogConfig?.() ?? null;
  initializeSlashCommands(
    tab,
    () => getTabHiddenCommands(tab, plugin),
    catalogInfo,
  );

  initializeInstructionAndTodo(tab, plugin);
  initializeInputToolbar(tab, plugin);

  state.callbacks = {
    ...state.callbacks,
    onUsageChanged: () => {
      // Usage truth lives in ChatState.usage; re-project so the Vue
      // ContextUsageMeter repaints (the imperative render object is gone).
      tab.composer?.emit();
    },
    onTodosChanged: () => tab.tabChrome?.emit(),
    // Edited-files truth lives in ChatState.editedFiles; the Vue EditedFilesBar
    // renders it off the projected store slice, so this only re-projects.
    onEditedFilesChanged: () => {
      autoResizeTextarea(dom.inputEl);
      tab.composer?.emit();
    },
  };
}

// Opens a file from the agent-edited-files strip. Re-resolves at click time so a
// file deleted after it was listed surfaces a Notice instead of opening nothing.
export function openEditedFile(app: App, rawPath: string): void {
  const openPath = resolveOpenableVaultPath(app, rawPath);
  if (!openPath) {
    new Notice(t('chat.fileOpen.notFound', { path: rawPath }));
    return;
  }
  void app.workspace.openLinkText(openPath, '', 'tab');
}

// SECURITY (SEC-1): 'yolo' maps to SDK bypassPermissions — tools run with no
// approval UI. Warn the user the first time they opt in, then persist a flag so
// the Notice shows only once.
export async function maybeWarnYoloMode(plugin: SpecoratorPlugin, mode: string): Promise<void> {
  if (mode !== 'yolo' || plugin.settings.yoloModeWarningShown) {
    return;
  }
  plugin.settings.yoloModeWarningShown = true;
  await plugin.saveSettings();
  new Notice(t('chat.permissionMode.yoloWarning'), 12000);
}

