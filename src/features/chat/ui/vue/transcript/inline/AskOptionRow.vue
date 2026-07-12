<script setup lang="ts">
import type { AskUserQuestionOption } from '../../../../../../core/types/tools';

/**
 * Vue port of `renderAskOptionRow` (`askQuestionTabRenderer.ts`): one
 * selectable option row. Purely presentational — all selection/focus state
 * lives in the host `InlineAskUserQuestion.vue`; this only renders and emits
 * `select`. Cursor placeholder standardizes on nbsp (matches
 * `InlineChoiceList.vue`'s convention, and the legacy row's own
 * `updateFocusIndicator()` converges to nbsp after any keyboard navigation
 * anyway — see `inlineAskUserQuestion.characterization.test.ts`).
 */
defineProps<{
  option: AskUserQuestionOption;
  optIdx: number;
  isFocused: boolean;
  isSelected: boolean;
  isMulti: boolean;
}>();
const emit = defineEmits<{ select: [] }>();
</script>

<template>
  <div
    class="specorator-ask-item"
    :class="{ 'is-focused': isFocused, 'is-selected': isSelected }"
    @click="emit('select')"
  >
    <span class="specorator-ask-cursor">{{ isFocused ? '›' : '\u00A0' }}</span>
    <span class="specorator-ask-item-num">{{ optIdx + 1 }}. </span>
    <span
      v-if="isMulti"
      class="specorator-ask-check"
      :class="{ 'is-checked': isSelected }"
    >{{ isSelected ? '[✓] ' : '[ ] ' }}</span>
    <div class="specorator-ask-item-content">
      <div class="specorator-ask-label-row">
        <span class="specorator-ask-item-label">{{ option.label }}</span>
        <span
          v-if="!isMulti && isSelected"
          class="specorator-ask-check-mark"
        > ✓</span>
      </div>
      <div
        v-if="option.description"
        class="specorator-ask-item-desc"
      >
        {{ option.description }}
      </div>
    </div>
  </div>
</template>
