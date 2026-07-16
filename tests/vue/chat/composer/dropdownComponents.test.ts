import { flushPromises, mount } from '@vue/test-utils';
import { setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Component } from 'vue';

import { CALLBACKS_KEY } from '@/features/chat/ui/vue/composer/composerKeys';
import { createComposerPinia } from '@/features/chat/ui/vue/composer/composerPinia';
import MentionDropdown from '@/features/chat/ui/vue/composer/dropdowns/MentionDropdown.vue';
import ResumeSessionDropdown from '@/features/chat/ui/vue/composer/dropdowns/ResumeSessionDropdown.vue';
import SlashCommandDropdown from '@/features/chat/ui/vue/composer/dropdowns/SlashCommandDropdown.vue';
import type { ComposerDropdownItem, ComposerDropdownKind } from '@/features/chat/ui/vue/composer/stores/composerStore';
import { useComposerStore } from '@/features/chat/ui/vue/composer/stores/composerStore';

const onDropdownSelect = vi.fn();

function mountDropdown(component: Component) {
  const pinia = createComposerPinia();
  setActivePinia(pinia);
  const wrapper = mount(component, {
    global: {
      plugins: [pinia],
      provide: { [CALLBACKS_KEY as symbol]: { onDropdownSelect } },
    },
  });
  return { wrapper, store: useComposerStore() };
}

function setDropdown(
  store: ReturnType<typeof useComposerStore>,
  kind: ComposerDropdownKind,
  items: ComposerDropdownItem[],
  activeIndex = 0,
) {
  store.setDropdown({ kind, items, activeIndex, anchorRect: { top: 100, left: 20, width: 320 } });
}

