import { render, screen } from '@testing-library/vue';
import { describe, expect, it } from 'vitest';

import type { MarketplaceItem } from '@/features/marketplace/catalogTypes';
import MarketplaceGrid from '@/features/marketplace/vue/components/MarketplaceGrid.vue';

const typeLabels = {
  'quick-action': 'Quick Action',
  agent: 'Agent',
  loop: 'Loop',
  template: 'Template',
  skill: 'Skill',
};
const items: MarketplaceItem[] = [
  { id: 'a', type: 'loop', name: 'Alpha', description: 'd', path: 'loops/a.md', tags: [] },
  { id: 'b', type: 'agent', name: 'Beta', description: 'd', path: 'agents/b.md', tags: [] },
];

describe('MarketplaceGrid', () => {
  it('renders a card per item', () => {
    render(MarketplaceGrid, { props: { items, installedIds: new Set<string>(), typeLabels } });
    expect(document.querySelectorAll('.specorator-vue-marketplace-card')).toHaveLength(2);
  });

  it('renders skeleton cells while loading with no items yet', () => {
    render(MarketplaceGrid, {
      props: { items: [], installedIds: new Set<string>(), typeLabels, loading: true, skeletonCount: 4 },
    });
    expect(document.querySelectorAll('.specorator-vue-marketplace-skeleton')).toHaveLength(4);
    expect(document.querySelectorAll('.specorator-vue-marketplace-card')).toHaveLength(0);
  });

  it('shows the empty state when not loading and no items', () => {
    render(MarketplaceGrid, { props: { items: [], installedIds: new Set<string>(), typeLabels } });
    expect(screen.getByText('No items match your filters.')).toBeTruthy();
  });
});
