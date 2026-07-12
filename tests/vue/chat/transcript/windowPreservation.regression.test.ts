import '@/providers';

import { flushPromises } from '@vue/test-utils';
import { App, Component, MarkdownRenderer } from 'obsidian';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

import type { ChatMessage } from '@/core/types';
import { ChatState } from '@/features/chat/state/ChatState';
import { TabTranscriptProjection } from '@/features/chat/tabs/tabTranscript';
import { mountTranscript } from '@/features/chat/ui/vue/transcript/mountTranscript';
import type { TranscriptCallbacks } from '@/features/chat/ui/vue/transcript/transcriptCallbacks';
import { RENDER_WINDOW_SIZE } from '@/features/chat/ui/vue/transcript/windowedRenderSetup';
import type SpecoratorPlugin from '@/main';

/**
 * Regression coverage for the render-window reset the cutover introduced: the
 * projection replaces `store.messages` with a FRESH array on every emit (the
 * ChatState getter copies), so the window watch fires on every streaming chunk.
 * Resetting to the trailing window there hid the older messages a user just
 * revealed with "Load earlier". These drive the REAL `mountTranscript` →
 * `TranscriptRoot` windowing path.
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

function userMessage(prefix: string, i: number): ChatMessage {
  return { id: `${prefix}${i}`, role: 'user', content: `message ${prefix}${i}`, timestamp: i };
}

async function clickLoadEarlier(container: HTMLElement): Promise<void> {
  const btn = container.querySelector<HTMLButtonElement>('.specorator-load-earlier-btn');
  expect(btn).not.toBeNull();
  btn!.click();
  await flushPromises();
}

beforeEach(() => {
  vi.clearAllMocks();
  renderMock.mockReset();
  renderMock.mockImplementation(async (md: string, el: HTMLElement) => {
    el.createDiv({ cls: 'rendered-md', text: md });
  });
});

describe('transcript render-window preservation during streaming', () => {
  it('keeps a loaded-earlier window when a streaming chunk emits a fresh messages array', async () => {
    // 170 messages ⇒ trailing window starts at index 90, so m10 is hidden until
    // "Load earlier" grows the window one chunk (90 → 10).
    const total = 2 * RENDER_WINDOW_SIZE + 10; // 170
    const state = new ChatState();
    for (let i = 0; i < total - 1; i++) state.addMessage(userMessage('m', i));
    const active: ChatMessage = {
      id: 'a1',
      role: 'assistant',
      content: 'Hello',
      timestamp: total,
      contentBlocks: [{ type: 'text', content: 'Hello' }],
      toolCalls: [],
    };
    state.addMessage(active);
    state.activeMessageId = 'a1';

    const projection = new TabTranscriptProjection(state);
    const { container, dispose } = mount(projection);
    await flushPromises();

    // Baseline trailing window: m10 hidden, a later message mounted.
    expect(container.querySelector('[data-message-id="m10"]')).toBeNull();
    expect(container.querySelector('[data-message-id="m100"]')).not.toBeNull();

    // Reveal the earlier chunk.
    await clickLoadEarlier(container);
    expect(container.querySelector('[data-message-id="m10"]')).not.toBeNull();

    // A streaming chunk grows the SAME active message in place, then emits — which
    // hands `store.messages` a fresh array and fires the window watch. The
    // loaded-earlier window must survive: m10 stays mounted.
    (active.contentBlocks![0] as { content: string }).content = 'Hello world';
    projection.emit();
    await flushPromises();

    expect(container.querySelector('[data-message-id="a1"]')?.textContent).toContain('Hello world');
    expect(container.querySelector('[data-message-id="m10"]')).not.toBeNull();

    dispose();
  }, 30_000);

  it('resets to the trailing window when a different conversation is loaded', async () => {
    const total = 2 * RENDER_WINDOW_SIZE + 10; // 170
    const state = new ChatState();
    for (let i = 0; i < total; i++) state.addMessage(userMessage('m', i));

    const projection = new TabTranscriptProjection(state);
    const { container, dispose } = mount(projection);
    await flushPromises();

    // Grow the window so an early message is mounted.
    await clickLoadEarlier(container);
    expect(container.querySelector('[data-message-id="m10"]')).not.toBeNull();

    // Switch to a DIFFERENT conversation (new first-id). The window must reset to
    // the trailing region: the new conversation's early messages are hidden again.
    const nextTotal = RENDER_WINDOW_SIZE + 40; // 120
    state.clearMessages();
    for (let i = 0; i < nextTotal; i++) state.addMessage(userMessage('n', i));
    projection.emit();
    await flushPromises();

    // Old conversation gone; new conversation windowed to its trailing region
    // (start = 120 − 80 = 40), so n10 is hidden but a late message is mounted.
    expect(container.querySelector('[data-message-id="m10"]')).toBeNull();
    expect(container.querySelector('[data-message-id="n10"]')).toBeNull();
    expect(container.querySelector('[data-message-id="n110"]')).not.toBeNull();

    dispose();
  }, 30_000);
});
