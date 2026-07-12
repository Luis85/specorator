<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';

import { CHOICE_CARD_HINTS_TEXT, type InlineChoiceRowSpec } from '../../../../rendering/inlineChoiceCard';
import type { PlanApprovalDecision } from '../../../../rendering/InlinePlanApproval';
import InlineChoiceList from './InlineChoiceList.vue';
import PlanContentPreview from './PlanContentPreview.vue';

/**
 * Vue port of `rendering/InlinePlanApproval.ts`. Owns ONLY input capture +
 * the single-exit resolve guard: takes `resolve` and calls it exactly once
 * with a decision or `null`. Unlike `InlineExitPlanMode.vue`, this card
 * takes NO `AbortSignal` (matching the legacy class). Visibility/attention
 * side effects and mounting/unmounting the card are owned by
 * `InlinePromptController` (Task 18) — out of scope here. Component unmount
 * (before a decision is made) is treated as the Vue equivalent of the legacy
 * class's `destroy()`: it resolves `null` exactly once.
 *
 * Plan-content seam: unlike ExitPlanMode, no decision here ever carries plan
 * content, so this card only needs the already-resolved preview text —
 * `planPreview` / `planReadError` (the caller runs
 * `readPlanMarkdownFromArtifact` before mounting). No fs access, no
 * resolve-time content callback needed.
 */
const props = defineProps<{
  resolve: (decision: PlanApprovalDecision | null) => void;
  planPreview: string | null;
  planReadError: string | null;
}>();

const rootEl = ref<HTMLElement | null>(null);
const choiceListRef = ref<InstanceType<typeof InlineChoiceList> | null>(null);
let resolved = false;

const readErrorMessage = props.planReadError ? `Could not read plan file: ${props.planReadError}` : null;

function handleResolve(decision: PlanApprovalDecision | null): void {
  if (resolved) return;
  resolved = true;
  props.resolve(decision);
}

const specs: InlineChoiceRowSpec[] = [
  {
    kind: 'action',
    label: 'Implement',
    onSelect: () => handleResolve({ type: 'implement' }),
  },
  {
    kind: 'input',
    placeholder: 'Enter feedback to revise plan...',
    onSubmit: (text) => handleResolve({ type: 'revise', text }),
  },
  {
    kind: 'action',
    label: 'Cancel',
    onSelect: () => handleResolve({ type: 'cancel' }),
  },
];

function onRootKeyDown(e: KeyboardEvent): void {
  if (resolved) return;
  choiceListRef.value?.handleKeyDown(e);
}

function focusRoot(): void {
  rootEl.value?.focus();
}

onMounted(() => {
  window.requestAnimationFrame(() => {
    rootEl.value?.focus();
    rootEl.value?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });
});

onBeforeUnmount(() => {
  handleResolve(null);
});
</script>

<template>
  <div
    ref="rootEl"
    class="specorator-plan-approval-inline"
    tabindex="0"
    @keydown="onRootKeyDown"
  >
    <div class="specorator-plan-inline-title">
      Plan complete
    </div>
    <PlanContentPreview
      :content="planPreview"
      :error-message="readErrorMessage"
    />
    <InlineChoiceList
      ref="choiceListRef"
      :specs="specs"
      @cancel="handleResolve(null)"
      @exit-input-focus="focusRoot"
    />
    <div class="specorator-ask-hints">
      {{ CHOICE_CARD_HINTS_TEXT }}
    </div>
  </div>
</template>
