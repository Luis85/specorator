import '@/providers';

import { createMockEl } from '@test/helpers/mockElement';

import { TOOL_AGENT_OUTPUT, TOOL_TASK } from '@/core/tools/toolNames';
import type { ChatMessage, ToolCallInfo } from '@/core/types';
import {
  SubagentStreamCoordinator,
  type SubagentStreamCoordinatorDeps,
} from '@/features/chat/controllers/SubagentStreamCoordinator';
import { SubagentManager } from '@/features/chat/services/SubagentManager';

/**
 * Task 17b characterization: locks that the SUBAGENT reactive DATA on
 * `msg.toolCalls[].subagent` (a `SubagentInfo`) is fully populated DURING
 * streaming by the `SubagentManager`-mediated Task path, independent of the
 * imperative DOM. This is the safety net for the Task 18 cutover that removes
 * the imperative `SubagentRenderer` DOM: `SubagentBlock.vue` /
 * `subagentViewModel.resolveTaskSubagent` read exactly these fields
 * (`description`, `prompt`, `mode`, `status`, `asyncStatus`, `result`, and
 * `toolCalls[]` with each nested `id`/`name`/`input`/`status`/`result`), so if
 * they're present here, the Vue component has what it needs.
 *
 * Unlike `SubagentManager.test.ts` (which mocks `SubagentRenderer`, so
 * `state.info.toolCalls` never grows), this drives the REAL coordinator + REAL
 * `SubagentManager` + REAL `SubagentRenderer` over mock DOM elements, so the
 * data mutations that the SFC depends on actually run.
 */

const mockApp = {
  workspace: { openLinkText: jest.fn() },
  metadataCache: { getFirstLinkpathDest: jest.fn(() => null) },
  vault: { getAbstractFileByPath: jest.fn(() => null) },
} as never;

function createMessage(): ChatMessage {
  return { id: 'assistant-1', role: 'assistant', content: '', timestamp: 0 } as ChatMessage;
}

function setup() {
  const state = {
    currentContentEl: createMockEl(),
    messages: [] as ChatMessage[],
  };

  const ref: { coordinator?: SubagentStreamCoordinator } = {};

  const subagentManager = new SubagentManager(mockApp, (subagent) => {
    ref.coordinator?.onAsyncSubagentStateChange(subagent);
  });

  const deps: SubagentStreamCoordinatorDeps = {
    state: state as never,
    subagentManager,
    getAgentService: () => null,
    findToolCall: (msg, id) => msg.toolCalls?.find((tc) => tc.id === id),
    normalizeToolResultContent: (c) => String(c),
    flushPendingTools: jest.fn(),
    showThinkingIndicator: jest.fn(),
    scrollToBottom: jest.fn(),
    recordEditedFiles: jest.fn(),
  };

  const coordinator = new SubagentStreamCoordinator(deps);
  ref.coordinator = coordinator;

  const msg = createMessage();
  state.messages.push(msg);

  return { coordinator, subagentManager, state, msg };
}

function taskToolCall(msg: ChatMessage): ToolCallInfo | undefined {
  return msg.toolCalls?.find((tc) => tc.name === TOOL_TASK);
}

