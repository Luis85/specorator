import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';

import type { ComposerEditedFile } from '@/features/chat/ui/vue/composer/stores/composerStore';
import EditedFilesStrip from '@/features/teamChat/ui/vue/components/EditedFilesStrip.vue';

// Unit coverage for the presentational core extracted out of the composer's
// EditedFilesBar: it renders purely from `entries` + `onOpen` props, with no
// store/inject coupling, so both the composer and the Team Chat top bar reuse it.
const ENTRIES: ComposerEditedFile[] = [
  { path: 'src/new.ts', changeKind: 'created', name: 'new.ts', dir: 'src' },
  { path: 'docs/readme.md', changeKind: 'edited', name: 'readme.md', dir: 'docs' },
];

describe('EditedFilesStrip.vue (presentational)', () => {
  it('hides the row and renders no badge when entries is empty', () => {
    const wrapper = mount(EditedFilesStrip, { props: { entries: [], onOpen: vi.fn() } });
    expect(wrapper.find('.specorator-edited-files-row').classes()).toContain('specorator-hidden');
    expect(wrapper.find('.specorator-edited-files-badge').exists()).toBe(false);
  });

  it('renders the kind-split badge count from props', () => {
    const wrapper = mount(EditedFilesStrip, { props: { entries: ENTRIES, onOpen: vi.fn() } });
    expect(wrapper.find('.specorator-edited-files-row').classes()).toContain('specorator-visible-flex');
    expect(wrapper.find('.specorator-edited-files-badge-count').text()).toBe('1 created · 1 edited');
  });

  it('toggles the popover, renders one row per entry, and fires onOpen(path) on activation', async () => {
    const onOpen = vi.fn();
    const wrapper = mount(EditedFilesStrip, { props: { entries: ENTRIES, onOpen } });

    await wrapper.find('.specorator-edited-files-badge').trigger('click');
    const items = wrapper.findAll('.specorator-edited-files-item');
    expect(items).toHaveLength(2);
    expect(items[0].classes()).toContain('specorator-edited-files-item--created');
    expect(items[1].classes()).toContain('specorator-edited-files-item--edited');

    await items[0].trigger('click');
    expect(onOpen).toHaveBeenCalledWith('src/new.ts');
    // Activation closes the popover (parity with the composer bar).
    expect(wrapper.find('.specorator-edited-files-menu').exists()).toBe(false);
  });

  it('closes an open popover when entries drains to empty', async () => {
    const wrapper = mount(EditedFilesStrip, { props: { entries: ENTRIES, onOpen: vi.fn() } });
    await wrapper.find('.specorator-edited-files-badge').trigger('click');
    expect(wrapper.find('.specorator-edited-files-menu').exists()).toBe(true);

    await wrapper.setProps({ entries: [] });
    expect(wrapper.find('.specorator-edited-files-row').classes()).toContain('specorator-hidden');

    // Reappearing entries must not re-open the stale popover.
    await wrapper.setProps({ entries: ENTRIES });
    expect(wrapper.find('.specorator-edited-files-menu').exists()).toBe(false);
  });
});
