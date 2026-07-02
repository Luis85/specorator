import { fireEvent, render, screen } from '@testing-library/vue';
import { describe, expect, it } from 'vitest';
import { h } from 'vue';

import LibraryCard from '@/features/library/vue/components/LibraryCard.vue';

describe('LibraryCard', () => {
  it('renders name, activates on card click and on Enter, but NOT from nested buttons', async () => {
    let activations = 0;
    let nested = 0;
    render(LibraryCard, {
      props: { name: 'My item', ariaLabel: 'My item', onActivate: () => { activations += 1; } },
      slots: {
        actions: () => h('button', { type: 'button', onClick: (e: MouseEvent) => { e.stopPropagation(); nested += 1; } }, 'Do'),
      },
    });
    const card = screen.getByRole('button', { name: 'My item' });
    await fireEvent.click(card);
    expect(activations).toBe(1);
    await fireEvent.keyDown(card, { key: 'Enter' });
    expect(activations).toBe(2);
    await fireEvent.click(screen.getByRole('button', { name: 'Do' }));
    expect(nested).toBe(1);
    expect(activations).toBe(2);
  });

  it('renders tag chips only when tags exist', () => {
    render(LibraryCard, {
      props: { name: 'x', ariaLabel: 'x', tags: ['t1', 't2'] },
    });
    expect(document.querySelectorAll('.specorator-library-chip')).toHaveLength(2);
  });
});
