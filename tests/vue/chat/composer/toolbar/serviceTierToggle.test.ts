import { mount } from '@vue/test-utils';
import { setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ServiceTierToggle from '@/features/chat/ui/vue/composer/components/toolbar/ServiceTierToggle.vue';
import type { ComposerCallbacks } from '@/features/chat/ui/vue/composer/composerCallbacks';
import { CALLBACKS_KEY } from '@/features/chat/ui/vue/composer/composerKeys';
import { createComposerPinia } from '@/features/chat/ui/vue/composer/composerPinia';
import { type ComposerServiceTierState, useComposerStore } from '@/features/chat/ui/vue/composer/stores/composerStore';

function stubCallbacks(): ComposerCallbacks {
  return { onSetServiceTier: vi.fn() } as unknown as ComposerCallbacks;
}

function mountToggle(cb: ComposerCallbacks) {
  const pinia = createComposerPinia();
  setActivePinia(pinia);
  const wrapper = mount(ServiceTierToggle, {
    global: { plugins: [pinia], provide: { [CALLBACKS_KEY as symbol]: cb } },
  });
  return { wrapper, store: useComposerStore() };
}

const TIER: ComposerServiceTierState = { active: false, activeValue: 'priority', inactiveValue: 'standard' };

describe('ServiceTierToggle.vue', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders nothing when store.toolbar.serviceTier is null', () => {
    const { wrapper } = mountToggle(stubCallbacks());
    expect(wrapper.find('.specorator-service-tier-toggle').exists()).toBe(false);
  });

  it('renders the contract root class when a service tier is projected', async () => {
    const { wrapper, store } = mountToggle(stubCallbacks());
    store.setToolbar({ ...store.toolbar, serviceTier: TIER });
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.specorator-service-tier-toggle').exists()).toBe(true);
  });

  it('toggling an inactive tier fires onSetServiceTier with activeValue', async () => {
    const cb = stubCallbacks();
    const { wrapper, store } = mountToggle(cb);
    store.setToolbar({ ...store.toolbar, serviceTier: { ...TIER, active: false } });
    await wrapper.vm.$nextTick();

    await wrapper.find('.specorator-service-tier-button').trigger('click');
    expect(cb.onSetServiceTier).toHaveBeenCalledWith('priority');
  });

  it('toggling an active tier fires onSetServiceTier with inactiveValue', async () => {
    const cb = stubCallbacks();
    const { wrapper, store } = mountToggle(cb);
    store.setToolbar({ ...store.toolbar, serviceTier: { ...TIER, active: true } });
    await wrapper.vm.$nextTick();

    await wrapper.find('.specorator-service-tier-button').trigger('click');
    expect(cb.onSetServiceTier).toHaveBeenCalledWith('standard');
  });
});
