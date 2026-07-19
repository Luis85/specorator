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

  it('rejects catalog items with a blank name', () => {
    // A blank name slugifies to the installer's shared per-type fallback (loop/
    // template/…), so two blank-named items would collide on one file.
    const manifest = parseManifest({
      schemaVersion: 1,
      items: [
        validItem,
        { id: 'loops/blank', type: 'loop', name: '   ', description: 'd', path: 'loops/blank.md', tags: [] },
        { id: 'loops/empty', type: 'loop', name: '', description: 'd', path: 'loops/empty.md', tags: [] },
      ],
    });
    expect(manifest?.items.map((i) => i.id)).toEqual(['loops/x']);
  });

  it('rejects names that normalize to an empty install slug (punctuation/non-ASCII only)', () => {
    // A non-blank name that slugifies to '' — punctuation-only or non-ASCII like
    // `计划` — still hits the installer's shared per-type fallback (loop/…) and
    // collides, exactly like a blank name. The storage slug is ASCII-only, so
    // require the name to survive normalization to a non-empty slug.
    const manifest = parseManifest({
      schemaVersion: 1,
      items: [
        validItem,
        { id: 'loops/cjk', type: 'loop', name: '计划', description: 'd', path: 'loops/cjk.md', tags: [] },
        { id: 'loops/punct', type: 'loop', name: '!!!', description: 'd', path: 'loops/punct.md', tags: [] },
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

  it('dedupes installable items colliding on the normalized install key, not just the id', () => {
    // Two loops with different ids whose names normalize to the same slug
    // (`foo-bar`) install to the same file. Id-dedup alone keeps both, so
    // installing either would flip both cards to Installed and hide the other's
    // Install action. A custom catalog can decouple id from name-slug, so drop
    // the later collision by type + normalized install key.
    const manifest = parseManifest({
      schemaVersion: 1,
      items: [
        { id: 'loops/foo-bar-1', type: 'loop', name: 'Foo Bar', description: 'd', path: 'loops/a.md', tags: [] },
        { id: 'loops/foo-bar-2', type: 'loop', name: 'Foo-Bar', description: 'd', path: 'loops/b.md', tags: [] },
      ],
    });
    expect(manifest?.items.map((i) => i.id)).toEqual(['loops/foo-bar-1']);
    expect(manifest?.count).toBe(1);
  });

  it('dedupes agents whose names collide on the roster install key', () => {
    const manifest = parseManifest({
      schemaVersion: 1,
      items: [
        { id: 'agents/code-reviewer', type: 'agent', name: 'Code Reviewer', description: 'd', path: 'agents/a.md', tags: [] },
        { id: 'agents/code-reviewer-alt', type: 'agent', name: 'Code-Reviewer', description: 'd', path: 'agents/b.md', tags: [] },
      ],
    });
    expect(manifest?.items.map((i) => i.id)).toEqual(['agents/code-reviewer']);
  });

  it('keeps same-slug names in different install types (folders differ, no collision)', () => {
    // A loop and a template with the same name slug live in different folders, so
    // they never collide — only same-type + same-slug does.
    const manifest = parseManifest({
      schemaVersion: 1,
      items: [
        { id: 'loops/foo', type: 'loop', name: 'Foo', description: 'd', path: 'loops/foo.md', tags: [] },
        { id: 'templates/foo', type: 'template', name: 'Foo', description: 'd', path: 'templates/foo.md', tags: [] },
      ],
    });
    expect(manifest?.items.map((i) => i.id)).toEqual(['loops/foo', 'templates/foo']);
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
