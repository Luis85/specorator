<script setup lang="ts">
import { t } from '@/i18n/i18n';

import { ONBOARDING_STEPS, type OnboardingStep,onboardingStepLabelKey } from '../../onboardingSteps';

/**
 * Free-navigable step rail. A `role="navigation"` landmark with
 * `aria-current="step"`, deliberately NOT an ARIA tablist — that would promise
 * roving arrow-key focus this doesn't implement (same call as MarketplaceNav).
 */
const props = defineProps<{ current: OnboardingStep }>();
defineEmits<{ select: [OnboardingStep] }>();

const steps = ONBOARDING_STEPS;

function indexOf(step: OnboardingStep): number {
  return steps.indexOf(step) + 1;
}

function isCurrent(step: OnboardingStep): boolean {
  return step === props.current;
}
</script>

<template>
  <nav
    class="specorator-onboarding-rail"
    role="navigation"
    :aria-label="t('onboarding.stepLabel')"
  >
    <button
      v-for="step in steps"
      :key="step"
      type="button"
      class="specorator-onboarding-rail-step"
      :class="{ 'is-current': isCurrent(step) }"
      :aria-current="isCurrent(step) ? 'step' : undefined"
      :data-step="step"
      @click="$emit('select', step)"
    >
      <span class="specorator-onboarding-rail-index">{{ indexOf(step) }}</span>
      <span class="specorator-onboarding-rail-label">{{ t(onboardingStepLabelKey(step)) }}</span>
    </button>
  </nav>
</template>

<style scoped>
.specorator-onboarding-rail {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-space-2xs);
  border-bottom: 1px solid var(--sp-border);
  padding-bottom: var(--sp-space-s);
  margin-bottom: var(--sp-space-l);
}

.specorator-onboarding-rail-step {
  display: flex;
  align-items: center;
  gap: var(--sp-space-2xs);
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--sp-radius-m);
  color: var(--sp-text-muted);
  cursor: pointer;
  font-size: var(--sp-font-small);
  padding: var(--sp-space-2xs) var(--sp-space-s);
}

.specorator-onboarding-rail-step:hover {
  background: var(--sp-surface-hover);
}

.specorator-onboarding-rail-step.is-current {
  background: var(--sp-surface-raised);
  border-color: var(--sp-border);
  color: var(--sp-text);
  font-weight: var(--sp-weight-semibold);
}

.specorator-onboarding-rail-index {
  color: var(--sp-text-faint);
  font-family: var(--sp-mono);
  font-size: var(--sp-font-smaller);
}
</style>
