<script setup lang="ts">
import { computed } from 'vue';

import { ProviderRegistry } from '@/core/providers/ProviderRegistry';
import type { ProviderCliInstallMethod, ProviderId } from '@/core/providers/types';
import { t } from '@/i18n/i18n';

import { useOnboardingStore } from '../stores/onboardingStore';
import ProviderCard from './ProviderCard.vue';

const store = useOnboardingStore();

const enabledCount = computed(() => store.enabledProviderIds.length);

function installFor(providerId: ProviderId) {
  return ProviderRegistry.getCliInstall(providerId);
}

function onInstall(providerId: ProviderId, method: ProviderCliInstallMethod): void {
  store.startInstall(providerId, method);
}

/**
 * The install currently holding the lock, by display name — every card whose
 * panel is not already showing that run has its Run action held.
 *
 * The exemption is "this leaf owns the run", not "same provider": the lock is
 * process-wide, so in a SECOND Setup leaf the installing provider's own card has
 * an idle panel and would otherwise show a live Run button — the one click the
 * lock exists to prevent.
 */
function blockedBy(providerId: ProviderId): string | null {
  const active = store.installingProviderId;
  if (!active || (active === providerId && store.runFor(providerId).phase === 'running')) {
    return null;
  }
  return store.detections.find((d) => d.providerId === active)?.displayName ?? null;
}
</script>

<template>
  <section
    class="specorator-onboarding-step"
    data-step-body="providers"
  >
    <h2>{{ t('onboarding.providers.heading') }}</h2>
    <p class="specorator-onboarding-intro">
      {{ t('onboarding.providers.intro') }}
    </p>

    <div class="specorator-onboarding-step-actions">
      <button
        type="button"
        data-action="rescan"
        :disabled="store.scanning"
        @click="store.refreshDetections()"
      >
        {{ store.scanning ? t('onboarding.providers.rescanning') : t('onboarding.providers.rescan') }}
      </button>
      <span class="specorator-onboarding-count">
        {{ enabledCount > 0
          ? t('onboarding.providers.enabledCount', { count: enabledCount })
          : t('onboarding.providers.noneEnabled') }}
      </span>
    </div>

    <div class="specorator-onboarding-provider-list">
      <ProviderCard
        v-for="detection in store.detections"
        :key="detection.providerId"
        :detection="detection"
        :install="installFor(detection.providerId)"
        :run="store.runFor(detection.providerId)"
        :blocked-by="blockedBy(detection.providerId)"
        @toggle="store.setEnabled(detection.providerId, $event)"
        @install="onInstall(detection.providerId, $event)"
        @cancel-install="store.cancelInstall(detection.providerId)"
        @set-path="store.setCliPath(detection.providerId, $event)"
      />
    </div>
  </section>
</template>

<style scoped>
/* Shared step/field classes live in src/style/vue/onboarding.css — a scoped
   block here could not reach a sibling step's identical wrapper. */
.specorator-onboarding-provider-list {
  display: flex;
  flex-direction: column;
  gap: var(--sp-space-s);
}
</style>
