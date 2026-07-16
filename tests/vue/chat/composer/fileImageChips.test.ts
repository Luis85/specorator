import { mount } from '@vue/test-utils';
import { setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import FileChips from '@/features/chat/ui/vue/composer/components/context/FileChips.vue';
import ImageChips from '@/features/chat/ui/vue/composer/components/context/ImageChips.vue';
import type { ComposerCallbacks } from '@/features/chat/ui/vue/composer/composerCallbacks';
import { CALLBACKS_KEY } from '@/features/chat/ui/vue/composer/composerKeys';
import { createComposerPinia } from '@/features/chat/ui/vue/composer/composerPinia';
import { type ComposerChips, useComposerStore } from '@/features/chat/ui/vue/composer/stores/composerStore';

function stubCallbacks(): ComposerCallbacks {
  return {
    onRemoveChip: vi.fn(),
    onOpenFile: vi.fn(),
    onOpenImage: vi.fn(),
  } as unknown as ComposerCallbacks;
}

function mountChips(component: typeof FileChips | typeof ImageChips, cb: ComposerCallbacks) {
  const pinia = createComposerPinia();
  setActivePinia(pinia);
  const wrapper = mount(component, {
    global: { plugins: [pinia], provide: { [CALLBACKS_KEY as symbol]: cb } },
  });
  return { wrapper, store: useComposerStore() };
}

const CHIPS: ComposerChips = {
  currentNote: { path: 'notes/current.md', label: 'current.md', kind: 'current' },
  files: [{ path: 'notes/other.md', label: 'other.md', kind: 'file' }],
  folders: [{ path: 'docs/design', label: 'design/' }],
  images: [
    { id: 'img-1', name: 'shot.png', sizeLabel: '2.0 KB', src: 'data:image/png;base64,AAAA' },
  ],
};

describe('FileChips.vue', () => {
  beforeEach(() => vi.clearAllMocks());

  it('is hidden with no pills and visible-flex once chips exist', async () => {
    const { wrapper, store } = mountChips(FileChips, stubCallbacks());
    const indicator = wrapper.find('.specorator-file-indicator');
    expect(indicator.classes()).toContain('specorator-hidden');
    expect(indicator.classes()).not.toContain('specorator-visible-flex');

    store.setChips({ ...CHIPS, images: [] });
    await wrapper.vm.$nextTick();
    expect(indicator.classes()).toContain('specorator-visible-flex');
    expect(indicator.classes()).not.toContain('specorator-hidden');
  });

  it('renders the current note as a --current pill alongside files and folders', async () => {
    const { wrapper, store } = mountChips(FileChips, stubCallbacks());
    store.setChips({ ...CHIPS, images: [] });
    await wrapper.vm.$nextTick();

    const chips = wrapper.findAll('.specorator-file-chip');
    expect(chips).toHaveLength(3);
    expect(chips[0].classes()).toContain('specorator-file-chip--current');
    expect(chips[1].classes()).toContain('specorator-file-chip--file');
    expect(chips[2].classes()).toContain('specorator-file-chip--folder');
    expect(chips[0].find('.specorator-file-chip-name').text()).toBe('current.md');
    expect(chips[2].find('.specorator-file-chip-name').text()).toBe('design/');
  });

  it('clicking a file pill name fires onOpenFile with its path', async () => {
    const cb = stubCallbacks();
    const { wrapper, store } = mountChips(FileChips, cb);
    store.setChips({ ...CHIPS, images: [] });
    await wrapper.vm.$nextTick();

    await wrapper.findAll('.specorator-file-chip-name')[1].trigger('click');
    expect(cb.onOpenFile).toHaveBeenCalledWith('notes/other.md');
  });

  it('clicking the current pill name fires onOpenFile with its path', async () => {
    const cb = stubCallbacks();
    const { wrapper, store } = mountChips(FileChips, cb);
    store.setChips({ ...CHIPS, images: [] });
    await wrapper.vm.$nextTick();

    await wrapper.findAll('.specorator-file-chip-name')[0].trigger('click');
    expect(cb.onOpenFile).toHaveBeenCalledWith('notes/current.md');
  });

  it('clicking a FOLDER pill name does NOT fire onOpenFile (folders are non-openable)', async () => {
    const cb = stubCallbacks();
    const { wrapper, store } = mountChips(FileChips, cb);
    store.setChips({ ...CHIPS, images: [] });
    await wrapper.vm.$nextTick();

    const folderChip = wrapper.findAll('.specorator-file-chip')[2];
    expect(folderChip.classes()).toContain('specorator-file-chip--folder');
    await folderChip.find('.specorator-file-chip-name').trigger('click');
    expect(cb.onOpenFile).not.toHaveBeenCalled();
  });

  it('a folder pill stays removable even though its name is non-openable', async () => {
    const cb = stubCallbacks();
    const { wrapper, store } = mountChips(FileChips, cb);
    store.setChips({ ...CHIPS, images: [] });
    await wrapper.vm.$nextTick();

    await wrapper.findAll('.specorator-file-chip-remove')[2].trigger('click');
    expect(cb.onRemoveChip).toHaveBeenCalledWith('docs/design', 'folder');
    expect(cb.onOpenFile).not.toHaveBeenCalled();
  });

  it('the remove × fires onRemoveChip with path + kind', async () => {
    const cb = stubCallbacks();
    const { wrapper, store } = mountChips(FileChips, cb);
    store.setChips({ ...CHIPS, images: [] });
    await wrapper.vm.$nextTick();

    await wrapper.findAll('.specorator-file-chip-remove')[1].trigger('click');
    expect(cb.onRemoveChip).toHaveBeenCalledWith('notes/other.md', 'file');
  });

  it('removing the current pill fires onRemoveChip(currentPath, "current")', async () => {
    const cb = stubCallbacks();
    const { wrapper, store } = mountChips(FileChips, cb);
    store.setChips({ ...CHIPS, images: [] });
    await wrapper.vm.$nextTick();

    await wrapper.findAll('.specorator-file-chip-remove')[0].trigger('click');
    expect(cb.onRemoveChip).toHaveBeenCalledWith('notes/current.md', 'current');
  });
});

describe('ImageChips.vue', () => {
  beforeEach(() => vi.clearAllMocks());

  it('is hidden with no images and visible-flex once images exist', async () => {
    const { wrapper, store } = mountChips(ImageChips, stubCallbacks());
    const preview = wrapper.find('.specorator-image-preview');
    expect(preview.classes()).toContain('specorator-hidden');

    store.setChips({ ...CHIPS, currentNote: null, files: [], folders: [] });
    await wrapper.vm.$nextTick();
    expect(preview.classes()).toContain('specorator-visible-flex');
    expect(preview.classes()).not.toContain('specorator-hidden');
    expect(wrapper.findAll('.specorator-image-chip')).toHaveLength(1);
  });

  it('clicking the thumbnail fires onOpenImage with the image id', async () => {
    const cb = stubCallbacks();
    const { wrapper, store } = mountChips(ImageChips, cb);
    store.setChips({ ...CHIPS, currentNote: null, files: [], folders: [] });
    await wrapper.vm.$nextTick();

    await wrapper.find('.specorator-image-thumb').trigger('click');
    expect(cb.onOpenImage).toHaveBeenCalledWith('img-1');
  });

  it('the remove × fires onRemoveChip(id, "image") and NOT onOpenImage (click.stop)', async () => {
    const cb = stubCallbacks();
    const { wrapper, store } = mountChips(ImageChips, cb);
    store.setChips({ ...CHIPS, currentNote: null, files: [], folders: [] });
    await wrapper.vm.$nextTick();

    await wrapper.find('.specorator-image-remove').trigger('click');
    expect(cb.onRemoveChip).toHaveBeenCalledWith('img-1', 'image');
    expect(cb.onOpenImage).not.toHaveBeenCalled();
  });
});
