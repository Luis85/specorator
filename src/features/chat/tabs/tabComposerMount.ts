import { type Component, Notice } from 'obsidian';

import type { ProviderId } from '../../../core/providers/types';
import { t } from '../../../i18n/i18n';
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

  // A rejected toolbar action (settings write, model-metadata prep, …) used to
  // vanish silently under `void … .finally()`; the deleted imperative widgets
  // surfaced it via a Notice (ui/toolbar/shared.ts `runToolbarAction`). Restore
  // that: catch + Notice, still emit so the widget snaps back to engine truth.
  const runToolbarAction = (action: Promise<void>, failureMessage: string): void => {
    void action.catch(() => { new Notice(failureMessage); }).finally(() => tab.composer?.emit());
  };

  const callbacks: ComposerCallbacks = {
    subscribe: tab.composer.subscribe,
    onSetModel: (model) => { runToolbarAction(toolbarActions.onModelChange(model), 'Failed to change model'); },
    onSetMode: (mode) => { runToolbarAction(toolbarActions.onModeChange(mode), 'Failed to change mode'); },
    onSetEffortLevel: (effort) => { runToolbarAction(toolbarActions.onEffortLevelChange(effort), 'Failed to change effort level'); },
    onSetThinkingBudget: (budget) => { runToolbarAction(toolbarActions.onThinkingBudgetChange(budget), 'Failed to change thinking budget'); },
    onSetServiceTier: (tier) => { runToolbarAction(toolbarActions.onServiceTierChange(tier), 'Failed to change service tier'); },
    onSetPermission: (mode) => { runToolbarAction(toolbarActions.onPermissionModeChange(mode), 'Failed to change permission mode'); },
    // Preserve the optional-call semantics: if the provider exposes no plan
    // toggle, do nothing (and do not emit), matching the old `?.()` short-circuit.
    onTogglePlanMode: () => {
      const action = toolbarActions.onPlanModeToggle?.();
      if (action) runToolbarAction(action, t('chat.planMode.toggleFailed'));
    },
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
      // Each manager mutation routes through onChipsChanged/onImagesChanged
      // (tabUi.ts `onContextChanged`), which already re-projects — no explicit
      // emit here or the chip slice would project twice per removal.
      if (kind === 'image') tab.ui.imageContextManager?.removeImageById(key);
      else if (kind === 'folder') fc?.detachFolderPill(key);
      else if (kind === 'current') fc?.clearCurrentNotePill();
      else fc?.detachFilePill(key);
    },
    onOpenImage: (id) => { tab.ui.imageContextManager?.openImageById(id); },
    onOpenFile: (path) => { openEditedFile(plugin.app, path); },
    onOpenEditedFile: (path) => { openEditedFile(plugin.app, path); },
    registerInputContainer: (el) => { tab.dom.inputContainerEl = el; },
    registerNavRow: (el) => { tab.dom.navRowEl = el; },
    registerInputWrapper: (el) => { tab.dom.inputWrapper = el; },
    registerContextRow: (el) => { tab.dom.contextRowEl = el; },
    registerQueueRow: (el) => {
      tab.dom.queueIndicatorEl = el;
      tab.state.queueIndicatorEl = el;
    },
    // Phase 1–3: host the engine-created textarea. Phase 4 deletes this and
    // ComposerTextarea.vue registers INPUT_EL_KEY instead.
    registerTextareaHost: (el) => { el.appendChild(tab.dom.inputEl); },
    // Phase 3: Vue renders the three engine-driven selection indicators; keep
    // the raw nodes so buildTabSelectionControllers (initializeTabControllers,
    // which runs AFTER this mount) reads them off tab.dom.*.
    registerSelectionIndicator: (el) => { tab.dom.selectionIndicatorEl = el; },
    registerBrowserIndicator: (el) => { tab.dom.browserIndicatorEl = el; },
    registerCanvasIndicator: (el) => { tab.dom.canvasIndicatorEl = el; },
  };

  tab.mountedComposer = mountComposer(tab.dom.composerHostEl, plugin, component, callbacks);
}
