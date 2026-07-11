import { setIcon } from 'obsidian';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { mountLucide } from '@/features/tasks/ui/vue/mountLucide';

describe('mountLucide', () => {
  beforeEach(() => (setIcon as unknown as ReturnType<typeof vi.fn>).mockClear());

  it('stamps data-icon and calls setIcon on a real element', () => {
    const el = document.createElement('span');
    mountLucide(el, 'play');
    expect(el.getAttribute('data-icon')).toBe('play');
    expect(setIcon).toHaveBeenCalledWith(el, 'play');
  });

  it('renders in a popout window where `instanceof HTMLElement` is false (nodeType check)', () => {
    // Simulate a popout-window node: it is a real element (nodeType 1) but NOT an
    // instanceof THIS window's HTMLElement — the exact case the old check dropped,
    // blanking every board icon in an Obsidian popout.
    const setAttribute = vi.fn();
    const popoutEl = { nodeType: 1, setAttribute } as unknown as Element;
    expect(popoutEl instanceof HTMLElement).toBe(false);
    mountLucide(popoutEl, 'square');
    expect(setAttribute).toHaveBeenCalledWith('data-icon', 'square');
    expect(setIcon).toHaveBeenCalledWith(popoutEl, 'square');
  });

  it('no-ops on null and on a component instance (no nodeType)', () => {
    expect(() => mountLucide(null, 'x')).not.toThrow();
    mountLucide({ $el: document.createElement('div') } as never, 'x');
    expect(setIcon).not.toHaveBeenCalled();
  });
});
