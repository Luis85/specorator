import { render } from '@testing-library/vue';
import { flushPromises } from '@vue/test-utils';
import { App, Component, MarkdownRenderer } from 'obsidian';
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

import ThinkingBlock from '@/features/chat/ui/vue/transcript/blocks/ThinkingBlock.vue';
import { APP_KEY, COMPONENT_KEY, PLUGIN_KEY } from '@/features/chat/ui/vue/transcript/transcriptKeys';
import type SpecoratorPlugin from '@/main';

const renderMock = MarkdownRenderer.renderMarkdown as unknown as Mock;

function mountBlock(props: { content: string; durationSeconds?: number; live?: boolean }) {
  const plugin = { settings: { mediaFolder: '' } } as unknown as SpecoratorPlugin;
  return render(ThinkingBlock, {
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

describe('ThinkingBlock', () => {
  it('renders the finalized wrapper/header/label DOM contract with a duration', async () => {
    const { container } = mountBlock({ content: 'reasoning', durationSeconds: 12 });
    await flushPromises();

    const wrapper = container.querySelector('.specorator-thinking-block');
    expect(wrapper).not.toBeNull();
    expect(wrapper?.classList.contains('expanded')).toBe(false);

    const header = container.querySelector('.specorator-thinking-header');
    expect(header?.getAttribute('tabindex')).toBe('0');
    expect(header?.getAttribute('role')).toBe('button');
    expect(header?.getAttribute('aria-expanded')).toBe('false');
    expect(header?.getAttribute('aria-label')).toBe('Extended thinking - click to expand');

    const label = container.querySelector('.specorator-thinking-label');
    expect(label?.textContent).toBe('Thought for 12s');

    const content = container.querySelector('.specorator-thinking-content');
    expect(content?.classList.contains('specorator-hidden')).toBe(true);
  });

  it('renders "Thought" with no duration', async () => {
    const { container } = mountBlock({ content: 'x' });
    await flushPromises();
    expect(container.querySelector('.specorator-thinking-label')?.textContent).toBe('Thought');
  });

  it('renders content markdown through MarkdownHost', async () => {
    const { container } = mountBlock({ content: 'hello', durationSeconds: 1 });
    await flushPromises();
    expect(container.querySelector('.specorator-thinking-content .rendered-md')?.textContent).toBe('hello');
  });

  it('toggles expanded state on click; aria-label stays static', async () => {
    const { container } = mountBlock({ content: 'x', durationSeconds: 1 });
    await flushPromises();

    const header = container.querySelector('.specorator-thinking-header') as HTMLElement;
    const wrapper = container.querySelector('.specorator-thinking-block') as HTMLElement;
    const content = container.querySelector('.specorator-thinking-content') as HTMLElement;

    header.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushPromises();

    expect(wrapper.classList.contains('expanded')).toBe(true);
    expect(content.classList.contains('specorator-hidden')).toBe(false);
    expect(header.getAttribute('aria-expanded')).toBe('true');
    expect(header.getAttribute('aria-label')).toBe('Extended thinking - click to expand');
  });

  it('toggles on Enter/Space keydown with preventDefault', async () => {
    const { container } = mountBlock({ content: 'x', durationSeconds: 1 });
    await flushPromises();
    const header = container.querySelector('.specorator-thinking-header') as HTMLElement;

    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    header.dispatchEvent(event);
    await flushPromises();

    expect(event.defaultPrevented).toBe(true);
    expect(container.querySelector('.specorator-thinking-block')?.classList.contains('expanded')).toBe(true);
  });

  describe('live mode', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('shows a ticking "Thinking Ns..." label that updates every second', async () => {
      const { container } = mountBlock({ content: 'x', live: true });
      await flushPromises();
      expect(container.querySelector('.specorator-thinking-label')?.textContent).toBe('Thinking 0s...');

      vi.advanceTimersByTime(3000);
      await flushPromises();
      expect(container.querySelector('.specorator-thinking-label')?.textContent).toBe('Thinking 3s...');
    });
  });
});
