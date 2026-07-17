import type { SubagentInfo, ToolCallInfo } from '../../../core/types';

/**
 * Pure data mutations for Task sub-agent state, extracted from the deleted
 * imperative `rendering/SubagentRenderer.ts` (ADR 0005 sub-project 2 debt).
 * The Vue transcript renders `SubagentInfo` reactively (`SubagentBlock.vue`),
 * so only these data ops survived the renderer's detached-DOM half.
 */

export function createSyncSubagentInfo(
  taskToolId: string,
  taskInput: Record<string, unknown>,
): SubagentInfo {
  return {
    id: taskToolId,
    description: (taskInput.description as string) || 'Subagent task',
    prompt: (taskInput.prompt as string) || '',
    status: 'running',
    toolCalls: [],
    isExpanded: false,
  };
}

/**
 * Adds a child tool call, or merges into the existing entry by id — keeping the
 * prior `result`/`isExpanded` when the update omits them and unioning `input`
 * (providers re-send tool_use with partial input deltas).
 */
export function mergeSubagentToolCall(info: SubagentInfo, toolCall: ToolCallInfo): void {
  const existingIndex = info.toolCalls.findIndex(tc => tc.id === toolCall.id);
  if (existingIndex >= 0) {
    const existing = info.toolCalls[existingIndex];
    info.toolCalls[existingIndex] = {
      ...existing,
      ...toolCall,
      input: {
        ...existing.input,
        ...toolCall.input,
      },
      result: toolCall.result ?? existing.result,
      isExpanded: toolCall.isExpanded ?? existing.isExpanded,
    };
    return;
  }
  info.toolCalls.push(toolCall);
}

/** Replaces a child tool call wholesale once its result arrives; unknown ids are ignored. */
export function setSubagentToolResult(info: SubagentInfo, toolId: string, toolCall: ToolCallInfo): void {
  const idx = info.toolCalls.findIndex(tc => tc.id === toolId);
  if (idx !== -1) {
    info.toolCalls[idx] = toolCall;
  }
}

export function finalizeSyncSubagentInfo(info: SubagentInfo, result: string, isError: boolean): void {
  info.status = isError ? 'error' : 'completed';
  info.result = result;
}
