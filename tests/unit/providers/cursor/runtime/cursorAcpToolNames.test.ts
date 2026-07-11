import { TOOL_BASH, TOOL_EDIT, TOOL_READ, TOOL_WRITE } from '@/core/tools/toolNames';
import {
  createCursorAcpToolStreamAdapter,
  CURSOR_ACP_CANONICAL_TOOL_NAMES,
  normalizeCursorAcpToolInput,
} from '@/providers/cursor/runtime/cursorAcpToolNames';

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

  it('falls back to the kind switch (not the title) when the title has no known mapping', () => {
    const adapter = createCursorAcpToolStreamAdapter();
    const chunks = adapter.normalizeToolCall(
      { toolCallId: 't2', title: 'Something Unmapped', kind: 'execute', rawInput: {} },
      [{ id: 't2', input: {}, name: 'unused', type: 'tool_use' }],
    );
    const toolUse = chunks.find((c) => c.type === 'tool_use') as { name: string } | undefined;
    expect(toolUse?.name).toBe(TOOL_BASH);
  });

  it('keeps the delete tool identity distinct from Bash so removal bookkeeping still matches it', () => {
    const adapter = createCursorAcpToolStreamAdapter();
    const chunks = adapter.normalizeToolCall(
      { toolCallId: 't3', title: 'delete', kind: 'delete', rawInput: { path: 'notes/todo.md' } },
      [{ id: 't3', input: {}, name: 'unused', type: 'tool_use' }],
    );
    const toolUse = chunks.find((c) => c.type === 'tool_use') as { name: string } | undefined;
    expect(toolUse?.name).toBe('delete');
    expect(toolUse?.name).not.toBe(TOOL_BASH);
    expect(CURSOR_ACP_CANONICAL_TOOL_NAMES.has('delete')).toBe(true);
  });

  it('resolves a file-mutating edit kind to Edit even when the title is prose', () => {
    const adapter = createCursorAcpToolStreamAdapter();
    const chunks = adapter.normalizeToolCall(
      { toolCallId: 'e1', title: 'Applying changes', kind: 'edit', rawInput: {} },
      [{ id: 'e1', input: {}, name: 'unused', type: 'tool_use' }],
    );
    const toolUse = chunks.find((c) => c.type === 'tool_use') as { name: string } | undefined;
    expect(toolUse?.name).toBe(TOOL_EDIT);
  });

  it('resolves a delete kind to the delete identity even when the title is prose', () => {
    const adapter = createCursorAcpToolStreamAdapter();
    const chunks = adapter.normalizeToolCall(
      { toolCallId: 'd1', title: 'Delete file', kind: 'delete', rawInput: { path: 'notes/todo.md' } },
      [{ id: 'd1', input: {}, name: 'unused', type: 'tool_use' }],
    );
    const toolUse = chunks.find((c) => c.type === 'tool_use') as { name: string } | undefined;
    expect(toolUse?.name).toBe('delete');
    expect(toolUse?.name).not.toBe(TOOL_BASH);
  });

  describe('normalizeCursorAcpToolUseResult (ACP edit diffs)', () => {
    it('surfaces the unified diff + file path from an edit tool_call_update diff block', () => {
      const adapter = createCursorAcpToolStreamAdapter();
      const chunks = adapter.normalizeToolCallUpdate(
        {
          toolCallId: 'edit-1',
          kind: 'edit',
          title: 'Applying changes',
          content: [{ type: 'diff', path: 'notes/todo.md', oldText: 'foo', newText: 'bar' }],
        },
        [{ id: 'edit-1', content: 'done', type: 'tool_result' }],
      );
      const result = chunks.find((c) => c.type === 'tool_result') as {
        toolUseResult?: { filePath?: string; unifiedDiff?: string };
      };
      expect(result.toolUseResult?.filePath).toBe('notes/todo.md');
      expect(result.toolUseResult?.unifiedDiff).toContain('-foo');
      expect(result.toolUseResult?.unifiedDiff).toContain('+bar');
    });

    it('leaves the tool_result untouched for a non-file tool carrying no diff', () => {
      const adapter = createCursorAcpToolStreamAdapter();
      const chunks = adapter.normalizeToolCallUpdate(
        { toolCallId: 'bash-1', kind: 'execute', title: 'shell', rawInput: { command: 'ls' } },
        [{ id: 'bash-1', content: 'ok', type: 'tool_result' }],
      );
      const result = chunks.find((c) => c.type === 'tool_result') as { toolUseResult?: unknown };
      expect(result.toolUseResult).toBeUndefined();
    });
  });

  describe('normalizeCursorAcpToolInput', () => {
    it('canonicalizes edit tool input (path/oldString/newString -> file_path/old_string/new_string)', () => {
      const result = normalizeCursorAcpToolInput('edit', {
        path: 'notes/todo.md',
        oldString: 'foo',
        newString: 'bar',
      });
      expect(result).toEqual({
        file_path: 'notes/todo.md',
        old_string: 'foo',
        new_string: 'bar',
      });
    });

    it('canonicalizes write tool input (path/content -> file_path/content)', () => {
      const result = normalizeCursorAcpToolInput('write', {
        path: 'notes/new.md',
        content: 'hello world',
      });
      expect(result.file_path).toBe('notes/new.md');
      expect(result.content).toBe('hello world');
    });

    it('canonicalizes read tool input (path -> file_path)', () => {
      const result = normalizeCursorAcpToolInput('read', { path: 'notes/todo.md' });
      expect(result).toEqual({ file_path: 'notes/todo.md' });
    });

    it('canonicalizes delete tool input (path -> path, kept for removal bookkeeping)', () => {
      const result = normalizeCursorAcpToolInput('delete', { path: 'notes/todo.md' });
      expect(result).toEqual({ path: 'notes/todo.md' });
    });

    it('leaves unknown tool input untouched (tolerant pass-through)', () => {
      const rawInput = { someField: 'value', nested: { a: 1 } };
      const result = normalizeCursorAcpToolInput('mystery_tool', rawInput);
      expect(result).toBe(rawInput);
    });

    it('leaves known non-file tool input untouched (e.g. bash)', () => {
      const rawInput = { command: 'ls -la' };
      const result = normalizeCursorAcpToolInput('bash', rawInput);
      expect(result).toBe(rawInput);
    });
  });

  it('registers TOOL_EDIT for the edit tool (sanity check, unrelated to input canonicalization)', () => {
    expect(CURSOR_ACP_CANONICAL_TOOL_NAMES.has(TOOL_EDIT)).toBe(true);
  });
});
