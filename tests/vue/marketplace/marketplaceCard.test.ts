import { render } from '@testing-library/vue';
import { describe, expect, it } from 'vitest';

import type { MarketplaceItem } from '@/features/marketplace/catalogTypes';
import MarketplaceCard from '@/features/marketplace/vue/components/MarketplaceCard.vue';

function cardWithSource(source: string) {
  const item: MarketplaceItem = {
    id: 'a',
    type: 'loop',
    name: 'Alpha',
    description: 'd',
    path: 'loops/a.md',
    tags: [],
    source,
  };
  return render(MarketplaceCard, {
    // expanded so the attribution (and its source link) renders.
    props: { item, installed: false, installing: false, expanded: true, body: 'BODY', previewError: false },
  });
}

describe('MarketplaceCard source link safety', () => {
  it('renders an http(s) source as a real link', () => {
    const { container } = cardWithSource('https://example.test/x');
    const link = container.querySelector('a[href="https://example.test/x"]');
    expect(link).not.toBeNull();
    expect(link?.getAttribute('rel')).toContain('noopener');
  });

  it('never linkifies a javascript: source (renders inert provenance text)', () => {
    const { container } = cardWithSource('javascript:alert(1)');
    // The catalog is untrusted: a javascript: URL must not become a live href.
    expect(container.querySelector('a[href^="javascript:"]')).toBeNull();
    expect(container.querySelector('a')).toBeNull();
    // Provenance is still shown, just as text.
    expect(container.textContent).toContain('javascript:alert(1)');
  });

  it('does not linkify a non-http scheme (file:)', () => {
    const { container } = cardWithSource('file:///etc/passwd');
    expect(container.querySelector('a')).toBeNull();
  });
});
