import { describe, expect, it } from 'vitest';

import type { ChatMessage, SubagentInfo, ToolCallInfo } from '@/core/types';
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
} from '@/features/chat/ui/vue/transcript/blocks/subagentViewModel';
import { codexSubagentLifecycleAdapter } from '@/providers/codex/normalization/codexSubagentNormalization';

/**
 * Reproduces `MessageSubagentRenderer`'s private projection methods
 * (`resolveTaskSubagent` / `mapToolStatusToSubagentStatus` /
 * `inferAsyncStatusFromTaskTool`) plus `SubagentRenderer.ts`'s small
 * display-derivation helpers, as pure functions.
 */
function createToolCall(overrides: Partial<ToolCallInfo> = {}): ToolCallInfo {
  return {
    id: 'task-1',
    name: 'Task',
    input: {},
    status: 'completed',
    ...overrides,
  };
}

describe('mapToolStatusToSubagentStatus', () => {
  it('maps completed -> completed', () => {
    expect(mapToolStatusToSubagentStatus('completed')).toBe('completed');
  });
  it('maps error -> error', () => {
    expect(mapToolStatusToSubagentStatus('error')).toBe('error');
  });
  it('maps blocked -> error', () => {
    expect(mapToolStatusToSubagentStatus('blocked')).toBe('error');
  });
  it('maps running -> running', () => {
    expect(mapToolStatusToSubagentStatus('running')).toBe('running');
  });
});

describe('inferAsyncStatusFromTaskTool', () => {
  it('returns error for error status', () => {
    expect(inferAsyncStatusFromTaskTool(createToolCall({ status: 'error' }))).toBe('error');
  });
  it('returns error for blocked status', () => {
    expect(inferAsyncStatusFromTaskTool(createToolCall({ status: 'blocked' }))).toBe('error');
  });
  it('returns running for running status regardless of result', () => {
    expect(inferAsyncStatusFromTaskTool(createToolCall({ status: 'running', result: '{"status":"completed"}' }))).toBe(
      'running'
    );
  });

  it.each([
    'not_ready',
    'Not Ready',
    '{"status":"running"}',
    '{"status":"pending"}',
    '{"retrieval_status":"running"}',
    '{"retrieval_status":"not_ready"}',
  ])('infers running from result text %j when tool status is completed', (resultText) => {
    expect(
      inferAsyncStatusFromTaskTool(createToolCall({ status: 'completed', result: resultText }))
    ).toBe('running');
  });

  it('defaults to completed when result text has no pending markers', () => {
    expect(
      inferAsyncStatusFromTaskTool(createToolCall({ status: 'completed', result: '{"status":"done"}' }))
    ).toBe('completed');
  });

  it('defaults to completed when there is no result at all', () => {
    expect(inferAsyncStatusFromTaskTool(createToolCall({ status: 'completed', result: undefined }))).toBe(
      'completed'
    );
  });
});

describe('resolveTaskSubagent', () => {
  it('returns the pre-projected toolCall.subagent unchanged when no modeHint is given', () => {
    const subagent: SubagentInfo = {
      id: 'task-1',
      description: 'Existing',
      status: 'completed',
      toolCalls: [],
      isExpanded: false,
      mode: 'sync',
    };
    const toolCall = createToolCall({ subagent });
    expect(resolveTaskSubagent(toolCall)).toBe(subagent);
  });

  it('returns toolCall.subagent unchanged when modeHint matches its mode', () => {
    const subagent: SubagentInfo = {
      id: 'task-1',
      description: 'Existing',
      status: 'completed',
      toolCalls: [],
      isExpanded: false,
      mode: 'async',
    };
    const toolCall = createToolCall({ subagent });
    expect(resolveTaskSubagent(toolCall, 'async')).toBe(subagent);
  });

  it('re-tags toolCall.subagent.mode when modeHint disagrees', () => {
    const subagent: SubagentInfo = {
      id: 'task-1',
      description: 'Existing',
      status: 'completed',
      toolCalls: [],
      isExpanded: false,
      mode: 'sync',
    };
    const toolCall = createToolCall({ subagent });
    const result = resolveTaskSubagent(toolCall, 'async');
    expect(result).not.toBe(subagent);
    expect(result.mode).toBe('async');
    expect(result.description).toBe('Existing');
  });

  it('derives a sync SubagentInfo from input.description/prompt when no subagent is stored', () => {
    const toolCall = createToolCall({
      input: { description: 'Do the thing', prompt: 'Please do the thing' },
      status: 'completed',
      result: 'All done',
    });
    const result = resolveTaskSubagent(toolCall);
    expect(result).toEqual({
      id: 'task-1',
      description: 'Do the thing',
      prompt: 'Please do the thing',
      status: 'completed',
      toolCalls: [],
      isExpanded: false,
      result: 'All done',
    });
  });

  it('falls back to default description/prompt text when input is missing them', () => {
    const toolCall = createToolCall({ input: {}, status: 'running' });
    const result = resolveTaskSubagent(toolCall);
    expect(result.description).toBe('Subagent task');
    expect(result.prompt).toBe('');
    expect(result.status).toBe('running');
  });

  it('infers async mode from input.run_in_background when no modeHint is given', () => {
    const toolCall = createToolCall({
      input: { description: 'Background job', run_in_background: true },
      status: 'completed',
      result: 'done payload',
    });
    const result = resolveTaskSubagent(toolCall);
    expect(result.mode).toBe('async');
    expect(result.asyncStatus).toBe('completed');
    expect(result.status).toBe('completed');
  });

  it('honors an explicit async modeHint even when run_in_background is falsy', () => {
    const toolCall = createToolCall({ input: { description: 'Background job' }, status: 'running' });
    const result = resolveTaskSubagent(toolCall, 'async');
    expect(result.mode).toBe('async');
    expect(result.asyncStatus).toBe('running');
  });

  it('honors an explicit sync modeHint even when run_in_background is true', () => {
    const toolCall = createToolCall({
      input: { description: 'Job', run_in_background: true },
      status: 'completed',
    });
    const result = resolveTaskSubagent(toolCall, 'sync');
    expect(result.mode).toBeUndefined();
    expect(result.asyncStatus).toBeUndefined();
  });
});

