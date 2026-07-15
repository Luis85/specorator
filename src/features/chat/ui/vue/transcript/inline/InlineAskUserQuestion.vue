<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';

import type { AskUserQuestionItem, AskUserQuestionOption } from '../../../../../../core/types/tools';
import { formatAskUserQuestionDisplayAnswer } from '../askUserQuestionDisplayAnswer';
import AskCustomInputRow from './AskCustomInputRow.vue';
import AskOptionRow from './AskOptionRow.vue';
import { coerceOption, deduplicateOptions } from './askUserQuestionOptions';

/**
 * Vue port of `rendering/InlineAskUserQuestion.ts`. Owns ONLY input capture +
 * the single-exit resolve guard: takes `resolve` (+ optional `signal`) and
 * calls it exactly once with an answers Record or `null`. Visibility/
 * attention side effects (hideInputContainer, needsAttention) and mounting/
 * unmounting the card are owned by `InlinePromptController` (Task 18) — out
 * of scope here. Component unmount (before a resolve) is treated as the Vue
 * equivalent of the legacy class's `destroy()`: it resolves `null` exactly
 * once, same as an aborted signal.
 *
 * The approval header is a `#header` slot (filled by `InlineApproval.vue`)
 * rather than the legacy's detached-`headerEl`-reattach trick — Vue owns the
 * whole subtree so there's no need to build DOM outside the component and
 * splice it in.
 *
 * State model: `answers`/`customInputs` are plain reactive arrays (index =
 * question index) rather than the legacy `Map<number, Set<string>>` — same
 * semantics (uniqueness enforced on push/splice), simpler Vue reactivity.
 * `questions` is parsed once from `input` at setup time (mirrors the legacy
 * one-shot `parseQuestions()` call inside `render()`); `input` is not
 * expected to change after mount.
 */
const HINTS_TEXT = 'Enter to select · Tab/Arrow keys to navigate · Esc to cancel';
const HINTS_TEXT_IMMEDIATE = 'Enter to select · Arrow keys to navigate · Esc to cancel';

interface RawQuestion {
  question: string;
  header?: string;
  options?: unknown[] | null;
  multiSelect?: boolean;
  isOther?: boolean;
  isSecret?: boolean;
  id?: string;
}

function parseQuestions(input: Record<string, unknown>): AskUserQuestionItem[] {
  const raw = input.questions;
  if (!Array.isArray(raw)) return [];

  return (raw as unknown[])
    .filter((q): q is RawQuestion => {
      if (!q || typeof q !== 'object' || Array.isArray(q)) return false;
      const record = q as Record<string, unknown>;
      return typeof record.question === 'string'
        && ((Array.isArray(record.options) && record.options.length > 0) || record.isOther === true);
    })
    .map((q, idx) => ({
      question: q.question,
      id: typeof q.id === 'string' ? q.id : undefined,
      header: typeof q.header === 'string' ? q.header.slice(0, 12) : `Q${idx + 1}`,
      options: deduplicateOptions((q.options ?? []).map((o) => coerceOption(o))),
      multiSelect: q.multiSelect === true,
      isOther: q.isOther === true,
      isSecret: q.isSecret === true,
    }));
}

function getOptionValue(option: AskUserQuestionOption): string {
  return option.value ?? option.label;
}

const props = withDefaults(defineProps<{
  resolve: (result: Record<string, string | string[]> | null) => void;
  input: Record<string, unknown>;
  signal?: AbortSignal;
  title?: string;
  showCustomInput?: boolean;
  immediateSelect?: boolean;
}>(), {
  signal: undefined,
  title: 'Question',
  showCustomInput: true,
  immediateSelect: false,
});

const questions = parseQuestions(props.input);
const effectiveImmediateSelect = props.immediateSelect === true && questions.length === 1;

const rootEl = ref<HTMLElement | null>(null);
const contentAreaEl = ref<HTMLElement | null>(null);
let resolved = false;

const activeTabIndex = ref(0);
const focusedItemIndex = ref(0);
const isInputFocused = ref(false);
const answers = ref<string[][]>(questions.map(() => []));
const customInputs = ref<string[]>(questions.map(() => ''));

function isQuestionAnswered(idx: number): boolean {
  return answers.value[idx].length > 0 || customInputs.value[idx].trim().length > 0;
}

function allAnswered(): boolean {
  return questions.every((_, i) => isQuestionAnswered(i));
}

