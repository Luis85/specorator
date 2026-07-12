<script setup lang="ts">
import { ref } from 'vue';

/**
 * Vue port of `renderAskCustomInputRow` (`askQuestionTabRenderer.ts`): the
 * free-text "other" row. Purely presentational — the host
 * `InlineAskUserQuestion.vue` owns `customInputs`/`isInputFocused`/
 * `focusedItemIndex` state; this renders the row and reports `update:text` /
 * `focus` / `blur` / `row-click`. Matches legacy's `onRowClick`: clicking the
 * row always focuses the text input directly (this component owns that
 * ref), while the host reacts to `row-click` only to set `focusedItemIndex`.
 */
defineProps<{
  customIdx: number;
  isFocused: boolean;
  isMulti: boolean;
  isSecret: boolean;
  text: string;
  hasCustomText: boolean;
}>();
const emit = defineEmits<{
  'update:text': [string];
  focus: [];
  blur: [];
  'row-click': [];
}>();

const inputEl = ref<HTMLInputElement | null>(null);

function onRowClick(): void {
  emit('row-click');
  inputEl.value?.focus();
}

function onInput(event: Event): void {
  emit('update:text', (event.target as HTMLInputElement).value);
}
</script>

<template>
  <div
    class="specorator-ask-item specorator-ask-custom-item"
    :class="{ 'is-focused': isFocused }"
    @click="onRowClick"
  >
    <span class="specorator-ask-cursor">{{ isFocused ? '›' : '\u00A0' }}</span>
    <span class="specorator-ask-item-num">{{ customIdx + 1 }}. </span>
    <span
      v-if="isMulti"
      class="specorator-ask-check"
      :class="{ 'is-checked': hasCustomText }"
    >{{ hasCustomText ? '[✓] ' : '[ ] ' }}</span>
    <input
      ref="inputEl"
      class="specorator-ask-custom-text"
      :type="isSecret ? 'password' : 'text'"
      :placeholder="isSecret ? 'Enter secret.' : 'Type something.'"
      :value="text"
      @input="onInput"
      @focus="emit('focus')"
      @blur="emit('blur')"
    >
  </div>
</template>
