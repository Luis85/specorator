import { render } from '@testing-library/vue';
import { flushPromises } from '@vue/test-utils';
import { App, Component, MarkdownRenderer } from 'obsidian';
import { beforeEach, describe, expect, it, type Mock } from 'vitest';

import TextBlock from '@/features/chat/ui/vue/transcript/blocks/TextBlock.vue';
import { APP_KEY, COMPONENT_KEY, PLUGIN_KEY } from '@/features/chat/ui/vue/transcript/transcriptKeys';
import type SpecoratorPlugin from '@/main';

const renderMock = MarkdownRenderer.renderMarkdown as unknown as Mock;

function mountBlock(props: { content: string; role: 'user' | 'assistant' }) {
  const plugin = { settings: { mediaFolder: '' } } as unknown as SpecoratorPlugin;
  return render(TextBlock, {
    props,
    global: {
      provide: {
        [APP_KEY as symbol]: new App(),
        [COMPONENT_KEY as symbol]: new Component(),
        [PLUGIN_KEY as symbol]: plugin,
      },
    },
  });
}

beforeEach(() => {
  renderMock.mockReset();
  renderMock.mockImplementation(async (md: string, el: HTMLElement) => {
    el.createDiv({ cls: 'rendered-md', text: md });
  });
});

describe('TextBlock', () => {
  it('renders plain assistant text in .specorator-text-block with a copy button', async () => {
    const { container } = mountBlock({ content: 'hello world', role: 'assistant' });
    await flushPromises();

    const block = container.querySelector('.specorator-text-block');
    expect(block).not.toBeNull();
    expect(block?.querySelector('.rendered-md')?.textContent).toBe('hello world');
    expect(block?.querySelector('.specorator-text-copy-btn')).not.toBeNull();
    expect(container.querySelector('.specorator-work-order-prompt')).toBeNull();
  });

  it('renders plain user text without a copy button', async () => {
    const { container } = mountBlock({ content: 'hi', role: 'user' });
    await flushPromises();

    const block = container.querySelector('.specorator-text-block');
    expect(block).not.toBeNull();
    expect(block?.querySelector('.rendered-md')?.textContent).toBe('hi');
    expect(block?.querySelector('.specorator-text-copy-btn')).toBeNull();
  });

  it('collapses a user work-order-prompt behind a <details class="specorator-work-order-prompt">', async () => {
    const prompt = 'You are executing a Specorator work order.\n\nDo the thing.';
    const { container } = mountBlock({ content: prompt, role: 'user' });
    await flushPromises();

    const details = container.querySelector('details.specorator-work-order-prompt');
    expect(details).not.toBeNull();
    expect(details?.tagName).toBe('DETAILS');

    const summary = details?.querySelector('summary.specorator-work-order-prompt-summary');
    expect(summary?.textContent).toBe('Work order prompt');

    const innerBlock = details?.querySelector('.specorator-text-block');
    expect(innerBlock).not.toBeNull();
    expect(innerBlock?.querySelector('.rendered-md')?.textContent).toBe(prompt);
    expect(innerBlock?.querySelector('.specorator-text-copy-btn')).toBeNull();
  });

  it('does not collapse assistant text even if it contains the work-order signature', async () => {
    const prompt = 'You are executing a Specorator work order.';
    const { container } = mountBlock({ content: prompt, role: 'assistant' });
    await flushPromises();

    expect(container.querySelector('.specorator-work-order-prompt')).toBeNull();
    expect(container.querySelector('.specorator-text-block .specorator-text-copy-btn')).not.toBeNull();
  });
});
