<script setup lang="ts">
import { computed, inject } from 'vue';

import { t } from '@/i18n/i18n';

import { setDefaultModel } from '../../onboardingSettings';
import { PLUGIN_KEY } from '../onboardingKeys';
import { useOnboardingStore } from '../stores/onboardingStore';
import { useAppSetting } from '../useAppSetting';

const injectedPlugin = inject(PLUGIN_KEY);
if (!injectedPlugin) throw new Error('DefaultsStep mounted without PLUGIN_KEY');
// Re-bind after the guard: vue-tsc widens a guard-narrowed inject() result back
// to `| undefined` inside nested functions (see MarketplaceRoot).
const plugin = injectedPlugin;

const store = useOnboardingStore();
const [model, setModelSetting] = useAppSetting<string>(plugin, 'model', 'haiku');
const [permissionMode, setPermissionMode] = useAppSetting<string>(plugin, 'permissionMode', 'normal');
const [autoTitles, setAutoTitles] = useAppSetting<boolean>(plugin, 'enableAutoTitleGeneration', true);

/**
 * A model choice has to be committed to the provider that owns it, or the
 * per-provider projection replaces it with that provider's fallback and the
 * default silently never applies (see `setDefaultModel`).
 */
async function setModel(next: string): Promise<void> {
  setModelSetting(next);
  await setDefaultModel(plugin, next);
}

const hasProvider = computed(() => store.enabledProviderIds.length > 0);
/** Grouped by provider display name so a shared model id reads unambiguously. */
const groups = computed(() => {
  const byGroup = new Map<string, Array<{ value: string; label: string }>>();
  for (const option of store.modelOptions) {
    const group = option.group ?? '';
    const bucket = byGroup.get(group) ?? [];
    bucket.push({ value: option.value, label: option.label });
    byGroup.set(group, bucket);
  }
  return [...byGroup.entries()];
});
</script>

<template>
  <section
    class="specorator-onboarding-step"
    data-step-body="defaults"
  >
    <h2>{{ t('onboarding.defaults.heading') }}</h2>
    <p class="specorator-onboarding-intro">
      {{ t('onboarding.defaults.intro') }}
    </p>

    <p
      v-if="!hasProvider"
      class="specorator-onboarding-intro"
      data-state="needs-provider"
    >
      {{ t('onboarding.defaults.needsProvider') }}
    </p>

    <div
      v-if="hasProvider"
      class="specorator-onboarding-field"
    >
      <div class="specorator-onboarding-field-text">
        <div class="specorator-onboarding-field-label">
          {{ t('onboarding.defaults.model') }}
        </div>
        <p class="specorator-onboarding-field-desc">
          {{ t('onboarding.defaults.modelDesc') }}
        </p>
      </div>
      <div class="specorator-onboarding-field-control">
        <select
          class="dropdown"
          data-field="model"
          :value="model"
          :aria-label="t('onboarding.defaults.model')"
          @change="setModel(($event.target as HTMLSelectElement).value)"
        >
          <optgroup
            v-for="[group, options] in groups"
            :key="group"
            :label="group"
          >
            <option
              v-for="option in options"
              :key="option.value"
              :value="option.value"
            >
              {{ option.label }}
            </option>
          </optgroup>
        </select>
      </div>
    </div>

    <div class="specorator-onboarding-field">
      <div class="specorator-onboarding-field-text">
        <div class="specorator-onboarding-field-label">
          {{ t('onboarding.defaults.permission') }}
        </div>
        <p class="specorator-onboarding-field-desc">
          {{ t('onboarding.defaults.permissionDesc') }}
        </p>
      </div>
      <div class="specorator-onboarding-field-control">
        <!-- `yolo` is deliberately absent: bypassing tool approval stays an
             explicit toolbar opt-in behind its one-time warning (SEC-1). -->
        <select
          class="dropdown"
          data-field="permission-mode"
          :value="permissionMode"
          :aria-label="t('onboarding.defaults.permission')"
          @change="setPermissionMode(($event.target as HTMLSelectElement).value)"
        >
          <option value="normal">
            {{ t('onboarding.defaults.permissionNormal') }}
          </option>
          <option value="plan">
            {{ t('onboarding.defaults.permissionPlan') }}
          </option>
        </select>
      </div>
    </div>

    <div class="specorator-onboarding-field">
      <div class="specorator-onboarding-field-text">
        <div class="specorator-onboarding-field-label">
          {{ t('onboarding.defaults.titles') }}
        </div>
        <p class="specorator-onboarding-field-desc">
          {{ t('onboarding.defaults.titlesDesc') }}
        </p>
      </div>
      <div class="specorator-onboarding-field-control">
        <input
          type="checkbox"
          data-field="auto-titles"
          :checked="autoTitles"
          :aria-label="t('onboarding.defaults.titles')"
          @change="setAutoTitles(($event.target as HTMLInputElement).checked)"
        >
      </div>
    </div>
  </section>
</template>
