import { render } from '@testing-library/vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ImageAttachment } from '@/core/types';
import MessageImages from '@/features/chat/ui/vue/transcript/cards/MessageImages.vue';
import type { TranscriptCallbacks } from '@/features/chat/ui/vue/transcript/transcriptCallbacks';
import { CALLBACKS_KEY } from '@/features/chat/ui/vue/transcript/transcriptKeys';

/**
 * Parity twin of `messageImages.characterization.test.ts`: reproduces the
 * same DOM contract via `MessageImages.vue`, sourcing `resolveImageSrc` /
 * `showFullImage` from the injected callbacks seam.
 */
function createImage(overrides: Partial<ImageAttachment> = {}): ImageAttachment {
  return { id: 'img-1', name: 'screenshot.png', mediaType: 'image/png', data: '', size: 0, source: 'paste', ...overrides };
}

function makeCallbacks(overrides: Partial<TranscriptCallbacks> = {}): TranscriptCallbacks {
  return {
    subscribe: vi.fn(),
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

beforeEach(() => {
  vi.clearAllMocks();
});

describe('MessageImages', () => {
  it('renders an <img> with the resolved src, alt, and lazy/async attributes', () => {
    const callbacks = makeCallbacks({ resolveImageSrc: vi.fn(() => 'app://resource/vault/screenshot.png') });
    const { container } = render(MessageImages, {
      props: { images: [createImage()] },
      global: { provide: { [CALLBACKS_KEY as symbol]: callbacks } },
    });

    const img = container.querySelector('img')!;
    expect(img.getAttribute('src')).toBe('app://resource/vault/screenshot.png');
    expect(img.getAttribute('alt')).toBe('screenshot.png');
    expect(img.getAttribute('loading')).toBe('lazy');
    expect(img.getAttribute('decoding')).toBe('async');
    expect(container.querySelector('.specorator-message-image-fallback')).toBeNull();
  });

  it('renders a name-only fallback when resolveImageSrc yields no source', () => {
    const callbacks = makeCallbacks({ resolveImageSrc: vi.fn(() => '') });
    const { container } = render(MessageImages, {
      props: { images: [createImage({ name: 'lost.png' })] },
      global: { provide: { [CALLBACKS_KEY as symbol]: callbacks } },
    });

    expect(container.querySelector('.specorator-message-image-fallback')?.textContent).toBe('lost.png');
    expect(container.querySelector('img')).toBeNull();
  });

  it('renders the "image" fallback text when name is empty', () => {
    const callbacks = makeCallbacks({ resolveImageSrc: vi.fn(() => '') });
    const { container } = render(MessageImages, {
      props: { images: [createImage({ name: '' })] },
      global: { provide: { [CALLBACKS_KEY as symbol]: callbacks } },
    });
    expect(container.querySelector('.specorator-message-image-fallback')?.textContent).toBe('image');
  });

  it('clicking a resolved image invokes showFullImage with the attachment', async () => {
    const image = createImage();
    const callbacks = makeCallbacks({ resolveImageSrc: vi.fn(() => 'app://resource/x.png') });
    const { container } = render(MessageImages, {
      props: { images: [image] },
      global: { provide: { [CALLBACKS_KEY as symbol]: callbacks } },
    });

    container.querySelector('img')!.dispatchEvent(new Event('click'));
    expect(callbacks.showFullImage).toHaveBeenCalledWith(image);
  });

  it('renders a fallback for every image when callbacks are not provided', () => {
    const { container } = render(MessageImages, { props: { images: [createImage()] } });
    expect(container.querySelector('.specorator-message-image-fallback')).not.toBeNull();
    expect(container.querySelector('img')).toBeNull();
  });
});
