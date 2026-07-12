import { render } from '@testing-library/vue';
import { flushPromises } from '@vue/test-utils';
import { Notice, setIcon } from 'obsidian';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import RuntimeErrorCard from '@/features/chat/ui/vue/transcript/blocks/RuntimeErrorCard.vue';
import type { TranscriptCallbacks } from '@/features/chat/ui/vue/transcript/transcriptCallbacks';
import { CALLBACKS_KEY } from '@/features/chat/ui/vue/transcript/transcriptKeys';

/**
 * Parity twin of `runtimeError.characterization.test.ts`: reproduces the
 * same DOM contract via `RuntimeErrorCard.vue`, sourcing
 * `openProviderSettings` / `onRetryLastTurn` / `getProviderId` from the
 * injected callbacks seam instead of `onOpenSettings`/`onRetry`/`providerId`
 * props.
 */
function stubClipboard(writeText: (text: string) => Promise<void>) {
  const original = globalThis.navigator;
  Object.defineProperty(globalThis, 'navigator', {
    value: { clipboard: { writeText } },
    writable: true,
    configurable: true,
  });
  return () => {
    Object.defineProperty(globalThis, 'navigator', { value: original, writable: true, configurable: true });
  };
}

function makeCallbacks(overrides: Partial<TranscriptCallbacks> = {}): TranscriptCallbacks {
  return {
    subscribe: vi.fn(),
    onRewind: vi.fn(),
    onFork: vi.fn(),
    isRewindEligible: vi.fn(() => false),
    openProviderSettings: vi.fn(),
    onRetryLastTurn: vi.fn(),
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

beforeEach(() => {
  vi.clearAllMocks();
});

describe('RuntimeErrorCard', () => {
  it('generic: card class, raw content as body, no details, retry-only action', () => {
    const callbacks = makeCallbacks();
    const { container } = render(RuntimeErrorCard, {
      props: { kind: 'generic', content: 'Network failed' },
      global: { provide: { [CALLBACKS_KEY as symbol]: callbacks } },
    });

    const card = container.querySelector('.specorator-runtime-error-card')!;
    expect(card.classList.contains('specorator-runtime-error-generic')).toBe(true);
    expect(card.querySelector('.specorator-runtime-error-body')?.textContent?.trim()).toBe('Network failed');
    expect(card.querySelector('.specorator-runtime-error-details')).toBeNull();
    expect(card.querySelector('.specorator-runtime-error-hint')).toBeNull();

    const buttons = card.querySelectorAll('.specorator-runtime-error-button');
    expect(buttons).toHaveLength(1);
    expect(buttons[0].classList.contains('specorator-runtime-error-button-primary')).toBe(true);
    (buttons[0] as HTMLElement).click();
    expect(callbacks.onRetryLastTurn).toHaveBeenCalledTimes(1);
  });

  it('cli-not-found: classified body + details row + settings AND retry actions', () => {
    const callbacks = makeCallbacks();
    const { container } = render(RuntimeErrorCard, {
      props: { kind: 'cli-not-found', content: 'spawn claude ENOENT' },
      global: { provide: { [CALLBACKS_KEY as symbol]: callbacks } },
    });

    const card = container.querySelector('.specorator-runtime-error-card')!;
    expect(card.querySelector('.specorator-runtime-error-body')?.textContent?.trim()).not.toBe(
      'spawn claude ENOENT',
    );
    expect(
      card.querySelector('.specorator-runtime-error-details-text')?.textContent,
    ).toBe('spawn claude ENOENT');

    const buttons = card.querySelectorAll('.specorator-runtime-error-button');
    expect(buttons).toHaveLength(2);
    (buttons[0] as HTMLElement).click();
    expect(callbacks.openProviderSettings).toHaveBeenCalledWith('claude');
    (buttons[1] as HTMLElement).click();
    expect(callbacks.onRetryLastTurn).toHaveBeenCalledTimes(1);
  });

  it('unauthenticated: provider-specific login hint with a copy button that copies + shows a Notice', async () => {
    const callbacks = makeCallbacks({ getProviderId: vi.fn(() => 'cursor') });
    const writeText = vi.fn().mockResolvedValue(undefined);
    const restoreClipboard = stubClipboard(writeText);

    try {
      const { container } = render(RuntimeErrorCard, {
        props: { kind: 'unauthenticated', content: '401 Unauthorized' },
        global: { provide: { [CALLBACKS_KEY as symbol]: callbacks } },
      });
      await flushPromises();

      const hint = container.querySelector('.specorator-runtime-error-hint')!;
      expect(hint.querySelector('.specorator-runtime-error-hint-command')?.textContent).toBe(
        'cursor-agent login',
      );

      const copyBtn = hint.querySelector('.specorator-runtime-error-hint-copy') as HTMLElement;
      expect(setIcon).toHaveBeenCalledWith(copyBtn, 'copy');

      copyBtn.click();
      await Promise.resolve();
      await Promise.resolve();
      expect(writeText).toHaveBeenCalledWith('cursor-agent login');
      expect(Notice).toHaveBeenCalled();
    } finally {
      restoreClipboard();
    }
  });

  it('context-too-large: guided body, no settings action even though callbacks are present', () => {
    const callbacks = makeCallbacks();
    const { container } = render(RuntimeErrorCard, {
      props: { kind: 'context-too-large', content: 'prompt is too long' },
      global: { provide: { [CALLBACKS_KEY as symbol]: callbacks } },
    });

    const buttons = container.querySelectorAll('.specorator-runtime-error-button');
    expect(buttons).toHaveLength(1); // retry only
    (buttons[0] as HTMLElement).click();
    expect(callbacks.onRetryLastTurn).toHaveBeenCalledTimes(1);
    expect(callbacks.openProviderSettings).not.toHaveBeenCalled();
  });

  it('omits every action button when onRetryLastTurn is null and callbacks are absent', () => {
    const { container } = render(RuntimeErrorCard, { props: { kind: 'cli-not-found', content: 'ENOENT' } });
    expect(container.querySelectorAll('.specorator-runtime-error-button')).toHaveLength(0);
  });

  it('omits the retry button (settings-only) when onRetryLastTurn is null', () => {
    const callbacks = makeCallbacks({ onRetryLastTurn: null });
    const { container } = render(RuntimeErrorCard, {
      props: { kind: 'cli-not-found', content: 'ENOENT' },
      global: { provide: { [CALLBACKS_KEY as symbol]: callbacks } },
    });
    const buttons = container.querySelectorAll('.specorator-runtime-error-button');
    expect(buttons).toHaveLength(1);
    expect(buttons[0].classList.contains('specorator-runtime-error-button-primary')).toBe(false);
  });
});
