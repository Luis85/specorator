import { mount } from '@vue/test-utils';
import { setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import McpServerSelector from '@/features/chat/ui/vue/composer/components/toolbar/McpServerSelector.vue';
import type { ComposerCallbacks } from '@/features/chat/ui/vue/composer/composerCallbacks';
import { CALLBACKS_KEY } from '@/features/chat/ui/vue/composer/composerKeys';
import { createComposerPinia } from '@/features/chat/ui/vue/composer/composerPinia';
import type { ComposerMcpServer } from '@/features/chat/ui/vue/composer/stores/composerStore';
import { useComposerStore } from '@/features/chat/ui/vue/composer/stores/composerStore';

function stubCallbacks(): ComposerCallbacks {
  return { onToggleMcpServer: vi.fn() } as unknown as ComposerCallbacks;
}

function mountSelector(cb: ComposerCallbacks) {
  const pinia = createComposerPinia();
  setActivePinia(pinia);
  const wrapper = mount(McpServerSelector, {
    global: { plugins: [pinia], provide: { [CALLBACKS_KEY as symbol]: cb } },
  });
  return { wrapper, store: useComposerStore() };
}

function setMcp(store: ReturnType<typeof useComposerStore>, count: number, servers: ComposerMcpServer[]): void {
  store.setToolbar({ ...store.toolbar, mcp: { visible: true, count, servers } });
}

describe('McpServerSelector.vue', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders nothing when store.toolbar.mcp.visible is false', () => {
    const { wrapper } = mountSelector(stubCallbacks());
    expect(wrapper.find('.specorator-mcp-selector').exists()).toBe(false);
  });

  it('renders when visible; dropdown is always in the DOM (no open flag)', async () => {
    const { wrapper, store } = mountSelector(stubCallbacks());
    setMcp(store, 0, []);
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.specorator-mcp-selector').exists()).toBe(true);
    expect(wrapper.find('.specorator-mcp-selector-dropdown').exists()).toBe(true);
    expect(wrapper.find('.specorator-mcp-selector-empty').text()).toBe('None');
  });

  it('one enabled server shows via the active icon + title, not the numeric badge', async () => {
    const { wrapper, store } = mountSelector(stubCallbacks());
    setMcp(store, 1, [{ name: 'srv', enabled: true, contextSaving: false }]);
    await wrapper.vm.$nextTick();

    const icon = wrapper.find('.specorator-mcp-selector-icon');
    expect(icon.classes()).toContain('active');
    expect(icon.attributes('title')).toBeTruthy();
    expect(icon.attributes('title')).toBe('1 MCP server enabled (click to manage)');

    const badge = wrapper.find('.specorator-mcp-selector-badge');
    expect(badge.classes()).not.toContain('visible');
    expect(badge.text()).toBe('');
  });

  it('two enabled servers show the numeric badge', async () => {
    const { wrapper, store } = mountSelector(stubCallbacks());
    setMcp(store, 2, [
      { name: 'a', enabled: true, contextSaving: false },
      { name: 'b', enabled: true, contextSaving: false },
    ]);
    await wrapper.vm.$nextTick();

    const badge = wrapper.find('.specorator-mcp-selector-badge');
    expect(badge.classes()).toContain('visible');
    expect(badge.text()).toBe('2');
  });

  it('with no enabled servers the icon is not active', async () => {
    const { wrapper, store } = mountSelector(stubCallbacks());
    setMcp(store, 0, []);
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.specorator-mcp-selector-icon').classes()).not.toContain('active');
  });

  it('paints the branded MCP glyph when visibility flips false→true after mount (v-if repaint)', async () => {
    const { wrapper, store } = mountSelector(stubCallbacks());
    // Mounted hidden (root v-if false): the icon element does not exist yet, so
    // the onMounted-era paint had nothing to write to.
    expect(wrapper.find('.specorator-mcp-selector-icon').exists()).toBe(false);

    setMcp(store, 0, []);
    await wrapper.vm.$nextTick();

    const icon = wrapper.find('.specorator-mcp-selector-icon');
    expect(icon.exists()).toBe(true);
    // The branded SVG must land on the newly-inserted element, not stay blank.
    expect(icon.element.querySelector('svg')).not.toBeNull();
  });

  it('clicking a server item fires onToggleMcpServer with its name', async () => {
    const cb = stubCallbacks();
    const { wrapper, store } = mountSelector(cb);
    setMcp(store, 0, [{ name: 'srv', enabled: false, contextSaving: false }]);
    await wrapper.vm.$nextTick();

    await wrapper.find('.specorator-mcp-selector-item').trigger('click');
    expect(cb.onToggleMcpServer).toHaveBeenCalledTimes(1);
    expect(cb.onToggleMcpServer).toHaveBeenCalledWith('srv');
  });
});
