import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { shallowRef } from 'vue';

import NavOverlay from '@/features/chat/ui/vue/tabChrome/NavOverlay.vue';
import { NAV_HOST_KEY, SCROLL_HOST_KEY } from '@/features/chat/ui/vue/tabChrome/tabChromeKeys';

vi.mock('obsidian', () => ({ setIcon: (el: HTMLElement, n: string) => el.setAttribute('data-icon', n) }));

function makeScrollEl(userTops: number[], scrollHeight = 2000, clientHeight = 400) {
  const el = document.createElement('div');
  Object.defineProperty(el, 'scrollHeight', { value: scrollHeight, configurable: true });
  Object.defineProperty(el, 'clientHeight', { value: clientHeight, configurable: true });
  el.scrollTop = 0;
  el.scrollTo = vi.fn();
  for (const top of userTops) {
    const m = document.createElement('div');
    m.className = 'specorator-message-user';
    Object.defineProperty(m, 'offsetTop', { value: top, configurable: true });
    el.appendChild(m);
  }
  return el;
}

function mountOverlay(scrollEl: HTMLElement | null) {
  const scrollHost = shallowRef<HTMLElement | null>(scrollEl);
  const w = mount(NavOverlay, {
    global: { provide: { [SCROLL_HOST_KEY as symbol]: scrollHost, [NAV_HOST_KEY as symbol]: () => null } },
  });
  return { w, scrollHost };
}

describe('NavOverlay.vue', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('renders the four nav buttons with legacy classes', () => {
    const { w } = mountOverlay(makeScrollEl([100, 800]));
    expect(w.find('.specorator-nav-sidebar').exists()).toBe(true);
    expect(w.find('.specorator-nav-btn-top').exists()).toBe(true);
    expect(w.find('.specorator-nav-btn-prev').exists()).toBe(true);
    expect(w.find('.specorator-nav-btn-next').exists()).toBe(true);
    expect(w.find('.specorator-nav-btn-bottom').exists()).toBe(true);
  });

  it('scans to the next user message below the scroll position', async () => {
    const scrollEl = makeScrollEl([100, 800, 1500]);
    const { w } = mountOverlay(scrollEl);
    await w.find('.specorator-nav-btn-next').trigger('click');
    expect(scrollEl.scrollTo).toHaveBeenCalledWith({ top: 90, behavior: 'smooth' });
  });

  it('scrolls to top and bottom', async () => {
    const scrollEl = makeScrollEl([100]);
    const { w } = mountOverlay(scrollEl);
    await w.find('.specorator-nav-btn-top').trigger('click');
    expect(scrollEl.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
    await w.find('.specorator-nav-btn-bottom').trigger('click');
    expect(scrollEl.scrollTo).toHaveBeenCalledWith({ top: 2000, behavior: 'smooth' });
  });
});
