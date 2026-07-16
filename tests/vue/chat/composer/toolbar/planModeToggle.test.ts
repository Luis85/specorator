import { mount } from '@vue/test-utils';
import { setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import PlanModeToggle from '@/features/chat/ui/vue/composer/components/toolbar/PlanModeToggle.vue';
import type { ComposerCallbacks } from '@/features/chat/ui/vue/composer/composerCallbacks';
import { CALLBACKS_KEY } from '@/features/chat/ui/vue/composer/composerKeys';
import { createComposerPinia } from '@/features/chat/ui/vue/composer/composerPinia';
import { useComposerStore } from '@/features/chat/ui/vue/composer/stores/composerStore';
import { t } from '@/i18n/i18n';

function stubCallbacks(): ComposerCallbacks {
  return { onTogglePlanMode: vi.fn() } as unknown as ComposerCallbacks;
}

function mountToggle(cb: ComposerCallbacks) {
  const pinia = createComposerPinia();
  setActivePinia(pinia);
  const wrapper = mount(PlanModeToggle, {
    global: { plugins: [pinia], provide: { [CALLBACKS_KEY as symbol]: cb } },
  });
  return { wrapper, store: useComposerStore() };
}

describe('PlanModeToggle.vue', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders nothing when store.toolbar.planMode.visible is false', () => {
    const { wrapper } = mountToggle(stubCallbacks());
    expect(wrapper.find('.specorator-plan-mode-toggle').exists()).toBe(false);
  });

  it('renders the button with the inactive title/aria when visible and not active', async () => {
    const { wrapper, store } = mountToggle(stubCallbacks());
    store.setToolbar({ ...store.toolbar, planMode: { visible: true, active: false } });
    await wrapper.vm.$nextTick();
    const button = wrapper.find('.specorator-plan-mode-button');
    expect(button.exists()).toBe(true);
    expect(button.attributes('aria-pressed')).toBe('false');
    expect(button.attributes('aria-label')).toBe(t('chat.planMode.ariaLabel'));
    expect(button.attributes('title')).toBe(t('chat.planMode.titleInactive'));
    expect(wrapper.find('.specorator-plan-mode-icon').exists()).toBe(true);
  });

  it('reflects the active state in the class, aria-pressed, and title', async () => {
    const { wrapper, store } = mountToggle(stubCallbacks());
    store.setToolbar({ ...store.toolbar, planMode: { visible: true, active: true } });
    await wrapper.vm.$nextTick();
    const button = wrapper.find('.specorator-plan-mode-button');
    expect(button.classes()).toContain('active');
    expect(button.attributes('aria-pressed')).toBe('true');
    expect(button.attributes('title')).toBe(t('chat.planMode.titleActive'));
  });

  it('clicking the button fires onTogglePlanMode', async () => {
    const cb = stubCallbacks();
    const { wrapper, store } = mountToggle(cb);
    store.setToolbar({ ...store.toolbar, planMode: { visible: true, active: false } });
    await wrapper.vm.$nextTick();

    await wrapper.find('.specorator-plan-mode-button').trigger('click');
    expect(cb.onTogglePlanMode).toHaveBeenCalledTimes(1);
  });
});
