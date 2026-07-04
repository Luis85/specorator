/**
 * Pure search/sort/filter engine + shared toolbar labels for the Library.
 * Consumed by the Vue list engine (`useLibraryList`, `LibraryToolbar.vue`);
 * holds no DOM — rendering lives in the Vue components.
 */
import { t } from '@/i18n/i18n';

export type LibrarySort = 'name' | 'updated';

export interface LibraryItemAccessors<T> {
  getName(item: T): string;
  getDescription(item: T): string;
  getTags(item: T): string[];
  getUpdatedAt(item: T): number;
}

export interface LibraryToolbarLabels {
  searchPlaceholder: string;
  /** Accessible name for the sort control itself (announced by screen readers). */
  sortLabel: string;
  sortName: string;
  sortUpdated: string;
  resetFilters: string;
}

/** Sorted union of every trimmed, non-empty tag across `items`. */
export function collectLibraryTags<T>(items: T[], accessors: LibraryItemAccessors<T>): string[] {
  const set = new Set<string>();
  for (const item of items) {
    for (const tag of accessors.getTags(item)) {
      const trimmed = tag.trim();
      if (trimmed) set.add(trimmed);
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

/** Case-insensitive substring filter + OR-tag filter + name/updated sort. */
export function applyLibraryQuery<T>(
  items: T[],
  accessors: LibraryItemAccessors<T>,
  state: { query: string; sort: LibrarySort; active: ReadonlySet<string> },
): T[] {
  const q = state.query.trim().toLowerCase();
  const filtered = items.filter((item) => {
    if (q) {
      const haystack = [
        accessors.getName(item),
        accessors.getDescription(item),
        ...accessors.getTags(item),
      ].join(' ').toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    if (state.active.size > 0) {
      const tags = accessors.getTags(item).map((tag) => tag.trim());
      if (!tags.some((tag) => state.active.has(tag))) return false;
    }
    return true;
  });
  const sorted = [...filtered];
  if (state.sort === 'name') {
    sorted.sort((a, b) => accessors.getName(a).localeCompare(accessors.getName(b)));
  } else {
    sorted.sort((a, b) => accessors.getUpdatedAt(b) - accessors.getUpdatedAt(a));
  }
  return sorted;
}

/** The standard library toolbar labels, shared by all library surfaces. */
export function libraryToolbarLabels(): LibraryToolbarLabels {
  return {
    searchPlaceholder: t('library.searchPlaceholder'),
    sortLabel: t('library.sortLabel'),
    sortName: t('library.sortName'),
    sortUpdated: t('library.sortUpdated'),
    resetFilters: t('library.resetFilters'),
  };
}
