import type { App } from 'obsidian';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ImageAttachment } from '@/core/types';
import { MessageImageRenderer } from '@/features/chat/rendering/MessageImageRenderer';

/**
 * Characterization test: locks the exact DOM contract
 * `MessageImageRenderer.renderMessageImages` produces — vault-file vs.
 * base64 vs. no-source resolution, the fallback name-only div, and the
 * `<img>` attribute set — so `cards/MessageImages.vue` can be built to
 * reproduce it exactly. The image-modal open path (`showFullImage`) is
 * exercised through the resolveImageSrc precedence only, since the modal
 * itself is out of this migration task's DOM contract. Deleted alongside the
 * legacy renderer in a later cleanup task; its Vue parity twin is
 * `messageImages.test.ts`.
 */
function createImage(overrides: Partial<ImageAttachment> = {}): ImageAttachment {
  return {
    id: 'img-1',
    name: 'screenshot.png',
    mediaType: 'image/png',
    data: '',
    size: 0,
    source: 'paste',
    ...overrides,
  };
}

describe('MessageImageRenderer.renderMessageImages characterization', () => {
  let parentEl: HTMLElement;
  let app: App;

  beforeEach(() => {
    parentEl = document.createElement('div');
    app = {
      vault: {
        getAbstractFileByPath: vi.fn((path: string) =>
          path === 'vault/screenshot.png' ? { path, basename: 'screenshot' } : null,
        ),
        getResourcePath: vi.fn((file: { path: string }) => `app://resource/${file.path}`),
      },
    } as unknown as App;
  });

  it('prefers the vault resource path over base64 when both are present', () => {
    const renderer = new MessageImageRenderer({ app, getOwnerDocument: () => document });
    renderer.renderMessageImages(parentEl, [
      createImage({ path: 'vault/screenshot.png', data: 'AAAA', mediaType: 'image/png' }),
    ]);

    const wrapper = parentEl.querySelector('.specorator-message-image')!;
    const img = wrapper.querySelector('img')!;
    expect(img.getAttribute('src')).toBe('app://resource/vault/screenshot.png');
    expect(img.getAttribute('alt')).toBe('screenshot.png');
    expect(img.getAttribute('loading')).toBe('lazy');
    expect(img.getAttribute('decoding')).toBe('async');
    expect(parentEl.querySelector('.specorator-message-image-fallback')).toBeNull();
  });

  it('falls back to a base64 data URI when the vault file is not found', () => {
    const renderer = new MessageImageRenderer({ app, getOwnerDocument: () => document });
    renderer.renderMessageImages(parentEl, [
      createImage({ path: 'missing.png', data: 'QUJD', mediaType: 'image/png' }),
    ]);

    const img = parentEl.querySelector('img')!;
    expect(img.getAttribute('src')).toBe('data:image/png;base64,QUJD');
  });

  it('renders a name-only fallback div when neither a vault file nor base64 data is available', () => {
    const renderer = new MessageImageRenderer({ app, getOwnerDocument: () => document });
    renderer.renderMessageImages(parentEl, [createImage({ name: 'lost.png', data: '' })]);

    const fallback = parentEl.querySelector('.specorator-message-image-fallback')!;
    expect(fallback.textContent).toBe('lost.png');
    expect(parentEl.querySelector('.specorator-message-image')).toBeNull();
    expect(parentEl.querySelector('img')).toBeNull();
  });

  it('renders the "image" fallback text when name is empty', () => {
    const renderer = new MessageImageRenderer({ app, getOwnerDocument: () => document });
    renderer.renderMessageImages(parentEl, [createImage({ name: '', data: '' })]);
    expect(parentEl.querySelector('.specorator-message-image-fallback')?.textContent).toBe('image');
  });

  it('clicking a resolved image invokes showFullImage', () => {
    const renderer = new MessageImageRenderer({ app, getOwnerDocument: () => document });
    const spy = vi.spyOn(renderer, 'showFullImage').mockImplementation(() => {});
    const image = createImage({ path: 'vault/screenshot.png' });
    renderer.renderMessageImages(parentEl, [image]);

    parentEl.querySelector('img')!.dispatchEvent(new Event('click'));
    expect(spy).toHaveBeenCalledWith(image);
  });
});