function canShowCustomInputForQuestion(q: AskUserQuestionItem): boolean {
  return props.showCustomInput !== false && q.isOther === true;
}

function getSelectedLabels(idx: number): string[] {
  const selected = answers.value[idx];
  return questions[idx].options
    .filter((o) => selected.includes(getOptionValue(o)))
    .map((o) => o.label);
}

function getAnswerText(idx: number): string {
  const selected = getSelectedLabels(idx);
  const custom = customInputs.value[idx];
  const parts: string[] = [];
  if (selected.length > 0) parts.push(selected.join(', '));
  if (custom.trim()) parts.push(custom.trim());
  return formatAskUserQuestionDisplayAnswer(
    parts.join(', '),
    questions[idx].isSecret === true,
  );
}

function cleanupAbortListener(): void {
  props.signal?.removeEventListener('abort', onAbort);
}

function handleResolve(result: Record<string, string | string[]> | null): void {
  if (resolved) return;
  resolved = true;
  cleanupAbortListener();
  props.resolve(result);
}

function onAbort(): void {
  handleResolve(null);
}

function switchTab(index: number): void {
  const clamped = Math.max(0, Math.min(index, questions.length));
  if (clamped === activeTabIndex.value) return;
  activeTabIndex.value = clamped;
  focusedItemIndex.value = 0;
  isInputFocused.value = false;
  rootEl.value?.focus();
}

function selectOption(qIdx: number, option: AskUserQuestionOption): void {
  const q = questions[qIdx];
  const value = getOptionValue(option);

  if (q.multiSelect) {
    const selected = answers.value[qIdx];
    const i = selected.indexOf(value);
    if (i >= 0) selected.splice(i, 1);
    else selected.push(value);
  } else {
    answers.value[qIdx] = [value];
    customInputs.value[qIdx] = '';
  }

  if (effectiveImmediateSelect) {
    const key = q.id ?? q.question;
    handleResolve({ [key]: value });
    return;
  }

  if (!q.multiSelect) {
    switchTab(activeTabIndex.value + 1);
  }
}

function onOptionSelect(optIdx: number, option: AskUserQuestionOption): void {
  focusedItemIndex.value = optIdx;
  selectOption(activeTabIndex.value, option);
}

function onCustomInput(idx: number, value: string): void {
  customInputs.value[idx] = value;
  if (!questions[idx].multiSelect && value.trim()) {
    answers.value[idx] = [];
  }
}

function onCustomRowClick(customIdx: number): void {
  focusedItemIndex.value = customIdx;
}

function handleSubmit(): void {
  if (!allAnswered()) return;

  const result: Record<string, string | string[]> = {};
  questions.forEach((q, i) => {
    const key = q.id ?? q.question;
    const selectedValues = answers.value[i];
    const customInput = customInputs.value[i].trim();

    if (q.multiSelect) {
      const values = [...selectedValues];
      if (customInput) values.push(customInput);
      result[key] = values;
      return;
    }

    result[key] = customInput || selectedValues[0] || '';
  });
  handleResolve(result);
}

function onSubmitRowClick(): void {
  focusedItemIndex.value = 0;
  handleSubmit();
}

function onCancelRowClick(): void {
  focusedItemIndex.value = 1;
  handleResolve(null);
}

function blurActiveElement(): void {
  (rootEl.value?.ownerDocument.activeElement as HTMLElement | null)?.blur();
}

function focusCustomInput(): void {
  const input = contentAreaEl.value?.querySelector<HTMLInputElement>('.specorator-ask-custom-text');
  input?.focus();
}

function handleNavigationKey(e: KeyboardEvent, maxFocusIndex: number): boolean {
  switch (e.key) {
    case 'ArrowDown':
      e.preventDefault();
      e.stopPropagation();
      focusedItemIndex.value = Math.min(focusedItemIndex.value + 1, maxFocusIndex);
      return true;
    case 'ArrowUp':
      e.preventDefault();
      e.stopPropagation();
      focusedItemIndex.value = Math.max(focusedItemIndex.value - 1, 0);
      return true;
    case 'ArrowLeft':
      if (effectiveImmediateSelect) return false;
      e.preventDefault();
      e.stopPropagation();
      switchTab(activeTabIndex.value - 1);
      return true;
    case 'Tab':
      if (effectiveImmediateSelect) return false;
      e.preventDefault();
      e.stopPropagation();
      if (e.shiftKey) switchTab(activeTabIndex.value - 1);
      else switchTab(activeTabIndex.value + 1);
      return true;
    case 'Escape':
      e.preventDefault();
      e.stopPropagation();
      handleResolve(null);
      return true;
    default:
      return false;
  }
}

