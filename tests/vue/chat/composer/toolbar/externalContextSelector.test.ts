import { mount } from '@vue/test-utils';
import { setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ExternalContextSelector from '@/features/chat/ui/vue/composer/components/toolbar/ExternalContextSelector.vue';
import type { ComposerCallbacks } from '@/features/chat/ui/vue/composer/composerCallbacks';
import { CALLBACKS_KEY } from '@/features/chat/ui/vue/composer/composerKeys';
import { createComposerPinia } from '@/features/chat/ui/vue/composer/composerPinia';
import type { ComposerExternalContextItem } from '@/features/chat/ui/vue/composer/stores/composerStore';
import { useComposerStore } from '@/features/chat/ui/vue/composer/stores/composerStore';

function stubCallbacks(): ComposerCallbacks {
  return {
    onAddExternalContext: vi.fn(),
    onRemoveExternalContext: vi.fn(),
    onToggleExternalContextPersistence: vi.fn(),
  } as unknown as ComposerCallbacks;
}

function mountSelector(cb: ComposerCallbacks) {
  const pinia = createComposerPinia();
  setActivePinia(pinia);
  const wrapper = mount(ExternalContextSelector, {
    global: { plugins: [pinia], provide: { [CALLBACKS_KEY as symbol]: cb } },
  });
  return { wrapper, store: useComposerStore() };
}

function setExternal(store: ReturnType<typeof useComposerStore>, items: ComposerExternalContextItem[]): void {
  store.setToolbar({ ...store.toolbar, externalContext: { count: items.length, items } });
}

describe('ExternalContextSelector.vue', () => {
  beforeEach(() => vi.clearAllMocks());

  it('always renders the selector and the dropdown (no visible flag, no open toggle)', () => {
    const { wrapper } = mountSelector(stubCallbacks());
    expect(wrapper.find('.specorator-external-context-selector').exists()).toBe(true);
    expect(wrapper.find('.specorator-external-context-dropdown').exists()).toBe(true);
    // No second/empty icon wrapper: exactly one hit target.
    expect(wrapper.findAll('.specorator-external-context-icon-wrapper')).toHaveLength(1);
  });

  it('shows the empty-state prompt when there are no external contexts', () => {
    const { wrapper } = mountSelector(stubCallbacks());
    expect(wrapper.find('.specorator-external-context-empty').text()).toBe('Click the folder icon to add');
  });

  it('clicking the folder icon wrapper fires onAddExternalContext', async () => {
    const cb = stubCallbacks();
    const { wrapper } = mountSelector(cb);
    await wrapper.find('.specorator-external-context-icon-wrapper').trigger('click');
    expect(cb.onAddExternalContext).toHaveBeenCalledTimes(1);
  });

  it('one external folder shows via the active icon + title, not the numeric badge', async () => {
    const { wrapper, store } = mountSelector(stubCallbacks());
    setExternal(store, [{ path: '/a', persistent: false }]);
    await wrapper.vm.$nextTick();

    const icon = wrapper.find('.specorator-external-context-icon');
    expect(icon.classes()).toContain('active');
    expect(icon.attributes('title')).toBeTruthy();
    expect(icon.attributes('title')).toBe('1 external context (click to add more)');

    const badge = wrapper.find('.specorator-external-context-badge');
    expect(badge.classes()).not.toContain('visible');
    expect(badge.text()).toBe('');
  });

  it('two external folders show the numeric badge', async () => {
    const { wrapper, store } = mountSelector(stubCallbacks());
    setExternal(store, [
      { path: '/a', persistent: false },
      { path: '/b', persistent: true },
    ]);
    await wrapper.vm.$nextTick();

    const badge = wrapper.find('.specorator-external-context-badge');
    expect(badge.classes()).toContain('visible');
    expect(badge.text()).toBe('2');
  });

  it('with no external folders the icon is not active', () => {
    const { wrapper } = mountSelector(stubCallbacks());
    expect(wrapper.find('.specorator-external-context-icon').classes()).not.toContain('active');
  });

  it('renders each item path and reflects persistence in the lock class', async () => {
    const { wrapper, store } = mountSelector(stubCallbacks());
    setExternal(store, [{ path: '/persist', persistent: true }]);
    await wrapper.vm.$nextTick();

    expect(wrapper.find('.specorator-external-context-text').text()).toBe('/persist');
    expect(wrapper.find('.specorator-external-context-lock').classes()).toContain('locked');
  });

  it('a session-only item has no locked class', async () => {
    const { wrapper, store } = mountSelector(stubCallbacks());
    setExternal(store, [{ path: '/session', persistent: false }]);
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.specorator-external-context-lock').classes()).not.toContain('locked');
  });

  it('clicking the lock fires onToggleExternalContextPersistence and × fires onRemoveExternalContext', async () => {
    const cb = stubCallbacks();
    const { wrapper, store } = mountSelector(cb);
    setExternal(store, [{ path: '/a', persistent: false }]);
    await wrapper.vm.$nextTick();

    await wrapper.find('.specorator-external-context-lock').trigger('click');
    expect(cb.onToggleExternalContextPersistence).toHaveBeenCalledWith('/a');

    await wrapper.find('.specorator-external-context-remove').trigger('click');
    expect(cb.onRemoveExternalContext).toHaveBeenCalledWith('/a');
  });
});
