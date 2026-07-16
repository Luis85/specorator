import { mount } from '@vue/test-utils';
import { setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ThinkingBudgetSelector from '@/features/chat/ui/vue/composer/components/toolbar/ThinkingBudgetSelector.vue';
import type { ComposerCallbacks } from '@/features/chat/ui/vue/composer/composerCallbacks';
import { CALLBACKS_KEY } from '@/features/chat/ui/vue/composer/composerKeys';
import { createComposerPinia } from '@/features/chat/ui/vue/composer/composerPinia';
import { type ComposerReasoningControl, useComposerStore } from '@/features/chat/ui/vue/composer/stores/composerStore';

function stubCallbacks(): ComposerCallbacks {
  return { onSetThinkingBudget: vi.fn(), onSetEffortLevel: vi.fn() } as unknown as ComposerCallbacks;
}

function mountSelector(cb: ComposerCallbacks) {
  const pinia = createComposerPinia();
  setActivePinia(pinia);
  const wrapper = mount(ThinkingBudgetSelector, {
    global: { plugins: [pinia], provide: { [CALLBACKS_KEY as symbol]: cb } },
  });
  return { wrapper, store: useComposerStore() };
}

const BUDGET: ComposerReasoningControl = {
  label: 'Thinking', current: 'Medium',
  options: [{ value: 'low', label: 'Low' }, { value: 'medium', label: 'Medium' }, { value: 'high', label: 'High' }],
};
const EFFORT: ComposerReasoningControl = {
  label: 'Effort', current: 'Low',
  options: [{ value: 'minimal', label: 'Minimal' }, { value: 'low', label: 'Low' }, { value: 'high', label: 'High' }],
};

describe('ThinkingBudgetSelector.vue', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders nothing when store.toolbar.reasoning is null', () => {
    const { wrapper } = mountSelector(stubCallbacks());
    expect(wrapper.find('.specorator-thinking-selector').exists()).toBe(false);
  });

  it('non-adaptive projection renders ONLY the budget control and fires onSetThinkingBudget', async () => {
    const cb = stubCallbacks();
    const { wrapper, store } = mountSelector(cb);
    store.setToolbar({ ...store.toolbar, reasoning: { budget: BUDGET, effort: null } });
    await wrapper.vm.$nextTick();

    expect(wrapper.find('.specorator-thinking-budget').exists()).toBe(true);
    expect(wrapper.find('.specorator-thinking-effort').exists()).toBe(false);

    const gears = wrapper.findAll('.specorator-thinking-budget .specorator-thinking-gear');
    await gears[2].trigger('click');
    expect(cb.onSetThinkingBudget).toHaveBeenCalledWith('high');
    expect(cb.onSetEffortLevel).not.toHaveBeenCalled();
  });

  it('adaptive projection renders ONLY the effort control and fires onSetEffortLevel', async () => {
    const cb = stubCallbacks();
    const { wrapper, store } = mountSelector(cb);
    store.setToolbar({ ...store.toolbar, reasoning: { budget: null, effort: EFFORT } });
    await wrapper.vm.$nextTick();

    expect(wrapper.find('.specorator-thinking-effort').exists()).toBe(true);
    expect(wrapper.find('.specorator-thinking-budget').exists()).toBe(false);

    const gears = wrapper.findAll('.specorator-thinking-effort .specorator-thinking-gear');
    await gears[0].trigger('click');
    expect(cb.onSetEffortLevel).toHaveBeenCalledWith('minimal');
    expect(cb.onSetThinkingBudget).not.toHaveBeenCalled();
  });
});
