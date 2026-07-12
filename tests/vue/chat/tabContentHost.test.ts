import { render } from '@testing-library/vue';
import { describe, expect, it, vi } from 'vitest';
import { h } from 'vue';

import { CONTENT_HOST_KEY } from '@/features/chat/ui/vue/chatShellKeys';
import TabContentHost from '@/features/chat/ui/vue/components/TabContentHost.vue';

describe('TabContentHost (opaque leave-me-alone host)', () => {
  it('invokes the CONTENT_HOST callback once with its element, and imperative children survive a parent re-render', async () => {
    const mount = vi.fn();
    const { container, rerender } = render(
      { setup: () => () => h(TabContentHost) },
      { global: { provide: { [CONTENT_HOST_KEY as symbol]: mount } } },
    );
    expect(mount).toHaveBeenCalledTimes(1);
    const hostEl = mount.mock.calls[0][0] as HTMLElement;
    expect(hostEl).toBe(container.querySelector('.specorator-tab-content-container'));

    const child = hostEl.ownerDocument.createElement('div');
    child.className = 'imperative-tab-content';
    const onClick = vi.fn();
    child.addEventListener('click', onClick);
    hostEl.appendChild(child);

    await rerender({});
    const survivor = hostEl.querySelector('.imperative-tab-content') as HTMLElement;
    expect(survivor).toBe(child);
    survivor.dispatchEvent(new MouseEvent('click'));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(mount).toHaveBeenCalledTimes(1);
  });
});
