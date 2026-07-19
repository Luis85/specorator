import { fireEvent, render, screen, within } from '@testing-library/vue';
import { describe, expect, it } from 'vitest';

import MarketplaceNav from '@/features/marketplace/vue/components/MarketplaceNav.vue';

const typeLabels = {
  'quick-action': 'Quick Action',
  agent: 'Agent',
  loop: 'Loop',
  template: 'Template',
  skill: 'Skill',
};

function renderNav(active: string, counts: Record<string, number>) {
  return render(MarketplaceNav, { props: { activeView: active, counts, typeLabels } });
}

describe('MarketplaceNav', () => {
  it('renders Home plus a tab only for present types, each with its count', () => {
    renderNav('home', { 'quick-action': 0, agent: 8, loop: 9, template: 0, skill: 0 });
    const bar = screen.getByRole('tablist', { name: 'Marketplace categories' });
    expect(within(bar).getByRole('tab', { name: 'Home' })).toBeTruthy();
    expect(within(bar).getByRole('tab', { name: /Agent/ })).toBeTruthy();
    expect(within(bar).getByRole('tab', { name: /Loop/ })).toBeTruthy();
    // Absent types get no tab.
    expect(within(bar).queryByRole('tab', { name: /Quick Action/ })).toBeNull();
    expect(within(bar).queryByRole('tab', { name: /Template/ })).toBeNull();
    // The count is shown.
    expect(within(bar).getByRole('tab', { name: /8/ })).toBeTruthy();
  });

  it('marks the active tab and emits select', async () => {
    const { emitted } = renderNav('agent', {
      'quick-action': 0,
      agent: 8,
      loop: 9,
      template: 0,
      skill: 0,
    });
    const agentTab = screen.getByRole('tab', { name: /Agent/ });
    expect(agentTab.getAttribute('aria-selected')).toBe('true');
    await fireEvent.click(screen.getByRole('tab', { name: 'Home' }));
    expect(emitted().select?.[0]).toEqual(['home']);
    await fireEvent.click(agentTab);
    expect(emitted().select?.[1]).toEqual(['agent']);
  });
});