describe('display helpers', () => {
  it('truncateDescription leaves short text untouched', () => {
    expect(truncateDescription('short')).toBe('short');
  });

  it('truncateDescription truncates at 40 chars with ellipsis', () => {
    const long = 'A'.repeat(50);
    expect(truncateDescription(long)).toBe('A'.repeat(40) + '...');
  });

  it('getAsyncDisplayStatus maps pending -> running', () => {
    expect(getAsyncDisplayStatus('pending')).toBe('running');
  });
  it('getAsyncDisplayStatus maps undefined -> running', () => {
    expect(getAsyncDisplayStatus(undefined)).toBe('running');
  });
  it('getAsyncDisplayStatus passes through completed/error/orphaned', () => {
    expect(getAsyncDisplayStatus('completed')).toBe('completed');
    expect(getAsyncDisplayStatus('error')).toBe('error');
    expect(getAsyncDisplayStatus('orphaned')).toBe('orphaned');
  });

  it('getAsyncStatusText / getAsyncStatusAriaLabel per raw asyncStatus', () => {
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

  it('buildSyncHeaderAriaLabel formats "Subagent task: <desc> - Status: <status> - click to expand"', () => {
    expect(buildSyncHeaderAriaLabel('My task', 'running')).toBe(
      'Subagent task: My task - Status: running - click to expand'
    );
  });

  it('buildAsyncHeaderAriaLabel formats "Background task: <desc> - <label> - click to expand"', () => {
    expect(buildAsyncHeaderAriaLabel('My job', 'orphaned')).toBe(
      'Background task: My job - Orphaned - click to expand'
    );
  });

  it('buildSyncRootClasses', () => {
    expect(buildSyncRootClasses('completed')).toEqual(['done']);
    expect(buildSyncRootClasses('error')).toEqual(['error']);
    expect(buildSyncRootClasses('running')).toEqual([]);
  });

  it('buildAsyncRootClasses', () => {
    expect(buildAsyncRootClasses('running')).toEqual(['async', 'running']);
    expect(buildAsyncRootClasses('completed')).toEqual(['async', 'completed', 'done']);
    expect(buildAsyncRootClasses('error')).toEqual(['async', 'error', 'error']);
    expect(buildAsyncRootClasses('orphaned')).toEqual(['async', 'orphaned', 'error']);
  });

  it('buildSyncStatusPill', () => {
    expect(buildSyncStatusPill('completed')).toEqual({ pillClass: 'status-completed', icon: 'check', ariaLabel: 'Status: completed' });
    expect(buildSyncStatusPill('error')).toEqual({ pillClass: 'status-error', icon: 'x', ariaLabel: 'Status: error' });
    expect(buildSyncStatusPill('running')).toEqual({ pillClass: 'status-running', icon: null, ariaLabel: 'Status: running' });
  });

  it('buildAsyncStatusPill', () => {
    expect(buildAsyncStatusPill('completed')).toEqual({ pillClass: 'status-completed', icon: 'check', ariaLabel: 'Status: Completed' });
    expect(buildAsyncStatusPill('error')).toEqual({ pillClass: 'status-error', icon: 'x', ariaLabel: 'Status: Error' });
    expect(buildAsyncStatusPill('orphaned')).toEqual({ pillClass: 'status-error', icon: 'alert-circle', ariaLabel: 'Status: Orphaned' });
    expect(buildAsyncStatusPill('pending')).toEqual({ pillClass: 'status-running', icon: null, ariaLabel: 'Status: Initializing' });
    expect(buildAsyncStatusPill(undefined)).toEqual({ pillClass: 'status-running', icon: null, ariaLabel: 'Status: Running in background' });
  });

  it('resolveSubagentResultText is null while running', () => {
    expect(resolveSubagentResultText('running', 'anything')).toBeNull();
  });

  it('resolveSubagentResultText uses result text when present for completed/error', () => {
    expect(resolveSubagentResultText('completed', 'All done')).toEqual({ text: 'All done' });
    expect(resolveSubagentResultText('error', 'Boom')).toEqual({ text: 'Boom' });
  });

  it('resolveSubagentResultText falls back to DONE/ERROR when result is blank', () => {
    expect(resolveSubagentResultText('completed', undefined)).toEqual({ text: 'DONE' });
    expect(resolveSubagentResultText('completed', '   ')).toEqual({ text: 'DONE' });
    expect(resolveSubagentResultText('error', '')).toEqual({ text: 'ERROR' });
  });

  it('resolveSubagentResultText uses the orphan-specific fallback', () => {
    expect(resolveSubagentResultText('orphaned', undefined)).toEqual({
      text: 'Conversation ended before task completed',
    });
    expect(resolveSubagentResultText('orphaned', 'Custom orphan text')).toEqual({ text: 'Custom orphan text' });
  });

  it('shouldShowRunningPlaceholder is true only while running with no result', () => {
    expect(shouldShowRunningPlaceholder(createToolCall({ status: 'running', result: undefined }))).toBe(true);
    expect(shouldShowRunningPlaceholder(createToolCall({ status: 'running', result: '' }))).toBe(true);
    expect(shouldShowRunningPlaceholder(createToolCall({ status: 'running', result: 'partial' }))).toBe(false);
    expect(shouldShowRunningPlaceholder(createToolCall({ status: 'completed', result: undefined }))).toBe(false);
  });
});

describe('projectProviderLifecycleSubagent (Codex spawn+wait/close consolidation)', () => {
  function makeMessage(toolCalls: ToolCallInfo[]): ChatMessage {
    return { id: 'a1', role: 'assistant', content: '', timestamp: 1, toolCalls } as ChatMessage;
  }

  it('consolidates a completed spawn + wait into one sync SubagentInfo', () => {
    const spawn: ToolCallInfo = {
      id: 'spawn-1',
      name: 'spawn_agent',
      input: { message: 'Investigate the flaky test', model: 'gpt-5.3-codex' },
      status: 'completed',
      result: JSON.stringify({ agent_id: 'agent-1', nickname: 'scout' }),
    };
    const wait: ToolCallInfo = {
      id: 'wait-1',
      name: 'wait_agent',
      input: { targets: ['agent-1'] },
      status: 'completed',
      result: JSON.stringify({ status: { 'agent-1': { completed: 'Found the race condition' } } }),
    };
    const msg = makeMessage([spawn, wait]);

    const info = projectProviderLifecycleSubagent(spawn, msg, codexSubagentLifecycleAdapter);

    expect(info.id).toBe('spawn-1');
    expect(info.mode).toBe('sync');
    expect(info.description).toBe('scout (gpt-5.3-codex)');
    expect(info.prompt).toBe('Investigate the flaky test');
    expect(info.status).toBe('completed');
    expect(info.result).toBe('Found the race condition');
    expect(info.agentId).toBe('agent-1');
    expect(info.toolCalls).toEqual([]);
  });

  it('derives an error status/result from a failed wait entry', () => {
    const spawn: ToolCallInfo = {
      id: 'spawn-1',
      name: 'spawn_agent',
      input: { message: 'go' },
      status: 'completed',
      result: JSON.stringify({ agent_id: 'agent-1' }),
    };
    const wait: ToolCallInfo = {
      id: 'wait-1',
      name: 'wait_agent',
      input: { targets: ['agent-1'] },
      status: 'completed',
      result: JSON.stringify({ status: { 'agent-1': { error: 'boom' } } }),
    };

    const info = projectProviderLifecycleSubagent(spawn, makeMessage([spawn, wait]), codexSubagentLifecycleAdapter);

    expect(info.status).toBe('error');
    expect(info.result).toBe('boom');
  });

  it('reports a still-running status when no wait completion is present yet', () => {
    const spawn: ToolCallInfo = {
      id: 'spawn-1',
      name: 'spawn_agent',
      input: { message: 'go' },
      status: 'completed',
      result: JSON.stringify({ agent_id: 'agent-1' }),
    };

    const info = projectProviderLifecycleSubagent(spawn, makeMessage([spawn]), codexSubagentLifecycleAdapter);

    expect(info.status).toBe('running');
    expect(info.result).toBeUndefined();
  });
});
