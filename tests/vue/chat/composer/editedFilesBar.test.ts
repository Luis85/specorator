import { mount } from '@vue/test-utils';
import { setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';

import EditedFilesBar from '@/features/chat/ui/vue/composer/components/EditedFilesBar.vue';
import type { ComposerCallbacks } from '@/features/chat/ui/vue/composer/composerCallbacks';
import { CALLBACKS_KEY } from '@/features/chat/ui/vue/composer/composerKeys';
import { createComposerPinia } from '@/features/chat/ui/vue/composer/composerPinia';
import { type ComposerEditedFile, useComposerStore } from '@/features/chat/ui/vue/composer/stores/composerStore';

const ENTRIES: ComposerEditedFile[] = [
  { path: 'src/new.ts', changeKind: 'created', name: 'new.ts', dir: 'src' },
  { path: 'docs/readme.md', changeKind: 'edited', name: 'readme.md', dir: 'docs' },
];

function stubCallbacks(): ComposerCallbacks {
  return { onOpenEditedFile: vi.fn() } as unknown as ComposerCallbacks;
}

function mountBar(cb: ComposerCallbacks) {
  const pinia = createComposerPinia();
  setActivePinia(pinia);
  // The dismissal listeners are bound to the SFC's own lifecycle on the
  // element's ownerDocument (the global document in jsdom), NOT the injected
  // long-lived component; spy the document so we can invoke handlers and assert
  // they are torn down on unmount.
  const addSpy = vi.spyOn(document, 'addEventListener');
  const removeSpy = vi.spyOn(document, 'removeEventListener');
  const wrapper = mount(EditedFilesBar, {
    global: {
      plugins: [pinia],
      provide: {
        [CALLBACKS_KEY as symbol]: cb,
      },
    },
  });
  return { wrapper, store: useComposerStore(), addSpy, removeSpy };
}

function docHandler(addSpy: MockInstance, type: string): (event: unknown) => void {
  const call = addSpy.mock.calls.find((c) => c[0] === type);
  if (!call) throw new Error(`no document addEventListener for ${type}`);
  return call[1] as (event: unknown) => void;
}

describe('EditedFilesBar.vue', () => {
  beforeEach(() => vi.clearAllMocks());

  it('hides the row and renders no badge when there are no edited files', () => {
    const { wrapper } = mountBar(stubCallbacks());
    const row = wrapper.find('.specorator-edited-files-row');
    expect(row.classes()).toContain('specorator-hidden');
    expect(row.classes()).not.toContain('specorator-visible-flex');
    expect(wrapper.find('.specorator-edited-files-badge').exists()).toBe(false);
  });

  it('renders the badge with the kind-split count once entries exist', async () => {
    const { wrapper, store } = mountBar(stubCallbacks());
    store.setEditedFiles(ENTRIES);
    await wrapper.vm.$nextTick();

    const row = wrapper.find('.specorator-edited-files-row');
    expect(row.classes()).toContain('specorator-visible-flex');
    expect(row.classes()).not.toContain('specorator-hidden');
    expect(wrapper.find('.specorator-edited-files-badge').exists()).toBe(true);
    expect(wrapper.find('.specorator-edited-files-badge-count').text()).toBe('1 created · 1 edited');
    // Popover is closed until the badge is clicked.
    expect(wrapper.find('.specorator-edited-files-menu').exists()).toBe(false);
  });

  it('toggles the popover open and closed on badge click', async () => {
    const { wrapper, store } = mountBar(stubCallbacks());
    store.setEditedFiles(ENTRIES);
    await wrapper.vm.$nextTick();

    const badge = wrapper.find('.specorator-edited-files-badge');
    await badge.trigger('click');
    expect(wrapper.find('.specorator-edited-files-menu').exists()).toBe(true);
    const items = wrapper.findAll('.specorator-edited-files-item');
    expect(items).toHaveLength(2);
    expect(items[0].classes()).toContain('specorator-edited-files-item--created');
    expect(items[1].classes()).toContain('specorator-edited-files-item--edited');

    await badge.trigger('click');
    expect(wrapper.find('.specorator-edited-files-menu').exists()).toBe(false);
  });

  it('closes the popover on Escape (document keydown)', async () => {
    const { wrapper, store, addSpy } = mountBar(stubCallbacks());
    store.setEditedFiles(ENTRIES);
    await wrapper.vm.$nextTick();
    await wrapper.find('.specorator-edited-files-badge').trigger('click');
    expect(wrapper.find('.specorator-edited-files-menu').exists()).toBe(true);

    docHandler(addSpy, 'keydown')({ key: 'Escape' });
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.specorator-edited-files-menu').exists()).toBe(false);
  });

  it('closes the popover on an outside mousedown but not on an inside one', async () => {
    const { wrapper, store, addSpy } = mountBar(stubCallbacks());
    store.setEditedFiles(ENTRIES);
    await wrapper.vm.$nextTick();
    await wrapper.find('.specorator-edited-files-badge').trigger('click');
    const mousedown = docHandler(addSpy, 'mousedown');

    // Inside the popover root: stays open.
    const badgeEl = wrapper.find('.specorator-edited-files-badge').element;
    mousedown({ target: badgeEl });
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.specorator-edited-files-menu').exists()).toBe(true);

    // Outside: closes.
    mousedown({ target: document.body });
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.specorator-edited-files-menu').exists()).toBe(false);
  });

  it('activates a row by click, firing onOpenEditedFile and closing the popover', async () => {
    const cb = stubCallbacks();
    const { wrapper, store } = mountBar(cb);
    store.setEditedFiles(ENTRIES);
    await wrapper.vm.$nextTick();
    await wrapper.find('.specorator-edited-files-badge').trigger('click');

    await wrapper.findAll('.specorator-edited-files-item')[1].trigger('click');
    expect(cb.onOpenEditedFile).toHaveBeenCalledWith('docs/readme.md');
    expect(wrapper.find('.specorator-edited-files-menu').exists()).toBe(false);
  });

  it('activates a row by Enter and Space keydown', async () => {
    const cb = stubCallbacks();
    const { wrapper, store } = mountBar(cb);
    store.setEditedFiles(ENTRIES);
    await wrapper.vm.$nextTick();

    await wrapper.find('.specorator-edited-files-badge').trigger('click');
    await wrapper.findAll('.specorator-edited-files-item')[0].trigger('keydown.enter');
    expect(cb.onOpenEditedFile).toHaveBeenNthCalledWith(1, 'src/new.ts');

    await wrapper.find('.specorator-edited-files-badge').trigger('click');
    await wrapper.findAll('.specorator-edited-files-item')[1].trigger('keydown.space');
    expect(cb.onOpenEditedFile).toHaveBeenNthCalledWith(2, 'docs/readme.md');
  });

  it('closes an open popover when the edited-files list drains to empty', async () => {
    const { wrapper, store } = mountBar(stubCallbacks());
    store.setEditedFiles(ENTRIES);
    await wrapper.vm.$nextTick();
    await wrapper.find('.specorator-edited-files-badge').trigger('click');
    expect(wrapper.find('.specorator-edited-files-menu').exists()).toBe(true);

    store.setEditedFiles([]);
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.specorator-edited-files-row').classes()).toContain('specorator-hidden');

    // Reappearing entries must not re-open the stale popover.
    store.setEditedFiles(ENTRIES);
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.specorator-edited-files-menu').exists()).toBe(false);
  });

  it('removes its document listeners on unmount so a closed tab leaves no dangling handler', () => {
    const { wrapper, addSpy, removeSpy } = mountBar(stubCallbacks());
    const mousedown = docHandler(addSpy, 'mousedown');
    const keydown = docHandler(addSpy, 'keydown');

    wrapper.unmount();

    expect(removeSpy).toHaveBeenCalledWith('mousedown', mousedown);
    expect(removeSpy).toHaveBeenCalledWith('keydown', keydown);
  });
});
