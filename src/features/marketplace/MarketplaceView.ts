import type { WorkspaceLeaf } from 'obsidian';
import { ItemView } from 'obsidian';
import type { App as VueApp } from 'vue';
import { createApp, markRaw } from 'vue';

import { t } from '../../i18n/i18n';
import type SpecoratorPlugin from '../../main';
import { VIEW_TYPE_MARKETPLACE } from './viewType';
import { getMarketplacePinia } from './vue/globalPinia';
import { PLUGIN_KEY } from './vue/marketplaceKeys';
import MarketplaceRoot from './vue/MarketplaceRoot.vue';

export class MarketplaceView extends ItemView {
  /** One Vue app per leaf — Obsidian can open several Marketplace leaves at once. */
  private vueApp: VueApp | null = null;

  constructor(leaf: WorkspaceLeaf, private readonly plugin: SpecoratorPlugin) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_MARKETPLACE;
  }

  getDisplayText(): string {
    return t('marketplace.viewTitle');
  }

  getIcon(): string {
    return 'store';
  }

  async onOpen(): Promise<void> {
    // Popout/move flows can run onOpen twice on one view instance (Hover
    // Editor-style; see SpecoratorView) — drop any previous island before
    // mounting a fresh one.
    this.vueApp?.unmount();
    this.vueApp = null;
    this.contentEl.empty();
    // Two calls, not one: Obsidian's real addClass is variadic but the shared
    // test-lane polyfill (tests/setup/obsidianDom.ts) is single-arg.
    this.contentEl.addClass('specorator-vue');
    this.contentEl.addClass('specorator-marketplace-vue-root');
    const app = createApp(MarketplaceRoot);
    app.use(getMarketplacePinia());
    // markRaw: Obsidian objects are large and cyclic; never deep-proxy them.
    app.provide(PLUGIN_KEY, markRaw(this.plugin));
    app.mount(this.contentEl);
    this.vueApp = app;
  }

  async onClose(): Promise<void> {
    // unmount() runs onUnmounted hooks; empty() drops any detached DOM +
    // listeners (Vue's documented leak class when the container is kept).
    this.vueApp?.unmount();
    this.vueApp = null;
    this.contentEl.removeClass('specorator-vue');
    this.contentEl.removeClass('specorator-marketplace-vue-root');
    this.contentEl.empty();
  }
}
