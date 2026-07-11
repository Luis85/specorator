import { TOOL_BASH, TOOL_EDIT, TOOL_READ, TOOL_WEB_FETCH, TOOL_WRITE } from '@/core/tools/toolNames';
import {
  createCursorAcpToolStreamAdapter,
  CURSOR_ACP_CANONICAL_TOOL_NAMES,
  normalizeCursorAcpToolInput,
  normalizeCursorAcpToolName,
  normalizeCursorAcpToolUseResult,
  resolveCursorAcpRawToolName,
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

  it('keeps the canonical file_path when a later update carries only partial rawInput', () => {
    // Regression: the file-tool mappers read only cursor-native keys (`path`),
    // so re-normalizing already-normalized state on a partial update used to
    // wipe file_path mid-stream.
    const adapter = createCursorAcpToolStreamAdapter();
    adapter.normalizeToolCall(
      { toolCallId: 'e2', kind: 'edit', title: 'edit', rawInput: { path: 'a.md', oldString: 'x' } },
      [],
    );
    const chunks = adapter.normalizeToolCallUpdate(
      { toolCallId: 'e2', rawInput: { newString: 'y' } },
      [],
    );
    const toolUse = chunks.find((c) => c.type === 'tool_use') as
      | { input: Record<string, unknown> }
      | undefined;
    expect(toolUse?.input).toEqual({ file_path: 'a.md', old_string: 'x', new_string: 'y' });
  });

  it('lets a later file-mutating kind correct a prose-pinned raw name', () => {
    // A first call with no kind and a prose title pins the prose; the follow-up
    // update carrying kind 'delete' must restore the canonical identity that
    // removal bookkeeping matches against.
    const adapter = createCursorAcpToolStreamAdapter();
    adapter.normalizeToolCall(
      { toolCallId: 'd2', title: 'Deleting stale note', rawInput: { path: 'notes/stale.md' } },
      [],
    );
    const chunks = adapter.normalizeToolCallUpdate(
      { toolCallId: 'd2', kind: 'delete', rawInput: {} },
      [],
    );
    const toolUse = chunks.find((c) => c.type === 'tool_use') as { name: string } | undefined;
    expect(toolUse?.name).toBe('delete');
  });

  it('attaches the diff toolUseResult when the terminal update carries no content of its own', () => {
    // Protocol-allowed split: the diff arrives on an in_progress update; the
    // completed update carries only the status.
    const adapter = createCursorAcpToolStreamAdapter();
    adapter.normalizeToolCall(
      { toolCallId: 'e3', kind: 'edit', title: 'edit', rawInput: { path: 'a.md' } },
      [],
    );
    adapter.normalizeToolCallUpdate(
      {
        toolCallId: 'e3',
        status: 'in_progress',
        content: [{ type: 'diff', path: 'a.md', oldText: 'foo', newText: 'bar' }],
      },
      [],
    );
    const chunks = adapter.normalizeToolCallUpdate(
      { toolCallId: 'e3', status: 'completed' },
      [{ id: 'e3', content: 'done', type: 'tool_result' }],
    );
    const result = chunks.find((c) => c.type === 'tool_result') as {
      toolUseResult?: { filePath?: string; unifiedDiff?: string };
    };
    expect(result.toolUseResult?.filePath).toBe('a.md');
    expect(result.toolUseResult?.unifiedDiff).toContain('+bar');
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

  describe('resolveCursorAcpRawToolName', () => {
    it('prefers a known title over the current raw name', () => {
      expect(resolveCursorAcpRawToolName('bash', { title: 'read', kind: null })).toBe('read');
    });

    it('keeps the current raw name when the title is unknown prose', () => {
      expect(resolveCursorAcpRawToolName('grep', { title: 'Searching files', kind: null })).toBe('grep');
    });

    it('resolves a fetch kind to webfetch when title and current name are absent', () => {
      expect(resolveCursorAcpRawToolName(undefined, { title: null, kind: 'fetch' })).toBe('webfetch');
    });

    it('resolves a read kind to read when title and current name are absent', () => {
      expect(resolveCursorAcpRawToolName(undefined, { title: null, kind: 'read' })).toBe('read');
    });

    it('falls back to the prose title for an unrecognised kind', () => {
      expect(resolveCursorAcpRawToolName(undefined, { title: 'Mystery', kind: 'think' })).toBe('Mystery');
    });

    it('falls back to the literal tool sentinel with neither title, name, nor known kind', () => {
      expect(resolveCursorAcpRawToolName(undefined, { title: null, kind: null })).toBe('tool');
    });
  });

  describe('normalizeCursorAcpToolName', () => {
    it('maps a known raw name to its canonical id', () => {
      expect(normalizeCursorAcpToolName('webfetch')).toBe(TOOL_WEB_FETCH);
    });

    it('passes an unknown raw name through trimmed', () => {
      expect(normalizeCursorAcpToolName('  mystery  ')).toBe('mystery');
    });

    it('falls back to the tool sentinel for an empty raw name', () => {
      expect(normalizeCursorAcpToolName(undefined)).toBe('tool');
    });
  });

  describe('normalizeCursorAcpToolUseResult (task subagent payloads)', () => {
    it('builds the structured task toolUseResult from a rawOutput success envelope', () => {
      const steps = [{ assistantMessage: { text: 'subagent done' } }];
      const result = normalizeCursorAcpToolUseResult(
        'task',
        { description: 'Explore', prompt: 'look around' },
        { success: { agentId: 'agent-7', conversationSteps: steps } },
        null,
      );
      expect(result).toEqual({ agentId: 'agent-7', conversationSteps: steps });
    });

    it('tolerates a bare success payload without the envelope', () => {
      const result = normalizeCursorAcpToolUseResult(
        'task',
        {},
        { agentId: 'agent-9' },
        null,
      );
      expect(result).toEqual({ agentId: 'agent-9' });
    });

    it('returns undefined when the task rawOutput carries no subagent payload', () => {
      expect(normalizeCursorAcpToolUseResult('task', {}, undefined, null)).toBeUndefined();
      expect(normalizeCursorAcpToolUseResult('task', {}, 'plain text', null)).toBeUndefined();
    });
  });

  describe('normalizeCursorAcpToolUseResult edge cases', () => {
    it('returns undefined for a non-file tool', () => {
      expect(normalizeCursorAcpToolUseResult('bash', {}, undefined, null)).toBeUndefined();
    });

    it('returns undefined for an edit tool carrying no diff content', () => {
      expect(normalizeCursorAcpToolUseResult('edit', {}, undefined, undefined)).toBeUndefined();
    });

    it('falls back to the input file path when the diff block omits its path', () => {
      const result = normalizeCursorAcpToolUseResult(
        'write',
        { file_path: 'notes/from-input.md' },
        undefined,
        [{ type: 'diff', path: '', oldText: '', newText: 'x' }],
      );
      expect(result?.filePath).toBe('notes/from-input.md');
    });
  });
});
