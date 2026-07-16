import { mount } from '@vue/test-utils';
import { setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import PermissionToggle from '@/features/chat/ui/vue/composer/components/toolbar/PermissionToggle.vue';
import type { ComposerCallbacks } from '@/features/chat/ui/vue/composer/composerCallbacks';
import { CALLBACKS_KEY } from '@/features/chat/ui/vue/composer/composerKeys';
import { createComposerPinia } from '@/features/chat/ui/vue/composer/composerPinia';
import { type ComposerPermissionState, useComposerStore } from '@/features/chat/ui/vue/composer/stores/composerStore';

function stubCallbacks(): ComposerCallbacks {
  return { onSetPermission: vi.fn() } as unknown as ComposerCallbacks;
}

function mountToggle(cb: ComposerCallbacks) {
  const pinia = createComposerPinia();
  setActivePinia(pinia);
  const wrapper = mount(PermissionToggle, {
    global: { plugins: [pinia], provide: { [CALLBACKS_KEY as symbol]: cb } },
  });
  return { wrapper, store: useComposerStore() };
}

const PERMISSION: ComposerPermissionState = {
  visible: true, label: 'SAFE', active: false, planActive: false, switchVisible: true,
  activeValue: 'acceptEdits', inactiveValue: 'default',
};

describe('PermissionToggle.vue', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders nothing when store.toolbar.permission is null', () => {
    const { wrapper } = mountToggle(stubCallbacks());
    expect(wrapper.find('.specorator-permission-toggle').exists()).toBe(false);
  });

  it('renders the label and switch when a permission is projected', async () => {
    const { wrapper, store } = mountToggle(stubCallbacks());
    store.setToolbar({ ...store.toolbar, permission: PERMISSION });
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.specorator-permission-toggle').exists()).toBe(true);
    expect(wrapper.find('.specorator-permission-label').text()).toBe('SAFE');
    expect(wrapper.find('.specorator-toggle-switch').isVisible()).toBe(true);
  });

  it('marks the label plan-active and hides the switch when in plan', async () => {
    const { wrapper, store } = mountToggle(stubCallbacks());
    store.setToolbar({
      ...store.toolbar,
      permission: { ...PERMISSION, planActive: true, switchVisible: false, label: 'PLAN' },
    });
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.specorator-permission-label').classes()).toContain('plan-active');
    expect(wrapper.find('.specorator-toggle-switch').isVisible()).toBe(false);
  });

  it('toggling an inactive permission fires onSetPermission with activeValue', async () => {
    const cb = stubCallbacks();
    const { wrapper, store } = mountToggle(cb);
    store.setToolbar({ ...store.toolbar, permission: { ...PERMISSION, active: false } });
    await wrapper.vm.$nextTick();

    await wrapper.find('.specorator-toggle-switch').trigger('click');
    expect(cb.onSetPermission).toHaveBeenCalledWith('acceptEdits');
  });

  it('toggling an active permission fires onSetPermission with inactiveValue', async () => {
    const cb = stubCallbacks();
    const { wrapper, store } = mountToggle(cb);
    store.setToolbar({ ...store.toolbar, permission: { ...PERMISSION, active: true } });
    await wrapper.vm.$nextTick();

    await wrapper.find('.specorator-toggle-switch').trigger('click');
    expect(cb.onSetPermission).toHaveBeenCalledWith('default');
  });
});
