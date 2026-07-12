<script setup lang="ts">
import { computed } from 'vue';

import type { ProgressData } from '../../../../rendering/WorkOrderProtocolDisplay';
import IconSpan from '../IconSpan.vue';

/**
 * Reproduces `rendering/WorkOrderProgressCard.ts`'s `renderWorkOrderProgressCard`
 * DOM contract: header (icon + step + optional counter) then an optional
 * progress bar and an optional note, both siblings of the header at the card
 * level (matching the legacy `card.createDiv` calls after `header`).
 */
const props = defineProps<{ progress: ProgressData }>();

const percent = computed(() => {
  const done = props.progress.done;
  if (!done) return 0;
  if (done.total <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((done.complete / done.total) * 100)));
});
</script>

<template>
  <!-- eslint-disable vue/multiline-html-element-content-newline, vue/singleline-html-element-content-newline -- exact textContent parity with the legacy DOM contract (no surrounding whitespace) -->
  <div class="specorator-work-order-progress-card">
    <div class="specorator-work-order-progress-card-header">
      <IconSpan
        icon="activity"
        css-class="specorator-work-order-progress-card-icon"
      />
      <div class="specorator-work-order-progress-card-main">
        <div class="specorator-work-order-progress-card-step">{{ progress.step }}</div>
      </div>
      <span
        v-if="progress.done"
        class="specorator-work-order-progress-card-counter"
      >{{ progress.done.complete }} / {{ progress.done.total }}</span>
    </div>
    <div
      v-if="progress.done"
      class="specorator-work-order-progress-card-bar"
    >
      <div
        class="specorator-work-order-progress-card-bar-fill"
        :style="{ width: `${percent}%` }"
      />
    </div>
    <div
      v-if="progress.note"
      class="specorator-work-order-progress-card-note"
    >{{ progress.note }}</div>
  </div>
  <!-- eslint-enable vue/multiline-html-element-content-newline, vue/singleline-html-element-content-newline -->
</template>
