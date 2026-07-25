<script setup lang="ts">
import { computed, inject, ref } from 'vue';

import { t } from '@/i18n/i18n';

import { readAppSetting } from '../../onboardingSettings';
import { PLUGIN_KEY } from '../onboardingKeys';
import { useOnboardingStore } from '../stores/onboardingStore';
import { useAppSetting } from '../useAppSetting';

const injectedPlugin = inject(PLUGIN_KEY);
if (!injectedPlugin) throw new Error('DefaultsStep mounted without PLUGIN_KEY');
// Re-bind after the guard: vue-tsc widens a guard-narrowed inject() result back
// to `| undefined` inside nested functions (see MarketplaceRoot).
const plugin = injectedPlugin;

const store = useOnboardingStore();
const [autoTitles, setAutoTitles] = useAppSetting<boolean>(plugin, 'enableAutoTitleGeneration', true);

// The model is NOT bound through useAppSetting: that setter persists on its own,
// and a second concurrent save is both wasteful and unordered — `saveSettings`
// re-runs `persistProjectedProviderState` for the CURRENT provider, so a save
// fired before the owner switch can stamp the pick onto the outgoing provider's
// projection. This ref is display-only; `store.selectModel` performs the single,
// owner-aware save.
const currentModel = readAppSetting(plugin, 'model');
const model = ref(typeof currentModel === 'string' ? currentModel : 'haiku');

/** Option keys must be unique, and a model id alone is not (two providers may share one). */
function optionKey(option: { providerId: string; value: string }): string {
  return `${option.providerId}\u0000${option.value}`;
}

const hasProvider = computed(() => store.enabledProviderIds.length > 0);
/** Grouped by provider display name so a shared model id reads unambiguously. */
const groups = computed(() => {
  const byGroup = new Map<string, Array<{ key: string; label: string }>>();
  for (const option of store.modelOptions) {
    const bucket = byGroup.get(option.group) ?? [];
    bucket.push({ key: optionKey(option), label: option.label });
    byGroup.set(option.group, bucket);
  }
  return [...byGroup.entries()];
});

/** The selected option, matching the owning provider first so duplicates resolve. */
const selectedKey = computed(() => {
  const owned = store.modelOptions.find(
    (option) => option.value === model.value && option.providerId === store.settingsProviderId,
  );
  const byValue = owned ?? store.modelOptions.find((option) => option.value === model.value);
  return byValue ? optionKey(byValue) : '';
});

/**
 * Hands the whole selected OPTION to the store, which commits it to the provider
 * that owns it — the owner is never re-inferred from the model id, because
 * `resolveProviderForModel` prefers a non-current owner and a shared id could
 * land on the wrong provider.
 */
async function setModel(key: string): Promise<void> {
  const option = store.modelOptions.find((candidate) => optionKey(candidate) === key);
  if (!option) return;
  model.value = option.value;
  await store.selectModel(option);
}
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
          :value="selectedKey"
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
              :key="option.key"
              :value="option.key"
            >
              {{ option.label }}
            </option>
          </optgroup>
        </select>
      </div>
    </div>

    <!-- Stated, not offered: `plan` is reset to `normal` on every load by design
         (main.ts, "Plan mode is ephemeral"), and `yolo` is a deliberate toolbar
         opt-in behind its one-time warning (SEC-1) — so there is no durable
         choice to make here, only a default worth naming. -->
    <div
      class="specorator-onboarding-field"
      data-field="permission-mode"
    >
      <div class="specorator-onboarding-field-text">
        <div class="specorator-onboarding-field-label">
          {{ t('onboarding.defaults.permission') }}
        </div>
        <p class="specorator-onboarding-field-desc">
          {{ t('onboarding.defaults.permissionDesc') }}
        </p>
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
