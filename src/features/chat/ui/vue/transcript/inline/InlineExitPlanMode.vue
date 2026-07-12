<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';

import type { ExitPlanModeDecision } from '../../../../../../core/types/tools';
import { CHOICE_CARD_HINTS_TEXT, type InlineChoiceRowSpec } from '../../../../rendering/inlineChoiceCard';
import InlineChoiceList from './InlineChoiceList.vue';
import PlanContentPreview from './PlanContentPreview.vue';

/**
 * Vue port of `rendering/InlineExitPlanMode.ts`. Owns ONLY input capture +
 * the single-exit resolve guard: takes `resolve` (+ optional `signal`) and
 * calls it exactly once with a decision or `null`. Visibility/attention side
 * effects (hideInputContainer, needsAttention) and mounting/unmounting the
 * card are owned by `InlinePromptController` (Task 18) — out of scope here.
 * Component unmount (before a decision is made) is treated as the Vue
 * equivalent of the legacy class's `destroy()`: it resolves `null` exactly
 * once, same as an aborted signal.
 *
 * Plan-content seam: the legacy class does a gated `fs.readFileSync` at
 * render time and caches the result for BOTH the on-screen preview AND the
 * `approve-new-session` decision's `planContent` payload. This component
 * does no fs access itself and stays pure/testable: `planPreview` /
 * `planReadError` carry the already-resolved preview (the caller performs
 * the same gated read before mounting this card), and `resolvePlanContent`
 * is invoked once, at the moment "Approve (new session)" is chosen, to build
 * that decision's `planContent` text — the engine supplies the fs read as
 * this callback at wiring time (Task 18).
 */
const props = defineProps<{
  resolve: (decision: ExitPlanModeDecision | null) => void;
  signal?: AbortSignal;
  planPreview: string | null;
  planReadError: string | null;
  allowedPrompts?: Array<{ tool: string; prompt: string }>;
  resolvePlanContent?: () => string | null;
}>();

const rootEl = ref<HTMLElement | null>(null);
const choiceListRef = ref<InstanceType<typeof InlineChoiceList> | null>(null);
let resolved = false;

const readErrorMessage = props.planReadError
  ? `Could not read plan file: ${props.planReadError}. "Approve (new session)" will not include plan details.`
  : null;

function extractPlanContent(): string {
  const content = props.resolvePlanContent?.() ?? null;
  return content ? `Implement this plan:\n\n${content}` : 'Implement the approved plan.';
}

function cleanupAbortListener(): void {
  props.signal?.removeEventListener('abort', onAbort);
}

function handleResolve(decision: ExitPlanModeDecision | null): void {
  if (resolved) return;
  resolved = true;
  cleanupAbortListener();
  props.resolve(decision);
}

function onAbort(): void {
  handleResolve(null);
}

const specs: InlineChoiceRowSpec[] = [
  {
    kind: 'action',
    label: 'Approve (new session)',
    onSelect: () => handleResolve({ type: 'approve-new-session', planContent: extractPlanContent() }),
  },
  {
    kind: 'action',
    label: 'Approve (current session)',
    onSelect: () => handleResolve({ type: 'approve' }),
  },
  {
    kind: 'input',
    placeholder: 'Enter feedback to continue planning...',
    onSubmit: (text) => handleResolve({ type: 'feedback', text }),
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
  props.signal?.addEventListener('abort', onAbort, { once: true });
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
    <div
      v-if="allowedPrompts && allowedPrompts.length > 0"
      class="specorator-plan-permissions"
    >
      <div class="specorator-plan-permissions-label">
        Requested permissions:
      </div>
      <ul class="specorator-plan-permissions-list">
        <li
          v-for="(perm, i) in allowedPrompts"
          :key="i"
        >
          {{ perm.prompt }}
        </li>
      </ul>
    </div>
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
