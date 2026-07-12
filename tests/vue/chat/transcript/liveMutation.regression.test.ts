import '@/providers';

import { flushPromises } from '@vue/test-utils';
import { App, Component, MarkdownRenderer } from 'obsidian';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

import { TOOL_TASK } from '@/core/tools/toolNames';
import type { ChatMessage, SubagentInfo, ToolCallInfo } from '@/core/types';
import {
  SubagentStreamCoordinator,
  type SubagentStreamCoordinatorDeps,
} from '@/features/chat/controllers/SubagentStreamCoordinator';
import { ChatState } from '@/features/chat/state/ChatState';
import { TabTranscriptProjection } from '@/features/chat/tabs/tabTranscript';
import { mountTranscript } from '@/features/chat/ui/vue/transcript/mountTranscript';
import type { TranscriptCallbacks } from '@/features/chat/ui/vue/transcript/transcriptCallbacks';
import type SpecoratorPlugin from '@/main';

/**
 * Regression coverage for the two live-render bugs the cutover missed: the
 * engine mutates the SAME message object in place, so unless the projection
 * refreshes that message's identity, the keyed `MessageBubble` skips its patch
 * and the turn renders blank. These drive the REAL `mountTranscript` →
 * `TranscriptRoot` → `MessageBubble`/`BlockList` path (the Jest lane stubs
 * mountTranscript; the earlier Vue-lane tests only ever pushed fresh arrays, so
 * neither exercised same-object in-place growth).
 */
const renderMock = MarkdownRenderer.renderMarkdown as unknown as Mock;

function makePlugin(): SpecoratorPlugin {
  return { app: new App(), settings: { mediaFolder: '' } } as unknown as SpecoratorPlugin;
}

function makeCallbacks(projection: TabTranscriptProjection, providerId = 'claude'): TranscriptCallbacks {
  return {
    subscribe: projection.subscribe,
    onRewind: vi.fn(),
    onFork: vi.fn(),
    isRewindEligible: vi.fn(() => false),
    openProviderSettings: vi.fn(),
    onRetryLastTurn: null,
    canRetryLastTurn: vi.fn(() => false),
    getMessageActions: vi.fn(() => []),
    copyText: vi.fn(),
    openFile: vi.fn(),
    resolveImageSrc: vi.fn(() => ''),
    showFullImage: vi.fn(),
    getProviderId: vi.fn(() => providerId),
    getWorkOrderPath: vi.fn(() => null),
    getCapabilities: vi.fn(() => ({
      providerId: 'claude',
      supportsPersistentRuntime: true,
      supportsNativeHistory: true,
      supportsPlanMode: true,
      supportsRewind: true,
      supportsFork: true,
      supportsProviderCommands: true,
      supportsImageAttachments: true,
      supportsInstructionMode: true,
      supportsMcpTools: true,
      reasoningControl: 'effort' as const,
    })),
  };
}

function mount(state: ChatState, projection: TabTranscriptProjection, providerId = 'claude') {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const mounted = mountTranscript(container, makePlugin(), new Component(), makeCallbacks(projection, providerId));
  return { container, mounted, dispose: () => { mounted.unmount(); container.remove(); } };
}

beforeEach(() => {
  vi.clearAllMocks();
  renderMock.mockReset();
  renderMock.mockImplementation(async (md: string, el: HTMLElement) => {
    el.createDiv({ cls: 'rendered-md', text: md });
  });
});