describe('SubagentStreamCoordinator reactive data (sync Task subagent)', () => {
  it('populates subagent description/prompt on the Task tool_use', () => {
    const { coordinator, msg } = setup();

    coordinator.dispatchToolUse(
      {
        type: 'tool_use',
        id: 'task-1',
        name: TOOL_TASK,
        input: { description: 'Refactor auth', prompt: 'Refactor src/auth', run_in_background: false },
      },
      msg,
    );

    const task = taskToolCall(msg);
    expect(task?.subagent).toBeDefined();
    const subagent = task!.subagent!;
    expect(subagent.id).toBe('task-1');
    expect(subagent.description).toBe('Refactor auth');
    expect(subagent.prompt).toBe('Refactor src/auth');
    expect(subagent.mode).not.toBe('async'); // sync
    expect(subagent.status).toBe('running');
    expect(subagent.toolCalls).toEqual([]);
  });

  it('grows subagent.toolCalls (with input + running status) on subagent_tool_use children', async () => {
    const { coordinator, msg } = setup();

    coordinator.dispatchToolUse(
      { type: 'tool_use', id: 'task-1', name: TOOL_TASK, input: { description: 'X', run_in_background: false } },
      msg,
    );

    await coordinator.handleSubagentChunk(
      { type: 'subagent_tool_use', subagentId: 'task-1', id: 'read-1', name: 'Read', input: { file_path: 'a.ts' } },
      msg,
    );
    await coordinator.handleSubagentChunk(
      { type: 'subagent_tool_use', subagentId: 'task-1', id: 'bash-1', name: 'Bash', input: { command: 'npm test' } },
      msg,
    );

    const subagent = taskToolCall(msg)!.subagent!;
    expect(subagent.toolCalls).toHaveLength(2);

    const [read, bash] = subagent.toolCalls;
    expect(read.id).toBe('read-1');
    expect(read.name).toBe('Read');
    expect(read.input).toEqual({ file_path: 'a.ts' });
    expect(read.status).toBe('running');

    expect(bash.id).toBe('bash-1');
    expect(bash.name).toBe('Bash');
    expect(bash.input).toEqual({ command: 'npm test' });
    expect(bash.status).toBe('running');
  });

  it('updates a nested tool status + result on subagent_tool_result', async () => {
    const { coordinator, msg } = setup();

    coordinator.dispatchToolUse(
      { type: 'tool_use', id: 'task-1', name: TOOL_TASK, input: { description: 'X', run_in_background: false } },
      msg,
    );
    await coordinator.handleSubagentChunk(
      { type: 'subagent_tool_use', subagentId: 'task-1', id: 'read-1', name: 'Read', input: { file_path: 'a.ts' } },
      msg,
    );
    await coordinator.handleSubagentChunk(
      { type: 'subagent_tool_result', subagentId: 'task-1', id: 'read-1', content: 'file contents', isError: false },
      msg,
    );

    const nested = taskToolCall(msg)!.subagent!.toolCalls.find((tc) => tc.id === 'read-1')!;
    expect(nested.status).toBe('completed');
    expect(nested.result).toBe('file contents');
  });

  it('marks a nested tool as error when its subagent_tool_result isError', async () => {
    const { coordinator, msg } = setup();

    coordinator.dispatchToolUse(
      { type: 'tool_use', id: 'task-1', name: TOOL_TASK, input: { description: 'X', run_in_background: false } },
      msg,
    );
    await coordinator.handleSubagentChunk(
      { type: 'subagent_tool_use', subagentId: 'task-1', id: 'bash-1', name: 'Bash', input: { command: 'x' } },
      msg,
    );
    await coordinator.handleSubagentChunk(
      { type: 'subagent_tool_result', subagentId: 'task-1', id: 'bash-1', content: 'boom', isError: true },
      msg,
    );

    const nested = taskToolCall(msg)!.subagent!.toolCalls.find((tc) => tc.id === 'bash-1')!;
    expect(nested.status).toBe('error');
    expect(nested.result).toBe('boom');
  });

  it('sets subagent.status=completed and .result when the Task tool_result arrives', async () => {
    const { coordinator, msg } = setup();

    coordinator.dispatchToolUse(
      { type: 'tool_use', id: 'task-1', name: TOOL_TASK, input: { description: 'X', run_in_background: false } },
      msg,
    );
    await coordinator.handleSubagentChunk(
      { type: 'subagent_tool_use', subagentId: 'task-1', id: 'read-1', name: 'Read', input: {} },
      msg,
    );

    const handled = await coordinator.handleToolResult(
      { type: 'tool_result', id: 'task-1', content: 'All done refactoring', isError: false },
      msg,
    );

    expect(handled).toBe(true);
    const subagent = taskToolCall(msg)!.subagent!;
    expect(subagent.status).toBe('completed');
    expect(subagent.result).toBe('All done refactoring');
    // The parent Task tool call mirrors the completed status/result.
    expect(taskToolCall(msg)!.status).toBe('completed');
    expect(taskToolCall(msg)!.result).toBe('All done refactoring');
  });

  it('sets subagent.status=error when the Task tool_result is an error', async () => {
    const { coordinator, msg } = setup();

    coordinator.dispatchToolUse(
      { type: 'tool_use', id: 'task-1', name: TOOL_TASK, input: { description: 'X', run_in_background: false } },
      msg,
    );
    await coordinator.handleToolResult(
      { type: 'tool_result', id: 'task-1', content: 'it failed', isError: true },
      msg,
    );

    const subagent = taskToolCall(msg)!.subagent!;
    expect(subagent.status).toBe('error');
    expect(subagent.result).toBe('it failed');
  });
});

