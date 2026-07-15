import type { ProviderSubagentLifecycleAdapter } from '@/core/providers/types';
import type { ChatMessage, ToolCallInfo } from '@/core/types';
import {
  buildAsyncHeaderAriaLabel,
  buildAsyncRootClasses,
  buildAsyncStatusPill,
  buildSyncHeaderAriaLabel,
  buildSyncRootClasses,
  buildSyncStatusPill,
  getAsyncDisplayStatus,
  getAsyncStatusAriaLabel,
  getAsyncStatusText,
  inferAsyncStatusFromTaskTool,
  mapToolStatusToSubagentStatus,
  projectProviderLifecycleSubagent,
  resolveSubagentResultText,
  resolveTaskSubagent,
  shouldShowRunningPlaceholder,
  truncateDescription,
} from '@/features/chat/rendering/subagentViewModel';

function tool(overrides: Partial<ToolCallInfo> = {}): ToolCallInfo {
  return { id: 't1', name: 'Task', status: 'running', input: {}, ...overrides } as ToolCallInfo;
}

describe('mapToolStatusToSubagentStatus', () => {
  it('maps completed/error/blocked/other', () => {
    expect(mapToolStatusToSubagentStatus('completed')).toBe('completed');
    expect(mapToolStatusToSubagentStatus('error')).toBe('error');
    expect(mapToolStatusToSubagentStatus('blocked')).toBe('error');
    expect(mapToolStatusToSubagentStatus('running')).toBe('running');
  });
});

describe('inferAsyncStatusFromTaskTool', () => {
  it('is error for error/blocked tool status', () => {
    expect(inferAsyncStatusFromTaskTool(tool({ status: 'error' }))).toBe('error');
    expect(inferAsyncStatusFromTaskTool(tool({ status: 'blocked' }))).toBe('error');
  });
  it('is running for a running tool status', () => {
    expect(inferAsyncStatusFromTaskTool(tool({ status: 'running' }))).toBe('running');
  });
  it('reads a not-ready / running result payload as running', () => {
    expect(inferAsyncStatusFromTaskTool(tool({ status: 'completed', result: 'NOT_READY yet' }))).toBe('running');
    expect(inferAsyncStatusFromTaskTool(tool({ status: 'completed', result: '{"status":"pending"}' }))).toBe('running');
    expect(inferAsyncStatusFromTaskTool(tool({ status: 'completed', result: '{"retrieval_status":"not_ready"}' }))).toBe('running');
  });
  it('is completed for a finished result', () => {
    expect(inferAsyncStatusFromTaskTool(tool({ status: 'completed', result: 'all done' }))).toBe('completed');
  });
});

describe('resolveTaskSubagent', () => {
  it('returns the existing subagent when present and mode matches (or no hint)', () => {
    const sub = { id: 's', description: 'd', prompt: 'p', mode: 'sync', status: 'running', toolCalls: [], isExpanded: false };
    const tc = tool({ subagent: sub as never });
    expect(resolveTaskSubagent(tc)).toBe(sub);
    expect(resolveTaskSubagent(tc, 'sync')).toBe(sub);
  });
  it('overrides the mode when the hint differs from the existing subagent', () => {
    const sub = { id: 's', description: 'd', prompt: 'p', mode: 'sync', status: 'running', toolCalls: [], isExpanded: false };
    const result = resolveTaskSubagent(tool({ subagent: sub as never }), 'async');
    expect(result.mode).toBe('async');
    expect(result).not.toBe(sub);
  });
  it('builds a sync subagent from a Task tool with no subagent', () => {
    const result = resolveTaskSubagent(tool({ status: 'completed', input: { description: 'Do it', prompt: 'go' } }));
    expect(result).toMatchObject({ description: 'Do it', prompt: 'go', status: 'completed' });
    expect(result.mode).toBeUndefined();
  });
  it('builds an async subagent when run_in_background is set (default description/prompt)', () => {
    const result = resolveTaskSubagent(tool({ status: 'completed', input: { run_in_background: true }, result: 'done' }));
    expect(result.mode).toBe('async');
    expect(result.description).toBe('Subagent task');
    expect(result.prompt).toBe('');
    expect(result.asyncStatus).toBe('completed');
  });
});

