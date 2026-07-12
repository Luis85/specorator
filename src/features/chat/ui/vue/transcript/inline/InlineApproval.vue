<script setup lang="ts">
import { Notice } from 'obsidian';

import type { ApprovalCallbackOptions, ApprovalDecisionOption } from '../../../../../../core/runtime/types';
import { getToolIcon } from '../../../../../../core/tools/toolIcons';
import type { ApprovalDecision } from '../../../../../../core/types';
import { t } from '../../../../../../i18n/i18n';
import IconSpan from '../IconSpan.vue';
import InlineAskUserQuestion from './InlineAskUserQuestion.vue';

/**
 * Vue port of the approval half of `InlinePromptController.handleApprovalRequest`:
 * configures `InlineAskUserQuestion.vue` as a single immediate-select question
 * ("Allow this action?") with the Deny/Allow once/Always allow options (or a
 * caller-supplied `decisionOptions` set), fills its `#header` slot with the
 * tool/reason/blocked-path/agent/description markup, and maps the resolved
 * answer to an `ApprovalDecision`.
 *
 * No `AbortSignal`: the legacy `handleApprovalRequest` hardcodes `undefined`
 * for the ask card's signal — approval prompts are not abortable today.
 */
const APPROVAL_OPTION_MAP: Record<string, ApprovalDecision> = {
  'Deny': 'deny',
  'Allow once': 'allow',
  'Always allow': 'allow-always',
};

const DEFAULT_APPROVAL_DECISION_OPTIONS: ApprovalDecisionOption[] =
  Object.entries(APPROVAL_OPTION_MAP).map(([label, decision]) => ({
    label,
    value: label,
    decision,
  }));

const props = defineProps<{
  resolve: (decision: ApprovalDecision) => void;
  toolName: string;
  description: string;
  approvalOptions?: ApprovalCallbackOptions;
}>();

const decisionOptions = props.approvalOptions?.decisionOptions ?? DEFAULT_APPROVAL_DECISION_OPTIONS;
const optionDecisionMap = new Map<string, ApprovalDecision>();
const questionOptions = decisionOptions.map((option, index) => {
  const value = option.value || `approval-option-${index}`;
  if (option.decision) {
    optionDecisionMap.set(value, option.decision);
  }
  return {
    label: option.label,
    description: option.description ?? '',
    value,
  };
});

const input = {
  questions: [{
    question: 'Allow this action?',
    options: questionOptions,
    isOther: false,
    isSecret: false,
  }],
};

function toApprovalDecision(result: Record<string, string | string[]> | null): ApprovalDecision {
  if (!result) return 'cancel';
  const selected = Object.values(result)[0];
  const selectedValue = Array.isArray(selected) ? selected[0] : selected;
  if (typeof selectedValue !== 'string') {
    new Notice(t('chat.input.unexpectedApprovalSelection', { value: String(selectedValue) }));
    return 'cancel';
  }

  const decision = optionDecisionMap.get(selectedValue);
  if (decision) return decision;

  return { type: 'select-option', value: selectedValue };
}

function onResolve(result: Record<string, string | string[]> | null): void {
  props.resolve(toApprovalDecision(result));
}
</script>

<template>
  <InlineAskUserQuestion
    :resolve="onResolve"
    :input="input"
    title="Permission required"
    :show-custom-input="false"
    immediate-select
  >
    <template #header>
      <div class="specorator-ask-approval-info">
        <div class="specorator-ask-approval-tool">
          <IconSpan
            :icon="getToolIcon(toolName)"
            css-class="specorator-ask-approval-icon"
            :aria-hidden="true"
          />
          <span class="specorator-ask-approval-tool-name">{{ toolName }}</span>
        </div>
        <div
          v-if="approvalOptions?.decisionReason"
          class="specorator-ask-approval-reason"
        >
          {{ approvalOptions.decisionReason }}
        </div>
        <div
          v-if="approvalOptions?.blockedPath"
          class="specorator-ask-approval-blocked-path"
        >
          {{ approvalOptions.blockedPath }}
        </div>
        <div
          v-if="approvalOptions?.agentID"
          class="specorator-ask-approval-agent"
        >
          Agent: {{ approvalOptions.agentID }}
        </div>
        <div class="specorator-ask-approval-desc">
          {{ description }}
        </div>
      </div>
    </template>
  </InlineAskUserQuestion>
</template>
