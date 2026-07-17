import type { ToolCallInfo } from '@/core/types';
import {
  createSyncSubagentInfo,
  finalizeSyncSubagentInfo,
  mergeSubagentToolCall,
  setSubagentToolResult,
} from '@/features/chat/services/subagentTaskState';

// Data characterization ported from the deleted SubagentRenderer.test.ts —
// the DOM half died with the detached renderer; these ops feed the Vue
// transcript's reactive SubagentInfo.

const runningTool = (id: string, extra: Partial<ToolCallInfo> = {}): ToolCallInfo => ({
  id,
  name: 'Read',
  input: { file_path: 'test.md' },
  status: 'running',
  isExpanded: false,
  ...extra,
});

describe('createSyncSubagentInfo', () => {
  it('starts running and collapsed with the task description', () => {
    const info = createSyncSubagentInfo('task-1', { description: 'My task description', prompt: 'Do it' });

    expect(info).toEqual({
      id: 'task-1',
      description: 'My task description',
      prompt: 'Do it',
      status: 'running',
      toolCalls: [],
      isExpanded: false,
    });
  });

  it('falls back to a default description and empty prompt', () => {
    const info = createSyncSubagentInfo('task-1', {});

    expect(info.description).toBe('Subagent task');
    expect(info.prompt).toBe('');
  });
});

describe('mergeSubagentToolCall', () => {
  it('appends distinct tool calls', () => {
    const info = createSyncSubagentInfo('task-1', { description: 'Test task' });

    mergeSubagentToolCall(info, runningTool('tool-1'));
    mergeSubagentToolCall(info, runningTool('tool-2', { name: 'Grep', input: { pattern: 'test' } }));

    expect(info.toolCalls).toHaveLength(2);
    expect(info.toolCalls.map(tc => tc.id)).toEqual(['tool-1', 'tool-2']);
  });

  it('merges repeated tool IDs instead of duplicating, unioning input', () => {
    const info = createSyncSubagentInfo('task-1', { description: 'Test task' });

    mergeSubagentToolCall(info, runningTool('tool-1', { name: 'Write', input: {} }));
    mergeSubagentToolCall(info, runningTool('tool-1', { name: 'Write', input: { file_path: 'notes.md' } }));

    expect(info.toolCalls).toHaveLength(1);
    expect(info.toolCalls[0]).toEqual(
      expect.objectContaining({ id: 'tool-1', input: { file_path: 'notes.md' } })
    );
  });

  it('keeps the prior result and isExpanded when the update omits them', () => {
    const info = createSyncSubagentInfo('task-1', { description: 'Test task' });

    mergeSubagentToolCall(info, runningTool('tool-1', { result: 'kept', isExpanded: true }));
    mergeSubagentToolCall(info, {
      id: 'tool-1',
      name: 'Read',
      input: { offset: 5 },
      status: 'completed',
    } as ToolCallInfo);

    expect(info.toolCalls[0]).toEqual(
      expect.objectContaining({
        status: 'completed',
        result: 'kept',
        isExpanded: true,
        input: { file_path: 'test.md', offset: 5 },
      })
    );
  });
});

describe('setSubagentToolResult', () => {
  it('replaces the tool call once its result arrives', () => {
    const info = createSyncSubagentInfo('task-1', { description: 'Test task' });
    mergeSubagentToolCall(info, runningTool('tool-1'));

    setSubagentToolResult(info, 'tool-1', runningTool('tool-1', { status: 'completed', result: 'File contents here' }));

    expect(info.toolCalls[0].status).toBe('completed');
    expect(info.toolCalls[0].result).toBe('File contents here');
  });

  it('ignores non-matching tool IDs', () => {
    const info = createSyncSubagentInfo('task-1', { description: 'Test task' });
    mergeSubagentToolCall(info, runningTool('tool-1'));

    setSubagentToolResult(info, 'tool-999', runningTool('tool-999', { status: 'completed' }));

    expect(info.toolCalls[0].status).toBe('running');
  });
});

describe('finalizeSyncSubagentInfo', () => {
  it('sets completed status and result', () => {
    const info = createSyncSubagentInfo('task-1', { description: 'Test task' });

    finalizeSyncSubagentInfo(info, 'All done', false);

    expect(info.status).toBe('completed');
    expect(info.result).toBe('All done');
  });

  it('sets error status on failure, keeping tool history', () => {
    const info = createSyncSubagentInfo('task-1', { description: 'Test task' });
    mergeSubagentToolCall(info, runningTool('tool-1'));

    finalizeSyncSubagentInfo(info, 'Something failed', true);

    expect(info.status).toBe('error');
    expect(info.result).toBe('Something failed');
    expect(info.toolCalls).toHaveLength(1);
  });
});
