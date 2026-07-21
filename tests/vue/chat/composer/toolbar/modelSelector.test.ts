import { mount } from '@vue/test-utils';
import { setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ProviderIconSvg } from '@/core/providers/types';
import ModelSelector from '@/features/chat/ui/vue/composer/components/toolbar/ModelSelector.vue';
import type { ComposerCallbacks } from '@/features/chat/ui/vue/composer/composerCallbacks';
import { CALLBACKS_KEY } from '@/features/chat/ui/vue/composer/composerKeys';
import { createComposerPinia } from '@/features/chat/ui/vue/composer/composerPinia';
import { useComposerStore } from '@/features/chat/ui/vue/composer/stores/composerStore';

// A real ProviderIconSvg DESCRIPTOR (object, not a string). createProviderIconSvg
// turns it into a live <svg> element — rendering the descriptor as text would
// print `[object Object]`.
const ICON: ProviderIconSvg = { kind: 'path', viewBox: '0 0 24 24', path: 'M0 0h24v24H0z' };

function stubCallbacks(): ComposerCallbacks {
  return {
    onSetModel: vi.fn(),
  } as unknown as ComposerCallbacks;
}

function mountSelector(cb: ComposerCallbacks) {
  const pinia = createComposerPinia();
  setActivePinia(pinia);
  return mount(ModelSelector, { global: { plugins: [pinia], provide: { [CALLBACKS_KEY as symbol]: cb } } });
}

describe('ModelSelector.vue', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders the contract root class', () => {
    const wrapper = mountSelector(stubCallbacks());
    expect(wrapper.find('.specorator-model-selector').exists()).toBe(true);
  });

  it('picking an option fires onSetModel with the option value and closes the dropdown', async () => {
    const cb = stubCallbacks();
    const wrapper = mountSelector(cb);
    const store = useComposerStore();
    store.setToolbar({
      ...store.toolbar,
      modelLabel: 'Sonnet',
      modelGroups: [{ label: 'Claude', options: [{ value: 'sonnet-id', label: 'Sonnet' }] }],
    });

    await wrapper.find('.specorator-model-btn').trigger('click');
    expect(wrapper.find('.specorator-model-dropdown').exists()).toBe(true);

    await wrapper.find('.specorator-model-option').trigger('click');
    expect(cb.onSetModel).toHaveBeenCalledWith('sonnet-id');
    expect(wrapper.find('.specorator-model-dropdown').exists()).toBe(false);
  });

  it('exposes native button semantics on the div trigger (role/tabindex/aria-haspopup + aria-expanded)', async () => {
    const wrapper = mountSelector(stubCallbacks());
    const trigger = wrapper.find('.specorator-model-btn');
    expect(trigger.attributes('role')).toBe('button');
    expect(trigger.attributes('tabindex')).toBe('0');
    expect(trigger.attributes('aria-haspopup')).toBe('listbox');
    expect(trigger.attributes('aria-expanded')).toBe('false');

    await trigger.trigger('click');
    expect(wrapper.find('.specorator-model-btn').attributes('aria-expanded')).toBe('true');
  });

  it('opens on Enter/Space keydown so keyboard users can reach the options', async () => {
    const wrapper = mountSelector(stubCallbacks());
    await wrapper.find('.specorator-model-btn').trigger('keydown', { key: 'Enter' });
    expect(wrapper.find('.specorator-model-dropdown').exists()).toBe(true);

    await wrapper.find('.specorator-model-btn').trigger('keydown', { key: 'Enter' });
    expect(wrapper.find('.specorator-model-dropdown').exists()).toBe(false);

    await wrapper.find('.specorator-model-btn').trigger('keydown', { key: ' ' });
    expect(wrapper.find('.specorator-model-dropdown').exists()).toBe(true);
  });

  it('activating an option by keyboard fires onSetModel and closes the dropdown', async () => {
    const cb = stubCallbacks();
    const wrapper = mountSelector(cb);
    const store = useComposerStore();
    store.setToolbar({
      ...store.toolbar,
      modelLabel: 'Sonnet',
      modelGroups: [{ label: 'Claude', options: [{ value: 'sonnet-id', label: 'Sonnet' }] }],
    });

    await wrapper.find('.specorator-model-btn').trigger('keydown', { key: 'Enter' });
    const option = wrapper.find('.specorator-model-option');
    expect(option.attributes('role')).toBe('option');
    expect(option.attributes('aria-selected')).toBe('true');

    await option.trigger('keydown', { key: 'Enter' });
    expect(cb.onSetModel).toHaveBeenCalledWith('sonnet-id');
    expect(wrapper.find('.specorator-model-dropdown').exists()).toBe(false);
  });

  it('Escape closes the dropdown', async () => {
    const wrapper = mountSelector(stubCallbacks());
    await wrapper.find('.specorator-model-btn').trigger('click');
    expect(wrapper.find('.specorator-model-dropdown').exists()).toBe(true);

    await wrapper.find('.specorator-model-selector').trigger('keydown', { key: 'Escape' });
    expect(wrapper.find('.specorator-model-dropdown').exists()).toBe(false);
  });

  it('renders a ProviderIconSvg descriptor as a REAL svg element, not [object Object]', async () => {
    const wrapper = mountSelector(stubCallbacks());
    const store = useComposerStore();
    store.setToolbar({
      ...store.toolbar,
      modelLabel: 'Sonnet',
      modelGroups: [{ label: 'Claude', options: [{ value: 'sonnet-id', label: 'Sonnet', providerIcon: ICON }] }],
    });

    await wrapper.find('.specorator-model-btn').trigger('click');

    const svg = wrapper.find('.specorator-model-provider-icon svg');
    expect(svg.exists()).toBe(true);
    expect(svg.element.tagName.toLowerCase()).toBe('svg');
    expect(wrapper.html()).not.toContain('[object Object]');
  });
});
