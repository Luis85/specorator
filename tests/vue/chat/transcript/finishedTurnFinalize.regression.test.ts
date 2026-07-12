import '@/providers';

import { flushPromises } from '@vue/test-utils';
import { App, Component, MarkdownRenderer } from 'obsidian';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

import type { ChatMessage } from '@/core/types';
import { TextRenderCoordinator } from '@/features/chat/controllers/TextRenderCoordinator';
import { ChatState } from '@/features/chat/state/ChatState';
import { TabTranscriptProjection } from '@/features/chat/tabs/tabTranscript';
import { mountTranscript } from '@/features/chat/ui/vue/transcript/mountTranscript';
import type { TranscriptCallbacks } from '@/features/chat/ui/vue/transcript/transcriptCallbacks';
import type SpecoratorPlugin from '@/main';

/**
 * Regression coverage for the finished-turn identity-refresh bug (PR #486 Codex
 * review): `InputController.completeFinishedTurn` clears `activeMessageId` and
 * THEN finalizes the text block, which flushes the interrupted marker / a
 * collapsed response's withheld body into the SAME `ChatMessage` object in place.
 * The projection only identity-refreshes the active/dirty message, so once the
 * store already holds that object identity, a plain re-emit reuses it and the
 * keyed `MessageBubble` skips the patch — the finalized text stays hidden until
 * a transcript reload. The fix marks the message dirty
 * (`TabTranscriptProjection.refreshMessage`) after finalize. These drive the REAL
 * `mountTranscript` → `TranscriptRoot` → `MessageBubble`/`BlockList` path.
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
  } as unknown as TranscriptCallbacks;
}

function mount(projection: TabTranscriptProjection) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const mounted = mountTranscript(container, makePlugin(), new Component(), makeCallbacks(projection));
  return { container, dispose: () => { mounted.unmount(); container.remove(); } };
}

beforeEach(() => {
  vi.clearAllMocks();
  renderMock.mockReset();
  renderMock.mockImplementation(async (md: string, el: HTMLElement) => {
    el.createDiv({ cls: 'rendered-md', text: md });
  });
});

describe('finished-turn finalize identity refresh', () => {
  it('interrupt: renders a marker appended + finalized in place AFTER activeMessageId is cleared', async () => {
    const state = new ChatState();
    const msg: ChatMessage = {
      id: 'a1',
      role: 'assistant',
      content: 'partial answer',
      timestamp: 0,
      contentBlocks: [{ type: 'text', content: 'partial answer' }],
      toolCalls: [],
    };
    state.addMessage(msg);
    state.activeMessageId = 'a1';

    const projection = new TabTranscriptProjection(state);
    const { container, dispose } = mount(projection);
    await flushPromises();
    expect(container.textContent).toContain('partial answer');

    // Replicate `completeFinishedTurn`: the pointer is dropped, then an emit lands
    // with the plain (non-refreshed) message identity now in the store...
    state.activeMessageId = null;
    projection.emit();
    await flushPromises();

    // ...then finalize mutates the SAME object in place (the interrupted marker).
    (msg.contentBlocks![0] as { content: string }).content = 'partial answer — Interrupted';

    // The fix marks it dirty so the next snapshot hands it a fresh identity.
    projection.refreshMessage(msg.id);
    await flushPromises();

    expect(container.textContent).toContain('Interrupted');
    dispose();
  });

  it('collapse: renders the withheld body flushed on finalize after activeMessageId is cleared', async () => {
    const state = new ChatState();
    const msg: ChatMessage = { id: 'a1', role: 'assistant', content: '', timestamp: 0, contentBlocks: [], toolCalls: [] };
    state.addMessage(msg);
    state.activeMessageId = 'a1';
    state.currentContentEl = document.createElement('div');

    const projection = new TabTranscriptProjection(state);
    const { container, dispose } = mount(projection);
    await flushPromises();

    // Collapse mode: withhold the streamed text (only the placeholder shows).
    const coordinator = new TextRenderCoordinator({
      state,
      showWriting: () => { state.streamingIndicatorMode = 'writing'; },
      hideThinkingIndicator: () => { state.streamingIndicatorMode = null; },
      shouldCollapseStreamingResponse: () => true,
      shouldDeferMathRendering: () => false,
    });
    await coordinator.append('Collapsed body', msg);
    projection.emit();
    await flushPromises();
    expect(container.textContent).not.toContain('Collapsed body');

    // `completeFinishedTurn` clears the pointer, an emit lands with the plain
    // identity, then finalize flushes the withheld body into the block in place.
    state.currentContentEl = null;
    state.activeMessageId = null;
    projection.emit();
    await flushPromises();
    await coordinator.finalize(msg);

    // The fix's dirty-mark carries the flushed body to a fresh identity.
    projection.refreshMessage(msg.id);
    await flushPromises();

    expect(container.textContent).toContain('Collapsed body');
    dispose();
  });

  it('documents the bug: a plain re-emit alone leaves the in-place finalize hidden', async () => {
    const state = new ChatState();
    const msg: ChatMessage = {
      id: 'a1',
      role: 'assistant',
      content: 'partial answer',
      timestamp: 0,
      contentBlocks: [{ type: 'text', content: 'partial answer' }],
      toolCalls: [],
    };
    state.addMessage(msg);
    state.activeMessageId = 'a1';

    const projection = new TabTranscriptProjection(state);
    const { container, dispose } = mount(projection);
    await flushPromises();

    // Pointer cleared, plain identity seeded into the store.
    state.activeMessageId = null;
    projection.emit();
    await flushPromises();

    // In-place finalize mutation, then a PLAIN emit (no dirty-mark): the keyed
    // MessageBubble reuses the same object identity and skips the patch.
    (msg.contentBlocks![0] as { content: string }).content = 'partial answer — Interrupted';
    projection.emit();
    await flushPromises();

    expect(container.textContent).not.toContain('Interrupted');
    dispose();
  });
});
