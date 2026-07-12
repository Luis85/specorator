import '@/providers';

import { flushPromises } from '@vue/test-utils';
import { App, Component, MarkdownRenderer } from 'obsidian';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

import type { ChatMessage } from '@/core/types';
import { STREAMING_RESPONSE_LABEL } from '@/features/chat/constants';
import { TextRenderCoordinator } from '@/features/chat/controllers/TextRenderCoordinator';
import { ChatState } from '@/features/chat/state/ChatState';
import { TabTranscriptProjection } from '@/features/chat/tabs/tabTranscript';
import { mountTranscript } from '@/features/chat/ui/vue/transcript/mountTranscript';
import type { TranscriptCallbacks } from '@/features/chat/ui/vue/transcript/transcriptCallbacks';
import type SpecoratorPlugin from '@/main';

/**
 * Regression coverage for the collapsed-streaming cutover follow-on: with
 * `collapseStreamingResponse` ON (the DEFAULT), the transcript must NOT render
 * the partial assistant text live — only the "Writing response…" placeholder —
 * and the full response must appear once on finalize. The cutover left
 * `TextRenderCoordinator.append` growing the reactive block on every chunk,
 * defeating the setting. These drive the REAL `TextRenderCoordinator` →
 * `TabTranscriptProjection` → `mountTranscript` → `TranscriptRoot` path.
 */
const renderMock = MarkdownRenderer.renderMarkdown as unknown as Mock;

function makePlugin(): SpecoratorPlugin {
  return { app: new App(), settings: { mediaFolder: '' } } as unknown as SpecoratorPlugin;
}

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

function mount(projection: TabTranscriptProjection) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const mounted = mountTranscript(container, makePlugin(), new Component(), makeCallbacks(projection));
  return { container, mounted, dispose: () => { mounted.unmount(); container.remove(); } };
}

/**
 * The real `TextRenderCoordinator` with its `showWriting`/`hideThinkingIndicator`
 * wired exactly like `StreamController` does — `showWriting` flips the streaming
 * indicator into `'writing'` mode (the placeholder the Vue transcript renders).
 */
function makeCoordinator(state: ChatState, collapse: boolean): TextRenderCoordinator {
  return new TextRenderCoordinator({
    state,
    showWriting: () => { state.streamingIndicatorMode = 'writing'; },
    hideThinkingIndicator: () => { state.streamingIndicatorMode = null; },
    shouldCollapseStreamingResponse: () => collapse,
  });
}

function startStreamingTurn(): { state: ChatState; msg: ChatMessage } {
  const state = new ChatState();
  const msg: ChatMessage = {
    id: 'a1',
    role: 'assistant',
    content: '',
    timestamp: 0,
    contentBlocks: [],
    toolCalls: [],
  };
  state.addMessage(msg);
  state.activeMessageId = 'a1';
  state.responseStartTime = performance.now();
  // The engine keeps `currentContentEl` non-null while a turn streams; the
  // coordinator gates its append on it.
  state.currentContentEl = document.createElement('div');
  return { state, msg };
}

beforeEach(() => {
  vi.clearAllMocks();
  renderMock.mockReset();
  renderMock.mockImplementation(async (md: string, el: HTMLElement) => {
    el.createDiv({ cls: 'rendered-md', text: md });
  });
});

describe('collapsed streaming response', () => {
  it('collapse ON: withholds partial text (placeholder only) until finalize renders it one-shot', async () => {
    const { state, msg } = startStreamingTurn();
    const projection = new TabTranscriptProjection(state);
    const { container, dispose } = mount(projection);
    await flushPromises();

    const coordinator = makeCoordinator(state, true);

    await coordinator.append('Hello ', msg);
    projection.emit();
    await flushPromises();
    await coordinator.append('world', msg);
    projection.emit();
    await flushPromises();

    // The partial text is WITHHELD: the open reactive block stays empty and the
    // transcript renders none of it — only the "Writing response…" placeholder.
    const block = msg.contentBlocks![state.activeBlockIndex] as { type: string; content: string };
    expect(block.content).toBe('');
    expect(container.textContent).not.toContain('Hello world');
    expect(state.getActiveStreamSnapshot()?.isWriting).toBe(true);
    const placeholder = container.querySelector('.specorator-thinking-flavor');
    expect(placeholder?.textContent).toBe(STREAMING_RESPONSE_LABEL);

    // Finalize flushes the full accumulated text into the block, one-shot, and
    // drops the placeholder — the full response renders on completion.
    await coordinator.finalize(msg);
    state.activeMessageId = null; // turn ended
    projection.emit();
    await flushPromises();

    expect(msg.contentBlocks).toContainEqual({ type: 'text', content: 'Hello world' });
    expect(container.textContent).toContain('Hello world');

    dispose();
  });

  it('collapse ON: a never-filled block is still dropped on finalize', async () => {
    const { state, msg } = startStreamingTurn();
    const projection = new TabTranscriptProjection(state);
    const { dispose } = mount(projection);
    await flushPromises();

    const coordinator = makeCoordinator(state, true);
    await coordinator.append('', msg);
    await coordinator.finalize(msg);

    expect(msg.contentBlocks).toEqual([]);

    dispose();
  });

  it('collapse OFF: grows the reactive block live per chunk (unchanged behavior)', async () => {
    const { state, msg } = startStreamingTurn();
    const projection = new TabTranscriptProjection(state);
    const { container, dispose } = mount(projection);
    await flushPromises();

    const coordinator = makeCoordinator(state, false);

    await coordinator.append('Hello ', msg);
    projection.emit();
    await flushPromises();

    // Non-collapse: the partial text is visible per chunk.
    const block = msg.contentBlocks![state.activeBlockIndex] as { type: string; content: string };
    expect(block.content).toBe('Hello ');
    expect(container.textContent).toContain('Hello ');

    await coordinator.append('world', msg);
    projection.emit();
    await flushPromises();
    expect(container.textContent).toContain('Hello world');

    await coordinator.finalize(msg);
    state.activeMessageId = null;
    projection.emit();
    await flushPromises();

    expect(msg.contentBlocks).toContainEqual({ type: 'text', content: 'Hello world' });

    dispose();
  });
});
