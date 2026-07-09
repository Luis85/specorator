import { applyLibraryQuery, collectLibraryTags, type LibraryItemAccessors, type LibrarySort } from '@/shared/libraryToolbar';

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

function apply(state: { query?: string; sort?: LibrarySort; active?: Iterable<string> } = {}): string[] {
  return applyLibraryQuery(rows, accessors, {
    query: state.query ?? '',
    sort: state.sort ?? 'name',
    active: new Set(state.active ?? []),
  }).map((r) => r.name);
}

describe('applyLibraryQuery', () => {
  it('sorts by name A-Z by default', () => {
    expect(apply()).toEqual(['Alpha', 'Beta', 'Gamma']);
  });

  it('sorts by updatedAt desc when sort=updated', () => {
    expect(apply({ sort: 'updated' })).toEqual(['Gamma', 'Beta', 'Alpha']);
  });

  it('search matches name, description, and tags case-insensitively', () => {
    expect(apply({ query: 'keyword' })).toEqual(['Alpha']);
    expect(apply({ query: 'GAMMA' })).toEqual(['Gamma']);
    expect(apply({ query: 'y' }).sort()).toEqual(['Alpha', 'Gamma']);
  });

  it('filters with OR semantics across active tags', () => {
    expect(apply({ active: ['x'] }).sort()).toEqual(['Beta', 'Gamma']);
    expect(apply({ active: ['x', 'y'] }).sort()).toEqual(['Alpha', 'Beta', 'Gamma']);
    expect(apply({ active: [] })).toHaveLength(3);
  });
});

describe('collectLibraryTags', () => {
  it('returns the sorted union of trimmed, non-empty tags', () => {
    expect(collectLibraryTags(rows, accessors)).toEqual(['x', 'y']);
    const messy: Row[] = [{ name: 'M', description: '', tags: [' z ', '', '  '], updatedAt: 1 }];
    expect(collectLibraryTags(messy, accessors)).toEqual(['z']);
  });
});
