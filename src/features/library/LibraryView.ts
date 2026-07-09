import type { ViewStateResult, WorkspaceLeaf } from 'obsidian';
import { ItemView } from 'obsidian';
import type { App as VueApp } from 'vue';
import { createApp, markRaw, ref } from 'vue';

import { t } from '../../i18n/i18n';
import type SpecoratorPlugin from '../../main';
import type { LibraryTab } from './viewType';
import { VIEW_TYPE_LIBRARY } from './viewType';
import { getLibraryPinia } from './vue/globalPinia';
import { ACTIVE_TAB_KEY, PLUGIN_KEY, TAB_GUARD_KEY, VIEW_KEY } from './vue/libraryKeys';
import LibraryRoot from './vue/LibraryRoot.vue';

const DEFAULT_TAB: LibraryTab = 'agents';

function isLibraryTab(value: unknown): value is LibraryTab {
  return value === 'agents' || value === 'skills' || value === 'loops' || value === 'quick-actions';
}

export class LibraryView extends ItemView {
  /** One Vue app per leaf — Obsidian can open several Library leaves at once. */
  private vueApp: VueApp | null = null;
  private readonly activeTab = ref<LibraryTab>(DEFAULT_TAB);
  /** Set by panels (via TAB_GUARD_KEY) to intercept tab switches; see libraryKeys.ts. */
  private readonly tabGuard = ref<(() => Promise<boolean>) | null>(null);
  /** True while a guard prompt is awaiting the user — later switches no-op. */
  private guardPending = false;

  constructor(leaf: WorkspaceLeaf, private readonly plugin: SpecoratorPlugin) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_LIBRARY;
  }

  getDisplayText(): string {
    return t('library.viewTitle');
  }

  getIcon(): string {
    return 'library';
  }

  async setActiveTab(tab: LibraryTab): Promise<void> {
    if (this.activeTab.value === tab) return;
    const guard = this.tabGuard.value;
    if (guard) {
      // Latch: while one guard prompt is awaiting the user, further switch
      // requests no-op instead of stacking a second prompt.
      if (this.guardPending) return;
      this.guardPending = true;
      try {
        if (!(await guard())) return;
      } finally {
        this.guardPending = false;
      }
    }
    this.activeTab.value = tab;
  }

  async setState(state: unknown, result: ViewStateResult): Promise<void> {
    const tab = (state as { tab?: unknown } | null)?.tab;
    // Workspace-restore path sets the tab directly (no guard): it runs before
    // any panel could have registered one.
    if (isLibraryTab(tab)) this.activeTab.value = tab;
    await super.setState(state, result);
  }

  getState(): Record<string, unknown> {
    return { ...super.getState(), tab: this.activeTab.value };
  }

  async onOpen(): Promise<void> {
    // Popout/move flows can run onOpen twice on one view instance
    // (Hover Editor-style; see SpecoratorView) — drop any previous island
    // before mounting a fresh one.
    this.vueApp?.unmount();
    this.vueApp = null;
    this.contentEl.empty();
    // Two calls, not one: Obsidian's real addClass is variadic but the shared
    // test-lane polyfill (tests/setup/obsidianDom.ts) is single-arg.
    this.contentEl.addClass('specorator-vue');
    this.contentEl.addClass('specorator-library-vue-root');
    const app = createApp(LibraryRoot);
    app.use(getLibraryPinia());
    // markRaw: Obsidian objects are large and cyclic; never deep-proxy them.
    app.provide(PLUGIN_KEY, markRaw(this.plugin));
    app.provide(VIEW_KEY, markRaw(this));
    app.provide(ACTIVE_TAB_KEY, this.activeTab);
    app.provide(TAB_GUARD_KEY, this.tabGuard);
    app.mount(this.contentEl);
    this.vueApp = app;
  }

  async onClose(): Promise<void> {
    // unmount() runs onUnmounted hooks; empty() drops any detached DOM +
    // listeners (Vue's documented leak class when the container is kept).
    this.vueApp?.unmount();
    this.vueApp = null;
    this.contentEl.removeClass('specorator-vue');
    this.contentEl.removeClass('specorator-library-vue-root');
    this.contentEl.empty();
  }
}
