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
    await fireEvent.click(screen.getByRole('button', { name: 'alpha' }));
    expect(emitted()['toggle-filter']).toEqual([['alpha']]);
    await fireEvent.click(screen.getByText('Clear filters'));
    expect(emitted()['clear-filters']).toHaveLength(1);
  });

  it('hides the chip row entirely when there are no tags', () => {
    render(LibraryToolbar, { props: { ...baseProps, tags: [] } });
    expect(document.querySelector('.specorator-library-filterchips')).toBeNull();
  });
});
