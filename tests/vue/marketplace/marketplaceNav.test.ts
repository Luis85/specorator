import { fireEvent, render, screen, within } from '@testing-library/vue';
import { describe, expect, it } from 'vitest';

import MarketplaceNav from '@/features/marketplace/vue/components/MarketplaceNav.vue';
import type { MarketplaceView } from '@/features/marketplace/vue/marketplaceView';

const typeLabels = {
  'quick-action': 'Quick Action',
  agent: 'Agent',
  loop: 'Loop',
  template: 'Template',
  skill: 'Skill',
};

function renderNav(active: MarketplaceView, counts: Record<string, number>) {
  return render(MarketplaceNav, { props: { activeView: active, counts, typeLabels } });
}

describe('MarketplaceNav', () => {
  it('renders Home plus a nav button only for present types, each with its count', () => {
    renderNav('home', { 'quick-action': 0, agent: 8, loop: 9, template: 0, skill: 0 });
    const bar = screen.getByRole('navigation', { name: 'Marketplace categories' });
    expect(within(bar).getByRole('button', { name: 'Home' })).toBeTruthy();
    expect(within(bar).getByRole('button', { name: /Agent/ })).toBeTruthy();
    expect(within(bar).getByRole('button', { name: /Loop/ })).toBeTruthy();
    // Absent types get no button.
    expect(within(bar).queryByRole('button', { name: /Quick Action/ })).toBeNull();
    expect(within(bar).queryByRole('button', { name: /Template/ })).toBeNull();
    // The count is shown.
    expect(within(bar).getByRole('button', { name: /8/ })).toBeTruthy();
  });

  it('marks the active category with aria-current and emits select', async () => {
    const { emitted } = renderNav('agent', {
      'quick-action': 0,
      agent: 8,
      loop: 9,
      template: 0,
      skill: 0,
    });
    const agentTab = screen.getByRole('button', { name: /Agent/ });
    expect(agentTab.getAttribute('aria-current')).toBe('page');
    await fireEvent.click(screen.getByRole('button', { name: 'Home' }));
    expect(emitted().select?.[0]).toEqual(['home']);
    await fireEvent.click(agentTab);
    expect(emitted().select?.[1]).toEqual(['agent']);
  });
});
