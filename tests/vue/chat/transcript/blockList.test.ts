import '@/providers';

import { render } from '@testing-library/vue';
import { flushPromises } from '@vue/test-utils';
import { App, Component, MarkdownRenderer } from 'obsidian';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

import type { ChatMessage } from '@/core/types';
import BlockList from '@/features/chat/ui/vue/transcript/blocks/BlockList.vue';
import type { TranscriptCallbacks } from '@/features/chat/ui/vue/transcript/transcriptCallbacks';
import { APP_KEY, CALLBACKS_KEY, COMPONENT_KEY, PLUGIN_KEY } from '@/features/chat/ui/vue/transcript/transcriptKeys';
import type SpecoratorPlugin from '@/main';

/**
 * Parity twin of `messageBubble.characterization.test.ts`: reproduces the
 * same content-block dispatch / leftover-tool / legacy-fallback / duration-
 * footer assembly contract via `BlockList.vue`, mounting the REAL leaf
 * components (not mocks) so this also proves the dispatch wiring end to end.
 */
const renderMock = MarkdownRenderer.renderMarkdown as unknown as Mock;

function makeCallbacks(overrides: Partial<TranscriptCallbacks> = {}): TranscriptCallbacks {
  return {
    subscribe: vi.fn(),
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
    getProviderId: vi.fn(() => 'claude'),
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
    ...overrides,
  };
}