function handleInputFocusedKey(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    e.preventDefault();
    e.stopPropagation();
    isInputFocused.value = false;
    blurActiveElement();
    rootEl.value?.focus();
    return;
  }
  if (e.key === 'Tab' || e.key === 'Enter') {
    e.preventDefault();
    e.stopPropagation();
    isInputFocused.value = false;
    blurActiveElement();
    switchTab(e.key === 'Tab' && e.shiftKey ? activeTabIndex.value - 1 : activeTabIndex.value + 1);
    return;
  }
  if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
    e.preventDefault();
    e.stopPropagation();
    blurActiveElement();
    isInputFocused.value = false;
    const q = questions[activeTabIndex.value];
    const maxIdx = canShowCustomInputForQuestion(q) ? q.options.length : q.options.length - 1;
    focusedItemIndex.value = e.key === 'ArrowUp'
      ? Math.max(focusedItemIndex.value - 1, 0)
      : Math.min(focusedItemIndex.value + 1, maxIdx);
    rootEl.value?.focus();
  }
}

function handleImmediateSelectKey(e: KeyboardEvent): void {
  const q = questions[activeTabIndex.value];
  const maxIdx = q.options.length - 1;
  if (handleNavigationKey(e, maxIdx)) return;
  if (e.key === 'Enter') {
    e.preventDefault();
    e.stopPropagation();
    if (focusedItemIndex.value <= maxIdx) {
      selectOption(activeTabIndex.value, q.options[focusedItemIndex.value]);
    }
  }
}

function handleSubmitTabKey(e: KeyboardEvent): void {
  if (handleNavigationKey(e, 1)) return;
  if (e.key === 'Enter') {
    e.preventDefault();
    e.stopPropagation();
    if (focusedItemIndex.value === 0) handleSubmit();
    else handleResolve(null);
  }
}

function handleQuestionTabKey(e: KeyboardEvent): void {
  const q = questions[activeTabIndex.value];
  const maxFocusIndex = canShowCustomInputForQuestion(q) ? q.options.length : q.options.length - 1;
  if (handleNavigationKey(e, maxFocusIndex)) return;

  switch (e.key) {
    case 'ArrowRight':
      e.preventDefault();
      e.stopPropagation();
      switchTab(activeTabIndex.value + 1);
      break;
    case 'Enter':
      e.preventDefault();
      e.stopPropagation();
      if (focusedItemIndex.value < q.options.length) {
        selectOption(activeTabIndex.value, q.options[focusedItemIndex.value]);
      } else if (canShowCustomInputForQuestion(q)) {
        isInputFocused.value = true;
        focusCustomInput();
      }
      break;
  }
}

function handleKeyDown(e: KeyboardEvent): void {
  if (isInputFocused.value) {
    handleInputFocusedKey(e);
    return;
  }
  if (effectiveImmediateSelect) {
    handleImmediateSelectKey(e);
    return;
  }
  if (activeTabIndex.value === questions.length) {
    handleSubmitTabKey(e);
    return;
  }
  handleQuestionTabKey(e);
}

function onRootKeyDown(e: KeyboardEvent): void {
  if (resolved) return;
  handleKeyDown(e);
}

function scrollFocusedItemIntoView(): void {
  const items = contentAreaEl.value?.querySelectorAll<HTMLElement>('.specorator-ask-item');
  items?.[focusedItemIndex.value]?.scrollIntoView({ block: 'nearest' });
}

watch(focusedItemIndex, () => scrollFocusedItemIntoView(), { flush: 'post' });

onMounted(() => {
  if (questions.length === 0) {
    handleResolve(null);
    return;
  }
  window.requestAnimationFrame(() => {
    rootEl.value?.focus();
    rootEl.value?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });
  props.signal?.addEventListener('abort', onAbort, { once: true });
});

onBeforeUnmount(() => {
  handleResolve(null);
});
</script>