describe('SubagentStreamCoordinator reactive data (async Task subagent)', () => {
  it('populates async mode + pending asyncStatus on the Task tool_use', () => {
    const { coordinator, msg } = setup();

    coordinator.dispatchToolUse(
      {
        type: 'tool_use',
        id: 'task-async',
        name: TOOL_TASK,
        input: { description: 'Background work', prompt: 'Investigate flake', run_in_background: true },
      },
      msg,
    );

    const subagent = taskToolCall(msg)!.subagent!;
    expect(subagent.mode).toBe('async');
    expect(subagent.description).toBe('Background work');
    expect(subagent.prompt).toBe('Investigate flake');
    expect(subagent.status).toBe('running');
    expect(subagent.asyncStatus).toBe('pending');
  });

  it('transitions asyncStatus pending -> running and records agentId on the Task tool_result', async () => {
    const { coordinator, msg } = setup();

    coordinator.dispatchToolUse(
      { type: 'tool_use', id: 'task-async', name: TOOL_TASK, input: { description: 'BG', run_in_background: true } },
      msg,
    );
    await coordinator.handleToolResult(
      { type: 'tool_result', id: 'task-async', content: JSON.stringify({ agent_id: 'agent-42' }), isError: false },
      msg,
    );

    const subagent = taskToolCall(msg)!.subagent!;
    expect(subagent.asyncStatus).toBe('running');
    expect(subagent.agentId).toBe('agent-42');
    expect(subagent.status).toBe('running');
  });

  it('populates status/asyncStatus/result when an async_subagent_result completes the run', async () => {
    const { coordinator, msg } = setup();

    coordinator.dispatchToolUse(
      { type: 'tool_use', id: 'task-async', name: TOOL_TASK, input: { description: 'BG', run_in_background: true } },
      msg,
    );
    await coordinator.handleToolResult(
      { type: 'tool_result', id: 'task-async', content: JSON.stringify({ agent_id: 'agent-42' }), isError: false },
      msg,
    );

    await coordinator.handleAsyncSubagentResult({
      type: 'async_subagent_result',
      agentId: 'agent-42',
      status: 'completed',
      result: 'Background task finished successfully.',
    });

    const subagent = taskToolCall(msg)!.subagent!;
    expect(subagent.asyncStatus).toBe('completed');
    expect(subagent.status).toBe('completed');
    expect(subagent.result).toBe('Background task finished successfully.');
  });

  it('populates error asyncStatus/result when an async_subagent_result errors', async () => {
    const { coordinator, msg } = setup();

    coordinator.dispatchToolUse(
      { type: 'tool_use', id: 'task-async', name: TOOL_TASK, input: { description: 'BG', run_in_background: true } },
      msg,
    );
    await coordinator.handleToolResult(
      { type: 'tool_result', id: 'task-async', content: JSON.stringify({ agent_id: 'agent-err' }), isError: false },
      msg,
    );

    await coordinator.handleAsyncSubagentResult({
      type: 'async_subagent_result',
      agentId: 'agent-err',
      status: 'error',
      result: 'Background task crashed.',
    });

    const subagent = taskToolCall(msg)!.subagent!;
    expect(subagent.asyncStatus).toBe('error');
    expect(subagent.status).toBe('error');
    expect(subagent.result).toBe('Background task crashed.');
  });

  it('completes an async subagent through the TaskOutput (agent-output) result path', async () => {
    const { coordinator, msg } = setup();

    coordinator.dispatchToolUse(
      { type: 'tool_use', id: 'task-async', name: TOOL_TASK, input: { description: 'BG', run_in_background: true } },
      msg,
    );
    await coordinator.handleToolResult(
      { type: 'tool_result', id: 'task-async', content: JSON.stringify({ agent_id: 'agent-out' }), isError: false },
      msg,
    );

    // TaskOutput tool links to the async subagent, then its result finalizes it.
    coordinator.dispatchToolUse(
      { type: 'tool_use', id: 'out-1', name: TOOL_AGENT_OUTPUT, input: { agent_id: 'agent-out' } },
      msg,
    );
    await coordinator.handleToolResult(
      {
        type: 'tool_result',
        id: 'out-1',
        content: JSON.stringify({
          retrieval_status: 'success',
          agents: { 'agent-out': { status: 'completed', result: 'Final answer from background agent.' } },
        }),
        isError: false,
      },
      msg,
    );

    const subagent = taskToolCall(msg)!.subagent!;
    expect(subagent.asyncStatus).toBe('completed');
    expect(subagent.status).toBe('completed');
    expect(subagent.result).toBe('Final answer from background agent.');
  });

  it('marks the subagent orphaned (data) when the stream ends mid-flight', async () => {
    const { coordinator, subagentManager, msg } = setup();

    coordinator.dispatchToolUse(
      { type: 'tool_use', id: 'task-async', name: TOOL_TASK, input: { description: 'BG', run_in_background: true } },
      msg,
    );
    await coordinator.handleToolResult(
      { type: 'tool_result', id: 'task-async', content: JSON.stringify({ agent_id: 'agent-orphan' }), isError: false },
      msg,
    );

    subagentManager.orphanAllActive();

    const subagent = taskToolCall(msg)!.subagent!;
    expect(subagent.asyncStatus).toBe('orphaned');
    expect(subagent.status).toBe('error');
    expect(subagent.result).toBe('Conversation ended before task completed');
  });
});
