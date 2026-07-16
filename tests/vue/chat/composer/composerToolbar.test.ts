import { mount } from '@vue/test-utils';
import { setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ComposerToolbar from '@/features/chat/ui/vue/composer/components/ComposerToolbar.vue';
import type { ComposerCallbacks } from '@/features/chat/ui/vue/composer/composerCallbacks';
import { CALLBACKS_KEY } from '@/features/chat/ui/vue/composer/composerKeys';
import { createComposerPinia } from '@/features/chat/ui/vue/composer/composerPinia';
import { type ComposerToolbarState, useComposerStore } from '@/features/chat/ui/vue/composer/stores/composerStore';

// The nine widgets inject CALLBACKS_KEY to fire their actions; a broad stub is
// enough for a render/visibility test.
function stubCallbacks(): ComposerCallbacks {
  return {
    onSetModel: vi.fn(), onSetMode: vi.fn(), onSetThinkingBudget: vi.fn(),
    onSetEffortLevel: vi.fn(), onSetServiceTier: vi.fn(), onSetPermission: vi.fn(),
    onTogglePlanMode: vi.fn(), onToggleMcpServer: vi.fn(), onAddExternalContext: vi.fn(),
    onRemoveExternalContext: vi.fn(), onToggleExternalContextPersistence: vi.fn(),
  } as unknown as ComposerCallbacks;
}

// A toolbar slice with every widget's visibility condition satisfied.
const FULL_TOOLBAR: ComposerToolbarState = {
  modelLabel: 'Sonnet',
  modelGroups: [{ label: null, options: [{ value: 'sonnet', label: 'Sonnet' }] }],
  mode: {
    label: 'Ask', value: 'ask', activeValue: 'agent', active: false,
    title: 'Ask ↔ Agent',
    options: [{ value: 'ask', label: 'Ask' }, { value: 'agent', label: 'Agent' }],
  },
  reasoning: { budget: { label: 'Thinking:', current: 'Off', options: [{ value: 'off', label: 'Off' }] }, effort: null },
  serviceTier: { active: false, activeValue: 'priority', inactiveValue: 'default' },
  permission: {
    visible: true, label: 'Ask', active: false, planActive: false,
    switchVisible: true, activeValue: 'yolo', inactiveValue: 'normal',
  },
  planMode: { visible: true, active: false },
  mcp: { visible: true, count: 0, servers: [] },
  externalContext: { count: 0, items: [] },
  usage: { percentage: 10, tooltip: '10%', warning: false },
};

// The nine widget root classes in the exact createInputToolbar order.
const WIDGET_ROOTS = [
  '.specorator-model-selector',
  '.specorator-thinking-selector',
  '.specorator-service-tier-toggle',
  '.specorator-context-meter',
  '.specorator-external-context-selector',
  '.specorator-mcp-selector',
  '.specorator-permission-toggle',
  '.specorator-plan-mode-toggle',
  '.specorator-mode-selector',
];

function mountToolbar() {
  const pinia = createComposerPinia();
  setActivePinia(pinia);
  const wrapper = mount(ComposerToolbar, {
    global: { plugins: [pinia], provide: { [CALLBACKS_KEY as symbol]: stubCallbacks() } },
  });
  return { wrapper, store: useComposerStore() };
}

describe('ComposerToolbar.vue', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders the toolbar root', () => {
    const { wrapper } = mountToolbar();
    expect(wrapper.find('.specorator-input-toolbar').exists()).toBe(true);
  });

  it('renders all nine widget root classes when the full toolbar slice is projected', async () => {
    const { wrapper, store } = mountToolbar();
    store.setToolbar({ ...FULL_TOOLBAR });
    await wrapper.vm.$nextTick();
    for (const root of WIDGET_ROOTS) {
      expect(wrapper.find(root).exists()).toBe(true);
    }
  });

  it('omits a hidden widget (mode: null) while keeping the others', async () => {
    const { wrapper, store } = mountToolbar();
    store.setToolbar({ ...FULL_TOOLBAR, mode: null });
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.specorator-mode-selector').exists()).toBe(false);
    // A sibling still renders — the toolbar is not wholesale hidden.
    expect(wrapper.find('.specorator-model-selector').exists()).toBe(true);
  });
});
