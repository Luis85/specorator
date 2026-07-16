import type { Component } from 'obsidian';
import { type App as VueApp, createApp, markRaw } from 'vue';

import type SpecoratorPlugin from '../../../../../main';
import type { ComposerCallbacks } from './composerCallbacks';
import {
  APP_KEY, BROWSER_INDICATOR_KEY, CALLBACKS_KEY, CANVAS_INDICATOR_KEY, COMPONENT_KEY,
  CONTEXT_ROW_KEY, INPUT_CONTAINER_KEY, INPUT_EL_KEY, INPUT_WRAPPER_KEY, NAV_ROW_KEY,
  PLUGIN_KEY, QUEUE_ROW_KEY, SELECTION_INDICATOR_KEY,
} from './composerKeys';
import { createComposerPinia } from './composerPinia';
import ComposerRoot from './ComposerRoot.vue';

/** Handle to a per-tab mounted composer island. */
export interface MountedComposer {
  app: VueApp;
  unmount: () => void;
}

/**
 * Mounts the Vue composer island for one chat tab. Per-tab mirror of
 * `mountTranscript`: a FRESH per-leaf Pinia (never a shared singleton — each tab
 * owns its own input state), the App/Component/Plugin/Callbacks provides, and the
 * element-handle keys wired to `callbacks.register*`. The host SFCs invoke those
 * registers in their `onMounted` (children mount before the parent, all during
 * `app.mount()`), so every `tab.dom.*` handle is set before this returns.
 *
 * `markRaw` on the Obsidian objects: they are large and cyclic — never deep-proxy.
 */
export function mountComposer(
  containerEl: HTMLElement,
  plugin: SpecoratorPlugin,
  component: Component,
  callbacks: ComposerCallbacks,
): MountedComposer {
  const app = createApp(ComposerRoot);
  app.use(createComposerPinia());
  app.provide(APP_KEY, markRaw(plugin.app));
  app.provide(COMPONENT_KEY, markRaw(component));
  app.provide(PLUGIN_KEY, markRaw(plugin));
  app.provide(CALLBACKS_KEY, markRaw(callbacks));
  app.provide(INPUT_CONTAINER_KEY, callbacks.registerInputContainer);
  app.provide(NAV_ROW_KEY, callbacks.registerNavRow);
  app.provide(INPUT_WRAPPER_KEY, callbacks.registerInputWrapper);
  app.provide(CONTEXT_ROW_KEY, callbacks.registerContextRow);
  app.provide(QUEUE_ROW_KEY, callbacks.registerQueueRow);
  app.provide(INPUT_EL_KEY, callbacks.registerInputEl);
  app.provide(SELECTION_INDICATOR_KEY, callbacks.registerSelectionIndicator);
  app.provide(BROWSER_INDICATOR_KEY, callbacks.registerBrowserIndicator);
  app.provide(CANVAS_INDICATOR_KEY, callbacks.registerCanvasIndicator);
  app.mount(containerEl);

  return { app, unmount: () => app.unmount() };
}
