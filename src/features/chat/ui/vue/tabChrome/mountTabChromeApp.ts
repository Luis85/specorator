import type { Component } from 'obsidian';
import { type App as VueApp, createApp, markRaw, shallowRef } from 'vue';

import type SpecoratorPlugin from '../../../../../main';
import type { TabChromeCallbacks } from './tabChromeCallbacks';
import { APP_KEY, CALLBACKS_KEY, COMPONENT_KEY, NAV_HOST_KEY, PLUGIN_KEY, SCROLL_HOST_KEY } from './tabChromeKeys';
import { createTabChromePinia } from './tabChromePinia';
import TabChromeRoot from './TabChromeRoot.vue';

/** Handle to a per-tab mounted tab-chrome island. */
export interface MountedTabChrome {
  app: VueApp;
  unmount: () => void;
  /** Pushes the transcript's live scroll host to NavOverlay, post-transcript-mount. */
  setScrollHost: (el: HTMLElement | null) => void;
}

/**
 * Mounts the Vue tab-chrome island for one chat tab. Per-tab mirror of
 * `mountComposer`: a FRESH per-leaf Pinia, the App/Component/Plugin/Callbacks
 * provides, plus a reactive SCROLL_HOST_KEY ref (NavOverlay watches it) and the
 * NAV_HOST_KEY teleport-target resolver.
 */
export function mountTabChromeApp(
  containerEl: HTMLElement,
  plugin: SpecoratorPlugin,
  component: Component,
  callbacks: TabChromeCallbacks,
): MountedTabChrome {
  const scrollHost = shallowRef<HTMLElement | null>(null);

  const app = createApp(TabChromeRoot);
  app.use(createTabChromePinia());
  app.provide(APP_KEY, markRaw(plugin.app));
  app.provide(COMPONENT_KEY, markRaw(component));
  app.provide(PLUGIN_KEY, markRaw(plugin));
  app.provide(CALLBACKS_KEY, markRaw(callbacks));
  app.provide(SCROLL_HOST_KEY, scrollHost);
  app.provide(NAV_HOST_KEY, callbacks.resolveNavHost);
  app.mount(containerEl);

  return {
    app,
    unmount: () => app.unmount(),
    setScrollHost: (el) => { scrollHost.value = el; },
  };
}
