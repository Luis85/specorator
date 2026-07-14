<script setup lang="ts">
import { computed } from 'vue';

import { extractResolvedAnswersFromResultText } from '../../../../../../core/tools/toolInput';
import type { AskUserQuestionItem, ToolCallInfo } from '../../../../../../core/types';
import { formatAskUserQuestionDisplayAnswer } from '../askUserQuestionDisplayAnswer';

/**
 * Reproduces the read-only ANSWERED branch of
 * `rendering/askUserQuestionRenderer.ts`'s `renderAskUserQuestionResult`
 * (`.specorator-ask-review` review rows). The pre-answer options-list state
 * (`renderAskUserQuestionFallback`) is a separate, larger DOM contract that
 * this task does not build — when questions/answers can't be resolved this
 * falls back to the shared plain-text `contentFallback` contract instead of
 * reproducing the options list, since stored tool calls are expected to
 * already be answered.
 *
 * Note: the legacy `resolveAskUserAnswers` caches its parsed result back
 * onto `toolCall.resolvedAnswers` as a side effect. That mutation is dropped
 * here (props must not be mutated) in favor of a pure computed re-derivation.
 */
const props = defineProps<{ toolCall: ToolCallInfo }>();

const questions = computed<AskUserQuestionItem[] | undefined>(() => {
  const raw = props.toolCall.input.questions;
  return Array.isArray(raw) ? (raw as AskUserQuestionItem[]) : undefined;
});

const answers = computed(
  () => props.toolCall.resolvedAnswers ?? extractResolvedAnswersFromResultText(props.toolCall.result)
);

interface AnswerRow {
  index: number;
  question: string;
  answer: string;
}

const rows = computed<AnswerRow[] | null>(() => {
  const qs = questions.value;
  const ans = answers.value;
  if (!qs || !ans) return null;

  return qs.map((q, i) => ({
    index: i + 1,
    question: q.question,
    answer: formatAskUserQuestionDisplayAnswer(
      (q.id ? ans[q.id] : undefined) ?? ans[q.question],
      q.isSecret === true,
    ),
  }));
});

const fallbackText = computed(() => {
  const qs = questions.value;
  const ans = answers.value;
  if (qs?.some((q) => q.isSecret === true) && ans) {
    return qs.map((q) => {
      const raw = (q.id ? ans[q.id] : undefined) ?? ans[q.question];
      const display = formatAskUserQuestionDisplayAnswer(raw, q.isSecret === true);
      return `${q.question}=${display || 'Not answered'}`;
    }).join('; ');
  }
  return props.toolCall.result || 'Waiting for answer...';
});
</script>

<template>
  <div
    v-if="rows"
    class="specorator-ask-review"
  >
    <div
      v-for="row in rows"
      :key="row.index"
      class="specorator-ask-review-pair"
    >
      <!-- eslint-disable vue/singleline-html-element-content-newline -- exact textContent parity with the legacy DOM contract (no surrounding whitespace) -->
      <div class="specorator-ask-review-num">{{ row.index }}.</div>
      <div class="specorator-ask-review-body">
        <div class="specorator-ask-review-q-text">{{ row.question }}</div>
        <div :class="row.answer ? 'specorator-ask-review-a-text' : 'specorator-ask-review-empty'">{{ row.answer || 'Not answered' }}</div>
      </div>
      <!-- eslint-enable vue/singleline-html-element-content-newline -->
    </div>
  </div>
  <div
    v-else
    class="specorator-tool-result-row"
  >
    <span class="specorator-tool-result-text">{{ fallbackText }}</span>
  </div>
</template>
