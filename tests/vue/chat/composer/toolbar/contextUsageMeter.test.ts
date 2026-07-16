import { mount } from '@vue/test-utils';
import { setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ContextUsageMeter from '@/features/chat/ui/vue/composer/components/toolbar/ContextUsageMeter.vue';
import { createComposerPinia } from '@/features/chat/ui/vue/composer/composerPinia';
import { useComposerStore } from '@/features/chat/ui/vue/composer/stores/composerStore';

function mountMeter() {
  const pinia = createComposerPinia();
  setActivePinia(pinia);
  const wrapper = mount(ContextUsageMeter, { global: { plugins: [pinia] } });
  return { wrapper, store: useComposerStore() };
}

describe('ContextUsageMeter.vue', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders nothing when store.toolbar.usage is null', () => {
    const { wrapper } = mountMeter();
    expect(wrapper.find('.specorator-context-meter').exists()).toBe(false);
  });

  it('renders the gauge + percent when usage is set', async () => {
    const { wrapper, store } = mountMeter();
    store.setToolbar({ ...store.toolbar, usage: { percentage: 42, tooltip: '4k / 10k', warning: false } });
    await wrapper.vm.$nextTick();

    const meter = wrapper.find('.specorator-context-meter');
    expect(meter.exists()).toBe(true);
    expect(meter.classes()).not.toContain('warning');
    expect(meter.attributes('data-tooltip')).toBe('4k / 10k');
    expect(wrapper.find('.specorator-context-meter-percent').text()).toBe('42%');
    expect(wrapper.find('.specorator-meter-fill').exists()).toBe(true);
  });

  it('applies the warning class past the threshold', async () => {
    const { wrapper, store } = mountMeter();
    store.setToolbar({ ...store.toolbar, usage: { percentage: 92, tooltip: 'high', warning: true } });
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.specorator-context-meter').classes()).toContain('warning');
  });

  it('drives the fill stroke-dashoffset from the percentage', async () => {
    const { wrapper, store } = mountMeter();
    store.setToolbar({ ...store.toolbar, usage: { percentage: 0, tooltip: 'empty', warning: false } });
    await wrapper.vm.$nextTick();
    const fill = wrapper.find('.specorator-meter-fill');
    const dashArray = Number(fill.attributes('stroke-dasharray'));
    // 0% → the fill is fully hidden: offset equals the full circumference.
    expect(Number(fill.attributes('stroke-dashoffset'))).toBeCloseTo(dashArray, 5);

    store.setToolbar({ ...store.toolbar, usage: { percentage: 50, tooltip: 'half', warning: false } });
    await wrapper.vm.$nextTick();
    // 50% → offset is halfway.
    expect(Number(fill.attributes('stroke-dashoffset'))).toBeCloseTo(dashArray / 2, 5);
  });
});
