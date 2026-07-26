<script setup lang="ts">
import { inject } from 'vue';

import { t } from '@/i18n/i18n';

import { activateMarketplace } from '../../../marketplace/activateMarketplace';
import { maybeWarnMarketplaceNetwork } from '../../../marketplace/marketplaceNetworkGate';
import { PLUGIN_KEY } from '../onboardingKeys';
import { useAppSetting } from '../useAppSetting';

const injectedPlugin = inject(PLUGIN_KEY);
if (!injectedPlugin) throw new Error('MarketplaceStep mounted without PLUGIN_KEY');
// Re-bind after the guard so the closures below keep the narrowed type.
const plugin = injectedPlugin;

const [networkEnabled, setNetworkEnabled] = useAppSetting<boolean>(plugin, 'marketplaceNetworkEnabled', false);

/**
 * Opting in here routes through the SAME one-time warning notice the
 * Marketplace view and settings toggle use, so the network disclosure can't be
 * skipped by coming in through onboarding.
 */
async function setEnabled(enabled: boolean): Promise<void> {
  await setNetworkEnabled(enabled);
  if (enabled) await maybeWarnMarketplaceNetwork(plugin);
}
</script>

<template>
  <section
    class="specorator-onboarding-step"
    data-step-body="marketplace"
  >
    <h2>{{ t('onboarding.marketplace.heading') }}</h2>
    <p class="specorator-onboarding-intro">
      {{ t('onboarding.marketplace.intro') }}
    </p>

    <div class="specorator-onboarding-field">
      <div class="specorator-onboarding-field-text">
        <div class="specorator-onboarding-field-label">
          {{ networkEnabled ? t('onboarding.marketplace.enabled') : t('onboarding.marketplace.enable') }}
        </div>
      </div>
      <div class="specorator-onboarding-field-control">
        <input
          type="checkbox"
          data-field="marketplace-network"
          :checked="networkEnabled"
          :aria-label="t('onboarding.marketplace.enable')"
          @change="setEnabled(($event.target as HTMLInputElement).checked)"
        >
      </div>
    </div>

    <div class="specorator-onboarding-step-actions">
      <button
        type="button"
        data-action="browse-marketplace"
        :disabled="!networkEnabled"
        @click="activateMarketplace(plugin)"
      >
        {{ t('onboarding.marketplace.browse') }}
      </button>
    </div>
  </section>
</template>
