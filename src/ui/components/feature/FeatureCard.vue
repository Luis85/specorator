<script setup lang="ts">
import { computed } from 'vue'
import AppBadge from '../common/AppBadge.vue'
import AppButton from '../common/AppButton.vue'
import type { FeatureDto } from '@/ui/types/FeatureDto'
import { FEATURE_STEP_COUNT } from '@/domain/feature/FeatureStep'

const props = defineProps<{ feature: FeatureDto }>()

const emit = defineEmits<{
  activate: [id: string]
  archive: [id: string]
  open: [id: string]
}>()

const stepCount = FEATURE_STEP_COUNT
const displayedStep = computed(() => Math.min(Math.max(props.feature.currentStep, 1), stepCount))
const isComplete = computed(() => props.feature.currentStep > stepCount)
const showProgress = computed(() => props.feature.status !== 'draft')
const completedSteps = computed(() => (isComplete.value ? stepCount : displayedStep.value - 1))
const progressWidth = computed(() => `${(completedSteps.value / stepCount) * 100}%`)
</script>

<template>
  <article class="sp-feature-card">
    <header class="sp-feature-card__header">
      <h3 class="sp-feature-card__title">{{ feature.title }}</h3>
      <AppBadge :status="feature.status" />
    </header>

    <div v-if="showProgress" class="sp-feature-card__progress">
      <div class="sp-progress-bar">
        <div
          class="sp-progress-bar__fill"
          :style="{ width: progressWidth }"
        />
      </div>
      <span v-if="feature.status === 'archived'" class="sp-feature-card__step-label">
        {{ $t('feature.status.archived') }}
      </span>
      <span v-else-if="feature.status === 'abandoned'" class="sp-feature-card__step-label">
        {{ $t('feature.status.abandoned') }}
      </span>
      <span v-else-if="isComplete" class="sp-feature-card__step-label">
        {{ $t('feature.complete') }}
      </span>
      <span v-else class="sp-feature-card__step-label">
        {{ $t('feature.stepProgress', { current: displayedStep, total: stepCount }) }}
      </span>
    </div>

    <footer class="sp-feature-card__actions">
      <AppButton
        v-if="feature.status === 'draft'"
        variant="primary"
        size="sm"
        @click="emit('activate', feature.id)"
      >
        {{ $t('feature.actions.activate') }}
      </AppButton>
      <AppButton
        v-if="feature.status === 'active'"
        variant="ghost"
        size="sm"
        @click="emit('open', feature.id)"
      >
        {{ $t('feature.actions.open') }}
      </AppButton>
      <AppButton
        v-if="feature.status !== 'archived' && feature.status !== 'abandoned'"
        variant="ghost"
        size="sm"
        @click="emit('archive', feature.id)"
      >
        {{ $t('feature.actions.archive') }}
      </AppButton>
    </footer>
  </article>
</template>

<style scoped>
.sp-feature-card {
  background: var(--background-secondary);
  border: 1px solid var(--background-modifier-border);
  border-radius: 8px;
  padding: 0.875rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
}

.sp-feature-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.sp-feature-card__title {
  margin: 0;
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--text-normal);
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sp-feature-card__progress {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.sp-progress-bar {
  height: 4px;
  background: var(--background-modifier-border);
  border-radius: 9999px;
  overflow: hidden;
}

.sp-progress-bar__fill {
  height: 100%;
  background: var(--interactive-accent);
  border-radius: 9999px;
  transition: width 0.3s ease;
}

.sp-feature-card__step-label {
  font-size: 0.75rem;
  color: var(--text-muted);
}

.sp-feature-card__actions {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}
</style>