describe('composer dropdown components', () => {
  beforeEach(() => vi.clearAllMocks());

  it('SlashCommandDropdown renders only on kind=slash, sets anchor vars, and .selected marks the active item', async () => {
    const { wrapper, store } = mountDropdown(SlashCommandDropdown);
    expect(wrapper.find('.specorator-slash-dropdown').exists()).toBe(false);

    // A non-matching kind keeps it hidden.
    setDropdown(store, 'mention', [{ id: 'a', primary: '@a' }]);
    await flushPromises();
    expect(wrapper.find('.specorator-slash-dropdown').exists()).toBe(false);

    setDropdown(store, 'slash', [
      { id: '/clear', primary: '/clear', secondary: 'reset', hint: '[msg]' },
      { id: '/help', primary: '/help' },
    ], 1);
    await flushPromises();

    const root = wrapper.find('.specorator-slash-dropdown');
    expect(root.exists()).toBe(true);
    expect(root.classes()).toContain('specorator-slash-dropdown-fixed');
    expect(root.classes()).toContain('visible');
    // window.innerHeight - top(100) + 4 in jsdom (innerHeight 768) → 672px.
    const style = root.attributes('style') ?? '';
    expect(style).toContain(`--specorator-fixed-dropdown-bottom: ${window.innerHeight - 100 + 4}px`);
    expect(style).toContain('--specorator-fixed-dropdown-left: 20px');
    expect(style).toContain('--specorator-fixed-dropdown-width: 320px');

    const items = wrapper.findAll('.specorator-slash-item');
    expect(items).toHaveLength(2);
    expect(items[0].classes()).not.toContain('selected');
    expect(items[1].classes()).toContain('selected');
    // Child classes match the existing stylesheet.
    expect(items[0].find('.specorator-slash-name').text()).toBe('/clear');
    expect(items[0].find('.specorator-slash-hint').text()).toBe('[msg]');
    expect(items[0].find('div.specorator-slash-desc').text()).toBe('reset');
    // Slash items carry no leading glyph (parity) — the first child is the name.
    expect(items[0].element.firstElementChild?.classList.contains('specorator-slash-name')).toBe(true);
  });

  it('SlashCommandDropdown fires onDropdownSelect(i) on mousedown (not click)', async () => {
    const { wrapper, store } = mountDropdown(SlashCommandDropdown);
    setDropdown(store, 'slash', [{ id: '/a', primary: '/a' }, { id: '/b', primary: '/b' }], 0);
    await flushPromises();

    await wrapper.findAll('.specorator-slash-item')[1].trigger('mousedown');
    expect(onDropdownSelect).toHaveBeenCalledWith(1);
  });

  it('SlashCommandDropdown renders the empty state when there are no items', async () => {
    const { wrapper, store } = mountDropdown(SlashCommandDropdown);
    setDropdown(store, 'slash', []);
    await flushPromises();
    expect(wrapper.find('.specorator-slash-item').exists()).toBe(false);
    expect(wrapper.find('.specorator-slash-empty').text()).toBe('No matching commands');
  });

  it('MentionDropdown renders only on kind=mention with variant + child classes and anchor vars', async () => {
    const { wrapper, store } = mountDropdown(MentionDropdown);
    expect(wrapper.find('.specorator-mention-dropdown').exists()).toBe(false);

    setDropdown(store, 'mention', [
      { id: 'agent:x', primary: '@x', secondary: 'an agent', variant: 'agent', iconId: 'bot' },
      { id: 'file:y', primary: 'y.md', iconId: 'file-text' },
    ], 0);
    await flushPromises();

    const root = wrapper.find('.specorator-mention-dropdown');
    expect(root.exists()).toBe(true);
    expect(root.classes()).toContain('specorator-mention-dropdown-fixed');
    expect(root.classes()).toContain('visible');
    expect(root.attributes('style')).toContain('--specorator-fixed-dropdown-width: 320px');

    const items = wrapper.findAll('.specorator-mention-item');
    expect(items[0].classes()).toContain('agent');
    expect(items[0].classes()).toContain('selected');
    // Leading glyph parity: every mention item paints a .specorator-mention-icon.
    expect(items[0].find('.specorator-mention-icon').exists()).toBe(true);
    expect(items[0].find('.specorator-mention-text .specorator-mention-name').text()).toBe('@x');
    expect(items[0].find('.specorator-mention-agent-desc').text()).toBe('an agent');

    await items[1].trigger('mousedown');
    expect(onDropdownSelect).toHaveBeenCalledWith(1);
  });

  it('MentionDropdown paints the appendMcpIcon glyph for the mcp sentinel', async () => {
    const { wrapper, store } = mountDropdown(MentionDropdown);
    setDropdown(store, 'mention', [{ id: 'mcp:ctx7', primary: '@ctx7', variant: 'mcp-server', iconId: 'mcp' }]);
    await flushPromises();
    // 'mcp' routes to appendMcpIcon (a real inline SVG), not the no-op setIcon mock.
    expect(wrapper.find('.specorator-mention-item.mcp-server .specorator-mention-icon svg').exists()).toBe(true);
  });

  it('ResumeSessionDropdown renders a header + CSS-flow dropup (no fixed vars) with title/date children', async () => {
    const { wrapper, store } = mountDropdown(ResumeSessionDropdown);
    expect(wrapper.find('.specorator-resume-dropdown').exists()).toBe(false);

    setDropdown(store, 'resume', [
      { id: 'c1', primary: 'First chat', secondary: 'Current session', variant: 'current' },
      { id: 'c2', primary: 'Older chat', secondary: 'Jul 1' },
    ], 0);
    await flushPromises();

    const root = wrapper.find('.specorator-resume-dropdown');
    expect(root.exists()).toBe(true);
    expect(root.classes()).toContain('visible');
    // Resume is a CSS-flow dropup — no fixed-position class or style vars.
    expect(root.classes()).not.toContain('specorator-resume-dropdown-fixed');
    expect(root.attributes('style') ?? '').not.toContain('--specorator-fixed-dropdown-bottom');
    expect(wrapper.find('.specorator-resume-header').text()).toBe('Resume conversation');
    expect(wrapper.find('.specorator-resume-list').exists()).toBe(true);

    const items = wrapper.findAll('.specorator-resume-item');
    expect(items[0].classes()).toContain('current');
    expect(items[0].find('div.specorator-resume-item-content div.specorator-resume-item-title').text()).toBe('First chat');
    expect(items[0].find('div.specorator-resume-item-date').text()).toBe('Current session');

    await items[1].trigger('mousedown');
    expect(onDropdownSelect).toHaveBeenCalledWith(1);
  });
});
