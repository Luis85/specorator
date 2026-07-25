import { fireEvent, render, screen } from '@testing-library/vue';
import { describe, expect, it } from 'vitest';

import type { MarketplaceItem } from '@/features/marketplace/catalogTypes';
import MarketplaceHome from '@/features/marketplace/vue/components/MarketplaceHome.vue';

const typeLabels = {
  'quick-action': 'Quick Action',
  agent: 'Agent',
  loop: 'Loop',
  template: 'Template',
  skill: 'Skill',
};
function item(id: string, type: MarketplaceItem['type'], name: string): MarketplaceItem {
  return { id, type, name, description: 'd', path: `${type}/${id}.md`, tags: [] };
}
const sections = [
  { type: 'agent' as const, items: [item('a1', 'agent', 'A1'), item('a2', 'agent', 'A2')] },
  { type: 'loop' as const, items: [item('l1', 'loop', 'L1')] },
];

describe('MarketplaceHome', () => {
  it('renders one section per type with its count and cards', () => {
    render(MarketplaceHome, { props: { sections, installedIds: new Set<string>(), typeLabels } });
    expect(screen.getByText('2 available')).toBeTruthy();
    // Reads correctly at one, which "1 items" did not — the i18n layer
    // interpolates only, so the wording has to carry any count.
    expect(screen.getByText('1 available')).toBeTruthy();
    expect(document.querySelectorAll('.specorator-vue-marketplace-card')).toHaveLength(3);
  });

  it('caps a section at previewLimit cards', () => {
    render(MarketplaceHome, {
      props: { sections, installedIds: new Set<string>(), typeLabels, previewLimit: 1 },
    });
    expect(document.querySelectorAll('.specorator-vue-marketplace-card')).toHaveLength(2);
  });

  it('emits seeAll(type) and open(item)', async () => {
    const { emitted } = render(MarketplaceHome, {
      props: { sections, installedIds: new Set<string>(), typeLabels },
    });
    await fireEvent.click(screen.getAllByRole('button', { name: 'See all' })[0]);
    expect(emitted().seeAll?.[0]).toEqual(['agent']);
    await fireEvent.click(screen.getByRole('button', { name: 'A1' }));
    expect((emitted().open?.[0] as MarketplaceItem[])[0].id).toBe('a1');
  });
});
