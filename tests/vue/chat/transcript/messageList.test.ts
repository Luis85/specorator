import '@/providers';

import { render } from '@testing-library/vue';
import { flushPromises } from '@vue/test-utils';
import { App, Component, MarkdownRenderer } from 'obsidian';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

import type { ChatMessage } from '@/core/types';
import MessageList from '@/features/chat/ui/vue/transcript/MessageList.vue';
import { APP_KEY, COMPONENT_KEY, PLUGIN_KEY } from '@/features/chat/ui/vue/transcript/transcriptKeys';
import type SpecoratorPlugin from '@/main';

/**
 * Reproduces `MessageRenderer.renderMessages`'s trailing-window loop
 * (`for (i = start; i < messages.length; i++)`), locked by
 * `windowing.characterization.test.ts`: only `messages.slice(renderWindowStart)`
 * mounts, keyed by message id, one `.specorator-message` per non-empty
 * message (mirrors the counting convention of the characterization test).
 */
const renderMock = MarkdownRenderer.renderMarkdown as unknown as Mock;

function userMessages(count: number): ChatMessage[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `m${i}`,
    role: 'user',
    content: `message ${i}`,
    timestamp: i,
  }));
}

function mountList(messages: ChatMessage[], renderWindowStart: number) {
  const plugin = { settings: { mediaFolder: '' } } as unknown as SpecoratorPlugin;
  return render(MessageList, {
    props: { messages, renderWindowStart },
    global: {
      plugins: [createPinia()],
      provide: {
        [APP_KEY as symbol]: new App(),
        [COMPONENT_KEY as symbol]: new Component(),
        [PLUGIN_KEY as symbol]: plugin,
      },
    },
  });
}

beforeEach(() => {
    // MessageBubble reads the transcript store for its agent attribution
    // (null on every non-Team-Chat surface), so isolated mounts need a Pinia.
    setActivePinia(createPinia());
  vi.clearAllMocks();
  renderMock.mockReset();
  renderMock.mockImplementation(async (md: string, el: HTMLElement) => {
    el.createDiv({ cls: 'rendered-md', text: md });
  });
});

describe('MessageList', () => {
  it('mounts every message when the window covers the whole list (renderWindowStart 0)', async () => {
    const { container } = mountList(userMessages(50), 0);
    await flushPromises();

    expect(container.querySelectorAll('.specorator-message')).toHaveLength(50);
  });

  it('mounts only the trailing window (matches the 81-message / window-1 characterization case)', async () => {
    const messages = userMessages(81);
    const { container } = mountList(messages, 1);
    await flushPromises();

    const rendered = container.querySelectorAll('.specorator-message');
    expect(rendered).toHaveLength(80);
    // The first mounted message is index 1 (m1), not m0 — the earlier chunk is hidden.
    expect((rendered[0] as HTMLElement).dataset.messageId).toBe('m1');
    expect((rendered[rendered.length - 1] as HTMLElement).dataset.messageId).toBe('m80');
  });

  it('reflects a grown window (load-earlier applied): renderWindowStart 0 over the same 81 messages', async () => {
    const messages = userMessages(81);
    const { container } = mountList(messages, 0);
    await flushPromises();

    const rendered = container.querySelectorAll('.specorator-message');
    expect(rendered).toHaveLength(81);
    expect((rendered[0] as HTMLElement).dataset.messageId).toBe('m0');
  });
});
