import { computed, type ComputedRef } from 'vue';

import type { ToolCallInfo } from '../../../../../../core/types';
import { getToolName, getToolSummary } from '../../../../rendering/toolCallViewModel';

export interface ToolNameSummary {
  toolName: ComputedRef<string>;
  toolSummary: ComputedRef<string>;
}

/**
 * Shared `getToolName`/`getToolSummary` projection, reused by `ToolCall.vue`
 * and `SubagentToolItem.vue` (both dispatch a tool call's header name +
 * summary text through the same DOM-free helpers, just
 * inside differently-shaped wrapper markup).
 */
export function useToolNameSummary(getToolCall: () => ToolCallInfo): ToolNameSummary {
  const toolName = computed(() => getToolName(getToolCall().name, getToolCall().input));
  const toolSummary = computed(() => getToolSummary(getToolCall().name, getToolCall().input));
  return { toolName, toolSummary };
}
