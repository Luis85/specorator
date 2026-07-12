import '@/providers';

import { flushPromises } from '@vue/test-utils';
import { App, Component, MarkdownRenderer } from 'obsidian';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

import type { ChatMessage, ToolCallInfo } from '@/core/types';
import { RENDER_WINDOW_SIZE } from '@/features/chat/rendering/windowedRenderSetup';
import { ChatState } from '@/features/chat/state/ChatState';
import { TabTranscriptProjection } from '@/features/chat/tabs/tabTranscript';
import { mountTranscript } from '@/features/chat/ui/vue/transcript/mountTranscript';
import type { TranscriptCallbacks } from '@/features/chat/ui/vue/transcript/transcriptCallbacks';
import type SpecoratorPlugin from '@/main';

/**
 * Transcript Vue-surface scaling guard rails — the blocking perf gate after the
 * Task 18b cutover deleted the imperative `MessageRenderer` and, with it,
 * `tests/perf/messageRenderer.perf.test.ts`.
 *
 * The Jest perf lane stubs `.vue` + `mountTranscript` (jest.base.config.js
 * moduleNameMapper), so it can no longer render a real transcript; only the
 * Vitest lane compiles SFCs, so the transcript's perf gate lives here — and
 * `npm run test:vue` (the CI `component` job) is a blocking gate, so the coverage
 * the deleted spec provided is preserved.
 *
 * Like the deleted spec, these are SCALING / STRUCTURE assertions, never
 * wall-clock timings, so they stay stable on noisy shared runners:
 *
 *   (a) Windowing: with N ≫ RENDER_WINDOW_SIZE messages projected, the mounted
 *       `.specorator-message` count stays ≤ RENDER_WINDOW_SIZE — DOM growth is
 *       bounded by the trailing render window, not by conversation length. The
 *       mounted count does NOT grow as N scales.
 *   (b) One-chunk → one-block: growing the ACTIVE streaming message in place and
 *       emitting re-renders only that message's content; sibling messages' DOM
 *       nodes keep node identity (the projection refreshes only the active
 *       message's identity, so Vue skips the keyed sibling's patch entirely).
 *       This is the Vue analogue of "one stream chunk re-renders exactly one
 *       message/block."
 */
const renderMock = MarkdownRenderer.renderMarkdown as unknown as Mock;

function makeCallbacks(projection: TabTranscriptProjection): TranscriptCallbacks {
  return {
    subscribe: projection.subscribe,
    onRewind: vi.fn(),
    onFork: vi.fn(),
    isRewindEligible: vi.fn(() => false),
    openProviderSettings: vi.fn(),
    onRetryLastTurn: null,
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
  };
}

function makePlugin(): SpecoratorPlugin {
  return { app: new App(), settings: { mediaFolder: '' } } as unknown as SpecoratorPlugin;
}

function mount(projection: TabTranscriptProjection) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const mounted = mountTranscript(container, makePlugin(), new Component(), makeCallbacks(projection));
  return { container, mounted, dispose: () => { mounted.unmount(); container.remove(); } };
}

function userMessage(i: number): ChatMessage {
  return { id: `m${i}`, role: 'user', content: `message ${i}`, timestamp: i };
}

beforeEach(() => {
  vi.clearAllMocks();
  renderMock.mockReset();
  renderMock.mockImplementation(async (md: string, el: HTMLElement) => {
    el.createDiv({ cls: 'rendered-md', text: md });
  });
});

