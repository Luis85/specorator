import { TOOL_BASH, TOOL_READ, TOOL_WRITE } from '@/core/tools/toolNames';
import { createCursorAcpToolStreamAdapter, CURSOR_ACP_CANONICAL_TOOL_NAMES } from '@/providers/cursor/runtime/cursorAcpToolNames';

describe('cursorAcpToolNames', () => {
  it('normalizes cursor native tool identifiers to canonical names', () => {
    const adapter = createCursorAcpToolStreamAdapter();
    const chunks = adapter.normalizeToolCall(
      { toolCallId: 't1', title: 'shell', kind: 'execute', rawInput: { command: 'ls' } },
      [{ id: 't1', input: {}, name: 'unused', type: 'tool_use' }],
    );
    const toolUse = chunks.find((c) => c.type === 'tool_use') as { name: string } | undefined;
    expect(toolUse?.name).toBe(TOOL_BASH);
  });

  it('exposes the canonical-name set for registration', () => {
    expect(CURSOR_ACP_CANONICAL_TOOL_NAMES.has(TOOL_READ)).toBe(true);
    expect(CURSOR_ACP_CANONICAL_TOOL_NAMES.has(TOOL_WRITE)).toBe(true);
  });
});
