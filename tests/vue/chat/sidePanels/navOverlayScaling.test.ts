import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { shallowRef } from 'vue';

import NavOverlay from '@/features/chat/ui/vue/tabChrome/NavOverlay.vue';
import { NAV_HOST_KEY, SCROLL_HOST_KEY } from '@/features/chat/ui/vue/tabChrome/tabChromeKeys';

vi.mock('obsidian', () => ({ setIcon: (el: HTMLElement, n: string) => el.setAttribute('data-icon', n) }));

/** Builds a scroll host with `mounted` user messages and counts querySelectorAll visits. */
function makeScrollEl(mounted: number) {
  const el = document.createElement('div');
  Object.defineProperty(el, 'scrollHeight', { value: 100000, configurable: true });
  Object.defineProperty(el, 'clientHeight', { value: 500, configurable: true });
  el.scrollTop = 250;
  el.scrollTo = vi.fn();
  let visited = 0;
  const realQSA = el.querySelectorAll.bind(el);
  (el as unknown as { querySelectorAll: typeof el.querySelectorAll }).querySelectorAll = ((sel: string) => {
    const r = realQSA(sel); visited += r.length; return r;
  }) as typeof el.querySelectorAll;
  for (let i = 0; i < mounted; i++) {
    const m = document.createElement('div');
    m.className = 'specorator-message-user';
    Object.defineProperty(m, 'offsetTop', { value: i * 100, configurable: true });
    el.appendChild(m);
  }
  return { el, visited: () => visited };
}

describe('NavOverlay scan scaling (migrated from navigationSidebar.perf)', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('scans O(mounted) user messages, not conversation length', async () => {
    for (const mounted of [10, 50, 100]) {
      const { el, visited } = makeScrollEl(mounted);
      const scrollHost = shallowRef<HTMLElement | null>(el);
      const w = mount(NavOverlay, { global: { provide: { [SCROLL_HOST_KEY as symbol]: scrollHost, [NAV_HOST_KEY as symbol]: () => null } } });
      await w.find('.specorator-nav-btn-next').trigger('click');
      // One scan visits at most the mounted set once.
      expect(visited()).toBeLessThanOrEqual(mounted);
    }
  });
});
