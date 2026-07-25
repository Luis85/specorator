<script setup lang="ts">
import { inject } from 'vue';

import { t } from '@/i18n/i18n';

import { PLUGIN_KEY } from '../onboardingKeys';
import { useAppSetting } from '../useAppSetting';

const injectedPlugin = inject(PLUGIN_KEY);
if (!injectedPlugin) throw new Error('WorkspaceStep mounted without PLUGIN_KEY');
// Re-bind after the guard so the closure below keeps the narrowed type.
const plugin = injectedPlugin;

const [placement, setPlacement] = useAppSetting<string>(plugin, 'chatViewPlacement', 'right-sidebar');
const [maxTabs, setMaxTabsSetting] = useAppSetting<number>(plugin, 'maxChatTabs', 3);

/** Matches the General tab's slider bounds so the two controls can't disagree. */
const TAB_CHOICES = [3, 4, 5, 6, 8, 10];

async function setMaxTabs(value: string): Promise<void> {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return;
  await setMaxTabsSetting(parsed);
  // The tab-budget control is rendered per leaf from this setting; refresh any
  // open chat view so the "+" affordance reflects the new cap immediately.
  for (const view of plugin.getAllViews()) view.refreshTabControls();
}
</script>

<template>
  <section
    class="specorator-onboarding-step"
    data-step-body="workspace"
  >
    <h2>{{ t('onboarding.workspace.heading') }}</h2>
    <p class="specorator-onboarding-intro">
      {{ t('onboarding.workspace.intro') }}
    </p>

    <div class="specorator-onboarding-field">
      <div class="specorator-onboarding-field-text">
        <div class="specorator-onboarding-field-label">
          {{ t('onboarding.workspace.placement') }}
        </div>
      </div>
      <div class="specorator-onboarding-field-control">
        <select
          class="dropdown"
          data-field="placement"
          :value="placement"
          :aria-label="t('onboarding.workspace.placement')"
          @change="setPlacement(($event.target as HTMLSelectElement).value)"
        >
          <option value="right-sidebar">
            {{ t('onboarding.workspace.placementRight') }}
          </option>
          <option value="left-sidebar">
            {{ t('onboarding.workspace.placementLeft') }}
          </option>
          <option value="main-tab">
            {{ t('onboarding.workspace.placementMain') }}
          </option>
        </select>
      </div>
    </div>

    <div class="specorator-onboarding-field">
      <div class="specorator-onboarding-field-text">
        <div class="specorator-onboarding-field-label">
          {{ t('onboarding.workspace.maxTabs') }}
        </div>
        <p class="specorator-onboarding-field-desc">
          {{ t('onboarding.workspace.maxTabsDesc') }}
        </p>
      </div>
      <div class="specorator-onboarding-field-control">
        <select
          class="dropdown"
          data-field="max-tabs"
          :value="String(maxTabs)"
          :aria-label="t('onboarding.workspace.maxTabs')"
          @change="setMaxTabs(($event.target as HTMLSelectElement).value)"
        >
          <option
            v-for="choice in TAB_CHOICES"
            :key="choice"
            :value="String(choice)"
          >
            {{ choice }}
          </option>
        </select>
      </div>
    </div>
  </section>
</template>
