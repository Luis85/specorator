import type { Component } from 'obsidian';

import type { ProviderId } from '../../../core/providers/types';
import type SpecoratorPlugin from '../../../main';
import type { ComposerCallbacks } from '../ui/vue/composer/composerCallbacks';
import { mountComposer } from '../ui/vue/composer/mountComposer';
import { TabComposerProjection } from './tabComposer';
import type { ProviderCatalogInfo } from './tabShared';
import { buildToolbarActionCallbacks, openEditedFile } from './tabUi';
import type { TabData } from './types';

/**
 * Toolbar-action wiring the model-picker needs on a blank-tab provider switch:
 * the provider's command catalog (for slash-command refresh) and the
 * provider-changed notification (header indicator + command prewarm). Threaded
 * from `TabManager` so the Vue toolbar path is behaviorally identical to the
 * former imperative `createInputToolbar` path.
 */
export interface ComposerToolbarWiring {
  getProviderCatalogConfig?: () => ProviderCatalogInfo;
  onProviderChanged?: (providerId: ProviderId) => void | Promise<void>;
}

/**
 * Mounts the Vue composer island for one tab and wires the engine↔island seam.
 * Called by `TabManager` BETWEEN `createTab` and `initializeTabUI`, so the
 * element handles (container/navRow/wrapper/contextRow/queueRow/edited-files/
 * textarea-host) are registered to `tab.dom.*` before `initializeTabUI` builds
 * the context managers. The toolbar is now fully Vue (ComposerToolbar.vue).
 *
 * Mirrors `initializeTabControllers`' transcript mount. The projection reads the
 * tab lazily at emit time, so it is safe to construct before the controllers.
 */
export function mountTabComposer(
  tab: TabData,
  plugin: SpecoratorPlugin,
  component: Component,
  toolbarWiring: ComposerToolbarWiring = {},
): void {
  tab.composer = new TabComposerProjection(tab, plugin);

  // Build the toolbar action callbacks once; the Vue widgets fire these SAME
  // closures (truth + I/O stay in the engine). The catalog/provider-changed
  // wiring keeps a blank-tab provider switch identical to the old path.
  const toolbarActions = buildToolbarActionCallbacks(
    tab,
    plugin,
    toolbarWiring.getProviderCatalogConfig,
    toolbarWiring.onProviderChanged,
  );

  const callbacks: ComposerCallbacks = {
    subscribe: tab.composer.subscribe,
    onSetModel: (model) => { void toolbarActions.onModelChange(model).finally(() => tab.composer?.emit()); },
    onSetMode: (mode) => { void toolbarActions.onModeChange(mode).finally(() => tab.composer?.emit()); },
    onSetEffortLevel: (effort) => { void toolbarActions.onEffortLevelChange(effort).finally(() => tab.composer?.emit()); },
    onSetThinkingBudget: (budget) => { void toolbarActions.onThinkingBudgetChange(budget).finally(() => tab.composer?.emit()); },
    onSetServiceTier: (tier) => { void toolbarActions.onServiceTierChange(tier).finally(() => tab.composer?.emit()); },
    onSetPermission: (mode) => { void toolbarActions.onPermissionModeChange(mode).finally(() => tab.composer?.emit()); },
    onTogglePlanMode: () => { void toolbarActions.onPlanModeToggle?.().finally(() => tab.composer?.emit()); },
    onToggleMcpServer: (name) => {
      const enabled = tab.ui.mcpServerSelector?.getEnabledServers() ?? new Set<string>();
      const next = new Set(enabled);
      if (next.has(name)) next.delete(name); else next.add(name);
      tab.ui.mcpServerSelector?.setEnabledServers([...next]);
      tab.composer?.emit();
    },
    // External-context re-projection is driven by ExternalContextSelector's
    // `onChange` (Step 5), NOT synchronously here: `openFolderPicker()` is ASYNC
    // (`await remote.dialog.showOpenDialog`) and appends + fires onChange only
    // AFTER the dialog resolves; remove + persistence also route through onChange.
    // A synchronous `tab.composer?.emit()` here would project the OLD list.
    onAddExternalContext: () => { void tab.ui.externalContextSelector?.openFolderPicker(); },
    onRemoveExternalContext: (path) => { tab.ui.externalContextSelector?.removePath(path); },
    onToggleExternalContextPersistence: (path) => { tab.ui.externalContextSelector?.togglePersistence(path); },
    onRemoveChip: (key, kind) => {
      const fc = tab.ui.fileContextManager;
      if (kind === 'image') tab.ui.imageContextManager?.removeImageById(key);
      else if (kind === 'folder') fc?.detachFolderPill(key);
      else if (kind === 'current') fc?.clearCurrentNotePill();
      else fc?.detachFilePill(key);
      tab.composer?.emit();
    },
    onOpenImage: (id) => { tab.ui.imageContextManager?.openImageById(id); },
    onOpenFile: (path) => { void plugin.app.workspace.openLinkText(path, '', 'tab'); },
    onOpenEditedFile: (path) => { openEditedFile(plugin.app, path); },
    registerInputContainer: (el) => { tab.dom.inputContainerEl = el; },
    registerNavRow: (el) => { tab.dom.navRowEl = el; },
    registerInputWrapper: (el) => { tab.dom.inputWrapper = el; },
    registerContextRow: (el) => { tab.dom.contextRowEl = el; },
    registerQueueRow: (el) => {
      tab.dom.queueIndicatorEl = el;
      tab.state.queueIndicatorEl = el;
    },
    registerEditedFilesRow: (el) => { tab.dom.editedFilesRowEl = el; },
    // Phase 1–3: host the engine-created textarea. Phase 4 deletes this and
    // ComposerTextarea.vue registers INPUT_EL_KEY instead.
    registerTextareaHost: (el) => { el.appendChild(tab.dom.inputEl); },
  };

  tab.mountedComposer = mountComposer(tab.dom.composerHostEl, plugin, component, callbacks);
}
