<script setup lang="ts">
import { computed, inject, ref } from 'vue';

import { t } from '../../../../../i18n/i18n';
import type { TaskSpec } from '../../../model/taskTypes';
import type { AgentBoardPauseState } from '../../cardActions';
import { CALLBACKS_KEY } from '../boardKeys';

// The paused-run reply surface: the live run's own control set — Send/Stop for
// needs_input, Approve/Reject for needs_approval — distinct from the hover
// action cluster. `pause` is nullable, so the
// prompt honors the same note-frontmatter fallback chain. WorkOrderCard gates the
// mount on STATUS (needs_input/needs_approval); the pause overlay only enriches
// the prompt, so the `?.` fallbacks below still hold when `pause` is null.
const props = defineProps<{ task: TaskSpec; pause: AgentBoardPauseState | null }>();

// Late-bound callbacks resolved at click time, like CardActionCluster.
const callbacks = inject(CALLBACKS_KEY) ?? null;

// Cap parity with REPLY_INPUT_MAX_LENGTH: keep a pasted megabyte from reaching
// the runtime and failing there with a cryptic error.
const MAX_LENGTH = 4000;

// Branch on the note status, not a pause discriminant — the real
// AgentBoardPauseState has no `kind`, and the imperative branches on status too.
const isNeedsInput = computed(() => props.task.frontmatter.status === 'needs_input');

// Prompt text with the imperative fallback chain: the live pause payload's
// question/action, else the note's pause_reason, else a generic i18n line.
const promptText = computed(() =>
  isNeedsInput.value
    ? props.pause?.question ?? props.task.frontmatter.pause_reason ?? t('tasks.board.card.reply.waitingForInput')
    : props.pause?.action ?? props.task.frontmatter.pause_reason ?? t('tasks.board.card.reply.requestsApproval'),
);

// renderPromptText parity: a single paragraph honors inline newlines via the
// --prewrap class; multiple blank-line-separated paragraphs each get their own
// row. Splitting (not Markdown) preserves the agent's structure as plain text.
const paragraphs = computed(() => promptText.value.split(/\n{2,}/));
const singleParagraph = computed(() => paragraphs.value.length === 1);

const riskText = computed(() =>
  props.pause?.risk ? t('tasks.board.card.reply.risk', { risk: props.pause.risk }) : null,
);

// Seed from the pause payload's default (needs_input) — parity with the
// imperative `field.value = pause.defaultValue`. needs_approval carries none.
const fieldValue = ref(props.pause?.defaultValue ?? '');

function submitReply(): void {
  callbacks?.onReply?.(props.task, fieldValue.value);
}
function stop(): void {
  // Stop routes through onCancelPaused (the imperative reply surface's Stop
  // button), which the view wires to the same stopTask() as the cluster's Stop.
  callbacks?.onCancelPaused?.(props.task);
}
function approve(): void {
  callbacks?.onApprove?.(props.task);
}
function reject(): void {
  // Reject reason source: the trimmed field, else the default-reject i18n string.
  callbacks?.onReject?.(props.task, fieldValue.value.trim() || t('tasks.board.card.reply.defaultRejectReason'));
}
</script>

<template>
  <!-- The card opens the detail view on click; keep reply interactions local. -->
  <div
    class="specorator-agent-board-card-reply"
    @click.stop
  >
    <div
      class="specorator-agent-board-card-reply-prompt"
      :class="{ 'specorator-agent-board-card-reply-prompt--prewrap': singleParagraph }"
    >
      <template v-if="singleParagraph">
        {{ promptText }}
      </template>
      <template v-else>
        <div
          v-for="(paragraph, index) in paragraphs"
          :key="index"
          class="specorator-agent-board-card-reply-prompt-paragraph"
        >
          {{ paragraph }}
        </div>
      </template>
    </div>

    <template v-if="isNeedsInput">
      <input
        v-model="fieldValue"
        class="specorator-agent-board-card-reply--field"
        type="text"
        :maxlength="MAX_LENGTH"
        :placeholder="t('tasks.board.card.reply.inputPlaceholder')"
        @keydown.enter.prevent="submitReply"
      >
      <div class="specorator-agent-board-card-reply--actions">
        <button
          type="button"
          class="mod-cta"
          @click.stop="submitReply"
        >
          {{ t('tasks.board.card.reply.send') }}
        </button>
        <button
          type="button"
          @click.stop="stop"
        >
          {{ t('tasks.board.card.reply.stop') }}
        </button>
      </div>
    </template>

    <template v-else>
      <div
        v-if="riskText"
        class="specorator-agent-board-card-reply-risk"
      >
        {{ riskText }}
      </div>
      <input
        v-model="fieldValue"
        class="specorator-agent-board-card-reply--field"
        type="text"
        :maxlength="MAX_LENGTH"
        :placeholder="t('tasks.board.card.reply.rejectReasonPlaceholder')"
      >
      <div class="specorator-agent-board-card-reply--actions">
        <button
          type="button"
          class="mod-cta"
          @click.stop="approve"
        >
          {{ t('tasks.board.card.reply.approve') }}
        </button>
        <button
          type="button"
          @click.stop="reject"
        >
          {{ t('tasks.board.card.reply.reject') }}
        </button>
      </div>
    </template>
  </div>
</template>
