<script setup lang="ts">
import { computed, inject } from 'vue';

import { ProviderRegistry } from '@/core/providers/ProviderRegistry';
import { t } from '@/i18n/i18n';

import { CLOSE_VIEW_KEY, PLUGIN_KEY } from '../onboardingKeys';
import { useOnboardingStore } from '../stores/onboardingStore';

const injectedPlugin = inject(PLUGIN_KEY);
if (!injectedPlugin) throw new Error('FinishStep mounted without PLUGIN_KEY');
// Re-bind after the guard so the async handler below keeps the narrowed type.
const plugin = injectedPlugin;
const closeView = inject(CLOSE_VIEW_KEY, null);

const store = useOnboardingStore();

const providerNames = computed(() => store.enabledProviderIds
  .map((providerId) => ProviderRegistry.getProviderDisplayName(providerId))
  .join(', '));

/** Marks the flow complete, then hands the user the surface they came for. */
async function finishAndOpenChat(): Promise<void> {
  await store.finish();
  closeView?.();
  await plugin.activateView();
}
</script>

<template>
  <section
    class="specorator-onboarding-step"
    data-step-body="finish"
  >
    <h2>{{ t('onboarding.finish.heading') }}</h2>
    <p class="specorator-onboarding-intro">
      {{ t('onboarding.finish.intro') }}
    </p>

    <p
      class="specorator-onboarding-count"
      data-state="providers"
    >
      {{ store.enabledProviderIds.length > 0
        ? t('onboarding.finish.providersReady', { names: providerNames })
        : t('onboarding.finish.noProviders') }}
    </p>

    <div class="specorator-onboarding-step-actions">
      <button
        type="button"
        class="mod-cta"
        data-action="finish-open-chat"
        @click="finishAndOpenChat()"
      >
        {{ t('onboarding.finish.openChat') }}
      </button>
    </div>

    <p class="specorator-onboarding-intro">
      {{ t('onboarding.finish.reopenHint') }}
    </p>
  </section>
</template>
