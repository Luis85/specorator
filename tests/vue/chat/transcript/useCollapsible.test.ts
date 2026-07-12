import { describe, expect, it, vi } from 'vitest';

import { useCollapsible } from '@/features/chat/ui/vue/transcript/collapsible';

describe('useCollapsible', () => {
  it('starts collapsed by default', () => {
    const { expanded } = useCollapsible();
    expect(expanded.value).toBe(false);
  });

  it('starts expanded when initiallyExpanded is true', () => {
    const { expanded } = useCollapsible({ initiallyExpanded: true });
    expect(expanded.value).toBe(true);
  });

  it('toggle() flips expanded', () => {
    const { expanded, toggle } = useCollapsible();
    toggle();
    expect(expanded.value).toBe(true);
    toggle();
    expect(expanded.value).toBe(false);
  });

  it('onKeydown toggles + preventDefault on Enter', () => {
    const { expanded, onKeydown } = useCollapsible();
    const event = { key: 'Enter', preventDefault: vi.fn() } as unknown as KeyboardEvent;
    onKeydown(event);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(expanded.value).toBe(true);
  });

  it('onKeydown toggles + preventDefault on Space', () => {
    const { expanded, onKeydown } = useCollapsible();
    const event = { key: ' ', preventDefault: vi.fn() } as unknown as KeyboardEvent;
    onKeydown(event);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(expanded.value).toBe(true);
  });

  it('onKeydown ignores other keys and does not call preventDefault', () => {
    const { expanded, onKeydown } = useCollapsible();
    const event = { key: 'Tab', preventDefault: vi.fn() } as unknown as KeyboardEvent;
    onKeydown(event);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(expanded.value).toBe(false);
  });

  it('ariaLabel is undefined without a baseAriaLabel', () => {
    const { ariaLabel } = useCollapsible();
    expect(ariaLabel.value).toBeUndefined();
  });

  it('ariaLabel computes "<base> - click to expand/collapse" with a baseAriaLabel', () => {
    const { ariaLabel, toggle } = useCollapsible({ baseAriaLabel: 'Tool' });
    expect(ariaLabel.value).toBe('Tool - click to expand');
    toggle();
    expect(ariaLabel.value).toBe('Tool - click to collapse');
  });
});