describe('transcript live in-place mutation', () => {
  it('C1: renders live growth of the SAME streaming message object (text + tool)', async () => {
    const state = new ChatState();
    const toolCall: ToolCallInfo = {
      id: 't1',
      name: 'Read',
      input: { file_path: 'a.md' },
      status: 'running',
      isExpanded: false,
    };
    const msg: ChatMessage = {
      id: 'a1',
      role: 'assistant',
      content: 'Hello',
      timestamp: 0,
      contentBlocks: [
        { type: 'text', content: 'Hello' },
        { type: 'tool_use', toolId: 't1' },
      ],
      toolCalls: [toolCall],
    };
    state.addMessage(msg);
    state.activeMessageId = 'a1';

    const projection = new TabTranscriptProjection(state);
    const { container, dispose } = mount(state, projection);
    await flushPromises();

    // Baseline: initial text + running tool status.
    expect(container.textContent).toContain('Hello');
    expect(container.textContent).not.toContain('Hello world');
    expect(container.querySelector('.specorator-tool-status.status-running')).not.toBeNull();
    expect(container.querySelector('.specorator-tool-status.status-completed')).toBeNull();

    // Grow the SAME objects in place, exactly like the streaming engine:
    // extend a text block, push a new block, and complete the tool call.
    (msg.contentBlocks![0] as { content: string }).content = 'Hello world';
    msg.contentBlocks!.push({ type: 'text', content: 'Second block' });
    toolCall.status = 'completed';
    toolCall.result = 'file contents';
    projection.emit();
    await flushPromises();

    expect(container.textContent).toContain('Hello world');
    expect(container.textContent).toContain('Second block');
    expect(container.querySelector('.specorator-tool-status.status-completed')).not.toBeNull();

    dispose();
  });

  it('C2: surfaces an async/background subagent completing after the turn ended', async () => {
    const state = new ChatState();
    const subagent: SubagentInfo = {
      id: 'task1',
      description: 'do the thing',
      prompt: 'go',
      status: 'running',
      toolCalls: [],
      isExpanded: false,
    };
    const taskToolCall: ToolCallInfo = {
      id: 'task1',
      name: TOOL_TASK,
      input: {},
      status: 'running',
      isExpanded: false,
      subagent,
    };
    const msg: ChatMessage = {
      id: 'a1',
      role: 'assistant',
      content: '',
      timestamp: 0,
      contentBlocks: [{ type: 'subagent', subagentId: 'task1' }],
      toolCalls: [taskToolCall],
    };
    state.addMessage(msg);
    // Turn already ended — the message is NOT the active stream message.
    state.activeMessageId = null;

    const projection = new TabTranscriptProjection(state);
    const { container, dispose } = mount(state, projection);
    await flushPromises();

    expect(container.querySelector('.specorator-subagent-status.status-running')).not.toBeNull();
    expect(container.querySelector('.specorator-subagent-status.status-completed')).toBeNull();

    // Drive the real coordinator path: SubagentManager reports the subagent
    // completed (mutating it in place) AFTER the turn, on a non-active message.
    const coordinator = new SubagentStreamCoordinator({
      state,
      subagentManager: {} as never,
      findToolCall: (m, id) => m.toolCalls?.find((tc) => tc.id === id),
      normalizeToolResultContent: (c) => String(c),
      flushPendingTools: () => {},
      showThinkingIndicator: () => {},
      scrollToBottom: () => {},
      recordEditedFiles: () => {},
      refreshTranscriptMessage: (id) => projection.refreshMessage(id),
    } as SubagentStreamCoordinatorDeps);

    subagent.status = 'completed';
    subagent.result = 'all done';
    coordinator.onAsyncSubagentStateChange(subagent);
    await flushPromises();

    expect(container.querySelector('.specorator-subagent-status.status-completed')).not.toBeNull();
    expect(container.querySelector('.specorator-subagent-status.status-running')).toBeNull();

    dispose();
  });

  it('C3: flips a live SYNC subagent NESTED tool status when its nested toolCall mutates in place', async () => {
    const state = new ChatState();
    // A nested tool inside a sync subagent, still running — exactly the state
    // `handleSubagentChunk` leaves it in on `subagent_tool_use`.
    const nestedTool: ToolCallInfo = {
      id: 'n1',
      name: 'Read',
      input: { file_path: 'x.md' },
      status: 'running',
      isExpanded: false,
    };
    const subagent: SubagentInfo = {
      id: 'task1',
      description: 'do the thing',
      prompt: 'go',
      status: 'running',
      toolCalls: [nestedTool],
      isExpanded: false,
    };
    const taskToolCall: ToolCallInfo = {
      id: 'task1',
      name: TOOL_TASK,
      input: {},
      status: 'running',
      isExpanded: false,
      subagent,
    };
    const msg: ChatMessage = {
      id: 'a1',
      role: 'assistant',
      content: '',
      timestamp: 0,
      contentBlocks: [{ type: 'subagent', subagentId: 'task1' }],
      toolCalls: [taskToolCall],
    };
    state.addMessage(msg);
    state.activeMessageId = 'a1'; // live streaming turn

    const projection = new TabTranscriptProjection(state);
    const { container, dispose } = mount(state, projection);
    await flushPromises();

    expect(container.querySelector('.specorator-subagent-tool-status.status-running')).not.toBeNull();
    expect(container.querySelector('.specorator-subagent-tool-status.status-completed')).toBeNull();

    // Exactly what `SubagentStreamCoordinator.handleSubagentChunk` does on a
    // `subagent_tool_result` chunk: mutate the nested entry IN PLACE.
    nestedTool.status = 'completed';
    nestedTool.result = 'file contents';
    projection.emit();
    await flushPromises();

    expect(container.querySelector('.specorator-subagent-tool-status.status-completed')).not.toBeNull();
    expect(container.querySelector('.specorator-subagent-tool-status.status-running')).toBeNull();

    dispose();
  });

  it('C4: flips a live provider-lifecycle (Codex spawn+wait) card when the wait tool result mutates in place', async () => {
    const state = new ChatState();
    const spawnTool: ToolCallInfo = {
      id: 'spawn-1',
      name: 'spawn_agent',
      input: { message: 'go', model: 'gpt-5.3-codex' },
      status: 'completed',
      isExpanded: false,
      result: JSON.stringify({ agent_id: 'agent-1', nickname: 'scout' }),
    };
    // Wait tool not yet resolved — the consolidated card should read "running".
    const waitTool: ToolCallInfo = {
      id: 'wait-1',
      name: 'wait_agent',
      input: { targets: ['agent-1'] },
      status: 'running',
      isExpanded: false,
    };
    const msg: ChatMessage = {
      id: 'a1',
      role: 'assistant',
      content: '',
      timestamp: 0,
      contentBlocks: [{ type: 'tool_use', toolId: 'spawn-1' }, { type: 'tool_use', toolId: 'wait-1' }],
      toolCalls: [spawnTool, waitTool],
    };
    state.addMessage(msg);
    state.activeMessageId = 'a1'; // live streaming turn

    const projection = new TabTranscriptProjection(state);
    const { container, dispose } = mount(state, projection, 'codex');
    await flushPromises();

    // Exactly one consolidated card, running; the wait tool is not rendered separately.
    expect(container.querySelectorAll('.specorator-subagent-list')).toHaveLength(1);
    expect(container.querySelector('.specorator-tool-call')).toBeNull();
    expect(container.querySelector('.specorator-subagent-status.status-running')).not.toBeNull();
    expect(container.querySelector('.specorator-subagent-status.status-completed')).toBeNull();

    // Resolve the wait in place, exactly like the Codex live stream would.
    waitTool.status = 'completed';
    waitTool.result = JSON.stringify({ status: { 'agent-1': { completed: 'Found the race condition' } } });
    projection.emit();
    await flushPromises();

    expect(container.querySelector('.specorator-subagent-status.status-completed')).not.toBeNull();
    expect(container.querySelector('.specorator-subagent-status.status-running')).toBeNull();
    expect(container.querySelector('.specorator-subagent-result-output')?.textContent).toBe('Found the race condition');

    dispose();
  });
});
