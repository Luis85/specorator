<script setup lang="ts">
import { type ComponentPublicInstance, ref } from 'vue';

import type { InlineChoiceRowSpec } from './inlineChoiceCard';

type VNodeRefEl = Element | ComponentPublicInstance | null;

/**
 * Vue port of `rendering/inlineChoiceCard.ts`'s `InlineChoiceList`: renders
 * the numbered action/input rows and owns focus + keyboard-navigation state.
 * Root-level chrome (tabindex, rAF focus, scrollIntoView-on-activate, abort
 * handling — legacy's `activateInlineCard`) stays with the host card, since
 * it applies to the card's whole root (title + plan preview + permissions +
 * this list), not just the list. `handleKeyDown` is exposed so the host
 * root's `@keydown` can delegate into it, matching the legacy
 * `onKeyDown: (e) => this.choices?.handleKeyDown(e)` wiring; `exit-input-focus`
 * is emitted so the host can refocus its own root, matching legacy's
 * `this.rootEl.focus()` call inside `handleInputModeKeyDown`'s Escape branch
 * (this component has no root of its own to focus).
 */
const props = defineProps<{ specs: InlineChoiceRowSpec[] }>();
const emit = defineEmits<{ cancel: []; 'exit-input-focus': [] }>();

const focusedIndex = ref(0);
const isInputFocused = ref(false);
const itemRefs = ref<(HTMLElement | null)[]>([]);
const inputEl = ref<HTMLInputElement | null>(null);

function setItemRef(el: VNodeRefEl, index: number): void {
  itemRefs.value[index] = (el as HTMLElement | null) ?? null;
}

function setInputRef(el: VNodeRefEl): void {
  inputEl.value = (el as HTMLInputElement | null) ?? null;
}

/** Mirrors legacy `updateFocus()`: re-derives every row's focus/scroll/input
 *  state from `focusedIndex` rather than diffing old vs. new. */
function updateFocus(): void {
  props.specs.forEach((spec, i) => {
    if (i === focusedIndex.value) {
      itemRefs.value[i]?.scrollIntoView({ block: 'nearest' });
      if (spec.kind === 'input') {
        inputEl.value?.focus();
      }
    } else if (spec.kind === 'input' && inputEl.value && inputEl.value.ownerDocument.activeElement === inputEl.value) {
      inputEl.value.blur();
    }
  });
}

function onRowClick(index: number, spec: InlineChoiceRowSpec): void {
  focusedIndex.value = index;
  updateFocus();
  if (spec.kind === 'action') {
    spec.onSelect();
  }
}

function onInputFocus(): void {
  isInputFocused.value = true;
}

function onInputBlur(): void {
  isInputFocused.value = false;
}

function handleInputModeKeyDown(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    e.preventDefault();
    e.stopPropagation();
    isInputFocused.value = false;
    inputEl.value?.blur();
    emit('exit-input-focus');
    return;
  }
  if (e.key === 'Enter' && inputEl.value && inputEl.value.value.trim()) {
    e.preventDefault();
    e.stopPropagation();
    const spec = props.specs[focusedIndex.value];
    if (spec?.kind === 'input') {
      spec.onSubmit(inputEl.value.value.trim());
    }
  }
}

function handleKeyDown(e: KeyboardEvent): void {
  if (isInputFocused.value) {
    handleInputModeKeyDown(e);
    return;
  }

  switch (e.key) {
    case 'ArrowDown':
      e.preventDefault();
      e.stopPropagation();
      focusedIndex.value = Math.min(focusedIndex.value + 1, props.specs.length - 1);
      updateFocus();
      break;
    case 'ArrowUp':
      e.preventDefault();
      e.stopPropagation();
      focusedIndex.value = Math.max(focusedIndex.value - 1, 0);
      updateFocus();
      break;
    case 'Enter': {
      e.preventDefault();
      e.stopPropagation();
      const spec = props.specs[focusedIndex.value];
      if (spec?.kind === 'action') {
        spec.onSelect();
      } else if (spec?.kind === 'input') {
        inputEl.value?.focus();
      }
      break;
    }
    case 'Escape':
      e.preventDefault();
      e.stopPropagation();
      emit('cancel');
      break;
  }
}

defineExpose({ handleKeyDown });
</script>

<template>
  <div class="specorator-ask-list">
    <div
      v-for="(spec, index) in specs"
      :key="index"
      :ref="(el) => setItemRef(el, index)"
      class="specorator-ask-item"
      :class="[spec.kind === 'input' ? 'specorator-ask-custom-item' : null, { 'is-focused': index === focusedIndex }]"
      @click="onRowClick(index, spec)"
    >
      <!-- eslint-disable-next-line no-irregular-whitespace -- nbsp cursor placeholder, matches legacy \u00A0 exactly -->
      <span class="specorator-ask-cursor">{{ index === focusedIndex ? '›' : ' ' }}</span>
      <span class="specorator-ask-item-num">{{ index + 1 }}. </span>
      <span
        v-if="spec.kind === 'action'"
        class="specorator-ask-item-label"
      >{{ spec.label }}</span>
      <input
        v-else
        :ref="setInputRef"
        type="text"
        class="specorator-ask-custom-text"
        :placeholder="spec.placeholder"
        @focus="onInputFocus"
        @blur="onInputBlur"
      >
    </div>
  </div>
</template>
