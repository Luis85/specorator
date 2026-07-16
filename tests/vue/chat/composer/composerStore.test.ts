import { setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';

import { createComposerPinia } from '@/features/chat/ui/vue/composer/composerPinia';
import { useComposerStore } from '@/features/chat/ui/vue/composer/stores/composerStore';

describe('composer store', () => {
  beforeEach(() => setActivePinia(createComposerPinia()));

  it('starts with empty read-model slices', () => {
    const store = useComposerStore();
    expect(store.toolbar.modelLabel).toBe('');
    expect(store.chips.files).toEqual([]);
    expect(store.chips.folders).toEqual([]);
    expect(store.streaming.isStreaming).toBe(false);
    expect(store.dropdown.kind).toBeNull();
    expect(store.inputMode).toBe('none');
    expect(store.draftMeta.isEmpty).toBe(true);
  });

  it('replaces whole values through setters (no draft string ever held)', () => {
    const store = useComposerStore();
    store.setStreaming({ isStreaming: true });
    store.setInputMode('instruction');
    store.setChips({ currentNote: null, files: [{ path: 'a.md', label: 'a.md', kind: 'file' }], folders: [{ path: 'dir', label: 'dir/' }], images: [] });
    expect(store.streaming.isStreaming).toBe(true);
    expect(store.inputMode).toBe('instruction');
    expect(store.chips.files).toHaveLength(1);
    expect(store.chips.folders).toHaveLength(1);
    expect(store).not.toHaveProperty('draft');
  });

  it('createComposerPinia returns a fresh instance each call (per-leaf isolation)', () => {
    expect(createComposerPinia()).not.toBe(createComposerPinia());
  });
});