describe('projectProviderLifecycleSubagent', () => {
  it('delegates to the adapter with the message tool calls', () => {
    const built = { id: 'x' };
    const adapter = { buildSubagentInfo: jest.fn(() => built) } as unknown as ProviderSubagentLifecycleAdapter;
    const spawn = tool();
    const msg = { toolCalls: [spawn] } as unknown as ChatMessage;
    expect(projectProviderLifecycleSubagent(spawn, msg, adapter)).toBe(built);
    expect(adapter.buildSubagentInfo).toHaveBeenCalledWith(spawn, [spawn]);
  });
  it('passes an empty array when the message has no tool calls', () => {
    const adapter = { buildSubagentInfo: jest.fn(() => ({})) } as unknown as ProviderSubagentLifecycleAdapter;
    projectProviderLifecycleSubagent(tool(), {} as ChatMessage, adapter);
    expect(adapter.buildSubagentInfo).toHaveBeenCalledWith(expect.anything(), []);
  });
});

describe('display derivations', () => {
  it('truncateDescription only truncates past the limit', () => {
    expect(truncateDescription('short')).toBe('short');
    expect(truncateDescription('x'.repeat(50))).toBe(`${'x'.repeat(40)}...`);
  });

  it('getAsyncDisplayStatus collapses to the four branches', () => {
    expect(getAsyncDisplayStatus('completed')).toBe('completed');
    expect(getAsyncDisplayStatus('error')).toBe('error');
    expect(getAsyncDisplayStatus('orphaned')).toBe('orphaned');
    expect(getAsyncDisplayStatus('pending')).toBe('running');
    expect(getAsyncDisplayStatus(undefined)).toBe('running');
  });

  it('getAsyncStatusText / getAsyncStatusAriaLabel cover every status', () => {
    expect(getAsyncStatusText('pending')).toBe('Initializing');
    expect(getAsyncStatusText('completed')).toBe('');
    expect(getAsyncStatusText('error')).toBe('Error');
    expect(getAsyncStatusText('orphaned')).toBe('Orphaned');
    expect(getAsyncStatusText(undefined)).toBe('Running in background');
    expect(getAsyncStatusAriaLabel('pending')).toBe('Initializing');
    expect(getAsyncStatusAriaLabel('completed')).toBe('Completed');
    expect(getAsyncStatusAriaLabel('error')).toBe('Error');
    expect(getAsyncStatusAriaLabel('orphaned')).toBe('Orphaned');
    expect(getAsyncStatusAriaLabel(undefined)).toBe('Running in background');
  });

  it('builds header aria labels', () => {
    expect(buildSyncHeaderAriaLabel('Task', 'running')).toContain('Subagent task: Task');
    expect(buildAsyncHeaderAriaLabel('Task', 'orphaned')).toContain('Background task: Task');
  });

  it('buildSyncRootClasses / buildAsyncRootClasses cover every branch', () => {
    expect(buildSyncRootClasses('completed')).toEqual(['done']);
    expect(buildSyncRootClasses('error')).toEqual(['error']);
    expect(buildSyncRootClasses('running')).toEqual([]);
    expect(buildAsyncRootClasses('completed')).toEqual(['async', 'completed', 'done']);
    expect(buildAsyncRootClasses('error')).toEqual(['async', 'error', 'error']);
    expect(buildAsyncRootClasses('orphaned')).toEqual(['async', 'orphaned', 'error']);
    expect(buildAsyncRootClasses('running')).toEqual(['async', 'running']);
  });

  it('buildSyncStatusPill / buildAsyncStatusPill cover every branch', () => {
    expect(buildSyncStatusPill('completed').icon).toBe('check');
    expect(buildSyncStatusPill('error').icon).toBe('x');
    expect(buildSyncStatusPill('running').icon).toBeNull();
    expect(buildAsyncStatusPill('completed').pillClass).toBe('status-completed');
    expect(buildAsyncStatusPill('error').pillClass).toBe('status-error');
    expect(buildAsyncStatusPill('orphaned').icon).toBe('alert-circle');
    expect(buildAsyncStatusPill('pending').pillClass).toBe('status-running');
  });

  it('resolveSubagentResultText covers running/orphaned/error/completed', () => {
    expect(resolveSubagentResultText('running', 'x')).toBeNull();
    expect(resolveSubagentResultText('orphaned', undefined)?.text).toBe('Conversation ended before task completed');
    expect(resolveSubagentResultText('orphaned', 'partial')?.text).toBe('partial');
    expect(resolveSubagentResultText('error', '  ')?.text).toBe('ERROR');
    expect(resolveSubagentResultText('completed', '')?.text).toBe('DONE');
    expect(resolveSubagentResultText('completed', 'result body')?.text).toBe('result body');
  });

  it('shouldShowRunningPlaceholder only when running with no result', () => {
    expect(shouldShowRunningPlaceholder(tool({ status: 'running', result: undefined }))).toBe(true);
    expect(shouldShowRunningPlaceholder(tool({ status: 'running', result: 'x' }))).toBe(false);
    expect(shouldShowRunningPlaceholder(tool({ status: 'completed' }))).toBe(false);
  });
});
