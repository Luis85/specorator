import { isInstallableType, parseManifest } from '@/features/marketplace/catalogTypes';

const validItem = {
  id: 'loops/x',
  type: 'loop',
  name: 'X',
  description: 'd',
  path: 'loops/x.md',
  tags: ['a'],
};

describe('parseManifest', () => {
  it('accepts a well-formed manifest', () => {
    const manifest = parseManifest({ schemaVersion: 1, catalog: 'specorator-marketplace', count: 1, items: [validItem] });
    expect(manifest).not.toBeNull();
    expect(manifest?.items).toHaveLength(1);
    expect(manifest?.count).toBe(1);
  });

  it('rejects an unsupported schema version', () => {
    expect(parseManifest({ schemaVersion: 2, items: [] })).toBeNull();
  });

  it('rejects non-object input', () => {
    expect(parseManifest(null)).toBeNull();
    expect(parseManifest('nope')).toBeNull();
  });

  it('drops malformed items but keeps valid ones', () => {
    const manifest = parseManifest({
      schemaVersion: 1,
      items: [validItem, { id: 'bad' }, { id: 'i', type: 'nope', name: 'n', path: 'p' }, { id: 'j', type: 'loop', name: 'n', path: 'p', tags: 'notarray' }],
    });
    expect(manifest?.items).toHaveLength(1);
    expect(manifest?.count).toBe(1);
  });

  it('defaults a missing description and tags', () => {
    const manifest = parseManifest({ schemaVersion: 1, items: [{ id: 'agents/n', type: 'agent', name: 'n', path: 'agents/n.md' }] });
    expect(manifest?.items[0].description).toBe('');
    expect(manifest?.items[0].tags).toEqual([]);
  });

  it('rejects prototype-polluting and non-path-like item ids', () => {
    // A hostile/malformed catalog id keyed onto the view's plain-object caches
    // could read as already-present or mutate a record prototype — reject any id
    // that isn't the expected lowercase `<folder>/<slug>` shape.
    const manifest = parseManifest({
      schemaVersion: 1,
      items: [
        validItem,
        { id: '__proto__', type: 'loop', name: 'p', path: 'loops/p.md', tags: [] },
        { id: 'constructor', type: 'loop', name: 'c', path: 'loops/c.md', tags: [] },
        { id: 'toString', type: 'loop', name: 't', path: 'loops/t.md', tags: [] },
        { id: 'nofolder', type: 'loop', name: 'n', path: 'loops/n.md', tags: [] },
      ],
    });
    expect(manifest?.items.map((i) => i.id)).toEqual(['loops/x']);
  });

  it('dedupes items by id (first wins) so card v-for keys stay unique', () => {
    const manifest = parseManifest({
      schemaVersion: 1,
      items: [
        validItem,
        { ...validItem, name: 'X duplicate' },
        { id: 'loops/y', type: 'loop', name: 'Y', description: 'd', path: 'loops/y.md', tags: [] },
      ],
    });
    expect(manifest?.items).toHaveLength(2);
    expect(manifest?.items.map((i) => i.id)).toEqual(['loops/x', 'loops/y']);
    expect(manifest?.items[0].name).toBe('X'); // first occurrence wins
    expect(manifest?.count).toBe(2);
  });
});

describe('isInstallableType', () => {
  it('installs the four content types, not skills', () => {
    expect(isInstallableType('loop')).toBe(true);
    expect(isInstallableType('agent')).toBe(true);
    expect(isInstallableType('template')).toBe(true);
    expect(isInstallableType('quick-action')).toBe(true);
    expect(isInstallableType('skill')).toBe(false);
  });
});
