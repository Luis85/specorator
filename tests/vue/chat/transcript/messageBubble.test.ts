import '@/providers';

import { render } from '@testing-library/vue';
import { flushPromises } from '@vue/test-utils';
import { App, Component, MarkdownRenderer, TFile } from 'obsidian';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

import type { ChatMessage } from '@/core/types';
import MessageBubble from '@/features/chat/ui/vue/transcript/MessageBubble.vue';
import type { TranscriptCallbacks } from '@/features/chat/ui/vue/transcript/transcriptCallbacks';
import { APP_KEY, CALLBACKS_KEY, COMPONENT_KEY, PLUGIN_KEY } from '@/features/chat/ui/vue/transcript/transcriptKeys';
import type SpecoratorPlugin from '@/main';

/**
 * Parity twin of `messageBubble.characterization.test.ts`: reproduces the
 * same shell DOM contract via `MessageBubble.vue`, mounting the REAL leaf +
 * `BlockList` components so this proves the full assembly wiring.
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

function mountBubble(msg: ChatMessage, callbacks?: TranscriptCallbacks, app: App = new App()) {
  const plugin = { settings: { mediaFolder: '' } } as unknown as SpecoratorPlugin;
  return render(MessageBubble, {
    props: { msg },
    global: {
      provide: {
        [APP_KEY as symbol]: app,
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

describe('MessageBubble', () => {
  it('user text message: shell attrs, text block inside content, action-bar toolbar as a msgEl-level sibling', async () => {
    const msg: ChatMessage = { id: 'u1', role: 'user', content: 'Hello world', timestamp: 1, userMessageId: 'user-u1' };
    const { container } = mountBubble(msg, makeCallbacks());
    await flushPromises();

    const msgEl = container.querySelector('.specorator-message') as HTMLElement;
    expect(msgEl.classList.contains('specorator-message-user')).toBe(true);
    expect(msgEl.dataset.messageId).toBe('u1');
    expect(msgEl.dataset.role).toBe('user');

    const contentEl = msgEl.querySelector(':scope > .specorator-message-content') as HTMLElement;
    expect(contentEl.getAttribute('dir')).toBe('auto');
    expect(contentEl.querySelector('.specorator-text-block')).not.toBeNull();

    const toolbar = msgEl.querySelector(':scope > .specorator-user-msg-actions');
    expect(toolbar).not.toBeNull();
    expect(contentEl.querySelector('.specorator-user-msg-actions')).toBeNull();
    expect(toolbar!.querySelector('.specorator-user-msg-copy-btn')).not.toBeNull();
  });

  it('renders the vault-mention context card for a user message', async () => {
    const app = new App();
    app.vault.getAbstractFileByPath = vi.fn((path: string) =>
      path === 'notes/design.md' ? Object.assign(new TFile(), { path }) : null
    );
    const msg: ChatMessage = { id: 'u1', role: 'user', content: 'See @notes/design.md please', timestamp: 1 };

    const { container } = mountBubble(msg, makeCallbacks(), app);
    await flushPromises();

    expect(container.querySelector('.specorator-context-card')).not.toBeNull();
  });

  it('skips the bubble entirely for an image-only user message', async () => {
    const msg: ChatMessage = {
      id: 'u1',
      role: 'user',
      content: '',
      timestamp: 1,
      images: [{ id: 'img-1', name: 'img.png', mediaType: 'image/png', data: 'abc', size: 100, source: 'paste' }],
    };
    const { container } = mountBubble(msg, makeCallbacks());
    await flushPromises();

    expect(container.querySelector('.specorator-message')).toBeNull();
    expect(container.querySelector('.specorator-message-images')).not.toBeNull();
  });

  it('renders images above the bubble when a user message has both text and images', async () => {
    const msg: ChatMessage = {
      id: 'u1',
      role: 'user',
      content: 'Check this',
      timestamp: 1,
      images: [{ id: 'img-1', name: 'photo.png', mediaType: 'image/png', data: 'abc', size: 100, source: 'file' }],
    };
    const { container } = mountBubble(msg, makeCallbacks());
    await flushPromises();

    const children = Array.from(container.children);
    const imagesIdx = children.findIndex((c) => c.classList.contains('specorator-message-images'));
    const bubbleIdx = children.findIndex((c) => c.classList.contains('specorator-message'));
    expect(imagesIdx).toBeGreaterThanOrEqual(0);
    expect(bubbleIdx).toBeGreaterThan(imagesIdx);
  });

  it('assistant message with visible content: renders BlockList output inside content + action bar', async () => {
    const msg: ChatMessage = {
      id: 'a1',
      role: 'assistant',
      content: '',
      timestamp: 1,
      contentBlocks: [{ type: 'text', content: 'Hi there' }],
    } as ChatMessage;
    const { container } = mountBubble(msg, makeCallbacks());
    await flushPromises();

    const msgEl = container.querySelector('.specorator-message') as HTMLElement;
    expect(msgEl.classList.contains('specorator-message-assistant')).toBe(true);
    expect(msgEl.dataset.messageId).toBe('a1');
    expect(msgEl.dataset.role).toBe('assistant');
    expect(msgEl.querySelector('.specorator-text-block')?.textContent).toContain('Hi there');
  });

  it('assistant action bar co-locates inside the last text block, beside the copy button (one hover row)', async () => {
    const msg: ChatMessage = {
      id: 'a1',
      role: 'assistant',
      content: '',
      timestamp: 1,
      contentBlocks: [{ type: 'text', content: 'Hi there' }],
    } as ChatMessage;
    const callbacks = makeCallbacks({
      getMessageActions: vi.fn(() => [
        { id: 'wo', label: 'Create work order', icon: 'briefcase', run: vi.fn() },
      ]),
    });
    const { container } = mountBubble(msg, callbacks);
    await flushPromises();

    const textBlock = container.querySelector('.specorator-text-block') as HTMLElement;
    // Both the copy button and the action bar live in the same text block, so
    // they anchor to the same box and render as one row.
    expect(textBlock.querySelector('.specorator-text-copy-btn')).not.toBeNull();
    expect(textBlock.querySelector('.specorator-text-actions')).not.toBeNull();
    expect(textBlock.querySelector('.specorator-text-action-btn')).not.toBeNull();
  });

  it('mounts a message-level fallback action bar when a response has no text block to host it', async () => {
    // Tool-only contentBlocks (no text item) but eligible actions via `content`:
    // the co-located slot has no host, so the bar falls back to message level.
    const msg = {
      id: 'a1',
      role: 'assistant',
      content: 'summary prose',
      timestamp: 1,
      contentBlocks: [{ type: 'tool_use', id: 't1', name: 'Bash' }],
      toolCalls: [{ id: 't1', name: 'Bash', status: 'completed', input: {} }],
    } as unknown as ChatMessage;
    const callbacks = makeCallbacks({
      getMessageActions: vi.fn(() => [
        { id: 'wo', label: 'Create work order', icon: 'briefcase', run: vi.fn() },
      ]),
    });
    const { container } = mountBubble(msg, callbacks);
    await flushPromises();

    // No text block exists, but the action bar still renders (message-level).
    expect(container.querySelector('.specorator-text-block')).toBeNull();
    const bar = container.querySelector('.specorator-message-content > .specorator-text-actions');
    expect(bar).not.toBeNull();
    expect(bar!.querySelector('.specorator-text-action-btn')).not.toBeNull();
  });

  it('renders nothing for an assistant message with no visible content', async () => {
    const msg: ChatMessage = { id: 'a1', role: 'assistant', content: '', timestamp: 1 };
    const { container } = mountBubble(msg, makeCallbacks());
    await flushPromises();

    expect(container.querySelector('.specorator-message')).toBeNull();
  });

  it('renders nothing for an isRebuiltContext message', async () => {
    const msg: ChatMessage = { id: 'u1', role: 'user', content: 'rebuilt', timestamp: 1, isRebuiltContext: true };
    const { container } = mountBubble(msg, makeCallbacks());
    await flushPromises();

    expect(container.querySelector('.specorator-message')).toBeNull();
  });

  it('interrupt-only user message: bare marker with no data-message-id/data-role attrs', async () => {
    const msg: ChatMessage = {
      id: 'interrupt-1',
      role: 'user',
      content: '[Request interrupted by user]',
      timestamp: 1,
      isInterrupt: true,
    };
    const { container } = mountBubble(msg, makeCallbacks());
    await flushPromises();

    const msgEl = container.querySelector('.specorator-message') as HTMLElement;
    expect(msgEl.classList.contains('specorator-message-assistant')).toBe(true);
    expect(msgEl.dataset.messageId).toBeUndefined();
    expect(msgEl.dataset.role).toBeUndefined();

    const textEl = msgEl.querySelector('.specorator-message-content > .specorator-text-block') as HTMLElement;
    expect(textEl.textContent).toBe('Interrupted · What should Specorator do instead?');
    expect(msgEl.querySelector('.specorator-user-msg-actions')).toBeNull();
  });

  it('interrupted assistant message with visible content: BlockList output + appended interrupt indicator + action bar', async () => {
    const msg: ChatMessage = {
      id: 'a-interrupt',
      role: 'assistant',
      content: '',
      timestamp: 1,
      isInterrupt: true,
      contentBlocks: [{ type: 'text', content: 'Partial response' }],
    } as ChatMessage;
    const { container } = mountBubble(msg, makeCallbacks());
    await flushPromises();

    const msgEl = container.querySelector('.specorator-message') as HTMLElement;
    expect(msgEl.dataset.messageId).toBe('a-interrupt');
    const textBlocks = msgEl.querySelectorAll('.specorator-text-block');
    expect(textBlocks).toHaveLength(2);
    expect(textBlocks[0].textContent).toContain('Partial response');
    expect(textBlocks[1].querySelector('.specorator-interrupted')).not.toBeNull();
  });

  it('bare-interrupt priority: an interrupted+rebuilt-context assistant message with no visible content still shows the bare marker', async () => {
    const msg: ChatMessage = {
      id: 'a1',
      role: 'assistant',
      content: '',
      timestamp: 1,
      isInterrupt: true,
      isRebuiltContext: true,
    };
    const { container } = mountBubble(msg, makeCallbacks());
    await flushPromises();

    const msgEl = container.querySelector('.specorator-message') as HTMLElement;
    expect(msgEl).not.toBeNull();
    expect(msgEl.querySelector('.specorator-interrupted')).not.toBeNull();
  });
});