<template>
  <div
    ref="rootEl"
    class="specorator-ask-question-inline"
    tabindex="0"
    @keydown="onRootKeyDown"
  >
    <div class="specorator-ask-inline-title">
      {{ title }}
    </div>
    <slot name="header" />
    <div
      v-if="questions.length > 0 && !effectiveImmediateSelect"
      class="specorator-ask-tab-bar"
    >
      <span
        v-for="(q, idx) in questions"
        :key="idx"
        class="specorator-ask-tab"
        :class="{ 'is-active': idx === activeTabIndex, 'is-answered': isQuestionAnswered(idx) }"
        :title="q.question"
        @click="switchTab(idx)"
      >
        <span class="specorator-ask-tab-label">{{ q.header }}</span>
        <span class="specorator-ask-tab-tick">{{ isQuestionAnswered(idx) ? ' ✓' : '' }}</span>
      </span>
      <span
        class="specorator-ask-tab"
        :class="{ 'is-active': activeTabIndex === questions.length }"
        @click="switchTab(questions.length)"
      >
        <span class="specorator-ask-tab-submit-check">{{ allAnswered() ? '✓ ' : '' }}</span>
        <span class="specorator-ask-tab-label">Submit</span>
      </span>
    </div>
    <div
      v-if="questions.length > 0"
      ref="contentAreaEl"
      class="specorator-ask-content"
    >
      <template v-if="activeTabIndex < questions.length">
        <div class="specorator-ask-question-text">
          {{ questions[activeTabIndex].question }}
        </div>
        <div class="specorator-ask-list">
          <AskOptionRow
            v-for="(option, optIdx) in questions[activeTabIndex].options"
            :key="optIdx"
            :option="option"
            :opt-idx="optIdx"
            :is-focused="optIdx === focusedItemIndex"
            :is-selected="answers[activeTabIndex].includes(getOptionValue(option))"
            :is-multi="questions[activeTabIndex].multiSelect"
            @select="onOptionSelect(optIdx, option)"
          />
          <AskCustomInputRow
            v-if="canShowCustomInputForQuestion(questions[activeTabIndex])"
            :custom-idx="questions[activeTabIndex].options.length"
            :is-focused="questions[activeTabIndex].options.length === focusedItemIndex"
            :is-multi="questions[activeTabIndex].multiSelect"
            :is-secret="questions[activeTabIndex].isSecret === true"
            :text="customInputs[activeTabIndex]"
            :has-custom-text="customInputs[activeTabIndex].trim().length > 0"
            @update:text="onCustomInput(activeTabIndex, $event)"
            @focus="isInputFocused = true"
            @blur="isInputFocused = false"
            @row-click="onCustomRowClick(questions[activeTabIndex].options.length)"
          />
        </div>
        <div class="specorator-ask-hints">
          {{ effectiveImmediateSelect ? HINTS_TEXT_IMMEDIATE : HINTS_TEXT }}
        </div>
      </template>
      <template v-else>
        <div class="specorator-ask-review-title">
          Review your answers
        </div>
        <div class="specorator-ask-review">
          <div
            v-for="(q, idx) in questions"
            :key="idx"
            class="specorator-ask-review-pair"
            @click="switchTab(idx)"
          >
            <div class="specorator-ask-review-num">
              {{ idx + 1 }}.
            </div>
            <div class="specorator-ask-review-body">
              <div class="specorator-ask-review-q-text">
                {{ q.question }}
              </div>
              <div :class="getAnswerText(idx) ? 'specorator-ask-review-a-text' : 'specorator-ask-review-empty'">
                {{ getAnswerText(idx) || 'Not answered' }}
              </div>
            </div>
          </div>
        </div>
        <div class="specorator-ask-review-prompt">
          Ready to submit your answers?
        </div>
        <div class="specorator-ask-list">
          <div
            class="specorator-ask-item"
            :class="{ 'is-focused': focusedItemIndex === 0, 'is-disabled': !allAnswered() }"
            @click="onSubmitRowClick"
          >
            <span class="specorator-ask-cursor">{{ focusedItemIndex === 0 ? '›' : '\u00A0' }}</span>
            <span class="specorator-ask-item-num">1. </span>
            <span class="specorator-ask-item-label">Submit answers</span>
          </div>
          <div
            class="specorator-ask-item"
            :class="{ 'is-focused': focusedItemIndex === 1 }"
            @click="onCancelRowClick"
          >
            <span class="specorator-ask-cursor">{{ focusedItemIndex === 1 ? '›' : '\u00A0' }}</span>
            <span class="specorator-ask-item-num">2. </span>
            <span class="specorator-ask-item-label">Cancel</span>
          </div>
        </div>
        <div class="specorator-ask-hints">
          {{ HINTS_TEXT }}
        </div>
      </template>
    </div>
  </div>
</template>
