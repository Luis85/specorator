import { fireEvent, render, screen } from '@testing-library/vue';
import { describe, expect, it } from 'vitest';

import type { MarketplaceItem } from '@/features/marketplace/catalogTypes';
import MarketplaceCard from '@/features/marketplace/vue/components/MarketplaceCard.vue';

const item: MarketplaceItem = {
  id: 'a',
  type: 'loop',
  name: 'Alpha',
  description: 'Alpha desc',
  path: 'loops/a.md',
  tags: ['t1', 't2'],
};

function renderCard(overrides: Partial<{ installed: boolean }> = {}) {
  return render(MarketplaceCard, {
    props: { item, installed: overrides.installed ?? false, typeLabel: 'Loop' },
  });
}

describe('MarketplaceCard', () => {
  it('renders name, description, type label, and tags', () => {
    renderCard();
    expect(screen.getByText('Alpha')).toBeTruthy();
    expect(screen.getByText('Alpha desc')).toBeTruthy();
    expect(screen.getByText('Loop')).toBeTruthy();
    expect(screen.getByText('t1')).toBeTruthy();
  });

  it('emits open on click and on Enter', async () => {
    const { emitted } = renderCard();
    const card = screen.getByRole('button', { name: 'Alpha' });
    await fireEvent.click(card);
    await fireEvent.keyDown(card, { key: 'Enter' });
    expect(emitted().open).toHaveLength(2);
  });

  it('shows the Installed badge when installed', () => {
    renderCard({ installed: true });
    expect(screen.getByText('Installed')).toBeTruthy();
  });

  it('renders the type icon intent (data-icon) from the per-type default', () => {
    const { container } = renderCard();
    expect(container.querySelector('[data-icon="repeat"]')).not.toBeNull();
  });
});
