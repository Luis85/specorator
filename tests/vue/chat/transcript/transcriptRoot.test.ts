import '@/providers';

import { render } from '@testing-library/vue';
import { flushPromises } from '@vue/test-utils';
import { App, Component, MarkdownRenderer } from 'obsidian';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

import type { ChatMessage } from '@/core/types';
import { useTranscriptStore } from '@/features/chat/ui/vue/transcript/stores/transcriptStore';
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
 * Parity twin of `windowing.characterization.test.ts`: reproduces
 * `MessageRenderer.renderMessages`'s windowed-render orchestration
 * (welcome + load-earlier control + trailing window) plus
 * `loadEarlierMessages`' scroll-anchor preservation, as `TranscriptRoot.vue`
 * over the reactive `transcriptStore`. Also proves the `SCROLL_HOST_KEY`
 * handoff (mirrors `tabContentHost.test.ts`'s `CONTENT_HOST_KEY` proof).
 */
const renderMock = MarkdownRenderer.renderMarkdown as unknown as Mock;

function makeCallbacks(overrides: Partial<TranscriptCallbacks> = {}): TranscriptCallbacks {
  return {
    subscribe: vi.fn(() => () => {}),
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
    ...overrides,
  };
}

function userMessages(count: number): ChatMessage[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `m${i}`,
    role: 'user',
    content: `message ${i}`,
    timestamp: i,
  }));
}

function mountRoot(callbacks: TranscriptCallbacks, mountScrollHost = vi.fn()) {
  const plugin = { settings: { mediaFolder: '' } } as unknown as SpecoratorPlugin;
  return {
    mountScrollHost,
    ...render(TranscriptRoot, {
      global: {
        provide: {
          [APP_KEY as symbol]: new App(),
          [COMPONENT_KEY as symbol]: new Component(),
          [PLUGIN_KEY as symbol]: plugin,
          [CALLBACKS_KEY as symbol]: callbacks,
          [SCROLL_HOST_KEY as symbol]: mountScrollHost,
        },
      },
    }),
  };
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  renderMock.mockReset();
  renderMock.mockImplementation(async (md: string, el: HTMLElement) => {
    el.createDiv({ cls: 'rendered-md', text: md });
  });
});

describe('TranscriptRoot', () => {
  it('calls the SCROLL_HOST_KEY callback once with its .specorator-messages scroll element on mount', async () => {
    const store = useTranscriptStore();
    store.setMessages(userMessages(3));
    const mountScrollHost = vi.fn();

    const { container } = mountRoot(makeCallbacks(), mountScrollHost);
    await flushPromises();

    expect(mountScrollHost).toHaveBeenCalledTimes(1);
    const el = mountScrollHost.mock.calls[0][0] as HTMLElement;
    expect(el).toBe(container.querySelector('.specorator-messages'));
  });

  it('subscribes via the callbacks seam on mount (routes engine snapshots into the store)', async () => {
    const callbacks = makeCallbacks();
    mountRoot(callbacks);
    await flushPromises();

    expect(callbacks.subscribe).toHaveBeenCalledTimes(1);
  });

  it('renders welcome + no load-earlier control under the window cap, and mounts every message', async () => {
    const store = useTranscriptStore();
    store.setGreeting('Good morning');
    store.setMessages(userMessages(5));

    const { container } = mountRoot(makeCallbacks());
    await flushPromises();

    expect(container.querySelector('.specorator-welcome-greeting')?.textContent?.trim()).toBe('Good morning');
    expect(container.querySelector('.specorator-load-earlier')).toBeNull();
    expect(container.querySelectorAll('.specorator-message')).toHaveLength(5);
  });

  it('shows the load-earlier control and windows to the trailing 80 for 81 stored messages', async () => {
    const store = useTranscriptStore();
    store.setMessages(userMessages(81));

    const { container } = mountRoot(makeCallbacks());
    await flushPromises();

    expect(container.querySelector('.specorator-load-earlier')).not.toBeNull();
    expect(container.querySelectorAll('.specorator-message')).toHaveLength(80);
  });

  it('loadEarlier grows the window by RENDER_WINDOW_SIZE, hides the control at 0, and preserves the scroll anchor', async () => {
    const store = useTranscriptStore();
    store.setMessages(userMessages(81));

    const { container } = mountRoot(makeCallbacks());
    await flushPromises();

    const scrollEl = container.querySelector('.specorator-messages') as HTMLElement;
    let scrollHeightReads = 0;
    Object.defineProperty(scrollEl, 'scrollHeight', {
      configurable: true,
      get: () => (scrollHeightReads++ === 0 ? 4000 : 4300),
    });
    Object.defineProperty(scrollEl, 'scrollTop', { configurable: true, value: 300, writable: true });

    (container.querySelector('.specorator-load-earlier-btn') as HTMLElement).click();
    await flushPromises();

    expect(container.querySelectorAll('.specorator-message')).toHaveLength(81);
    expect(container.querySelector('.specorator-load-earlier')).toBeNull();
    expect(scrollEl.scrollTop).toBe(600);
  });

  it('resets the render window when store.messages identity changes (new conversation/reload)', async () => {
    const store = useTranscriptStore();
    store.setMessages(userMessages(81));

    const { container } = mountRoot(makeCallbacks());
    await flushPromises();
    expect(container.querySelector('.specorator-load-earlier')).not.toBeNull();

    // A fresh conversation load replaces the array with a short one — the
    // window resets to 0 (fits entirely), not to a stale offset.
    store.setMessages(userMessages(4));
    await flushPromises();

    expect(container.querySelector('.specorator-load-earlier')).toBeNull();
    expect(container.querySelectorAll('.specorator-message')).toHaveLength(4);
  });

  it('renders the loading state instead of welcome/messages when loadingText is set', async () => {
    const store = useTranscriptStore();
    store.setMessages(userMessages(5));
    store.setLoadingText('Loading conversation…');

    const { container } = mountRoot(makeCallbacks());
    await flushPromises();

    const loader = container.querySelector('.specorator-loading');
    expect(loader).not.toBeNull();
    expect(loader!.querySelector('.specorator-loading-text')?.textContent).toBe('Loading conversation…');
    expect(container.querySelector('.specorator-welcome')).toBeNull();
    expect(container.querySelector('.specorator-message')).toBeNull();
  });

  it('renders the hydration-error banner from the store via WelcomeBanner', async () => {
    const store = useTranscriptStore();
    store.setMessages(userMessages(1));
    store.setHydrationError({ code: 'store-unreadable', message: 'History unavailable' });

    const { container } = mountRoot(makeCallbacks());
    await flushPromises();

    const banner = container.querySelector('.specorator-hydration-error') as HTMLElement;
    expect(banner.dataset.errorCode).toBe('store-unreadable');
  });

  it('leaves the Task 12 streaming-indicator slot as a marker comment after MessageList', async () => {
    const store = useTranscriptStore();
    store.setMessages(userMessages(1));

    const { container } = mountRoot(makeCallbacks());
    await flushPromises();

    expect(container.innerHTML).toContain('StreamingIndicator mounts here in Task 12');
  });
});
