import type { ComputedRef, Ref } from 'vue';
import { computed, ref, shallowRef, triggerRef, watch } from 'vue';

import type { LibraryItemAccessors, LibrarySort } from '../../../shared/libraryToolbar';
import { applyLibraryQuery, collectLibraryTags } from '../../../shared/libraryToolbar';

export interface LibraryList<T> {
  items: ComputedRef<T[]>;
  query: Ref<string>;
  sort: Ref<LibrarySort>;
  activeFilters: ComputedRef<string[]>;
  allTags: ComputedRef<string[]>;
  rows: ComputedRef<T[]>;
  toggleFilter(tag: string): void;
  clearFilters(): void;
}

/**
 * Reactive twin of LibraryListController for the Vue panels: same pure engine
 * (applyLibraryQuery/collectLibraryTags), driven by a reactive SOURCE getter
 * (typically `() => store.xxx`) rather than snapshots. This is what keeps a
 * SECOND Library leaf consistent: the stores are plugin-global, so any leaf's
 * mutation reloads the store and every mounted panel's rows re-derive — no
 * manual "setItems after each action" step to forget.
 */
export function useLibraryList<T>(
  source: () => T[],
  accessors: LibraryItemAccessors<T>,
): LibraryList<T> {
  const items = computed(source);
  const query = ref('');
  const sort = ref<LibrarySort>('name');
  const active = shallowRef(new Set<string>());

  const allTags = computed(() => collectLibraryTags(items.value, accessors));
  const activeFilters = computed(() => [...active.value]);
  const rows = computed(() =>
    applyLibraryQuery(items.value, accessors, {
      query: query.value,
      sort: sort.value,
      active: active.value,
    }),
  );

  // Prune active filters whose tag vanished from the item set. flush: 'sync'
  // keeps the semantics of the old setItems() prune (and test determinism).
  // Called from component setup, the watcher is auto-disposed on unmount.
  watch(allTags, (tags) => {
    const present = new Set(tags);
    let changed = false;
    for (const tag of [...active.value]) {
      if (!present.has(tag)) {
        active.value.delete(tag);
        changed = true;
      }
    }
    if (changed) triggerRef(active);
  }, { flush: 'sync' });

  function toggleFilter(tag: string): void {
    if (active.value.has(tag)) active.value.delete(tag);
    else active.value.add(tag);
    triggerRef(active);
  }

  function clearFilters(): void {
    active.value.clear();
    triggerRef(active);
  }

  return { items, query, sort, activeFilters, allTags, rows, toggleFilter, clearFilters };
}
