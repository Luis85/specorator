<script setup lang="ts">
import { computed } from 'vue';

import { t } from '@/i18n/i18n';
import type { TranslationKey } from '@/i18n/types';

import type { OnboardingFolderKey } from '../../onboardingSettings';
import { useOnboardingStore } from '../stores/onboardingStore';

const store = useOnboardingStore();

const LABEL_KEYS: Record<OnboardingFolderKey, TranslationKey> = {
  agentBoardWorkOrderFolder: 'onboarding.folders.workOrders',
  agentBoardTemplateFolder: 'onboarding.folders.templates',
  agentBoardLoopFolder: 'onboarding.folders.loops',
  agentBoardArchiveFolder: 'onboarding.folders.archive',
  quickActionsFolder: 'onboarding.folders.quickActions',
};

const missingCount = computed(
  () => store.folders.filter((folder) => folder.path && !folder.exists).length,
);

function statusText(folder: { path: string; exists: boolean }): string {
  if (!folder.path) return t('onboarding.folders.blank');
  return folder.exists ? t('onboarding.folders.exists') : t('onboarding.folders.willCreate');
}
</script>

<template>
  <section
    class="specorator-onboarding-step"
    data-step-body="folders"
  >
    <h2>{{ t('onboarding.folders.heading') }}</h2>
    <p class="specorator-onboarding-intro">
      {{ t('onboarding.folders.intro') }}
    </p>

    <div class="specorator-onboarding-step-actions">
      <button
        type="button"
        class="mod-cta"
        data-action="create-folders"
        :disabled="store.creatingFolders || missingCount === 0"
        @click="store.createFolders()"
      >
        {{ store.creatingFolders ? t('onboarding.folders.creating') : t('onboarding.folders.create') }}
      </button>
      <span class="specorator-onboarding-count">
        {{ missingCount === 0 ? t('onboarding.folders.created') : t('onboarding.folders.willCreate') }}
      </span>
    </div>

    <p
      v-if="store.folderError"
      class="specorator-onboarding-folder-error"
      data-state="error"
    >
      {{ t('onboarding.folders.createFailed', { error: store.folderError }) }}
    </p>

    <div
      v-for="folder in store.folders"
      :key="folder.key"
      class="specorator-onboarding-field"
      :data-folder="folder.key"
      :data-exists="folder.exists ? 'true' : 'false'"
    >
      <div class="specorator-onboarding-field-text">
        <div class="specorator-onboarding-field-label">
          {{ t(LABEL_KEYS[folder.key]) }}
        </div>
        <p class="specorator-onboarding-field-desc">
          {{ statusText(folder) }}
        </p>
      </div>
      <div class="specorator-onboarding-field-control">
        <input
          type="text"
          :value="folder.path"
          :aria-label="t(LABEL_KEYS[folder.key])"
          @change="store.setFolder(folder.key, ($event.target as HTMLInputElement).value)"
        >
      </div>
    </div>
  </section>
</template>

<style scoped>
.specorator-onboarding-folder-error {
  color: var(--sp-text-error);
  font-size: var(--sp-font-small);
  margin: 0 0 var(--sp-space-s);
}
</style>
