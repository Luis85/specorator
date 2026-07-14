import '@/providers';

import { render } from '@testing-library/vue';
import { flushPromises } from '@vue/test-utils';
import { App, Component, MarkdownRenderer } from 'obsidian';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

import type { ChatMessage } from '@/core/types';
import type { ChatState } from '@/features/chat/state/ChatState';
import type { ActiveStreamState } from '@/features/chat/state/types';
import { TabTranscriptProjection } from '@/features/chat/tabs/tabTranscript';
import type { TranscriptCallbacks } from '@/features/chat/ui/vue/transcript/transcriptCallbacks';
import {
  APP_KEY,
  CALLBACKS_KEY,
  COMPONENT_KEY,
  PLUGIN_KEY,
  SCROLL_HOST_KEY,
} from '@/features/chat/ui/vue/transcript/transcriptKeys';
import TranscriptRoot from '@/features/chat/ui/vue/transcript/TranscriptRoot.vue';
import type SpecoratorPlugin from '@/main';

/**
 * End-to-end regression for "chats from history do not load": drives the REAL
 * `TabTranscriptProjection` through the exact two-phase `switchTo` sequence a
 * history-item click produces —
 *   Phase A: `state.messages = []` (emit) + `setLoadingText('Loading…')`
 *   Phase B: `state.messages = [...N]` (emit) + `setLoadingText(null)`
 * — into a mounted `TranscriptRoot`, and asserts the historical messages
 * actually render once the spinner clears. Covers the projection → store →
 * window-reset → MessageList links the unit tests exercise only in isolation.
 */
const renderMock = MarkdownRenderer.renderMarkdown as unknown as Mock;

/** Minimal `ChatState` stand-in exposing only what the projection reads. */
class FakeChatState {
  private _messages: ChatMessage[] = [];
  activeMessageId: string | null = null;
  private _stream: ActiveStreamState | null = null;

  get messages(): ChatMessage[] {
    return [...this._messages]; // copying getter, like the real ChatState
  }
  set messages(next: ChatMessage[]) {
    this._messages = next;
  }
  getActiveStreamSnapshot(): ActiveStreamState | null {
    return this._stream;
  }
}

function assistantMessages(count: number): ChatMessage[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `h${i}`,
    role: 'assistant' as const,
    content: `historical message ${i}`,
    timestamp: i,
  }));
}

function makeCallbacks(subscribe: TranscriptCallbacks['subscribe']): TranscriptCallbacks {
  return {
    subscribe,
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

function mountRoot(callbacks: TranscriptCallbacks) {
  const plugin = { settings: { mediaFolder: '' } } as unknown as SpecoratorPlugin;
  return render(TranscriptRoot, {
    global: {
      provide: {
        [APP_KEY as symbol]: new App(),
        [COMPONENT_KEY as symbol]: new Component(),
        [PLUGIN_KEY as symbol]: plugin,
        [CALLBACKS_KEY as symbol]: callbacks,
        [SCROLL_HOST_KEY as symbol]: vi.fn(),
      },
    },
  });
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  renderMock.mockReset();
  renderMock.mockImplementation(async (md: string, el: HTMLElement) => {
    el.createDiv({ cls: 'rendered-md', text: md });
  });
});

describe('switchTo history (projection → transcript)', () => {
  it('renders historical messages after the two-phase switch clears the spinner', async () => {
    const state = new FakeChatState();
    // The tab was previously showing another conversation's messages.
    state.messages = assistantMessages(3);
    const projection = new TabTranscriptProjection(state as unknown as ChatState);

    const { container } = mountRoot(makeCallbacks(projection.subscribe));
    await flushPromises();
    expect(container.querySelectorAll('.specorator-message')).toHaveLength(3);

    // Phase A — instant swap: clear the list and raise the hydration spinner.
    state.messages = [];
    projection.emit();
    projection.setLoadingText('Loading…');
    await flushPromises();
    expect(container.querySelector('.specorator-loading--overlay')).not.toBeNull();
    expect(container.querySelector('.specorator-message')).toBeNull();

    // Phase B — restoreConversation: assign the loaded transcript, then clear
    // the spinner. The messages must render.
    state.messages = assistantMessages(5);
    projection.emit();
    projection.setLoadingText(null);
    await flushPromises();

    expect(container.querySelector('.specorator-loading--overlay')).toBeNull();
    expect(container.querySelectorAll('.specorator-message')).toHaveLength(5);
    expect(container.textContent).toContain('historical message 4');
  });
});
