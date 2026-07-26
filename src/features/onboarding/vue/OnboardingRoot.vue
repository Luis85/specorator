<script setup lang="ts">
import { computed, inject, onUnmounted } from 'vue';

import { t } from '@/i18n/i18n';

import { ONBOARDING_STEPS } from '../onboardingSteps';
import DefaultsStep from './components/DefaultsStep.vue';
import FinishStep from './components/FinishStep.vue';
import FoldersStep from './components/FoldersStep.vue';
import MarketplaceStep from './components/MarketplaceStep.vue';
import ProvidersStep from './components/ProvidersStep.vue';
import StepRail from './components/StepRail.vue';
import WorkspaceStep from './components/WorkspaceStep.vue';
import { CLOSE_VIEW_KEY, PLUGIN_KEY } from './onboardingKeys';
import { useOnboardingStore } from './stores/onboardingStore';

const injectedPlugin = inject(PLUGIN_KEY);
if (!injectedPlugin) throw new Error('OnboardingRoot mounted without PLUGIN_KEY');
// Re-bind after the guard: vue-tsc widens a guard-narrowed inject() result back
// to `| undefined` inside nested functions (same pattern as MarketplaceRoot).
const plugin = injectedPlugin;
const closeView = inject(CLOSE_VIEW_KEY, null);

const store = useOnboardingStore();
store.init(plugin);

const isLast = computed(() => store.step === ONBOARDING_STEPS[ONBOARDING_STEPS.length - 1]);
const isFirst = computed(() => store.step === ONBOARDING_STEPS[0]);

async function dismiss(): Promise<void> {
  // Closing is a completion, not an escape: the flow must not reopen itself on
  // every load once the user has decided they are done with it.
  await store.finish();
  closeView?.();
}

// A leaf closed mid-install must not leave an orphan package manager running.
onUnmounted(() => store.dispose());
</script>

<template>
  <div class="specorator-onboarding-root">
    <header class="specorator-onboarding-header">
      <div>
        <h1 class="specorator-onboarding-title">
          {{ t('onboarding.heading') }}
        </h1>
        <p class="specorator-onboarding-subtitle">
          {{ t('onboarding.subheading') }}
        </p>
      </div>
      <button
        type="button"
        data-action="dismiss"
        @click="dismiss()"
      >
        {{ t('onboarding.close') }}
      </button>
    </header>

    <StepRail
      :current="store.step"
      @select="store.goTo($event)"
    />

    <div class="specorator-onboarding-body">
      <ProvidersStep v-if="store.step === 'providers'" />
      <DefaultsStep v-else-if="store.step === 'defaults'" />
      <FoldersStep v-else-if="store.step === 'folders'" />
      <WorkspaceStep v-else-if="store.step === 'workspace'" />
      <MarketplaceStep v-else-if="store.step === 'marketplace'" />
      <FinishStep v-else />
    </div>

    <footer class="specorator-onboarding-footer">
      <button
        type="button"
        data-action="back"
        :disabled="isFirst"
        @click="store.advance(-1)"
      >
        {{ t('onboarding.back') }}
      </button>
      <button
        v-if="!isLast"
        type="button"
        class="mod-cta"
        data-action="next"
        @click="store.advance(1)"
      >
        {{ t('onboarding.next') }}
      </button>
      <button
        v-else
        type="button"
        data-action="finish"
        @click="dismiss()"
      >
        {{ t('onboarding.finishButton') }}
      </button>
    </footer>
  </div>
</template>

<style scoped>
.specorator-onboarding-root {
  display: flex;
  flex-direction: column;
  margin: 0 auto;
  max-width: 52em;
}

.specorator-onboarding-header {
  align-items: flex-start;
  display: flex;
  gap: var(--sp-space-s);
  justify-content: space-between;
  margin-bottom: var(--sp-space-m);
}

.specorator-onboarding-title {
  font-size: var(--sp-font-small);
  font-weight: var(--sp-weight-semibold);
  margin: 0;
  text-transform: uppercase;
}

.specorator-onboarding-subtitle {
  color: var(--sp-text-muted);
  font-size: var(--sp-font-small);
  margin: var(--sp-space-3xs) 0 0;
}

.specorator-onboarding-footer {
  border-top: 1px solid var(--sp-border);
  display: flex;
  gap: var(--sp-space-s);
  justify-content: flex-end;
  margin-top: var(--sp-space-l);
  padding-top: var(--sp-space-m);
}
</style>
