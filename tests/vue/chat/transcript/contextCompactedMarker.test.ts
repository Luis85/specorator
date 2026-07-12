import { render } from '@testing-library/vue';
import { describe, expect, it } from 'vitest';

import ContextCompactedMarker from '@/features/chat/ui/vue/transcript/blocks/ContextCompactedMarker.vue';

describe('ContextCompactedMarker', () => {
  it('renders the two-element compact-boundary DOM contract', () => {
    const { container } = render(ContextCompactedMarker);

    const boundary = container.querySelector('div.specorator-compact-boundary');
    expect(boundary).not.toBeNull();
    expect(boundary?.children.length).toBe(1);

    const label = boundary?.querySelector('span.specorator-compact-boundary-label');
    expect(label).not.toBeNull();
    expect(label?.textContent).toBe('Conversation compacted');
  });
});
