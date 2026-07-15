import '@/providers';

import { flushPromises } from '@vue/test-utils';
import { App, Component, MarkdownRenderer } from 'obsidian';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

import type { ChatMessage } from '@/core/types';
import { ChatState } from '@/features/chat/state/ChatState';
import { TabTranscriptProjection } from '@/features/chat/tabs/tabTranscript';
import { mountTranscript } from '@/features/chat/ui/vue/transcript/mountTranscript';
import type { TranscriptCallbacks } from '@/features/chat/ui/vue/transcript/transcriptCallbacks';
import type SpecoratorPlugin from '@/main';

/**
 * Production-path regression: mountTranscript + TabTranscriptProjection wired
 * through ChatState.onMessagesChanged (mirrors initializeTabControllers) and
 * the two-phase switchTo sequence. Guards against subscribe-timing races where
 * Phase B completes before the transcript island registers its observer.
 */
const renderMock = MarkdownRenderer.renderMarkdown as unknown as Mock;

function assistantMessages(count: number): ChatMessage[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `h${i}`,
    role: 'assistant' as const,
    content: `historical message ${i}`,
    timestamp: i,
  }));
}

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
      providerId: 'claude' as const,
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

function wireProductionProjection(state: ChatState, projection: TabTranscriptProjection): void {
  state.callbacks = {
    ...state.callbacks,
    onMessagesChanged: () => projection.emit(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  renderMock.mockReset();
  renderMock.mockImplementation(async (md: string, el: HTMLElement) => {
    el.createDiv({ cls: 'rendered-md', text: md });
  });
});

describe('switchTo history (mountTranscript production path)', () => {
  it('renders historical messages after switchTo phases when wired like a real tab', async () => {
    const state = new ChatState();
    state.messages = assistantMessages(2);
    const projection = new TabTranscriptProjection(state);
    wireProductionProjection(state, projection);

    const container = document.createElement('div');
    document.body.appendChild(container);
    const mounted = mountTranscript(
      container,
      makePlugin(),
      new Component(),
      makeCallbacks(projection),
    );
    await flushPromises();
    expect(container.querySelectorAll('.specorator-message')).toHaveLength(2);

    // Phase A — bind, clear transcript, show hydration overlay.
    state.messages = [];
    projection.setLoadingText('Loading conversation…');
    await flushPromises();
    expect(container.querySelector('.specorator-loading--overlay')).not.toBeNull();
    expect(container.querySelectorAll('.specorator-message')).toHaveLength(0);

    // Phase B — restoreConversation: assign transcript + clear spinner + emit.
    state.messages = assistantMessages(4);
    projection.setLoadingText(null);
    projection.emit();
    await flushPromises();

    expect(container.querySelector('.specorator-loading--overlay')).toBeNull();
    expect(container.querySelectorAll('.specorator-message')).toHaveLength(4);
    expect(container.textContent).toContain('historical message 3');

    mounted.unmount();
    container.remove();
  });
});
