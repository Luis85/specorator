import '@/providers';

import { flushPromises } from '@vue/test-utils';
import { App, Component, MarkdownRenderer } from 'obsidian';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

import type { ChatMessage } from '@/core/types';
import { ConversationController, type ConversationControllerDeps } from '@/features/chat/controllers/ConversationController';
import { ChatState } from '@/features/chat/state/ChatState';
import { TabTranscriptProjection } from '@/features/chat/tabs/tabTranscript';
import { mountTranscript } from '@/features/chat/ui/vue/transcript/mountTranscript';
import type { TranscriptCallbacks } from '@/features/chat/ui/vue/transcript/transcriptCallbacks';
import type SpecoratorPlugin from '@/main';

/**
 * Full-stack regression: real ConversationController.switchTo (Phase A + B)
 * wired through production TabTranscriptProjection + mountTranscript, matching
 * initializeTabControllers. Guards the "brief spinner then empty transcript"
 * defect when history selection hydrates in the background.
 */
const renderMock = MarkdownRenderer.renderMarkdown as unknown as Mock;

function historicalMessages(count: number): ChatMessage[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `h${i}`,
    role: 'assistant' as const,
    content: `historical message ${i}`,
    timestamp: i,
  }));
}

function makePlugin(switchConversation: ConversationControllerDeps['plugin']['switchConversation']): SpecoratorPlugin {
  return {
    app: new App(),
    settings: { mediaFolder: '', enableAutoScroll: true, userName: '' },
    switchConversation,
    getConversationSync: vi.fn(),
    getConversationList: vi.fn(() => []),
    updateConversation: vi.fn().mockResolvedValue(undefined),
    createConversation: vi.fn(),
  } as unknown as SpecoratorPlugin;
}

function wireTabLikeProduction(state: ChatState, projection: TabTranscriptProjection): void {
  state.callbacks = {
    ...state.callbacks,
    onMessagesChanged: () => projection.emit(),
  };
}

function makeTranscriptCallbacks(projection: TabTranscriptProjection): TranscriptCallbacks {
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

function makeControllerDeps(
  plugin: SpecoratorPlugin,
  state: ChatState,
  projection: TabTranscriptProjection,
): ConversationControllerDeps {
  const inputEl = { value: '', focus: vi.fn() } as unknown as HTMLTextAreaElement;
  return {
    plugin,
    state,
    subagentManager: { orphanAllActive: vi.fn(), clear: vi.fn() } as unknown as ConversationControllerDeps['subagentManager'],
    setTranscriptGreeting: (greeting) => projection.setGreeting(greeting),
    setTranscriptLoading: (loadingText) => projection.setLoadingText(loadingText),
    setTranscriptHydrationError: (error) => projection.setHydrationError(error),
    emitTranscript: () => projection.emit(),
    getMessagesEl: () => document.createElement('div'),
    getInputEl: () => inputEl,
    getFileContextManager: () => null,
    getImageContextManager: () => null,
    getMcpServerSelector: () => null,
    getExternalContextSelector: () => null,
    clearQueuedMessage: vi.fn(),
    clearRetryableTurn: vi.fn(),
    getAgentService: () => null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  renderMock.mockReset();
  renderMock.mockImplementation(async (md: string, el: HTMLElement) => {
    el.createDiv({ cls: 'rendered-md', text: md });
  });
});

describe('switchTo history (ConversationController + mountTranscript)', () => {
  it('renders historical messages after switchTo completes background hydration', async () => {
    const state = new ChatState();
    state.currentConversationId = 'conv-current';
    state.messages = historicalMessages(2);

    const projection = new TabTranscriptProjection(state);
    wireTabLikeProduction(state, projection);

    const switchConversation = vi.fn().mockResolvedValue({
      id: 'conv-history',
      title: 'History Conversation',
      messages: historicalMessages(4),
      sessionId: 'session-1',
      createdAt: 1,
      updatedAt: 1,
    });
    const plugin = makePlugin(switchConversation);
    const controller = new ConversationController(makeControllerDeps(plugin, state, projection));

    const container = document.createElement('div');
    document.body.appendChild(container);
    const mounted = mountTranscript(
      container,
      plugin,
      new Component(),
      makeTranscriptCallbacks(projection),
    );
    await flushPromises();
    expect(container.querySelectorAll('.specorator-message')).toHaveLength(2);

    await controller.switchTo('conv-history');
    await controller.whenHydrated();
    await flushPromises();

    expect(switchConversation).toHaveBeenCalledWith(
      'conv-history',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(state.messages).toHaveLength(4);
    expect(container.querySelector('.specorator-loading--overlay')).toBeNull();
    expect(container.querySelectorAll('.specorator-message')).toHaveLength(4);
    expect(container.textContent).toContain('historical message 3');

    mounted.unmount();
    container.remove();
  });

  it('re-hydrates when the tab is already bound but the transcript is empty', async () => {
    const state = new ChatState();
    state.currentConversationId = 'conv-stuck';
    state.messages = [];
    state.isHydrating = true;

    const projection = new TabTranscriptProjection(state);
    wireTabLikeProduction(state, projection);

    const switchConversation = vi.fn().mockResolvedValue({
      id: 'conv-stuck',
      title: 'Stuck Conversation',
      messages: historicalMessages(3),
      sessionId: 'session-1',
      createdAt: 1,
      updatedAt: 1,
    });
    const plugin = makePlugin(switchConversation);
    const controller = new ConversationController(makeControllerDeps(plugin, state, projection));

    const container = document.createElement('div');
    document.body.appendChild(container);
    const mounted = mountTranscript(
      container,
      plugin,
      new Component(),
      makeTranscriptCallbacks(projection),
    );
    await flushPromises();

    await controller.switchTo('conv-stuck');
    await controller.whenHydrated();
    await flushPromises();

    expect(state.messages).toHaveLength(3);
    expect(container.querySelectorAll('.specorator-message')).toHaveLength(3);

    mounted.unmount();
    container.remove();
  });

  it('still renders when provider bind fails after hydration', async () => {
    const state = new ChatState();
    state.currentConversationId = 'conv-current';
    state.messages = historicalMessages(1);

    const projection = new TabTranscriptProjection(state);
    wireTabLikeProduction(state, projection);

    const switchConversation = vi.fn().mockResolvedValue({
      id: 'conv-history',
      title: 'History Conversation',
      messages: historicalMessages(3),
      sessionId: 'session-1',
      createdAt: 1,
      updatedAt: 1,
    });
    const plugin = makePlugin(switchConversation);
    const ensureServiceForConversation = vi
      .fn()
      .mockRejectedValue(new Error('provider bind failed'));
    const controller = new ConversationController({
      ...makeControllerDeps(plugin, state, projection),
      ensureServiceForConversation,
    });

    const container = document.createElement('div');
    document.body.appendChild(container);
    const mounted = mountTranscript(
      container,
      plugin,
      new Component(),
      makeTranscriptCallbacks(projection),
    );
    await flushPromises();

    await controller.switchTo('conv-history');
    await controller.whenHydrated();
    await flushPromises();

    expect(container.querySelectorAll('.specorator-message')).toHaveLength(3);

    mounted.unmount();
    container.remove();
  });
});
