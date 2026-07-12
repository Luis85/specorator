<script setup lang="ts">
import { computed } from 'vue';

import CopyButton from '../CopyButton.vue';
import MarkdownHost from '../MarkdownHost.vue';

/**
 * Plain markdown text block. Reproduces two paths from
 * `rendering/MessageRenderer.ts`:
 *  - `renderPlainAssistantTextBlock`: `.specorator-text-block` + a copy button.
 *  - `renderUserTextBlock`'s work-order-prompt collapse: a user text block
 *    whose content contains the signature line emitted by `renderTaskPrompt`
 *    collapses behind a `<details class="specorator-work-order-prompt">`.
 *
 * The work-order *protocol segment split* (progress/needs-input/handoff/etc.)
 * is a later task — this component only ever renders plain markdown or the
 * user work-order-prompt collapse.
 */
const props = defineProps<{ content: string; role: 'user' | 'assistant' }>();

// Mirrors `MessageRenderer.ts`'s WORK_ORDER_PROMPT_SIGNATURE constant, which
// is not exported from that (LOC-capped) module — re-declared here per the
// migration plan rather than widening that file's public surface.
const WORK_ORDER_PROMPT_SIGNATURE = 'You are executing a Specorator work order.';

const isWorkOrderPrompt = computed(
  () => props.role === 'user' && props.content.includes(WORK_ORDER_PROMPT_SIGNATURE)
);
</script>

<template>
  <details
    v-if="isWorkOrderPrompt"
    class="specorator-work-order-prompt"
  >
    <summary class="specorator-work-order-prompt-summary">Work order prompt</summary>
    <div class="specorator-text-block">
      <MarkdownHost :markdown="content" />
    </div>
  </details>
  <div
    v-else
    class="specorator-text-block"
  >
    <MarkdownHost :markdown="content" />
    <CopyButton
      v-if="role === 'assistant'"
      :text="content"
    />
  </div>
</template>
