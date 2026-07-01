import { type LibraryItemAccessors, LibraryListController, type LibraryToolbarLabels } from '@/shared/libraryToolbar';

interface Row { name: string; description: string; tags: string[]; updatedAt: number }

const accessors: LibraryItemAccessors<Row> = {
  getName: (r) => r.name,
  getDescription: (r) => r.description,
  getTags: (r) => r.tags,
  getUpdatedAt: (r) => r.updatedAt,
};

const rows: Row[] = [
  { name: 'Beta', description: 'second', tags: ['x'], updatedAt: 200 },
  { name: 'Alpha', description: 'has KEYWORD', tags: ['y'], updatedAt: 100 },
  { name: 'Gamma', description: 'third', tags: ['x', 'y'], updatedAt: 300 },
];

function make(): LibraryListController<Row> {
  const c = new LibraryListController<Row>(accessors);
  c.setItems(rows);
  return c;
}

describe('LibraryListController', () => {
  it('sorts by name A-Z by default', () => {
    expect(make().apply().map((r) => r.name)).toEqual(['Alpha', 'Beta', 'Gamma']);
  });

  it('sorts by updatedAt desc when sort=updated', () => {
    const c = make();
    c.setSort('updated');
    expect(c.apply().map((r) => r.name)).toEqual(['Gamma', 'Beta', 'Alpha']);
  });

  it('search matches name, description, and tags case-insensitively', () => {
    const c = make();
    c.setQuery('keyword');
    expect(c.apply().map((r) => r.name)).toEqual(['Alpha']);
    c.setQuery('GAMMA');
    expect(c.apply().map((r) => r.name)).toEqual(['Gamma']);
    c.setQuery('y');
    expect(c.apply().map((r) => r.name).sort()).toEqual(['Alpha', 'Gamma']);
  });

  it('filters with OR semantics across active chips', () => {
    const c = make();
    c.toggleFilter('x');
    expect(c.apply().map((r) => r.name).sort()).toEqual(['Beta', 'Gamma']);
    c.toggleFilter('y');
    expect(c.apply().map((r) => r.name).sort()).toEqual(['Alpha', 'Beta', 'Gamma']);
    c.clearFilters();
    expect(c.apply()).toHaveLength(3);
  });

  it('allTags returns the sorted union', () => {
    expect(make().allTags()).toEqual(['x', 'y']);
  });

  it('drops active filters whose tag disappears after setItems', () => {
    const c = make();
    c.toggleFilter('x');
    c.setItems([{ name: 'Solo', description: '', tags: ['z'], updatedAt: 1 }]);
    expect(c.activeFilters()).toEqual([]);
    expect(c.apply()).toHaveLength(1);
  });
});

// The unit suite runs under `testEnvironment: 'node'` (no real DOM), and Obsidian's
// `createEl`/`empty`/`toggleClass` extensions exist only on Obsidian-owned elements,
// not on plain nodes. This minimal stub implements the element contract that
// `renderToolbar` actually exercises, so the smoke test verifies render wiring
// without depending on jsdom or the Obsidian module's element stubs.
interface StubEl {
  tagName: string;
  className: string;
  textContent: string;
  value: string;
  children: StubEl[];
  attrs: Record<string, string>;
  listeners: Record<string, Array<() => void>>;
  empty(): void;
  addClass(cls: string): void;
  toggleClass(cls: string, on: boolean): void;
  setAttribute(key: string, value: string): void;
  addEventListener(type: string, fn: () => void): void;
  dispatch(type: string): void;
  createEl(tag: string, opts?: { cls?: string; text?: string; type?: string; attr?: Record<string, string> }): StubEl;
  createDiv(opts?: { cls?: string }): StubEl;
  find(predicate: (el: StubEl) => boolean): StubEl | undefined;
}

function makeStub(tagName = 'div'): StubEl {
  const el: StubEl = {
    tagName,
    className: '',
    textContent: '',
    value: '',
    children: [],
    attrs: {},
    listeners: {},
    empty() { this.children = []; },
    addClass() { /* class tracking not needed for smoke assertions */ },
    toggleClass() { /* pressed-state visuals not asserted here */ },
    setAttribute(key, value) { this.attrs[key] = value; },
    addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); },
    dispatch(type) { for (const fn of this.listeners[type] ?? []) fn(); },
    createEl(tag, opts) {
      const child = makeStub(tag);
      if (opts?.cls) child.className = opts.cls;
      if (opts?.text) child.textContent = opts.text;
      if (opts?.type) child.attrs.type = opts.type;
      if (opts?.attr) Object.assign(child.attrs, opts.attr);
      this.children.push(child);
      return child;
    },
    createDiv(opts) { return this.createEl('div', opts); },
    find(predicate) {
      for (const child of this.children) {
        if (predicate(child)) return child;
        const nested = child.find(predicate);
        if (nested) return nested;
      }
      return undefined;
    },
  };
  return el;
}

const labels: LibraryToolbarLabels = {
  searchPlaceholder: 'Search…',
  sortLabel: 'Sort by',
  sortName: 'Name (A–Z)',
  sortUpdated: 'Recently updated',
  resetFilters: 'Reset',
};

describe('LibraryListController.renderToolbar', () => {
  it('mounts a search input and uses sortLabel for the sort aria-label', () => {
    const c = make();
    const host = makeStub();
    c.renderToolbar(host as unknown as HTMLElement, labels, () => undefined);

    const search = host.find((el) => el.className.includes('specorator-library-search'));
    expect(search).toBeDefined();
    expect(search?.attrs.placeholder).toBe('Search…');

    const sort = host.find((el) => el.className.includes('specorator-library-sort'));
    expect(sort?.attrs['aria-label']).toBe('Sort by');
  });

  it('gives the reset and chip buttons type="button"', () => {
    const c = make();
    const host = makeStub();
    c.renderToolbar(host as unknown as HTMLElement, labels, () => undefined);

    const reset = host.find((el) => el.className === 'specorator-library-filterreset');
    expect(reset?.attrs.type).toBe('button');

    const chip = host.find((el) => el.className === 'specorator-library-filterchip');
    expect(chip?.attrs.type).toBe('button');
  });

  it('fires onChange and toggles the controller filter when a chip is clicked', () => {
    const c = make();
    const host = makeStub();
    let changes = 0;
    c.renderToolbar(host as unknown as HTMLElement, labels, () => { changes += 1; });

    const chipX = host.find(
      (el) => el.className === 'specorator-library-filterchip' && el.textContent === 'x',
    );
    expect(chipX).toBeDefined();
    chipX?.dispatch('click');

    expect(changes).toBe(1);
    expect(c.activeFilters()).toEqual(['x']);
  });
});