describe('Transcript Vue scaling', () => {
  it('bounds mounted DOM to the render window — mounted messages never grow with conversation length', async () => {
    // Scale conversation length by ~4x across [80, 300]. The trailing render
    // window caps the mounted set at RENDER_WINDOW_SIZE, so a 4x-longer chat must
    // mount the SAME number of messages — bounded by the window, not by N. If
    // windowing is ever removed upstream, mounted grows with N and this trips.
    const scales = [RENDER_WINDOW_SIZE, 160, 300];

    const metrics: Array<{ n: number; mounted: number; nodes: number; listeners: number }> = [];
    for (const n of scales) {
      const state = new ChatState();
      for (let i = 0; i < n; i++) state.addMessage(userMessage(i));
      const projection = new TabTranscriptProjection(state);

      // Count element listeners registered during THIS mount only — the axis that
      // must NOT scale with conversation length (only with the mounted window).
      const addSpy = vi.spyOn(HTMLElement.prototype, 'addEventListener');
      const { container, dispose } = mount(projection);
      await flushPromises();
      const listeners = addSpy.mock.calls.length;
      addSpy.mockRestore();

      const mounted = container.querySelectorAll('.specorator-message').length;
      const nodes = container.querySelectorAll('*').length;
      metrics.push({ n, mounted, nodes, listeners });
      dispose();
    }

    // Every scale mounts at most the render window — the hard windowing bound.
    for (const m of metrics) {
      expect(m.mounted).toBeLessThanOrEqual(RENDER_WINDOW_SIZE);
    }

    const small = metrics[0];
    const large = metrics[metrics.length - 1];

    // The mounted set does NOT grow with N: a 300-message chat mounts exactly as
    // many messages as an 80-message chat (both saturate the window at 80).
    expect(large.mounted).toBe(small.mounted);
    expect(large.mounted).toBe(RENDER_WINDOW_SIZE);

    // DOM + listeners track the mounted window, not conversation length: the only
    // extra cost at N ≫ window is the fixed "load earlier" control (a small
    // constant), so a 4x-longer chat can't cost meaningfully more DOM/listeners.
    expect(large.nodes).toBeLessThanOrEqual(small.nodes + 20);
    expect(large.listeners).toBeLessThanOrEqual(small.listeners + 5);
  }, 30_000);

  it('PERF: growing the active streaming message re-renders only that message — sibling DOM nodes are not recreated', async () => {
    const state = new ChatState();
    state.addMessage(userMessage(0));
    state.addMessage(userMessage(1));
    const toolCall: ToolCallInfo = {
      id: 't1',
      name: 'Read',
      input: { file_path: 'a.md' },
      status: 'running',
      isExpanded: false,
    };
    const active: ChatMessage = {
      id: 'a1',
      role: 'assistant',
      content: 'Hello',
      timestamp: 2,
      contentBlocks: [
        { type: 'text', content: 'Hello' },
        { type: 'tool_use', toolId: 't1' },
      ],
      toolCalls: [toolCall],
    };
    state.addMessage(active);
    state.activeMessageId = 'a1';

    const projection = new TabTranscriptProjection(state);
    const { container, dispose } = mount(projection);
    await flushPromises();

    // Baseline: three siblings mounted, the active turn shows its initial content.
    const activeBefore = container.querySelector('[data-message-id="a1"]') as HTMLElement;
    const sibling = container.querySelector('[data-message-id="m1"]') as HTMLElement;
    const siblingContent = sibling.querySelector('.specorator-message-content');
    expect(activeBefore).not.toBeNull();
    expect(sibling).not.toBeNull();
    expect(siblingContent).not.toBeNull();
    expect(activeBefore.textContent).toContain('Hello');
    expect(activeBefore.textContent).not.toContain('Hello world');

    // A stream chunk grows the SAME active message object in place — exactly like
    // the streaming engine (extend the text block, push a block, complete the
    // tool) — then emits. The projection refreshes ONLY the active message's
    // identity, so only its keyed MessageBubble re-patches.
    (active.contentBlocks![0] as { content: string }).content = 'Hello world';
    active.contentBlocks!.push({ type: 'text', content: 'Second block' });
    toolCall.status = 'completed';
    toolCall.result = 'file contents';
    projection.emit();
    await flushPromises();

    // The active turn's content re-rendered from the mutated block/tool state.
    const activeAfter = container.querySelector('[data-message-id="a1"]') as HTMLElement;
    expect(activeAfter.textContent).toContain('Hello world');
    expect(activeAfter.textContent).toContain('Second block');
    expect(container.querySelector('.specorator-tool-status.status-completed')).not.toBeNull();

    // The sibling was NOT re-rendered: its `.specorator-message` node (and its
    // inner content subtree) keep node identity across the emit — Vue skipped the
    // keyed patch because the projection left the sibling's object reference
    // untouched. This is the "one chunk touches one message" boundary.
    const siblingAfter = container.querySelector('[data-message-id="m1"]');
    expect(siblingAfter).toBe(sibling);
    expect(siblingAfter!.querySelector('.specorator-message-content')).toBe(siblingContent);
    expect(siblingAfter!.textContent).toContain('message 1');
    expect(siblingAfter!.textContent).not.toContain('Hello world');

    dispose();
  }, 30_000);
});
