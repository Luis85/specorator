import type { Pinia } from 'pinia';
import type { App as VueApp, Component } from 'vue';
import { createApp } from 'vue';

export interface LeafIslandOptions {
  component: Component;
  /** Per-leaf or shared Pinia — the caller owns that choice. */
  pinia: Pinia;
  /** View-specific host class alongside the shared `.specorator-vue` baseline. */
  hostClass: string;
  /** Injection wiring; runs after `use(pinia)` and before `mount`. */
  provide?: (app: VueApp) => void;
}

/**
 * Mounts one Vue island into a workspace leaf's `contentEl`, shared by every
 * `ItemView` island host (Library, Marketplace, Setup) so the lifecycle
 * subtleties below live in ONE place instead of being re-derived per view.
 *
 * Pass the previous app so a second `onOpen` on the same instance replaces it:
 * popout/move flows can run `onOpen` twice on one view instance (Hover
 * Editor-style; see SpecoratorView), which would otherwise leak an app.
 */
export function mountLeafIsland(
  contentEl: HTMLElement,
  previous: VueApp | null,
  options: LeafIslandOptions,
): VueApp {
  previous?.unmount();
  contentEl.empty();
  // Two calls, not one: Obsidian's real addClass is variadic but the shared
  // test-lane polyfill (tests/setup/obsidianDom.ts) is single-arg.
  contentEl.addClass('specorator-vue');
  contentEl.addClass(options.hostClass);
  const app = createApp(options.component);
  app.use(options.pinia);
  options.provide?.(app);
  app.mount(contentEl);
  return app;
}

/**
 * Tears an island down on `onClose`. `unmount()` runs onUnmounted hooks;
 * `empty()` drops any detached DOM + listeners (Vue's documented leak class
 * when the container element is kept alive, which Obsidian does).
 */
export function unmountLeafIsland(
  contentEl: HTMLElement,
  app: VueApp | null,
  hostClass: string,
): void {
  app?.unmount();
  contentEl.removeClass('specorator-vue');
  contentEl.removeClass(hostClass);
  contentEl.empty();
}
