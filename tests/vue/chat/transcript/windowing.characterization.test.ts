import '@/providers';

import { App } from 'obsidian';
import { describe, expect, it, vi } from 'vitest';

import type { ChatMessage, ChatMessageAction } from '@/core/types';
import { MessageRenderer } from '@/features/chat/rendering/MessageRenderer';

/**
 * Characterization test: locks the legacy `MessageRenderer` windowing +
 * loading + hydration-banner DOM contract so `MessageList.vue` /
 * `WelcomeBanner.vue` / `LoadEarlierControl.vue` / `TranscriptRoot.vue` can
 * reproduce it exactly. Companion to `MessageRenderer.windowing.test.ts`
 * (Jest lane) — this copy lives in the Vue lane (real DOM + the
 * `obsidianDom` prototype polyfill, matching `messageBubble.characterization.test.ts`)
 * as the reference the parity tests in this directory are checked against.
 * Real elements are used rather than the shared `createMockEl` jest-lane
 * helper: under Vitest's jsdom environment, `createMockEl`'s internal
 * `ownerDocument.createElement` falls through to the REAL `document`, so
 * `loadEarlierMessages`' detached staging element ends up a genuine DOM node
 * spliced into a mock-element tree — an unsupported hybrid, not a lane
 * difference in the renderer's actual behavior.
 */
vi.mock('@/utils/imageEmbed', () => ({
  replaceImageEmbedsWithHtml: vi.fn((md: string) => md),
}));
vi.mock('@/utils/fileLink', () => ({
  processFileLinks: vi.fn(),
  registerFileLinkHandler: vi.fn(),
}));

function createMockComponent() {
  return {
    registerDomEvent: vi.fn(),
    register: vi.fn(),
    addChild: vi.fn(),
    load: vi.fn(),
    unload: vi.fn(),
  };
}

function mockRendererPlugin(overrides: Record<string, unknown> = {}) {
  return {
    app: new App(),
    settings: { mediaFolder: '' },
    chatMessageActions: [] as ChatMessageAction[],
    getActiveConversationSnapshot: () => null as { id: string; title: string } | null,
    ...overrides,
  };
}

function createRenderer(messagesEl: HTMLElement): MessageRenderer {
  const renderer = new MessageRenderer(mockRendererPlugin() as any, createMockComponent() as any, messagesEl);
  // Markdown render is async; keep it synchronous/DOM-free for this test's counting.
  vi.spyOn(renderer, 'renderContent').mockResolvedValue(undefined);
  return renderer;
}

function userMessages(count: number): ChatMessage[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `m${i}`,
    role: 'user',
    content: `message ${i}`,
    timestamp: i,
  }));
}

function messageCount(messagesEl: HTMLElement): number {
  return messagesEl.querySelectorAll('.specorator-message').length;
}

describe('MessageRenderer windowing/loading/hydration DOM contract (locked)', () => {
  it('81 messages mount only the trailing 80 and show a load-earlier control', () => {
    const messagesEl = document.createElement('div');
    const renderer = createRenderer(messagesEl);

    renderer.renderMessages(userMessages(81), () => 'hi');

    expect(messageCount(messagesEl)).toBe(80);
    expect(messagesEl.querySelector('.specorator-load-earlier')).not.toBeNull();
    expect(messagesEl.querySelector('.specorator-load-earlier-btn')?.textContent).toBe('Load earlier messages');
  });

  it('loadEarlierMessages (via the button click) mounts the prior chunk and preserves the scroll anchor', () => {
    const messagesEl = document.createElement('div');
    const renderer = createRenderer(messagesEl);

    renderer.renderMessages(userMessages(81), () => 'hi');
    expect(messageCount(messagesEl)).toBe(80);

    // Two reads happen inside loadEarlierMessages: once BEFORE the insert
    // (prevScrollHeight) and once AFTER (to compute the restored scrollTop).
    // Stubbing by read-count isolates the anchor-preservation FORMULA from
    // jsdom's lack of real layout, exactly like scrollToBottom.test.ts's
    // scrollHeightReads pattern.
    let scrollHeightReads = 0;
    Object.defineProperty(messagesEl, 'scrollHeight', {
      configurable: true,
      get: () => (scrollHeightReads++ === 0 ? 4000 : 4300),
    });
    Object.defineProperty(messagesEl, 'scrollTop', { configurable: true, value: 300, writable: true });

    (messagesEl.querySelector('.specorator-load-earlier-btn') as HTMLElement).click();

    // All 81 messages now mounted; control disappears once the window reaches 0.
    expect(messageCount(messagesEl)).toBe(81);
    expect(messagesEl.querySelector('.specorator-load-earlier')).toBeNull();
    // scrollTop = prevScrollTop + (newScrollHeight - prevScrollHeight) = 300 + (4300 - 4000)
    expect(messagesEl.scrollTop).toBe(600);
  });

  it('renderLoading replaces the pane with a spinner + text, clearing prior content', () => {
    const messagesEl = document.createElement('div');
    const renderer = createRenderer(messagesEl);

    renderer.renderMessages(userMessages(3), () => 'hi');
    expect(messageCount(messagesEl)).toBe(3);

    renderer.renderLoading('Loading conversation…');

    expect(messageCount(messagesEl)).toBe(0);
    const loader = messagesEl.querySelector('.specorator-loading');
    expect(loader).not.toBeNull();
    expect(loader!.querySelector('.specorator-loading-spinner')).not.toBeNull();
    expect(loader!.querySelector('.specorator-loading-text')?.textContent).toBe('Loading conversation…');
  });

  it('setHydrationError renders the banner with the error code + message; clearHydrationBanner removes it', () => {
    const messagesEl = document.createElement('div');
    const renderer = createRenderer(messagesEl);

    renderer.setHydrationError({ code: 'store-unreadable', message: 'History unavailable' });
    const banner = messagesEl.querySelector('.specorator-hydration-error') as HTMLElement;
    expect(banner).not.toBeNull();
    expect(banner.dataset.errorCode).toBe('store-unreadable');
    expect(banner.textContent).toBe('History unavailable');

    // Survives a subsequent renderMessages (re-rendered from recorded state).
    renderer.renderMessages(userMessages(1), () => 'hi');
    expect(messagesEl.querySelector('.specorator-hydration-error')?.textContent).toBe('History unavailable');

    renderer.clearHydrationBanner();
    expect(messagesEl.querySelector('.specorator-hydration-error')).toBeNull();
  });
});
