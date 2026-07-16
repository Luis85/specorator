<script setup lang="ts">
import { computed } from 'vue';

import { useComposerStore } from '../../stores/composerStore';

const store = useComposerStore();

// Gauge geometry copied from ui/toolbar/ContextUsageMeter.ts so the fill matches
// pixel-for-pixel: a 240° arc (150°→390°) on a 16px viewBox, radius (size−stroke)/2.
const SIZE = 16;
const STROKE_WIDTH = 2;
const RADIUS = (SIZE - STROKE_WIDTH) / 2;
const CENTER = SIZE / 2;
const START_ANGLE = 150;
const END_ANGLE = 390;
const ARC_RADIANS = ((END_ANGLE - START_ANGLE) * Math.PI) / 180;
const CIRCUMFERENCE = RADIUS * ARC_RADIANS;

function polar(angleDeg: number): { x: number; y: number } {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: CENTER + RADIUS * Math.cos(rad), y: CENTER + RADIUS * Math.sin(rad) };
}
const start = polar(START_ANGLE);
const end = polar(END_ANGLE);
const ARC_PATH = `M ${start.x} ${start.y} A ${RADIUS} ${RADIUS} 0 1 1 ${end.x} ${end.y}`;

// stroke-dashoffset = circumference − pct/100 · circumference (imperative update()).
const dashOffset = computed(() =>
  store.toolbar.usage
    ? CIRCUMFERENCE - (store.toolbar.usage.percentage / 100) * CIRCUMFERENCE
    : CIRCUMFERENCE,
);
</script>

<template>
  <div
    v-if="store.toolbar.usage"
    class="specorator-context-meter"
    :class="{ warning: store.toolbar.usage.warning }"
    :data-tooltip="store.toolbar.usage.tooltip"
  >
    <div class="specorator-context-meter-gauge">
      <svg
        :width="SIZE"
        :height="SIZE"
        :viewBox="`0 0 ${SIZE} ${SIZE}`"
      >
        <path
          class="specorator-meter-bg"
          :d="ARC_PATH"
          fill="none"
          :stroke-width="STROKE_WIDTH"
          stroke-linecap="round"
        />
        <path
          class="specorator-meter-fill"
          :d="ARC_PATH"
          fill="none"
          :stroke-width="STROKE_WIDTH"
          stroke-linecap="round"
          :stroke-dasharray="CIRCUMFERENCE"
          :stroke-dashoffset="dashOffset"
        />
      </svg>
    </div>
    <span class="specorator-context-meter-percent">{{ store.toolbar.usage.percentage }}%</span>
  </div>
</template>
