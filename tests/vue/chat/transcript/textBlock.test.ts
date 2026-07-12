import { render } from '@testing-library/vue';
import { flushPromises } from '@vue/test-utils';
import { App, Component, MarkdownRenderer } from 'obsidian';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

import TextBlock from '@/features/chat/ui/vue/transcript/blocks/TextBlock.vue';
import type { TranscriptCallbacks } from '@/features/chat/ui/vue/transcript/transcriptCallbacks';
import { APP_KEY, CALLBACKS_KEY, COMPONENT_KEY, PLUGIN_KEY } from '@/features/chat/ui/vue/transcript/transcriptKeys';
import type SpecoratorPlugin from '@/main';

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

function mountBlock(
  props: { content: string; role: 'user' | 'assistant' },
  callbacks?: TranscriptCallbacks,
) {
  const plugin = { settings: { mediaFolder: '' } } as unknown as SpecoratorPlugin;
  return render(TextBlock, {
    props,
    global: {
      provide: {
        [APP_KEY as symbol]: new App(),
        [COMPONENT_KEY as symbol]: new Component(),
        [PLUGIN_KEY as symbol]: plugin,
        ...(callbacks ? { [CALLBACKS_KEY as symbol]: callbacks } : {}),
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

describe('TextBlock work-order protocol segment split', () => {
  it('renders a plain block + copy button when no callbacks are provided (no work-order path reachable)', async () => {
    const { container } = mountBlock({ content: 'hello world', role: 'assistant' });
    await flushPromises();

    expect(container.querySelectorAll('.specorator-text-block')).toHaveLength(1);
    expect(container.querySelector('.specorator-text-block .specorator-text-copy-btn')).not.toBeNull();
    expect(container.querySelector('.specorator-work-order-progress-card')).toBeNull();
  });

  it('renders a plain block + copy button when callbacks are provided but getWorkOrderPath is falsy', async () => {
    const callbacks = makeCallbacks({ getWorkOrderPath: vi.fn(() => null) });
    const { container } = mountBlock({ content: 'hello world', role: 'assistant' }, callbacks);
    await flushPromises();

    expect(container.querySelectorAll('.specorator-text-block')).toHaveLength(1);
    expect(container.querySelector('.rendered-md')?.textContent).toBe('hello world');
  });

  it('renders a work-order progress card for a <specorator_progress> block when a work-order path is active', async () => {
    const callbacks = makeCallbacks({ getWorkOrderPath: vi.fn(() => 'Agent Board/wo-1.md') });
    const content = '<specorator_progress>\nstep: Scanning files\ndone: 2/5\n</specorator_progress>';
    const { container } = mountBlock({ content, role: 'assistant' }, callbacks);
    await flushPromises();

    const card = container.querySelector('.specorator-work-order-progress-card');
    expect(card).not.toBeNull();
    expect(card?.querySelector('.specorator-work-order-progress-card-step')?.textContent).toBe(
      'Scanning files',
    );
    expect(card?.querySelector('.specorator-work-order-progress-card-counter')?.textContent).toBe('2 / 5');
    // No plain text block/copy button for the protocol block itself.
    expect(container.querySelector('.specorator-text-block')).toBeNull();
  });

  it('renders surrounding markdown segments (with copy buttons) alongside a protocol card', async () => {
    const callbacks = makeCallbacks({ getWorkOrderPath: vi.fn(() => 'Agent Board/wo-1.md') });
    const content =
      'Before the block.\n\n<specorator_needs_approval>\naction: Delete branch\n</specorator_needs_approval>\n\nAfter the block.';
    const { container } = mountBlock({ content, role: 'assistant' }, callbacks);
    await flushPromises();

    const textBlocks = container.querySelectorAll('.specorator-text-block');
    expect(textBlocks).toHaveLength(2);
    expect(textBlocks[0].querySelector('.rendered-md')?.textContent).toBe('Before the block.');
    expect(textBlocks[0].querySelector('.specorator-text-copy-btn')).not.toBeNull();
    expect(textBlocks[1].querySelector('.rendered-md')?.textContent).toBe('After the block.');

    const card = container.querySelector('.specorator-work-order-needs-approval-card');
    expect(card?.querySelector('.specorator-work-order-needs-approval-card-action')?.textContent).toBe(
      'Delete branch',
    );
  });

  it('does not split user text even when a work-order path is active', async () => {
    const callbacks = makeCallbacks({ getWorkOrderPath: vi.fn(() => 'Agent Board/wo-1.md') });
    const content = '<specorator_progress>\nstep: x\n</specorator_progress>';
    const { container } = mountBlock({ content, role: 'user' }, callbacks);
    await flushPromises();

    expect(container.querySelector('.specorator-work-order-progress-card')).toBeNull();
    const block = container.querySelector('.specorator-text-block');
    expect(block?.querySelector('.rendered-md')?.textContent).toBe(content);
  });
});
