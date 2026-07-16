import { mount } from '@vue/test-utils';
import { setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ModeSelector from '@/features/chat/ui/vue/composer/components/toolbar/ModeSelector.vue';
import type { ComposerCallbacks } from '@/features/chat/ui/vue/composer/composerCallbacks';
import { CALLBACKS_KEY } from '@/features/chat/ui/vue/composer/composerKeys';
import { createComposerPinia } from '@/features/chat/ui/vue/composer/composerPinia';
import { type ComposerModeState,useComposerStore } from '@/features/chat/ui/vue/composer/stores/composerStore';

function stubCallbacks(): ComposerCallbacks {
  return { onSetMode: vi.fn() } as unknown as ComposerCallbacks;
}

function mountSelector(cb: ComposerCallbacks) {
  const pinia = createComposerPinia();
  setActivePinia(pinia);
  const wrapper = mount(ModeSelector, {
    global: { plugins: [pinia], provide: { [CALLBACKS_KEY as symbol]: cb } },
  });
  return { wrapper, store: useComposerStore() };
}

const MODE: ComposerModeState = {
  label: 'Ask', value: 'ask', activeValue: 'agent', active: false,
  title: 'Toggle mode',
  options: [{ value: 'ask', label: 'Ask' }, { value: 'agent', label: 'Agent' }],
};

describe('ModeSelector.vue', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders nothing when store.toolbar.mode is null', () => {
    const { wrapper } = mountSelector(stubCallbacks());
    expect(wrapper.find('.specorator-mode-selector').exists()).toBe(false);
  });

  it('renders the contract root class when a mode is projected', () => {
    const { wrapper, store } = mountSelector(stubCallbacks());
    store.setToolbar({ ...store.toolbar, mode: MODE });
    return wrapper.vm.$nextTick().then(() => {
      expect(wrapper.find('.specorator-mode-selector').exists()).toBe(true);
    });
  });

  it('toggling an inactive mode fires onSetMode with activeValue', async () => {
    const cb = stubCallbacks();
    const { wrapper, store } = mountSelector(cb);
    store.setToolbar({ ...store.toolbar, mode: { ...MODE, active: false } });
    await wrapper.vm.$nextTick();

    await wrapper.find('.specorator-mode-selector').trigger('click');
    expect(cb.onSetMode).toHaveBeenCalledWith('agent');
  });

  it('toggling an active mode fires onSetMode with the other option value', async () => {
    const cb = stubCallbacks();
    const { wrapper, store } = mountSelector(cb);
    store.setToolbar({ ...store.toolbar, mode: { ...MODE, active: true } });
    await wrapper.vm.$nextTick();

    await wrapper.find('.specorator-mode-selector').trigger('click');
    expect(cb.onSetMode).toHaveBeenCalledWith('ask');
  });
});
