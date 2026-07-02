import { describe, expect, it } from 'vitest';
import { shallowRef } from 'vue';

import { useLibraryList } from '@/features/library/vue/useLibraryList';

interface Row { name: string; desc: string; tags: string[]; updated: number }

const accessors = {
  getName: (r: Row) => r.name,
  getDescription: (r: Row) => r.desc,
  getTags: (r: Row) => r.tags,
  getUpdatedAt: (r: Row) => r.updated,
};

const rows: Row[] = [
  { name: 'Beta', desc: 'second', tags: ['x'], updated: 2 },
  { name: 'Alpha', desc: 'first thing', tags: ['x', 'y'], updated: 3 },
  { name: 'Gamma', desc: 'third', tags: [], updated: 1 },
];

// The composable consumes a reactive SOURCE (not snapshots) so every mounted
// panel — including a second Library leaf — re-derives when the shared store
// changes. Tests drive the source through a shallowRef.
function makeList(initial: Row[]) {
  const src = shallowRef(initial);
  return { src, list: useLibraryList(() => src.value, accessors) };
}

describe('useLibraryList', () => {
  it('sorts by name by default and by updated desc when switched', () => {
    const { list } = makeList(rows);
    expect(list.rows.value.map((r) => r.name)).toEqual(['Alpha', 'Beta', 'Gamma']);
    list.sort.value = 'updated';
    expect(list.rows.value.map((r) => r.name)).toEqual(['Alpha', 'Beta', 'Gamma'].sort(
      (a, b) => rows.find((r) => r.name === b)!.updated - rows.find((r) => r.name === a)!.updated,
    ));
  });

  it('filters by case-insensitive substring over name+desc+tags', () => {
    const { list } = makeList(rows);
    list.query.value = 'FIRST';
    expect(list.rows.value.map((r) => r.name)).toEqual(['Alpha']);
  });

  it('OR-filters by active tags and exposes the sorted tag union', () => {
    const { list } = makeList(rows);
    expect(list.allTags.value).toEqual(['x', 'y']);
    list.toggleFilter('y');
    expect(list.rows.value.map((r) => r.name)).toEqual(['Alpha']);
    list.toggleFilter('x');
    expect(list.rows.value.map((r) => r.name)).toEqual(['Alpha', 'Beta']);
    list.clearFilters();
    expect(list.rows.value).toHaveLength(3);
  });

  it('re-derives rows when the source changes (cross-leaf consistency)', () => {
    const { src, list } = makeList(rows);
    src.value = rows.filter((r) => r.name !== 'Beta');
    expect(list.rows.value.map((r) => r.name)).toEqual(['Alpha', 'Gamma']);
  });

  it('prunes active filters that vanish from the source', () => {
    const { src, list } = makeList(rows);
    list.toggleFilter('y');
    src.value = rows.filter((r) => !r.tags.includes('y'));
    expect(list.activeFilters.value).toEqual([]);
  });
});
