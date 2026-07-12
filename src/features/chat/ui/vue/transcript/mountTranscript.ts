import type { Component } from 'obsidian';
import { type App as VueApp, createApp, markRaw } from 'vue';

import type SpecoratorPlugin from '../../../../../main';
import { registerFileLinkHandler } from '../../../../../utils/fileLink';
import type { TranscriptCallbacks } from './transcriptCallbacks';
import {
  APP_KEY,
  CALLBACKS_KEY,
  COMPONENT_KEY,
  PLUGIN_KEY,
  SCROLL_HOST_KEY,
} from './transcriptKeys';
import { createTranscriptPinia } from './transcriptPinia';
import TranscriptRoot from './TranscriptRoot.vue';

/** Handle to a per-tab mounted transcript island. */
export interface MountedTranscript {
  /** The Vue app; unmount via {@link MountedTranscript.unmount}. */
  app: VueApp;
  /**
   * The Vue-owned `.specorator-messages` scroll container, captured through
   * `SCROLL_HOST_KEY` during mount. Null only before mount completes. The tab
   * wiring stores this as `dom.messagesEl` so every `getMessagesEl` closure
   * (StreamController auto-scroll, NavigationController's keyboard scan, the drop
   * overlay) keeps targeting the real scrollable element.
   */
  getScrollEl: () => HTMLElement | null;
  /** Runs the island's `onUnmounted` hooks (routing disposer) and detaches it. */
  unmount: () => void;
}

/**
 * Mounts the Vue transcript island for one chat tab. Per-tab mirror of
 * `SpecoratorView.mountChatShell()`: a fresh per-leaf Pinia (never a shared
 * module singleton — each tab owns its own `ChatState.messages`), the App /
 * Component / Plugin / Callbacks provides, and a `SCROLL_HOST_KEY` handler that
 * captures the Vue-rendered `.specorator-messages` element so the imperative
 * engine keeps a direct handle for scrollTop reads/writes.
 *
 * `markRaw` on the Obsidian objects: they are large and cyclic — never
 * deep-proxy them (same rule as the shell mount).
 */
export function mountTranscript(
  containerEl: HTMLElement,
  plugin: SpecoratorPlugin,
  component: Component,
  callbacks: TranscriptCallbacks,
): MountedTranscript {
  let scrollEl: HTMLElement | null = null;

  const app = createApp(TranscriptRoot);
  app.use(createTranscriptPinia());
  app.provide(APP_KEY, markRaw(plugin.app));
  app.provide(COMPONENT_KEY, markRaw(component));
  app.provide(PLUGIN_KEY, markRaw(plugin));
  app.provide(CALLBACKS_KEY, markRaw(callbacks));
  app.provide(SCROLL_HOST_KEY, (el: HTMLElement) => {
    scrollEl = el;
    // The transcript's markdown renders through `MarkdownHost` → `processFileLinks`,
    // which turns assistant-authored wikilinks / inline vault paths into
    // `.specorator-file-link` anchors whose CLICKS are opened by this DELEGATED
    // handler (the deleted `MessageRenderer` used to register it in its
    // constructor). Bind it to the scroll host, which contains every rendered
    // message. `registerFileLinkHandler` goes through `component.registerDomEvent`,
    // so Obsidian removes the listener when the tab's `component` unloads — no
    // explicit disposal needed on `unmount()`.
    registerFileLinkHandler(plugin.app, el, component);
  });
  app.mount(containerEl);

  return {
    app,
    getScrollEl: () => scrollEl,
    unmount: () => app.unmount(),
  };
}
