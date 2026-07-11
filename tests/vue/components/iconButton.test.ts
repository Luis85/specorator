import { fireEvent, render, screen } from '@testing-library/vue';
import { setIcon } from 'obsidian';
import type { Mock } from 'vitest';
import { describe, expect, it } from 'vitest';

import IconButton from '@/features/library/vue/components/IconButton.vue';

describe('IconButton', () => {
  it('renders a labelled button', () => {
    render(IconButton, { props: { icon: 'star', ariaLabel: 'Toggle favorite' } });
    const btn = screen.getByRole('button', { name: 'Toggle favorite' });
    expect(btn.classList.contains('specorator-vue-icon-btn')).toBe(true);
  });

  it('renders the glyph via setIcon on mount (the function ref stamps the button — a blank button means the guard rejected it)', () => {
    (setIcon as unknown as Mock).mockClear();
    render(IconButton, { props: { icon: 'star', ariaLabel: 'Toggle favorite' } });
    const btn = screen.getByRole('button', { name: 'Toggle favorite' });
    // Guarded on nodeType (not instanceof HTMLElement) so a popout-window button —
    // a different window's HTMLElement — still gets its glyph.
    expect(setIcon).toHaveBeenCalledWith(btn, 'star');
  });

  it('reflects the pressed prop as aria-pressed + is-on, and omits aria-pressed when pressed is undefined', () => {
    const { rerender } = render(IconButton, {
      props: { icon: 'star', ariaLabel: 'Toggle favorite', pressed: false },
    });
    const btn = screen.getByRole('button', { name: 'Toggle favorite' });
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    expect(btn.classList.contains('is-on')).toBe(false);
    return rerender({ icon: 'star', ariaLabel: 'Toggle favorite', pressed: true }).then(() => {
      expect(btn.getAttribute('aria-pressed')).toBe('true');
      expect(btn.classList.contains('is-on')).toBe(true);
    });
  });

  it('omits aria-pressed entirely when pressed is not a boolean', () => {
    render(IconButton, { props: { icon: 'copy', ariaLabel: 'Duplicate' } });
    expect(screen.getByRole('button', { name: 'Duplicate' }).hasAttribute('aria-pressed')).toBe(false);
  });

  it('emits activate with the native event on click (so callers can .stop propagation)', async () => {
    const { emitted } = render(IconButton, { props: { icon: 'star', ariaLabel: 'Toggle favorite' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Toggle favorite' }));
    const events = emitted().activate as unknown[][];
    expect(events).toHaveLength(1);
    expect(events[0][0]).toBeInstanceOf(MouseEvent);
  });

  it('disables the button and blocks activation when disabled', async () => {
    const { emitted } = render(IconButton, {
      props: { icon: 'star', ariaLabel: 'Toggle favorite', disabled: true },
    });
    const btn = screen.getByRole('button', { name: 'Toggle favorite' }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    await fireEvent.click(btn);
    expect(emitted().activate).toBeUndefined();
  });

  it('marks the filled variant so the on-state can fill the glyph', () => {
    render(IconButton, {
      props: { icon: 'star', ariaLabel: 'Toggle favorite', pressed: true, filled: true },
    });
    const btn = screen.getByRole('button', { name: 'Toggle favorite' });
    expect(btn.classList.contains('is-filled')).toBe(true);
  });
});
