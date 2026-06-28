import { type LibraryItemAccessors,LibraryListController } from '@/shared/libraryToolbar';

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
