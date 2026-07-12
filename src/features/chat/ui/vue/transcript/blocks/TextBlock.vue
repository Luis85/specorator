<script setup lang="ts">
import { computed, inject } from 'vue';

import { splitWorkOrderProtocolForDisplay, type WorkOrderProtocolSegment } from '../../../../rendering/WorkOrderProtocolDisplay';
import WorkOrderHandoffCard from '../cards/WorkOrderHandoffCard.vue';
import WorkOrderNeedsApprovalCard from '../cards/WorkOrderNeedsApprovalCard.vue';
import WorkOrderNeedsInputCard from '../cards/WorkOrderNeedsInputCard.vue';
import WorkOrderProgressCard from '../cards/WorkOrderProgressCard.vue';
import CopyButton from '../CopyButton.vue';
import MarkdownHost from '../MarkdownHost.vue';
import { CALLBACKS_KEY } from '../transcriptKeys';

/**
 * Reproduces three paths from `rendering/MessageRenderer.ts`:
 *  - `renderUserTextBlock`'s work-order-prompt collapse: a user text block
 *    whose content contains the signature line emitted by `renderTaskPrompt`
 *    collapses behind a `<details class="specorator-work-order-prompt">`.
 *  - `renderPlainAssistantTextBlock`: `.specorator-text-block` + a copy
 *    button — used both for the plain-assistant path (no active work-order
 *    tab) and for each `markdown`-type segment when a work-order split
 *    applies (`renderAssistantDisplaySegment`'s `markdown` case re-dispatches
 *    to the same plain renderer, copy button included).
 *  - `renderAssistantTextBlock`'s work-order protocol segment split: when
 *    `getWorkOrderPath()` is truthy, `splitWorkOrderProtocolForDisplay`
 *    breaks the markdown into segments and each non-markdown segment renders
 *    through its matching card. `getWorkOrderPath` is read from the optional
 *    injected callbacks seam — absent (e.g. isolated component tests) or
 *    falsy (no active work-order tab) both fall back to the single-segment
 *    plain-markdown path, matching the legacy `!this.getWorkOrderPath()`
 *    short-circuit.
 */
const props = defineProps<{ content: string; role: 'user' | 'assistant' }>();

const callbacks = inject(CALLBACKS_KEY, undefined);

// Mirrors `MessageRenderer.ts`'s WORK_ORDER_PROMPT_SIGNATURE constant, which
// is not exported from that (LOC-capped) module — re-declared here per the
// migration plan rather than widening that file's public surface.
const WORK_ORDER_PROMPT_SIGNATURE = 'You are executing a Specorator work order.';

const isWorkOrderPrompt = computed(
  () => props.role === 'user' && props.content.includes(WORK_ORDER_PROMPT_SIGNATURE)
);

const segments = computed<WorkOrderProtocolSegment[]>(() => {
  const workOrderPath = callbacks?.getWorkOrderPath() ?? null;
  if (props.role !== 'assistant' || !workOrderPath) {
    return [{ type: 'markdown', content: props.content }];
  }
  return splitWorkOrderProtocolForDisplay(props.content);
});
</script>

<template>
  <!-- eslint-disable vue/singleline-html-element-content-newline -- exact textContent parity with the legacy DOM contract (the summary label must be "Work order prompt", no surrounding whitespace) -->
  <details
    v-if="isWorkOrderPrompt"
    class="specorator-work-order-prompt"
  >
    <summary class="specorator-work-order-prompt-summary">Work order prompt</summary>
    <div class="specorator-text-block">
      <MarkdownHost :markdown="content" />
    </div>
  </details>
  <!-- eslint-enable vue/singleline-html-element-content-newline -->
  <template v-else-if="role === 'assistant'">
    <template
      v-for="(segment, i) in segments"
      :key="i"
    >
      <div
        v-if="segment.type === 'markdown'"
        class="specorator-text-block"
      >
        <MarkdownHost :markdown="segment.content" />
        <CopyButton :text="segment.content" />
      </div>
      <WorkOrderProgressCard
        v-else-if="segment.type === 'progress'"
        :progress="segment.progress"
      />
      <WorkOrderNeedsInputCard
        v-else-if="segment.type === 'needs_input'"
        :needs-input="segment.needsInput"
      />
      <WorkOrderNeedsApprovalCard
        v-else-if="segment.type === 'needs_approval'"
        :needs-approval="segment.needsApproval"
      />
      <WorkOrderHandoffCard
        v-else-if="segment.type === 'handoff'"
        :handoff="segment.handoff"
        :preview="segment.preview"
      />
    </template>
  </template>
  <div
    v-else
    class="specorator-text-block"
  >
    <MarkdownHost :markdown="content" />
  </div>
</template>
