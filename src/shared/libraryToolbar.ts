import { setIcon } from 'obsidian';

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

/**
 * Content-agnostic search/sort/filter engine shared by the Agent, Skill, and
 * Loop library views. Holds query + sort + active-tag state; `apply()` returns
 * the filtered, sorted view. `renderToolbar` mounts the controls; callers
 * re-render only their list container on change (so the search input keeps focus).
 */
export class LibraryListController<T> {
  private items: T[] = [];
  private query = '';
  private sort: LibrarySort = 'name';
  private readonly active = new Set<string>();

  constructor(private readonly accessors: LibraryItemAccessors<T>) {}

  setItems(items: T[]): void {
    this.items = items;
    const present = new Set(this.allTags());
    for (const tag of [...this.active]) {
      if (!present.has(tag)) this.active.delete(tag);
    }
  }

  setQuery(query: string): void { this.query = query; }
  setSort(sort: LibrarySort): void { this.sort = sort; }
  toggleFilter(tag: string): void {
    if (this.active.has(tag)) this.active.delete(tag);
    else this.active.add(tag);
  }
  clearFilters(): void { this.active.clear(); }
  activeFilters(): string[] { return [...this.active]; }
  totalCount(): number { return this.items.length; }

  /** Sorted union of every tag across the current item set. */
  allTags(): string[] {
    return collectLibraryTags(this.items, this.accessors);
  }

  apply(): T[] {
    return applyLibraryQuery(this.items, this.accessors, {
      query: this.query,
      sort: this.sort,
      active: this.active,
    });
  }

  /**
   * Mounts search input + sort dropdown + filter-chip row into `host`. Calls
   * `onChange` after any control mutates state. Re-mount (call again) only when
   * the tag universe changes; chip pressed-state updates in place.
   */
  renderToolbar(host: HTMLElement, labels: LibraryToolbarLabels, onChange: () => void): void {
    host.empty();
    host.addClass('specorator-library-toolbar');

    const search = host.createEl('input', {
      cls: 'specorator-library-search',
      type: 'search',
      attr: { placeholder: labels.searchPlaceholder, 'aria-label': labels.searchPlaceholder },
    });
    search.value = this.query;
    search.addEventListener('input', () => { this.setQuery(search.value); onChange(); });

    const sort = host.createEl('select', {
      cls: 'specorator-library-sort dropdown',
      attr: { 'aria-label': labels.sortLabel },
    });
    sort.createEl('option', { value: 'name', text: labels.sortName });
    sort.createEl('option', { value: 'updated', text: labels.sortUpdated });
    sort.value = this.sort;
    sort.addEventListener('change', () => { this.setSort(sort.value as LibrarySort); onChange(); });

    const tags = this.allTags();
    if (tags.length === 0) return;

    const chips = host.createDiv({
      cls: 'specorator-library-filterchips',
      attr: { role: 'group', 'aria-label': t('library.filterGroupLabel') },
    });
    const reset = chips.createEl('button', {
      cls: 'specorator-library-filterreset',
      text: labels.resetFilters,
      attr: { type: 'button' },
    });
    const syncReset = (): void => { reset.toggleClass('is-hidden', this.active.size === 0); };

    const chipEls: Array<{ tag: string; el: HTMLElement }> = [];
    const refreshAll = (): void => {
      for (const { tag, el } of chipEls) {
        const on = this.active.has(tag);
        el.toggleClass('is-on', on);
        el.setAttribute('aria-pressed', String(on));
      }
      syncReset();
    };

    reset.addEventListener('click', () => { this.clearFilters(); refreshAll(); onChange(); });
    for (const tag of tags) {
      const chip = chips.createEl('button', {
        cls: 'specorator-library-filterchip',
        text: tag,
        attr: { type: 'button' },
      });
      chip.addEventListener('click', () => { this.toggleFilter(tag); refreshAll(); onChange(); });
      chipEls.push({ tag, el: chip });
    }
    refreshAll();
  }
}

/** The standard library toolbar labels, shared by all library views. */
export function libraryToolbarLabels(): LibraryToolbarLabels {
  return {
    searchPlaceholder: t('library.searchPlaceholder'),
    sortLabel: t('library.sortLabel'),
    sortName: t('library.sortName'),
    sortUpdated: t('library.sortUpdated'),
    resetFilters: t('library.resetFilters'),
  };
}

/**
 * Mounts the search/sort/filter toolbar for `controller` into `toolbar` and
 * paints the filtered rows into `list`, re-rendering ONLY the list on change
 * (search input keeps focus). `renderCard` paints one row; an empty filter
 * result shows the shared "no matches" line.
 */
export function mountLibraryList<T>(opts: {
  controller: LibraryListController<T>;
  items: T[];
  toolbar: HTMLElement;
  list: HTMLElement;
  renderCard: (list: HTMLElement, item: T) => void;
}): void {
  const { controller, items, toolbar, list, renderCard } = opts;
  controller.setItems(items);
  const renderRows = (): void => {
    list.empty();
    const rows = controller.apply();
    if (rows.length === 0) {
      list.createDiv({ cls: 'specorator-library-empty-text', text: t('library.noMatches') });
      return;
    }
    for (const row of rows) renderCard(list, row);
  };
  controller.renderToolbar(toolbar, libraryToolbarLabels(), renderRows);
  renderRows();
}

/**
 * Renders a card's user-tag chip row (`.specorator-library-card-caps`) into
 * `body`, one `.specorator-library-chip` per tag. Renders nothing when there are
 * no tags. Shared by the Skill and Loop cards; the Agent card builds its own caps
 * row because it interleaves role/skills chips with the user tags.
 */
export function renderLibraryCardTags(body: HTMLElement, tags: string[]): void {
  if (tags.length === 0) return;
  const caps = body.createDiv({ cls: 'specorator-library-card-caps' });
  for (const tag of tags) caps.createSpan({ cls: 'specorator-library-chip', text: tag });
}

/** Renders the shared Duplicate (copy-icon) card-action button. */
export function renderCloneButton(actions: HTMLElement, onClick: (e: MouseEvent) => void): HTMLButtonElement {
  const btn = actions.createEl('button', {
    cls: 'specorator-library-card-icon',
    attr: { 'aria-label': t('library.duplicate'), title: t('library.duplicate') },
  });
  setIcon(btn, 'copy');
  btn.onclick = onClick;
  return btn;
}
