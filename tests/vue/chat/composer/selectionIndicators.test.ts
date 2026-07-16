import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';

import SelectionIndicators from '@/features/chat/ui/vue/composer/components/context/SelectionIndicators.vue';
import {
  BROWSER_INDICATOR_KEY, CANVAS_INDICATOR_KEY, SELECTION_INDICATOR_KEY,
} from '@/features/chat/ui/vue/composer/composerKeys';

describe('SelectionIndicators.vue', () => {
  it('renders the three legacy indicator divs, initially hidden', () => {
    const wrapper = mount(SelectionIndicators);
    const sel = wrapper.find('.specorator-selection-indicator');
    const browser = wrapper.find('.specorator-browser-selection-indicator');
    const canvas = wrapper.find('.specorator-canvas-indicator');
    expect(sel.exists()).toBe(true);
    expect(browser.exists()).toBe(true);
    expect(canvas.exists()).toBe(true);
    for (const el of [sel, browser, canvas]) {
      expect(el.classes()).toContain('specorator-hidden');
    }
  });

  it('registers all three raw nodes to the engine on mount', () => {
    const regSel = vi.fn();
    const regBrowser = vi.fn();
    const regCanvas = vi.fn();
    const wrapper = mount(SelectionIndicators, {
      global: {
        provide: {
          [SELECTION_INDICATOR_KEY as symbol]: regSel,
          [BROWSER_INDICATOR_KEY as symbol]: regBrowser,
          [CANVAS_INDICATOR_KEY as symbol]: regCanvas,
        },
      },
    });

    expect(regSel).toHaveBeenCalledWith(wrapper.find('.specorator-selection-indicator').element);
    expect(regBrowser).toHaveBeenCalledWith(wrapper.find('.specorator-browser-selection-indicator').element);
    expect(regCanvas).toHaveBeenCalledWith(wrapper.find('.specorator-canvas-indicator').element);
  });

  it('leaves engine-driven textContent + .specorator-hidden mutations untouched', async () => {
    let node: HTMLElement | null = null;
    const wrapper = mount(SelectionIndicators, {
      global: { provide: { [SELECTION_INDICATOR_KEY as symbol]: (el: HTMLElement) => { node = el; } } },
    });
    expect(node).not.toBeNull();

    // Drive a SelectionController-style mutation directly on the raw node.
    const el = node as unknown as HTMLElement;
    el.textContent = 'Selection: 12 lines';
    el.classList.remove('specorator-hidden');

    // The host never reads the store and never re-renders these children, so the
    // controller's mutation survives Vue's reactivity flush.
    await wrapper.vm.$nextTick();
    const live = wrapper.find('.specorator-selection-indicator');
    expect(live.text()).toBe('Selection: 12 lines');
    expect(live.classes()).not.toContain('specorator-hidden');
  });
});
