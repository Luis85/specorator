import { fireEvent, render, screen } from '@testing-library/vue';
import { describe, expect, it } from 'vitest';

import LibraryToolbar from '@/features/library/vue/components/LibraryToolbar.vue';

const baseProps = {
  query: '',
  sort: 'name' as const,
  tags: ['alpha', 'beta'],
  activeFilters: [] as string[],
};

describe('LibraryToolbar', () => {
  it('emits update:query on input', async () => {
    const { emitted } = render(LibraryToolbar, { props: baseProps });
    await fireEvent.update(screen.getByRole('searchbox'), 'abc');
    expect(emitted()['update:query']).toEqual([['abc']]);
  });

  it('emits update:sort on select change', async () => {
    const { emitted } = render(LibraryToolbar, { props: baseProps });
    await fireEvent.update(screen.getByRole('combobox'), 'updated');
    expect(emitted()['update:sort']).toEqual([['updated']]);
  });

  it('renders a chip per tag, marks active ones pressed, and emits toggle/clear', async () => {
    const { emitted } = render(LibraryToolbar, {
      props: { ...baseProps, activeFilters: ['beta'] },
    });
    const beta = screen.getByRole('button', { name: 'beta' });
    expect(beta.getAttribute('aria-pressed')).toBe('true');
    expect(beta.classList.contains('is-on')).toBe(true);
    expect(screen.getByText('Clear filters').classList.contains('is-hidden')).toBe(false);
    await fireEvent.click(screen.getByRole('button', { name: 'alpha' }));
    expect(emitted()['toggle-filter']).toEqual([['alpha']]);
    await fireEvent.click(screen.getByText('Clear filters'));
    expect(emitted()['clear-filters']).toHaveLength(1);
  });

  it('hides the reset button via is-hidden when no filters are active', () => {
    render(LibraryToolbar, { props: baseProps });
    expect(screen.getByText('Clear filters').classList.contains('is-hidden')).toBe(true);
  });

  it('hides the chip row entirely when there are no tags', () => {
    render(LibraryToolbar, { props: { ...baseProps, tags: [] } });
    expect(document.querySelector('.specorator-vue-toolbar-filterchips')).toBeNull();
  });
});
