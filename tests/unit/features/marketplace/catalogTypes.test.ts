import { isBinarySkillPath, isInstallableType, MAX_SKILL_FILES, parseManifest } from '@/features/marketplace/catalogTypes';

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

  it('rejects the WHOLE skill when any declared file is unsafe', () => {
    // Silently dropping just the bad entry would install an incomplete folder
    // (missing a required file) and mark it installed, blocking reinstall.
    for (const bad of [
      'skills/project-setup/../evil.md', // traversal
      '/etc/passwd', // absolute
      'skills/project-setup/a\\b.md', // backslash
      'skills/other/x.md', // different skill's folder
      'skills/project-setup//evil.md', // empty segment → suffix '/evil.md'
      'skills/project-setup/C:/evil.md', // drive after prefix → suffix 'C:/evil.md'
      'skills/project-setup/scripts//run.mjs', // empty interior segment in the suffix
      'skills/project-setup/scripts/con.txt', // Windows reserved device name
      'skills/project-setup/scripts/setup?.ps1', // Windows illegal character
    ]) {
      expect(firstSkill(['skills/project-setup/SKILL.md', bad])).toBeUndefined();
    }
  });

  it('drops a skill declaring more than MAX_SKILL_FILES files, before the O(n²) collision scan', () => {
    const over = Array.from({ length: MAX_SKILL_FILES + 1 }, (_unused, i) => `skills/project-setup/f${i}.md`);
    expect(firstSkill(['skills/project-setup/SKILL.md', ...over])).toBeUndefined();
    // At the cap it's still accepted (safe, no collisions).
    const atCap = Array.from({ length: MAX_SKILL_FILES - 1 }, (_unused, i) => `skills/project-setup/g${i}.md`);
    expect(firstSkill(['skills/project-setup/SKILL.md', ...atCap])).toBeDefined();
  });

  it('drops a skill when injecting the SKILL.md marker pushes the count over the cap', () => {
    // Exactly MAX_SKILL_FILES safe supporting paths but item.path omitted: injecting
    // SKILL.md normalizes to MAX_SKILL_FILES+1, which the install path caps — so the
    // parse-time count must include the injected marker or Install would always fail.
    const supporting = Array.from({ length: MAX_SKILL_FILES }, (_unused, i) => `skills/project-setup/h${i}.md`);
    expect(firstSkill(supporting)).toBeUndefined();
  });

  it('rejects the WHOLE skill when one declared file is a directory prefix of another', () => {
    // Each path is safe alone, but the installer would create the ancestor as a
    // directory while writing the descendant, then fail writing the ancestor as a
    // file — a partial folder that blocks retry. Needs a cross-path check.
    expect(firstSkill([
      'skills/project-setup/SKILL.md',
      'skills/project-setup/SKILL.md/readme.txt', // SKILL.md marker used as a folder
    ])).toBeUndefined();
    expect(firstSkill([
      'skills/project-setup/SKILL.md',
      'skills/project-setup/scripts/setup.mjs',
      'skills/project-setup/scripts/setup.mjs/extra.txt', // a supporting file used as a folder
    ])).toBeUndefined();
  });

  it('dedupes safe files (SKILL.md + a duplicate supporting file)', () => {
    const item = firstSkill([
      'skills/project-setup/SKILL.md',
      'skills/project-setup/scripts/setup.mjs',
      'skills/project-setup/scripts/setup.mjs', // duplicate
    ]);
    expect(item?.files).toEqual([
      'skills/project-setup/SKILL.md',
      'skills/project-setup/scripts/setup.mjs',
    ]);
  });

  it('rejects the WHOLE skill on a case-insensitive file collision (Windows / default macOS)', () => {
    // Two paths differing only in case are distinct on Linux but the SAME file on
    // Windows / default macOS, where one silently overwrites the other. Reject the skill
    // on all platforms so the catalog parse stays deterministic and portable.
    expect(firstSkill([
      'skills/project-setup/SKILL.md',
      'skills/project-setup/scripts/Setup.mjs',
      'skills/project-setup/scripts/setup.mjs', // collides with Setup.mjs case-insensitively
    ])).toBeUndefined();
    // A supporting file that case-folds to the injected SKILL.md marker also collides.
    expect(firstSkill([
      'skills/project-setup/SKILL.md',
      'skills/project-setup/skill.md', // == SKILL.md on a case-insensitive filesystem
    ])).toBeUndefined();
    // A case-folded directory-prefix collision is caught too.
    expect(firstSkill([
      'skills/project-setup/SKILL.md',
      'skills/project-setup/Scripts', // ancestor of scripts/... after folding
      'skills/project-setup/scripts/run.mjs',
    ])).toBeUndefined();
  });

  it('rejects the WHOLE skill on a Unicode-normalization file collision (macOS)', () => {
    // 'é' has two encodings macOS treats as the same file: NFC (single U+00E9) and NFD
    // (U+0065 + combining U+0301). Case folding alone leaves them distinct, so the paths
    // must be Unicode-normalized (NFC) before comparison or one silently overwrites the other.
    const acute = String.fromCharCode(0x0301); // combining acute accent
    const nfd = `skills/project-setup/cafe${acute}.md`.normalize('NFD');
    const nfc = nfd.normalize('NFC');
    expect(nfc).not.toBe(nfd); // genuinely distinct strings...
    expect(firstSkill(['skills/project-setup/SKILL.md', nfc, nfd])).toBeUndefined(); // ...same file
  });

  it('falls back to just SKILL.md when files is absent', () => {
    expect(firstSkill(undefined)?.files).toEqual(['skills/project-setup/SKILL.md']);
  });

  it('drops the whole item when files is present but not an array', () => {
    expect(firstSkill('nope')).toBeUndefined();
  });

  it('drops a skill whose marker path is not a .../SKILL.md', () => {
    // No `/SKILL.md` suffix means no derivable install folder, so the skill is
    // malformed — dropped, not installed under a guessed folder.
    const manifest = parseManifest({
      schemaVersion: 1,
      items: [
        {
          id: 'skills/project-setup',
          type: 'skill',
          name: 'project-setup',
          description: 'd',
          path: 'skills/project-setup/README.md',
          files: ['skills/project-setup/README.md'],
          tags: ['x'],
        },
      ],
    });
    expect(manifest?.items).toHaveLength(0);
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
