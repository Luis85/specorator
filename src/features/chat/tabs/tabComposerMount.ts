import type { Component } from 'obsidian';

import type SpecoratorPlugin from '../../../main';
import type { ComposerCallbacks } from '../ui/vue/composer/composerCallbacks';
import { mountComposer } from '../ui/vue/composer/mountComposer';
import { TabComposerProjection } from './tabComposer';
import type { TabData } from './types';

/**
 * Mounts the Vue composer island for one tab and wires the engine↔island seam.
 * Called by `TabManager` BETWEEN `createTab` and `initializeTabUI`, so the
 * element handles (container/navRow/wrapper/contextRow/queueRow/edited-files/
 * toolbar-host/textarea-host) are registered to `tab.dom.*` before
 * `initializeTabUI` builds the imperative toolbar + context managers into them.
 *
 * Mirrors `initializeTabControllers`' transcript mount. The projection reads the
 * tab lazily at emit time, so it is safe to construct before the controllers.
 */
export function mountTabComposer(
  tab: TabData,
  plugin: SpecoratorPlugin,
  component: Component,
): void {
  tab.composer = new TabComposerProjection(tab, plugin);

  const callbacks: ComposerCallbacks = {
    subscribe: tab.composer.subscribe,
    registerInputContainer: (el) => { tab.dom.inputContainerEl = el; },
    registerNavRow: (el) => { tab.dom.navRowEl = el; },
    registerInputWrapper: (el) => { tab.dom.inputWrapper = el; },
    registerContextRow: (el) => { tab.dom.contextRowEl = el; },
    registerQueueRow: (el) => {
      tab.dom.queueIndicatorEl = el;
      tab.state.queueIndicatorEl = el;
    },
    registerEditedFilesRow: (el) => { tab.dom.editedFilesRowEl = el; },
    registerToolbarHost: (el) => { tab.dom.toolbarHostEl = el; },
    // Phase 1–3: host the engine-created textarea. Phase 4 deletes this and
    // ComposerTextarea.vue registers INPUT_EL_KEY instead.
    registerTextareaHost: (el) => { el.appendChild(tab.dom.inputEl); },
  };

  tab.mountedComposer = mountComposer(tab.dom.composerHostEl, plugin, component, callbacks);
}
