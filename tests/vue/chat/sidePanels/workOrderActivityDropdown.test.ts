import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CALLBACKS_KEY } from '@/features/chat/ui/vue/chatShellKeys';
import WorkOrderActivityDropdown from '@/features/chat/ui/vue/components/WorkOrderActivityDropdown.vue';
import { useChatShellStore } from '@/features/chat/ui/vue/stores/chatShellStore';

import { shellCallbacks } from './helpers';

vi.mock('obsidian', () => ({ setIcon: (el: HTMLElement, n: string) => el.setAttribute('data-icon', n) }));
vi.mock('@/i18n/i18n', () => ({ t: (k: string) => k }));

const SUMMARY = {
  items: [{ id: 'i1', path: 'p', title: 'Run 1', status: 'running', labelKey: 'k.l', actionHintKey: 'k.a', sidepanelTabId: null }],
  closableTabs: [{ tabId: 't1', title: 'Done 1' }],
  runningCount: 1, attentionCount: 0,
};

function mountDd(cb: Record<string, unknown> = {}) {
  return mount(WorkOrderActivityDropdown, {
    global: { provide: { [CALLBACKS_KEY as symbol]: shellCallbacks(cb) } },
  });
}

describe('WorkOrderActivityDropdown.vue', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('hides when empty and shows toggle + count when populated', async () => {
    const store = useChatShellStore();
    const w = mountDd();
    expect(w.find('.specorator-work-order-activity-slot').classes()).toContain('specorator-hidden');
    store.setWorkOrder(SUMMARY as never);
    await w.vm.$nextTick();
    expect(w.find('.specorator-work-order-activity-slot').classes()).not.toContain('specorator-hidden');
    expect(w.find('.specorator-work-order-activity-toggle').exists()).toBe(true);
    expect(w.find('.specorator-work-order-activity-count').text()).toBe('2');
  });

  it('opens the menu, opens an item, and closes a finished tab', async () => {
    const store = useChatShellStore();
    store.setWorkOrder(SUMMARY as never);
    const onOpenWorkOrderItem = vi.fn();
    const onCloseWorkOrderTab = vi.fn();
    const w = mountDd({ onOpenWorkOrderItem, onCloseWorkOrderTab });
    await w.find('.specorator-work-order-activity-toggle').trigger('click');
    expect(w.find('.specorator-work-order-activity-menu').exists()).toBe(true);
    await w.find('.specorator-work-order-activity-close').trigger('click');
    expect(onCloseWorkOrderTab).toHaveBeenCalledWith('t1');
    await w.find('.specorator-work-order-activity-item').trigger('click');
    expect(onOpenWorkOrderItem).toHaveBeenCalledWith('i1');
  });
  it('stays closed when items return after the summary drained to empty', async () => {
    const store = useChatShellStore();
    store.setWorkOrder(SUMMARY as never);
    const w = mountDd();
    await w.find('.specorator-work-order-activity-toggle').trigger('click');
    expect(w.find('.specorator-work-order-activity-menu').exists()).toBe(true);
    // Drain: the collapse watch must reset the local open state...
    store.setWorkOrder({ items: [], closableTabs: [], runningCount: 0, attentionCount: 0 } as never);
    await w.vm.$nextTick();
    expect(w.find('.specorator-work-order-activity-slot').classes()).toContain('specorator-hidden');
    // ...so a later item does NOT auto-reopen the menu.
    store.setWorkOrder(SUMMARY as never);
    await w.vm.$nextTick();
    expect(w.find('.specorator-work-order-activity-menu').exists()).toBe(false);
  });
});