function mountBlockList(msg: ChatMessage, callbacks?: TranscriptCallbacks) {
  const plugin = { settings: { mediaFolder: '' } } as unknown as SpecoratorPlugin;
  return render(BlockList, {
    props: { msg },
    global: {
      provide: {
        [APP_KEY as symbol]: new App(),
        [COMPONENT_KEY as symbol]: new Component(),
        [PLUGIN_KEY as symbol]: plugin,
        ...(callbacks ? { [CALLBACKS_KEY as symbol]: callbacks } : {}),
      },
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  renderMock.mockReset();
  renderMock.mockImplementation(async (md: string, el: HTMLElement) => {
    el.createDiv({ cls: 'rendered-md', text: md });
  });
});

describe('BlockList', () => {
  it('dispatches thinking/text/tool_use/subagent blocks in order, no footer', async () => {
    const msg: ChatMessage = {
      id: 'a1',
      role: 'assistant',
      content: '',
      timestamp: 1,
      toolCalls: [
        { id: 'edit-1', name: 'Edit', input: { file_path: 'x.md' }, status: 'completed' },
        { id: 'read-1', name: 'Read', input: { file_path: 'x.md' }, status: 'completed' },
        {
          id: 'sub-1',
          name: 'Task',
          input: { description: 'desc' },
          status: 'running',
          subagent: { id: 'sub-1', description: 'desc', mode: 'sync', status: 'running', toolCalls: [], isExpanded: false },
        },
      ],
      contentBlocks: [
        { type: 'thinking', content: 'thinking text', durationSeconds: 3 },
        { type: 'text', content: 'Hello from assistant' },
        { type: 'tool_use', toolId: 'edit-1' },
        { type: 'tool_use', toolId: 'read-1' },
        { type: 'subagent', subagentId: 'sub-1' },
      ],
    } as ChatMessage;

    const { container } = mountBlockList(msg, makeCallbacks());
    await flushPromises();

    const classList = Array.from(container.children).map((c) => Array.from(c.classList));
    expect(classList).toEqual([
      ['specorator-thinking-block'],
      ['specorator-text-block'],
      ['specorator-write-edit-block', 'done'],
      ['specorator-tool-call'],
      ['specorator-subagent-list'],
    ]);
    expect(container.querySelector('.specorator-response-footer')).toBeNull();

    const writeEdit = container.children[2] as HTMLElement;
    expect(writeEdit.dataset.toolId).toBe('edit-1');
    const toolCall = container.children[3] as HTMLElement;
    expect(toolCall.dataset.toolId).toBe('read-1');
    const subagent = container.children[4] as HTMLElement;
    expect(subagent.dataset.subagentId).toBe('sub-1');
  });

  it('skips empty or whitespace-only text blocks', async () => {
    const msg: ChatMessage = {
      id: 'a1',
      role: 'assistant',
      content: '',
      timestamp: 1,
      contentBlocks: [
        { type: 'text', content: '' },
        { type: 'text', content: '   ' },
        { type: 'text', content: 'Real content' },
      ],
    } as ChatMessage;

    const { container } = mountBlockList(msg);
    await flushPromises();

    expect(container.querySelectorAll('.specorator-text-block')).toHaveLength(1);
    expect(container.querySelector('.rendered-md')?.textContent).toBe('Real content');
  });

  it('renders a context_compacted marker and a runtime_error card', async () => {
    const msg: ChatMessage = {
      id: 'a1',
      role: 'assistant',
      content: '',
      timestamp: 1,
      contentBlocks: [
        { type: 'runtime_error', content: 'spawn claude ENOENT' },
        { type: 'context_compacted' },
      ],
    } as ChatMessage;

    const { container } = mountBlockList(msg, makeCallbacks());
    await flushPromises();

    const errorCard = container.querySelector('.specorator-runtime-error-card');
    expect(errorCard).not.toBeNull();
    expect(errorCard?.classList.contains('specorator-runtime-error-cli-not-found')).toBe(true);
    expect(container.querySelector('.specorator-compact-boundary')).not.toBeNull();
    // A compaction boundary block suppresses the footer even when durationSeconds is set.
  });

  it('appends leftover tool calls (not referenced by any content block) after the block-driven items', async () => {
    const msg: ChatMessage = {
      id: 'a1',
      role: 'assistant',
      content: '',
      timestamp: 1,
      toolCalls: [
        { id: 'a', name: 'Read', input: { file_path: 'a.md' }, status: 'completed' },
        { id: 'b', name: 'Bash', input: { command: 'ls' }, status: 'completed' },
      ],
      contentBlocks: [{ type: 'tool_use', toolId: 'a' }],
    } as ChatMessage;

    const { container } = mountBlockList(msg);
    await flushPromises();

    const toolEls = container.querySelectorAll('.specorator-tool-call');
    expect(toolEls).toHaveLength(2);
    expect((toolEls[0] as HTMLElement).dataset.toolId).toBe('a');
    expect((toolEls[1] as HTMLElement).dataset.toolId).toBe('b');
  });

  it('falls back to legacy rendering (msg.content + all toolCalls) when contentBlocks is absent', async () => {
    const msg: ChatMessage = {
      id: 'a1',
      role: 'assistant',
      content: 'Legacy text',
      timestamp: 1,
      toolCalls: [{ id: 't1', name: 'Read', input: { file_path: 'a.md' }, status: 'completed' }],
    };

    const { container } = mountBlockList(msg);
    await flushPromises();

    const classes = Array.from(container.children).map((c) => c.className);
    expect(classes).toEqual(['specorator-text-block', 'specorator-tool-call']);
  });

  it('renders the duration footer with the flavor word and formatted mm:ss', async () => {
    const msg: ChatMessage = {
      id: 'a1',
      role: 'assistant',
      content: '',
      timestamp: 1,
      contentBlocks: [{ type: 'text', content: 'Response' }],
      durationSeconds: 65,
      durationFlavorWord: 'Cooked',
    } as ChatMessage;

    const { container } = mountBlockList(msg);
    await flushPromises();

    const footer = container.lastElementChild as HTMLElement;
    expect(footer.classList.contains('specorator-response-footer')).toBe(true);
    expect(footer.querySelector('.specorator-baked-duration')?.textContent).toBe('* Cooked for 1m 5s');
  });

  it('does not render a footer when durationSeconds is 0', async () => {
    const msg: ChatMessage = {
      id: 'a1',
      role: 'assistant',
      content: '',
      timestamp: 1,
      contentBlocks: [{ type: 'text', content: 'Response' }],
      durationSeconds: 0,
    } as ChatMessage;

    const { container } = mountBlockList(msg);
    await flushPromises();

    expect(container.querySelector('.specorator-response-footer')).toBeNull();
  });

  it('suppresses the footer across a compaction boundary even when durationSeconds is set', async () => {
    const msg: ChatMessage = {
      id: 'a1',
      role: 'assistant',
      content: '',
      timestamp: 1,
      contentBlocks: [{ type: 'text', content: 'Before' }, { type: 'context_compacted' }],
      durationSeconds: 30,
    } as ChatMessage;

    const { container } = mountBlockList(msg);
    await flushPromises();

    expect(container.querySelector('.specorator-response-footer')).toBeNull();
  });

  it('shouldRenderToolCall gate: hides TaskOutput, empty write_stdin, and custom_tool_call_output', async () => {
    const msg: ChatMessage = {
      id: 'a1',
      role: 'assistant',
      content: '',
      timestamp: 1,
      toolCalls: [
        { id: 't1', name: 'TaskOutput', input: {}, status: 'completed' },
        { id: 't2', name: 'write_stdin', input: { session_id: '1', chars: '' }, status: 'completed' },
        { id: 't3', name: 'custom_tool_call_output', input: {}, status: 'completed' },
        { id: 't4', name: 'write_stdin', input: { session_id: '1', chars: 'y\n' }, status: 'completed' },
      ],
    } as ChatMessage;

    const { container } = mountBlockList(msg);
    await flushPromises();

    const toolEls = container.querySelectorAll('.specorator-tool-call');
    expect(toolEls).toHaveLength(1);
    expect((toolEls[0] as HTMLElement).dataset.toolId).toBe('t4');
  });

  it('shouldRenderToolCall gate: hides a provider-lifecycle hidden tool for the active provider (Codex wait_agent)', async () => {
    const msg: ChatMessage = {
      id: 'a1',
      role: 'assistant',
      content: '',
      timestamp: 1,
      toolCalls: [{ id: 'wait-1', name: 'wait_agent', input: { targets: ['agent-1'] }, status: 'completed' }],
    } as ChatMessage;

    const { container } = mountBlockList(msg, makeCallbacks({ getProviderId: vi.fn(() => 'codex') }));
    await flushPromises();

    expect(container.querySelector('.specorator-tool-call')).toBeNull();
  });

  it('provider-lifecycle SPAWN tool (Codex spawn_agent) consolidates into a subagent card, not a plain ToolCall', async () => {
    const msg: ChatMessage = {
      id: 'a1',
      role: 'assistant',
      content: '',
      timestamp: 1,
      toolCalls: [
        {
          id: 'spawn-1',
          name: 'spawn_agent',
          input: { message: 'Investigate the flaky test', model: 'gpt-5.3-codex' },
          status: 'completed',
          result: JSON.stringify({ agent_id: 'agent-1', nickname: 'scout' }),
        },
        {
          id: 'wait-1',
          name: 'wait_agent',
          input: { targets: ['agent-1'] },
          status: 'completed',
          result: JSON.stringify({ status: { 'agent-1': { completed: 'Found the race condition' } } }),
        },
      ],
    } as ChatMessage;

    const { container } = mountBlockList(msg, makeCallbacks({ getProviderId: vi.fn(() => 'codex') }));
    await flushPromises();

    const card = container.querySelector('.specorator-subagent-list') as HTMLElement | null;
    expect(card).not.toBeNull();
    // The spawn's own id anchors the consolidated card (sync mode).
    expect(card?.dataset.subagentId).toBe('spawn-1');
    expect(card?.classList.contains('done')).toBe(true);
    expect(card?.querySelector('.specorator-subagent-label')?.textContent).toBe('scout (gpt-5.3-codex)');
    expect(card?.querySelector('.specorator-subagent-prompt-text')?.textContent).toBe('Investigate the flaky test');
    expect(card?.querySelector('.specorator-subagent-result-output')?.textContent).toBe('Found the race condition');
    // The wait sibling is consolidated, NOT rendered as a separate plain tool.
    expect(container.querySelector('.specorator-tool-call')).toBeNull();
    expect(container.querySelectorAll('.specorator-subagent-list')).toHaveLength(1);
  });

  it('consolidates a spawn card referenced by content blocks and does not re-render its wait sibling', async () => {
    const msg: ChatMessage = {
      id: 'a1',
      role: 'assistant',
      content: '',
      timestamp: 1,
      toolCalls: [
        {
          id: 'spawn-1',
          name: 'spawn_agent',
          input: { message: 'go', model: 'gpt-5.3-codex' },
          status: 'completed',
          result: JSON.stringify({ agent_id: 'agent-1', nickname: 'scout' }),
        },
        {
          id: 'wait-1',
          name: 'wait_agent',
          input: { targets: ['agent-1'] },
          status: 'completed',
          result: JSON.stringify({ status: { 'agent-1': { completed: 'done' } } }),
        },
      ],
      contentBlocks: [
        { type: 'text', content: 'Spawning a scout' },
        { type: 'tool_use', toolId: 'spawn-1' },
        { type: 'tool_use', toolId: 'wait-1' },
      ],
    } as ChatMessage;

    const { container } = mountBlockList(msg, makeCallbacks({ getProviderId: vi.fn(() => 'codex') }));
    await flushPromises();

    expect(container.querySelectorAll('.specorator-subagent-list')).toHaveLength(1);
    expect(container.querySelector('.specorator-tool-call')).toBeNull();
    expect(container.querySelector('.specorator-text-block')).not.toBeNull();
  });
});
