import { fireEvent, render } from '@testing-library/vue';
import { flushPromises } from '@vue/test-utils';
import { setIcon } from 'obsidian';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import CopyButton from '@/features/chat/ui/vue/transcript/CopyButton.vue';

function stubClipboard(writeText: (text: string) => Promise<void>) {
  const original = globalThis.navigator;
  Object.defineProperty(globalThis, 'navigator', {
    value: { clipboard: { writeText } },
    writable: true,
    configurable: true,
  });
  return () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: original,
      writable: true,
      configurable: true,
    });
  };
}

describe('CopyButton', () => {
  beforeEach(() => {
    (setIcon as unknown as ReturnType<typeof vi.fn>).mockClear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the .specorator-text-copy-btn root and stamps the copy icon on mount', async () => {
    const { container } = render(CopyButton, { props: { text: 'hello' } });
    await flushPromises();
    const btn = container.querySelector('.specorator-text-copy-btn');
    expect(btn).not.toBeNull();
    expect(setIcon).toHaveBeenCalledWith(btn, 'copy');
  });

  it('copies text to the clipboard and shows "Copied!" + .copied for 1500ms on click', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const restore = stubClipboard(writeText);

    const { container } = render(CopyButton, { props: { text: 'markdown content' } });
    const btn = container.querySelector('.specorator-text-copy-btn') as HTMLElement;

    await fireEvent.click(btn);
    await flushPromises();
    expect(writeText).toHaveBeenCalledWith('markdown content');

    expect(btn.textContent).toBe('Copied!');
    expect(btn.classList.contains('copied')).toBe(true);

    vi.advanceTimersByTime(1500);
    await flushPromises();
    expect(btn.classList.contains('copied')).toBe(false);
    expect(setIcon).toHaveBeenCalledWith(btn, 'copy');

    restore();
  });

  it('does nothing on a rejected clipboard write (no throw, no "Copied!" state)', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('not allowed'));
    const restore = stubClipboard(writeText);

    const { container } = render(CopyButton, { props: { text: 'content' } });
    const btn = container.querySelector('.specorator-text-copy-btn') as HTMLElement;

    await fireEvent.click(btn);
    await flushPromises();
    expect(writeText).toHaveBeenCalled();

    expect(btn.classList.contains('copied')).toBe(false);

    restore();
  });
});
