import { describe, expect, it } from 'vitest';
import { ref } from 'vue';

import type { ToolCallInfo } from '@/core/types';
import { getToolName, getToolSummary } from '@/features/chat/rendering/ToolCallRenderer';
import { useToolNameSummary } from '@/features/chat/ui/vue/transcript/blocks/toolNameSummary';

function createToolCall(overrides: Partial<ToolCallInfo> = {}): ToolCallInfo {
  return { id: 'tool-1', name: 'Bash', input: { command: 'ls -la' }, status: 'completed', ...overrides };
}

describe('useToolNameSummary', () => {
  it('projects toolName/toolSummary through the shared ToolCallRenderer helpers', () => {
    const toolCall = createToolCall();
    const { toolName, toolSummary } = useToolNameSummary(() => toolCall);

    expect(toolName.value).toBe(getToolName(toolCall.name, toolCall.input));
    expect(toolSummary.value).toBe(getToolSummary(toolCall.name, toolCall.input));
  });

  it('recomputes reactively as the underlying tool call (e.g. a component prop) changes', () => {
    const toolCallRef = ref(createToolCall({ name: 'Read', input: { file_path: '/vault/a.md' } }));
    const { toolName, toolSummary } = useToolNameSummary(() => toolCallRef.value);

    expect(toolName.value).toBe(getToolName('Read', { file_path: '/vault/a.md' }));

    toolCallRef.value = createToolCall({ name: 'Write', input: { file_path: '/vault/b.md' } });
    expect(toolName.value).toBe(getToolName('Write', { file_path: '/vault/b.md' }));
    expect(toolSummary.value).toBe(getToolSummary('Write', { file_path: '/vault/b.md' }));
  });
});
