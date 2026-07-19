import { isBinarySkillPath, isInstallableType, parseManifest } from '@/features/marketplace/catalogTypes';

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

describe('parseManifest — skill files', () => {
  const skill = (files: unknown) => ({
    id: 'skills/project-setup',
    type: 'skill',
    name: 'project-setup',
    description: 'd',
    path: 'skills/project-setup/SKILL.md',
    files,
    tags: ['x'],
  });

  const firstSkill = (files: unknown) =>
    parseManifest({ schemaVersion: 1, items: [skill(files)] })?.items[0];

  it('keeps files under the skill folder, SKILL.md included, in order', () => {
    const item = firstSkill([
      'skills/project-setup/SKILL.md',
      'skills/project-setup/scripts/setup.mjs',
      'skills/project-setup/references/a.md',
    ]);
    expect(item?.files).toEqual([
      'skills/project-setup/SKILL.md',
      'skills/project-setup/scripts/setup.mjs',
      'skills/project-setup/references/a.md',
    ]);
  });

  it('prepends SKILL.md when the manifest omitted it from files', () => {
    const item = firstSkill(['skills/project-setup/scripts/setup.mjs']);
    expect(item?.files?.[0]).toBe('skills/project-setup/SKILL.md');
    expect(item?.files).toContain('skills/project-setup/scripts/setup.mjs');
  });

  it('drops traversal, absolute, backslash, out-of-folder, and duplicate entries', () => {
    const item = firstSkill([
      'skills/project-setup/SKILL.md',
      'skills/project-setup/../evil.md', // traversal
      '/etc/passwd', // absolute
      'skills/project-setup/a\\b.md', // backslash
      'skills/other/x.md', // different skill's folder
      'skills/project-setup/scripts/setup.mjs',
      'skills/project-setup/scripts/setup.mjs', // duplicate
    ]);
    expect(item?.files).toEqual([
      'skills/project-setup/SKILL.md',
      'skills/project-setup/scripts/setup.mjs',
    ]);
  });

  it('falls back to just SKILL.md when files is absent', () => {
    expect(firstSkill(undefined)?.files).toEqual(['skills/project-setup/SKILL.md']);
  });

  it('drops the whole item when files is present but not an array', () => {
    expect(firstSkill('nope')).toBeUndefined();
  });

  it('strips a files array from non-skill items', () => {
    const manifest = parseManifest({
      schemaVersion: 1,
      items: [
        { id: 'loops/x', type: 'loop', name: 'X', description: 'd', path: 'loops/x.md', tags: ['a'], files: ['loops/x.md', 'loops/evil'] },
      ],
    });
    expect(manifest?.items[0] && 'files' in manifest.items[0]).toBe(false);
  });
});

describe('isBinarySkillPath', () => {
  it('flags known binary extensions (case-insensitive) and allows text files', () => {
    expect(isBinarySkillPath('skills/x/logo.png')).toBe(true);
    expect(isBinarySkillPath('skills/x/doc.PDF')).toBe(true);
    expect(isBinarySkillPath('skills/x/font.woff2')).toBe(true);
    expect(isBinarySkillPath('skills/x/SKILL.md')).toBe(false);
    expect(isBinarySkillPath('skills/x/scripts/setup.mjs')).toBe(false);
    expect(isBinarySkillPath('skills/x/data.json')).toBe(false);
    expect(isBinarySkillPath('skills/x/Makefile')).toBe(false); // no extension
  });
});

describe('isInstallableType', () => {
  it('installs all five content types, including skills', () => {
    expect(isInstallableType('loop')).toBe(true);
    expect(isInstallableType('agent')).toBe(true);
    expect(isInstallableType('template')).toBe(true);
    expect(isInstallableType('quick-action')).toBe(true);
    expect(isInstallableType('skill')).toBe(true);
  });
});
