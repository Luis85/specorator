<script setup lang="ts">
import { computed, inject } from 'vue';

import { DEFAULT_CHAT_PROVIDER_ID } from '../../../../../../core/providers/types';
import type { ChatMessage } from '../../../../../../core/types';
import { formatDurationMmSs } from '../../../../../../utils/date';
import { classifyRuntimeError } from '../../../../controllers/runtimeErrorClassification';
import { CALLBACKS_KEY } from '../transcriptKeys';
import { hasDurationFooter, resolveBlockListItems } from './blockListViewModel';
import ContextCompactedMarker from './ContextCompactedMarker.vue';
import RuntimeErrorCard from './RuntimeErrorCard.vue';
import SubagentBlock from './SubagentBlock.vue';
import TextBlock from './TextBlock.vue';
import ThinkingBlock from './ThinkingBlock.vue';
import ToolCall from './ToolCall.vue';
import WriteEditView from './WriteEditView.vue';

/**
 * Reproduces `rendering/assistantMessageContent.ts`'s
 * `renderAssistantMessageContent` (content-block dispatch loop + leftover
 * tool calls + legacy fallback + duration footer) as a thin `<component>`
 * dispatch over `blockListViewModel.resolveBlockListItems`'s pure item list.
 * Tool-level dispatch (write/edit vs subagent vs plain, plus the
 * `shouldRenderToolCall` visibility gate) is baked into the item's `kind` by
 * the viewmodel, so the template only maps `kind` to a component.
 */
const props = defineProps<{ msg: ChatMessage }>();

const callbacks = inject(CALLBACKS_KEY, undefined);
const providerId = computed(() => callbacks?.getProviderId() ?? DEFAULT_CHAT_PROVIDER_ID);

const items = computed(() => resolveBlockListItems(props.msg, providerId.value));
const showFooter = computed(() => hasDurationFooter(props.msg));
const flavorWord = computed(() => props.msg.durationFlavorWord || 'Baked');
const durationText = computed(() => formatDurationMmSs(props.msg.durationSeconds ?? 0));
</script>

<template>
  <template
    v-for="item in items"
    :key="item.key"
  >
    <ThinkingBlock
      v-if="item.kind === 'thinking'"
      :content="item.content"
      :duration-seconds="item.durationSeconds"
      :live="false"
    />
    <TextBlock
      v-else-if="item.kind === 'text'"
      role="assistant"
      :content="item.content"
    />
    <ContextCompactedMarker v-else-if="item.kind === 'context_compacted'" />
    <RuntimeErrorCard
      v-else-if="item.kind === 'runtime_error'"
      :kind="classifyRuntimeError(item.content)"
      :content="item.content"
    />
    <SubagentBlock
      v-else-if="item.kind === 'subagent'"
      :tool-call="item.toolCall"
      :mode="item.mode"
      :provider-id="providerId"
    />
    <WriteEditView
      v-else-if="item.kind === 'tool_write_edit'"
      :tool-call="item.toolCall"
    />
    <ToolCall
      v-else-if="item.kind === 'tool_plain'"
      :tool-call="item.toolCall"
    />
  </template>
  <!-- eslint-disable vue/singleline-html-element-content-newline, vue/multiline-html-element-content-newline -- exact textContent parity with the legacy DOM contract -->
  <div
    v-if="showFooter"
    class="specorator-response-footer"
  ><span class="specorator-baked-duration">{{ `* ${flavorWord} for ${durationText}` }}</span></div>
  <!-- eslint-enable vue/singleline-html-element-content-newline, vue/multiline-html-element-content-newline -->
</template>
