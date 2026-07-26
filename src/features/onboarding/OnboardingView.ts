import type { WorkspaceLeaf } from 'obsidian';
import { ItemView } from 'obsidian';
import type { App as VueApp } from 'vue';
import { markRaw } from 'vue';

import { t } from '../../i18n/i18n';
import type SpecoratorPlugin from '../../main';
import { mountLeafIsland, unmountLeafIsland } from '../../shared/vue/leafIsland';
import { VIEW_TYPE_ONBOARDING } from './viewType';
import { createOnboardingPinia } from './vue/createOnboardingPinia';
import { CLOSE_VIEW_KEY, PLUGIN_KEY } from './vue/onboardingKeys';
import OnboardingRoot from './vue/OnboardingRoot.vue';

const HOST_CLASS = 'specorator-onboarding-vue-root';

export class OnboardingView extends ItemView {
  /** One Vue app per leaf, with a fresh Pinia — wizard state is per leaf. */
  private vueApp: VueApp | null = null;

  constructor(leaf: WorkspaceLeaf, private readonly plugin: SpecoratorPlugin) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_ONBOARDING;
  }

  getDisplayText(): string {
    return t('onboarding.viewTitle');
  }

  getIcon(): string {
    return 'rocket';
  }

  async onOpen(): Promise<void> {
    this.vueApp = mountLeafIsland(this.contentEl, this.vueApp, {
      component: OnboardingRoot,
      pinia: createOnboardingPinia(),
      hostClass: HOST_CLASS,
      provide: (app) => {
        // markRaw: Obsidian objects are large and cyclic; never deep-proxy them.
        app.provide(PLUGIN_KEY, markRaw(this.plugin));
        app.provide(CLOSE_VIEW_KEY, () => this.leaf.detach());
      },
    });
  }

  async onClose(): Promise<void> {
    // The island's onUnmounted cancels any in-flight CLI install.
    unmountLeafIsland(this.contentEl, this.vueApp, HOST_CLASS);
    this.vueApp = null;
  }
}
