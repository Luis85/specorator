import { fireEvent, render, screen } from '@testing-library/vue';
import { describe, expect, it } from 'vitest';

import type { MarketplaceItem } from '@/features/marketplace/catalogTypes';
import MarketplaceDetail from '@/features/marketplace/vue/components/MarketplaceDetail.vue';

function base(overrides: Partial<MarketplaceItem> = {}): MarketplaceItem {
  return {
    id: 'a',
    type: 'loop',
    name: 'Alpha',
    description: 'Alpha desc',
    path: 'loops/a.md',
    tags: ['t1'],
    ...overrides,
  };
}
function renderDetail(props: Record<string, unknown> = {}) {
  return render(MarketplaceDetail, {
    props: {
      item: base(),
      typeLabel: 'Loop',
      body: 'BODY',
      previewError: false,
      installing: false,
      installed: false,
      installable: true,
      ...props,
    },
  });
}

describe('MarketplaceDetail', () => {
  it('emits back', async () => {
    const { emitted } = renderDetail();
    await fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(emitted().back).toHaveLength(1);
  });

  it('shows the reviewed body and enables Install once it loads', async () => {
    const { emitted } = renderDetail({ body: 'REVIEWED' });
    expect(screen.getByText('REVIEWED')).toBeTruthy();
    const install = screen.getByRole('button', { name: 'Install' }) as HTMLButtonElement;
    expect(install.disabled).toBe(false);
    await fireEvent.click(install);
    expect(emitted().install).toHaveLength(1);
  });

  it('disables Install until the body has loaded', () => {
    renderDetail({ body: null });
    expect((screen.getByRole('button', { name: 'Install' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it('shows Installed (not a button) when installed', () => {
    renderDetail({ installed: true });
    expect(screen.getByText('Installed')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Install' })).toBeNull();
  });

  it('shows the not-installable note for non-installable types', () => {
    renderDetail({
      item: base({ type: 'skill', id: 'skills/x', path: 'skills/x.md' }),
      installable: false,
      typeLabel: 'Skill',
    });
    expect(screen.getByText('Not yet installable')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Install' })).toBeNull();
  });

  it('linkifies only http(s) sources', () => {
    const { container: c1 } = renderDetail({ item: base({ source: 'https://example.test/x' }) });
    expect(c1.querySelector('a[href="https://example.test/x"]')).not.toBeNull();
    const { container: c2 } = renderDetail({ item: base({ source: 'javascript:alert(1)' }) });
    expect(c2.querySelector('a')).toBeNull();
    expect(c2.textContent).toContain('javascript:alert(1)');
  });
});
