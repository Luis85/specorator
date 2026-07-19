import type { WorkspaceLeaf } from 'obsidian';
import { ItemView } from 'obsidian';
import type { App as VueApp, Ref } from 'vue';
import { createApp, markRaw, ref } from 'vue';

import { t } from '../../i18n/i18n';
import type SpecoratorPlugin from '../../main';
import { VIEW_TYPE_MARKETPLACE } from './viewType';
import { getMarketplacePinia } from './vue/globalPinia';
import { PLUGIN_KEY, REQUESTED_VIEW_KEY } from './vue/marketplaceKeys';
import MarketplaceRoot from './vue/MarketplaceRoot.vue';
import type { MarketplaceView as MarketplaceViewTarget } from './vue/marketplaceView';

export class MarketplaceView extends ItemView {
  /** One Vue app per leaf — Obsidian can open several Marketplace leaves at once. */
  private vueApp: VueApp | null = null;
  // Per-leaf deep-link target, provided to this leaf's Root. `activateMarketplace`
  // sets it via `requestView` on the REVEALED leaf only, so a multi-leaf deep-link
  // navigates the right leaf instead of racing a shared store. Stable across
  // onOpen re-mounts (the same ref is re-provided).
  private readonly requestedView: Ref<MarketplaceViewTarget | null> = ref(null);

  constructor(leaf: WorkspaceLeaf, private readonly plugin: SpecoratorPlugin) {
    super(leaf);
  }

  /** Deep-link this leaf's storefront to a category (called by activateMarketplace). */
  requestView(view: MarketplaceViewTarget): void {
    this.requestedView.value = view;
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
    app.provide(REQUESTED_VIEW_KEY, this.requestedView);
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
