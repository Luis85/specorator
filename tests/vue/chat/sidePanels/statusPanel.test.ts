import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import StatusPanel from '@/features/chat/ui/vue/tabChrome/StatusPanel.vue';
import { useTabChromeStore } from '@/features/chat/ui/vue/tabChrome/stores/tabChromeStore';
import { CALLBACKS_KEY } from '@/features/chat/ui/vue/tabChrome/tabChromeKeys';

import { chromeCallbacks } from './helpers';

vi.mock('obsidian', () => ({ setIcon: (el: HTMLElement, n: string) => el.setAttribute('data-icon', n), Notice: vi.fn() }));
vi.mock('@/i18n/i18n', () => ({ t: (k: string) => k }));

function mountPanel(cb: Record<string, unknown> = {}) {
  return mount(StatusPanel, { global: { provide: { [CALLBACKS_KEY as symbol]: chromeCallbacks(cb) } } });
}

describe('StatusPanel.vue', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('renders todos with legacy classes', async () => {
    const store = useTabChromeStore();
    store.setTodos([{ content: 'Do it', status: 'pending', activeForm: 'Doing it' }] as never);
    const w = mountPanel();
    await w.vm.$nextTick();
    expect(w.find('.specorator-status-panel-todos').classes()).not.toContain('specorator-hidden');
    expect(w.find('.specorator-todo-item').exists()).toBe(true);
  });

  it('renders bash outputs and fires clear', async () => {
    const store = useTabChromeStore();
    store.setBashOutputs([{ id: 'a', command: 'ls', status: 'completed', output: 'files' }] as never);
    const onClearBashOutputs = vi.fn();
    const w = mountPanel({ onClearBashOutputs });
    await w.vm.$nextTick();
    expect(w.find('.specorator-status-panel-bash').classes()).not.toContain('specorator-hidden');
    expect(w.find('.specorator-status-panel-bash-entry').exists()).toBe(true);
    await w.find('.specorator-status-panel-bash-action-clear').trigger('click');
    expect(onClearBashOutputs).toHaveBeenCalled();
  });

  it('hides both sections when empty', () => {
    const w = mountPanel();
    expect(w.find('.specorator-status-panel-todos').classes()).toContain('specorator-hidden');
    expect(w.find('.specorator-status-panel-bash').classes()).toContain('specorator-hidden');
  });

  it('pins bash content to the bottom on data updates but not on expand toggles', async () => {
    const store = useTabChromeStore();
    store.setBashOutputs([{ id: 'a', command: 'ls', status: 'running', output: '' }] as never);
    const w = mountPanel();
    await w.vm.$nextTick();
    const content = w.find('.specorator-status-panel-bash-content').element as HTMLElement;
    Object.defineProperty(content, 'scrollHeight', { value: 500, configurable: true });

    // A data update (fresh array identity, changed status/output) scrolls to bottom.
    store.setBashOutputs([{ id: 'a', command: 'ls', status: 'completed', output: 'long output' }] as never);
    await w.vm.$nextTick();
    await w.vm.$nextTick();
    expect(content.scrollTop).toBe(500);

    // A re-projection with identical content (fresh identity, same data) must NOT
    // re-pin — the user's manual scroll position survives.
    content.scrollTop = 3;
    store.setBashOutputs([{ id: 'a', command: 'ls', status: 'completed', output: 'long output' }] as never);
    await w.vm.$nextTick();
    await w.vm.$nextTick();
    expect(content.scrollTop).toBe(3);

    // Collapsing/expanding the panel never scrolls.
    await w.find('.specorator-status-panel-bash-header').trigger('click');
    await w.find('.specorator-status-panel-bash-header').trigger('click');
    expect(content.scrollTop).toBe(3);
  });
});
