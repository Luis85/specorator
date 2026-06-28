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
    const set = new Set<string>();
    for (const item of this.items) {
      for (const tag of this.accessors.getTags(item)) {
        const trimmed = tag.trim();
        if (trimmed) set.add(trimmed);
      }
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }

  apply(): T[] {
    const q = this.query.trim().toLowerCase();
    const filtered = this.items.filter((item) => {
      if (q) {
        const haystack = [
          this.accessors.getName(item),
          this.accessors.getDescription(item),
          ...this.accessors.getTags(item),
        ].join(' ').toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (this.active.size > 0) {
        const tags = this.accessors.getTags(item).map((tag) => tag.trim());
        if (!tags.some((tag) => this.active.has(tag))) return false;
      }
      return true;
    });
    const sorted = [...filtered];
    if (this.sort === 'name') {
      sorted.sort((a, b) => this.accessors.getName(a).localeCompare(this.accessors.getName(b)));
    } else {
      sorted.sort((a, b) => this.accessors.getUpdatedAt(b) - this.accessors.getUpdatedAt(a));
    }
    return sorted;
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

    const chips = host.createDiv({ cls: 'specorator-library-filterchips' });
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
