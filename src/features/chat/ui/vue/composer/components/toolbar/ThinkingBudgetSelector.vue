<script setup lang="ts">
import { computed, inject } from 'vue';

import { CALLBACKS_KEY } from '../../composerKeys';
import { useComposerStore } from '../../stores/composerStore';

const store = useComposerStore();
const cb = inject(CALLBACKS_KEY);
const reasoning = computed(() => store.toolbar.reasoning);
</script>

<template>
  <!-- The projection provides EXACTLY ONE of budget/effort (never both, per
       ThinkingBudgetSelector.render): adaptive models → effort gears (persist
       effortLevel via onSetEffortLevel), non-adaptive → budget gears (persist
       thinkingBudget via onSetThinkingBudget). Render whichever is non-null. -->
  <div
    v-if="reasoning && (reasoning.budget || reasoning.effort)"
    class="specorator-thinking-selector"
  >
    <div
      v-if="reasoning.budget"
      class="specorator-thinking-budget"
    >
      <span class="specorator-thinking-label-text">{{ reasoning.budget.label }}</span>
      <div class="specorator-thinking-gears">
        <span class="specorator-thinking-current">{{ reasoning.budget.current }}</span>
        <div class="specorator-thinking-options">
          <div
            v-for="opt in reasoning.budget.options"
            :key="opt.value"
            class="specorator-thinking-gear"
            :class="{ selected: opt.label === reasoning.budget.current }"
            :title="opt.title"
            @click="cb?.onSetThinkingBudget(opt.value)"
          >
            {{ opt.label }}
          </div>
        </div>
      </div>
    </div>
    <div
      v-if="reasoning.effort"
      class="specorator-thinking-effort"
    >
      <span class="specorator-thinking-label-text">{{ reasoning.effort.label }}</span>
      <div class="specorator-thinking-gears">
        <span class="specorator-thinking-current">{{ reasoning.effort.current }}</span>
        <div class="specorator-thinking-options">
          <div
            v-for="opt in reasoning.effort.options"
            :key="opt.value"
            class="specorator-thinking-gear"
            :class="{ selected: opt.label === reasoning.effort.current }"
            :title="opt.title"
            @click="cb?.onSetEffortLevel(opt.value)"
          >
            {{ opt.label }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
