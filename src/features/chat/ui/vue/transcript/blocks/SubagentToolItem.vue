<script setup lang="ts">
import { computed } from 'vue';

import { getToolIcon } from '../../../../../../core/tools/toolIcons';
import type { ToolCallInfo } from '../../../../../../core/types';
import { getToolLabel } from '../../../../rendering/toolLabel';
import { useCollapsible } from '../collapsible';
import { useIconDiv } from './subagentIconDiv';
import { shouldShowRunningPlaceholder } from './subagentViewModel';
import ToolContentLines from './ToolContentLines.vue';
import { useToolNameSummary } from './toolNameSummary';

/**
 * Nested tool item inside a subagent block — reproduces
 * `SubagentRenderer.ts`'s `createSubagentToolView`/`updateSubagentToolView`/
 * `renderSubagentToolContent` DOM contract. Distinct from `ToolCall.vue`:
 * every wrapper element uses the `.specorator-subagent-tool-*` class family
 * (verbatim `<div>`s, matching the legacy renderer — never the `<span>`
 * `IconSpan.vue`/`ToolCall.vue` use for their own icon/status slots), and
 * the content body falls back to a "Running..." placeholder while a tool is
 * running with no result yet, before falling through to the same
 * `ToolContentLines.vue` body `ToolCall.vue` reuses for
 * `renderExpandedContent`.
 */
const props = defineProps<{ toolCall: ToolCallInfo }>();

const SUBAGENT_TOOL_STATUS_ICONS: Partial<Record<ToolCallInfo['status'], string>> = {
  completed: 'check',
  error: 'x',
  blocked: 'shield-off',
};

const { toolName, toolSummary } = useToolNameSummary(() => props.toolCall);
const statusIcon = computed(() => SUBAGENT_TOOL_STATUS_ICONS[props.toolCall.status] ?? null);
const showRunningPlaceholder = computed(() => shouldShowRunningPlaceholder(props.toolCall));

const { expanded, toggle, onKeydown, ariaLabel } = useCollapsible({
  initiallyExpanded: props.toolCall.isExpanded ?? false,
  baseAriaLabel: getToolLabel(props.toolCall.name, props.toolCall.input),
});

// `useIconDiv` reproduces `ToolCallRenderer.ts`'s `setToolIcon` MCP-marker
// dispatch onto a plain `<div>` (matching the legacy tag; see
// `subagentIconDiv.ts`) instead of reusing `setToolIcon` directly, which
// writes into a caller-supplied element rather than returning a ref.
const iconEl = useIconDiv(() => getToolIcon(props.toolCall.name));
const statusEl = useIconDiv(() => statusIcon.value);
</script>

<template>
  <!-- eslint-disable vue/multiline-html-element-content-newline, vue/singleline-html-element-content-newline -- exact textContent parity with the legacy DOM contract (no surrounding whitespace) -->
  <div
    class="specorator-subagent-tool-item"
    :class="[`specorator-subagent-tool-${toolCall.status}`, { expanded }]"
    :data-tool-id="toolCall.id"
  >
    <div
      class="specorator-subagent-tool-header"
      tabindex="0"
      role="button"
      :aria-expanded="expanded ? 'true' : 'false'"
      :aria-label="ariaLabel"
      @click="toggle"
      @keydown="onKeydown"
    >
      <div
        ref="iconEl"
        class="specorator-subagent-tool-icon"
        aria-hidden="true"
      />
      <div class="specorator-subagent-tool-name">{{ toolName }}</div>
      <div class="specorator-subagent-tool-summary">{{ toolSummary }}</div>
      <div
        ref="statusEl"
        class="specorator-subagent-tool-status"
        :class="`status-${toolCall.status}`"
        :aria-label="`Status: ${toolCall.status}`"
      />
    </div>
    <div
      class="specorator-subagent-tool-content"
      :class="{ 'specorator-hidden': !expanded }"
    >
      <div
        v-if="showRunningPlaceholder"
        class="specorator-subagent-tool-empty"
      >Running...</div>
      <ToolContentLines
        v-else
        :name="toolCall.name"
        :input="toolCall.input"
        :result="toolCall.result"
      />
    </div>
  </div>
  <!-- eslint-enable vue/multiline-html-element-content-newline, vue/singleline-html-element-content-newline -->
</template>
