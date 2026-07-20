import type { HomeFileAdapter } from '@/core/storage/HomeFileAdapter';
import type { VaultFileAdapter } from '@/core/storage/VaultFileAdapter';
import { SKILLS_PATH,SkillStorage } from '@/providers/claude/storage/SkillStorage';

/** Mock home adapter: home-relative reads, host-absolute `getAbsolutePath`. */
function createMockHomeAdapter(files: Record<string, string> = {}, homeRoot = '/home/user'): HomeFileAdapter {
  return {
    exists: jest.fn(async (path: string) => path in files || Object.keys(files).some(k => k.startsWith(path + '/'))),
    read: jest.fn(async (path: string) => {
      if (!(path in files)) throw new Error(`File not found: ${path}`);
      return files[path];
    }),
    listFolders: jest.fn(async (folder: string) => {
      const prefix = folder.endsWith('/') ? folder : folder + '/';
      const folders = new Set<string>();
      for (const path of Object.keys(files)) {
        if (path.startsWith(prefix)) {
          const rest = path.slice(prefix.length);
          const firstSlash = rest.indexOf('/');
          if (firstSlash >= 0) folders.add(prefix + rest.slice(0, firstSlash));
        }
      }
      return Array.from(folders);
    }),
    getAbsolutePath: jest.fn((p: string) => `${homeRoot}/${p}`),
    write: jest.fn(),
    delete: jest.fn(),
    deleteFolder: jest.fn(),
    listFiles: jest.fn(),
    ensureFolder: jest.fn(),
  } as unknown as HomeFileAdapter;
}

/** Minimal PluginInfo for discovery tests. */
function plugin(
  name: string,
  installPath: string,
  enabled = true,
): { id: string; name: string; enabled: boolean; scope: 'user' | 'project'; installPath: string } {
  return { id: `${name}@marketplace`, name, enabled, scope: 'user', installPath };
}

/**
 * Factory that hands each plugin install path its own rooted read adapter, so a
 * plugin's `skills/` dir resolves to host-absolute paths under its install path.
 */
function createPluginAdapterFactory(byRoot: Record<string, Record<string, string>>) {
  return (root: string) => createMockHomeAdapter(byRoot[root] ?? {}, root);
}

function createMockAdapter(files: Record<string, string> = {}): VaultFileAdapter {
  const mockAdapter = {
    exists: jest.fn(async (path: string) => path in files || Object.keys(files).some(k => k.startsWith(path + '/'))),
    read: jest.fn(async (path: string) => {
      if (!(path in files)) throw new Error(`File not found: ${path}`);
      return files[path];
    }),
    write: jest.fn(),
    delete: jest.fn(),
    listFolders: jest.fn(async (folder: string) => {
      const prefix = folder.endsWith('/') ? folder : folder + '/';
      const folders = new Set<string>();
      for (const path of Object.keys(files)) {
        if (path.startsWith(prefix)) {
          const rest = path.slice(prefix.length);
          const firstSlash = rest.indexOf('/');
          if (firstSlash >= 0) {
            folders.add(prefix + rest.slice(0, firstSlash));
          }
        }
      }
      return Array.from(folders);
    }),
    listFiles: jest.fn(),
    listFilesRecursive: jest.fn(),
    ensureFolder: jest.fn(),
    rename: jest.fn(),
    append: jest.fn(),
    stat: jest.fn(),
    deleteFolder: jest.fn(),
  } as unknown as VaultFileAdapter;
  return mockAdapter;
}

describe('SkillStorage', () => {
  it('exports SKILLS_PATH', () => {
    expect(SKILLS_PATH).toBe('.claude/skills');
  });

  describe('loadAll', () => {
    it('loads skills from subdirectories with SKILL.md', async () => {
      const adapter = createMockAdapter({
        '.claude/skills/my-skill/SKILL.md': `---
description: A helpful skill
userInvocable: true
---
Do the thing`,
      });
      const storage = new SkillStorage(adapter);
      const loaded = await storage.loadAll();

      expect(loaded).toHaveLength(1);
      const { skill } = loaded[0];
      expect(skill.id).toBe('skill-my-skill');
      expect(skill.name).toBe('my-skill');
      expect(skill.description).toBe('A helpful skill');
      expect(skill.userInvocable).toBe(true);
      expect(skill.content).toBe('Do the thing');
      expect(skill.source).toBe('user');
      expect(loaded[0].readOnly).toBe(false);
    });

    it('returns the SKILL.md path alongside each skill', async () => {
      const adapter = createMockAdapter({
        '.claude/skills/tdd/SKILL.md': `---
description: TDD
---
Prompt`,
        '.claude/skills/brainstorming/SKILL.md': `---
description: Brainstorm
---
Prompt`,
      });
      const storage = new SkillStorage(adapter);
      const loaded = await storage.loadAll();

      const paths = loaded.map((entry) => entry.filePath).sort();
      expect(paths).toEqual([
        '.claude/skills/brainstorming/SKILL.md',
        '.claude/skills/tdd/SKILL.md',
      ]);
    });

    it('loads multiple skills', async () => {
      const adapter = createMockAdapter({
        '.claude/skills/skill-a/SKILL.md': `---
description: Skill A
---
Prompt A`,
        '.claude/skills/skill-b/SKILL.md': `---
description: Skill B
disableModelInvocation: true
---
Prompt B`,
      });
      const storage = new SkillStorage(adapter);
      const loaded = await storage.loadAll();

      expect(loaded).toHaveLength(2);
      expect(loaded.map(({ skill }) => skill.name).sort()).toEqual(['skill-a', 'skill-b']);
    });

    it('skips folders without SKILL.md', async () => {
      const adapter = createMockAdapter({
        '.claude/skills/has-skill/SKILL.md': `---
description: Valid
---
Prompt`,
        '.claude/skills/no-skill/README.md': 'Just a readme',
      });
      const storage = new SkillStorage(adapter);
      const loaded = await storage.loadAll();

      expect(loaded).toHaveLength(1);
      expect(loaded[0].skill.name).toBe('has-skill');
    });

    it('returns empty array when skills directory does not exist', async () => {
      const adapter = createMockAdapter({});
      (adapter.exists as jest.Mock).mockResolvedValue(false);
      const storage = new SkillStorage(adapter);
      const loaded = await storage.loadAll();

      expect(loaded).toEqual([]);
    });

    it('returns empty array when listFolders throws an error', async () => {
      const adapter = createMockAdapter({});
      (adapter.listFolders as jest.Mock).mockRejectedValue(new Error('Permission denied'));
      const storage = new SkillStorage(adapter);
      const loaded = await storage.loadAll();

      expect(loaded).toEqual([]);
    });

    it('skips malformed skill and continues loading valid ones', async () => {
      const adapter = createMockAdapter({
        '.claude/skills/good/SKILL.md': `---
description: Valid
---
Prompt`,
        '.claude/skills/bad/SKILL.md': 'content',
      });
      const originalRead = adapter.read as jest.Mock;
      const originalImpl = originalRead.getMockImplementation()!;
      originalRead.mockImplementation(async (p: string) => {
        if (p.includes('bad')) throw new Error('Corrupt file');
        return originalImpl(p);
      });
      const storage = new SkillStorage(adapter);
      const loaded = await storage.loadAll();

      expect(loaded).toHaveLength(1);
      expect(loaded[0].skill.name).toBe('good');
    });

    it('parses all skill frontmatter fields', async () => {
      const adapter = createMockAdapter({
        '.claude/skills/full/SKILL.md': `---
description: Full skill
disableModelInvocation: true
userInvocable: true
context: fork
agent: code-reviewer
model: sonnet
allowed-tools:
  - Read
  - Grep
---
Full prompt`,
      });
      const storage = new SkillStorage(adapter);
      const loaded = await storage.loadAll();

      expect(loaded).toHaveLength(1);
      const { skill } = loaded[0];
      expect(skill.description).toBe('Full skill');
      expect(skill.disableModelInvocation).toBe(true);
      expect(skill.userInvocable).toBe(true);
      expect(skill.context).toBe('fork');
      expect(skill.agent).toBe('code-reviewer');
      expect(skill.model).toBe('sonnet');
      expect(skill.allowedTools).toEqual(['Read', 'Grep']);
      expect(skill.content).toBe('Full prompt');
    });

    it('loads skills without frontmatter as content-only', async () => {
      const adapter = createMockAdapter({
        '.claude/skills/valid/SKILL.md': `---
description: Valid
---
Prompt`,
        '.claude/skills/invalid/SKILL.md': 'No frontmatter at all',
      });
      const storage = new SkillStorage(adapter);
      const loaded = await storage.loadAll();

      // Invalid skill has no frontmatter but still loads (content only)
      expect(loaded).toHaveLength(2);
    });
  });

  describe('loadUserAll', () => {
    it('returns [] when no home adapter is wired', async () => {
      const storage = new SkillStorage(createMockAdapter({}));
      expect(await storage.loadUserAll()).toEqual([]);
    });

    it('discovers ~/.claude/skills/ as read-only with host-absolute paths', async () => {
      const home = createMockHomeAdapter({
        '.claude/skills/global-tdd/SKILL.md': `---
description: Global TDD
---
Prompt`,
      });
      const storage = new SkillStorage(createMockAdapter({}), home);
      const loaded = await storage.loadUserAll();

      expect(loaded).toHaveLength(1);
      expect(loaded[0].skill.name).toBe('global-tdd');
      expect(loaded[0].skill.description).toBe('Global TDD');
      expect(loaded[0].readOnly).toBe(true);
      expect(loaded[0].filePath).toBe('/home/user/.claude/skills/global-tdd/SKILL.md');
      // Distinct id from a same-named vault skill so both survive id-keyed maps.
      expect(loaded[0].skill.id).toBe('user-skill-global-tdd');
    });

    it('skips home folders without SKILL.md', async () => {
      const home = createMockHomeAdapter({
        '.claude/skills/good/SKILL.md': `---
description: Good
---
Prompt`,
        '.claude/skills/nope/README.md': 'not a skill',
      });
      const storage = new SkillStorage(createMockAdapter({}), home);
      const loaded = await storage.loadUserAll();
      expect(loaded.map((l) => l.skill.name)).toEqual(['good']);
    });

    it('loads vault (read-write) and home (read-only) skills independently', async () => {
      const vault = createMockAdapter({
        '.claude/skills/vault-only/SKILL.md': `---
description: Vault
---
Prompt`,
      });
      const home = createMockHomeAdapter({
        '.claude/skills/home-only/SKILL.md': `---
description: Home
---
Prompt`,
      });
      const storage = new SkillStorage(vault, home);

      const vaultSkills = await storage.loadAll();
      const userSkills = await storage.loadUserAll();
      expect(vaultSkills.map((s) => s.skill.name)).toEqual(['vault-only']);
      expect(vaultSkills[0].readOnly).toBe(false);
      expect(userSkills.map((s) => s.skill.name)).toEqual(['home-only']);
      expect(userSkills[0].readOnly).toBe(true);
    });

    it('returns [] when home listing throws', async () => {
      const home = createMockHomeAdapter({});
      (home.listFolders as jest.Mock).mockRejectedValue(new Error('nope'));
      const storage = new SkillStorage(createMockAdapter({}), home);
      expect(await storage.loadUserAll()).toEqual([]);
    });
  });

  describe('loadPluginAll', () => {
    it('returns [] for no plugins', async () => {
      const storage = new SkillStorage(createMockAdapter({}));
      expect(await storage.loadPluginAll([])).toEqual([]);
    });

    it('scans whatever plugins it is given (enable-gating is the caller/manager job)', async () => {
      // loadPluginAll no longer re-filters on the raw `enabled` flag: the manager's
      // getEffectivelyEnabledPlugins() is the single enable/effective-source
      // authority, and it intentionally returns effectively-loaded plugins whose
      // raw `enabled` may be false (project-disable withheld on an untrusted vault).
      const factory = createPluginAdapterFactory({
        '/plugins/formatter': { 'skills/fix/SKILL.md': '---\ndescription: Fix\n---\nFix' },
      });
      const storage = new SkillStorage(createMockAdapter({}), undefined, factory);
      const loaded = await storage.loadPluginAll([plugin('formatter', '/plugins/formatter', false)]);
      expect(loaded.map((l) => l.skill.name)).toEqual(['formatter:fix']);
    });

    it('discovers enabled plugin skills from <installPath>/skills, namespaced and read-only', async () => {
      const factory = createPluginAdapterFactory({
        '/plugins/formatter': {
          'skills/review/SKILL.md': '---\ndescription: Plugin review\n---\nReview',
        },
      });
      const storage = new SkillStorage(createMockAdapter({}), undefined, factory);
      const loaded = await storage.loadPluginAll([plugin('formatter', '/plugins/formatter')]);

      expect(loaded).toHaveLength(1);
      // Namespaced `plugin:skill` name — the exact `/name` the runtime resolves.
      expect(loaded[0].skill.name).toBe('formatter:review');
      expect(loaded[0].skill.description).toBe('Plugin review');
      // Distinct, plugin-namespaced id so two plugins' same-named skills don't collide.
      expect(loaded[0].skill.id).toBe('plugin-skill-formatter:review');
      expect(loaded[0].readOnly).toBe(true);
      // Host-absolute path under the plugin install dir → clone/delete gate rejects it.
      expect(loaded[0].filePath).toBe('/plugins/formatter/skills/review/SKILL.md');
    });

    it('namespaces two plugins independently so same-named skills do not collide', async () => {
      const factory = createPluginAdapterFactory({
        '/plugins/a': { 'skills/deploy/SKILL.md': '---\ndescription: A deploy\n---\nA' },
        '/plugins/b': { 'skills/deploy/SKILL.md': '---\ndescription: B deploy\n---\nB' },
      });
      const storage = new SkillStorage(createMockAdapter({}), undefined, factory);
      const loaded = await storage.loadPluginAll([
        plugin('a', '/plugins/a'),
        plugin('b', '/plugins/b'),
      ]);

      expect(loaded.map((l) => l.skill.name).sort()).toEqual(['a:deploy', 'b:deploy']);
      expect(loaded.map((l) => l.skill.id).sort()).toEqual([
        'plugin-skill-a:deploy',
        'plugin-skill-b:deploy',
      ]);
    });

    it('builds injective ids for ambiguous kebab-case plugin/skill names', async () => {
      // plugin `a-b` skill `c` vs plugin `a` skill `b-c`: a `-` join collides
      // (both `...a-b-c`); the `:` separator keeps them distinct so the Library's
      // entryById map can't run the wrong plugin's skill.
      const factory = createPluginAdapterFactory({
        '/plugins/a-b': { 'skills/c/SKILL.md': '---\ndescription: ab-c\n---\nX' },
        '/plugins/a': { 'skills/b-c/SKILL.md': '---\ndescription: a-bc\n---\nY' },
      });
      const storage = new SkillStorage(createMockAdapter({}), undefined, factory);
      const loaded = await storage.loadPluginAll([
        plugin('a-b', '/plugins/a-b'),
        plugin('a', '/plugins/a'),
      ]);
      const ids = loaded.map((l) => l.skill.id).sort();
      expect(ids).toEqual(['plugin-skill-a-b:c', 'plugin-skill-a:b-c']);
      expect(new Set(ids).size).toBe(2);
    });

    it('loads a manifest path that is itself a skill dir (contains SKILL.md directly)', async () => {
      // "skills": ["./custom/extra"] where custom/extra/SKILL.md exists directly
      // — the runtime loads it as <plugin>:extra, not as a parent of skill dirs.
      const factory = createPluginAdapterFactory({
        '/plugins/p': {
          '.claude-plugin/plugin.json': JSON.stringify({ skills: ['./custom/extra'] }),
          'custom/extra/SKILL.md': '---\ndescription: Direct skill\n---\nD',
          'skills/normal/SKILL.md': '---\ndescription: Normal\n---\nN',
        },
      });
      const storage = new SkillStorage(createMockAdapter({}), undefined, factory);
      const loaded = await storage.loadPluginAll([plugin('p', '/plugins/p')]);
      expect(loaded.map((l) => l.skill.name).sort()).toEqual(['p:extra', 'p:normal']);
      expect(loaded.find((l) => l.skill.name === 'p:extra')!.filePath)
        .toBe('/plugins/p/custom/extra/SKILL.md');
    });

    it('returns [] for a plugin whose skills dir is absent (no throw)', async () => {
      const factory = createPluginAdapterFactory({}); // no files for any root
      const storage = new SkillStorage(createMockAdapter({}), undefined, factory);
      const loaded = await storage.loadPluginAll([plugin('empty', '/plugins/empty')]);
      expect(loaded).toEqual([]);
    });

    it('reads plugin skills independently of vault and user skills', async () => {
      const vault = createMockAdapter({
        '.claude/skills/vault-only/SKILL.md': '---\ndescription: Vault\n---\nV',
      });
      const home = createMockHomeAdapter({
        '.claude/skills/home-only/SKILL.md': '---\ndescription: Home\n---\nH',
      });
      const factory = createPluginAdapterFactory({
        '/plugins/p': { 'skills/plug-only/SKILL.md': '---\ndescription: Plugin\n---\nP' },
      });
      const storage = new SkillStorage(vault, home, factory);

      expect((await storage.loadAll()).map((s) => s.skill.name)).toEqual(['vault-only']);
      expect((await storage.loadUserAll()).map((s) => s.skill.name)).toEqual(['home-only']);
      expect((await storage.loadPluginAll([plugin('p', '/plugins/p')])).map((s) => s.skill.name)).toEqual([
        'p:plug-only',
      ]);
    });

    it('honors additive plugin.json skills path overrides (string form)', async () => {
      const factory = createPluginAdapterFactory({
        '/plugins/formatter': {
          '.claude-plugin/plugin.json': JSON.stringify({ name: 'formatter', skills: './extra-skills/' }),
          'skills/default-one/SKILL.md': '---\ndescription: Default\n---\nD',
          'extra-skills/extra-one/SKILL.md': '---\ndescription: Extra\n---\nE',
        },
      });
      const storage = new SkillStorage(createMockAdapter({}), undefined, factory);
      const loaded = await storage.loadPluginAll([plugin('formatter', '/plugins/formatter')]);
      // Default `skills/` is ALWAYS scanned; the manifest dir is added alongside it.
      expect(loaded.map((l) => l.skill.name).sort()).toEqual([
        'formatter:default-one',
        'formatter:extra-one',
      ]);
    });

    it('honors array-form overrides and dedupes a same-named skill (default wins)', async () => {
      const factory = createPluginAdapterFactory({
        '/plugins/p': {
          '.claude-plugin/plugin.json': JSON.stringify({ skills: ['./a/', './b/'] }),
          'skills/shared/SKILL.md': '---\ndescription: from default\n---\nD',
          'a/shared/SKILL.md': '---\ndescription: from a\n---\nA',
          'a/only-a/SKILL.md': '---\ndescription: only a\n---\nA',
          'b/only-b/SKILL.md': '---\ndescription: only b\n---\nB',
        },
      });
      const storage = new SkillStorage(createMockAdapter({}), undefined, factory);
      const loaded = await storage.loadPluginAll([plugin('p', '/plugins/p')]);
      expect(loaded.map((l) => l.skill.name).sort()).toEqual(['p:only-a', 'p:only-b', 'p:shared']);
      // `shared` exists in both the default and `a/`; the default root wins.
      expect(loaded.find((l) => l.skill.name === 'p:shared')!.skill.description).toBe('from default');
    });

    it('rejects unsafe manifest skill paths (traversal / absolute)', async () => {
      const factory = createPluginAdapterFactory({
        '/plugins/p': {
          '.claude-plugin/plugin.json': JSON.stringify({ skills: ['../../etc', '/abs/skills', './ok/'] }),
          'skills/base/SKILL.md': '---\ndescription: base\n---\nB',
          'ok/good/SKILL.md': '---\ndescription: good\n---\nG',
        },
      });
      const storage = new SkillStorage(createMockAdapter({}), undefined, factory);
      const loaded = await storage.loadPluginAll([plugin('p', '/plugins/p')]);
      // Only the default `skills/` and the safe `./ok/` override are scanned.
      expect(loaded.map((l) => l.skill.name).sort()).toEqual(['p:base', 'p:good']);
    });

    it('falls back to the default root when plugin.json is malformed', async () => {
      const factory = createPluginAdapterFactory({
        '/plugins/p': {
          '.claude-plugin/plugin.json': 'not json {{{',
          'skills/base/SKILL.md': '---\ndescription: base\n---\nB',
        },
      });
      const storage = new SkillStorage(createMockAdapter({}), undefined, factory);
      const loaded = await storage.loadPluginAll([plugin('p', '/plugins/p')]);
      expect(loaded.map((l) => l.skill.name)).toEqual(['p:base']);
    });
  });

  describe('save', () => {
    it('writes skill to correct path', async () => {
      const adapter = createMockAdapter({});
      const storage = new SkillStorage(adapter);

      await storage.save({
        id: 'skill-my-skill',
        name: 'my-skill',
        description: 'A skill',
        content: 'Do the thing',
      });

      expect(adapter.ensureFolder).toHaveBeenCalledWith('.claude/skills/my-skill');
      expect(adapter.write).toHaveBeenCalledWith(
        '.claude/skills/my-skill/SKILL.md',
        expect.stringContaining('description: A skill')
      );
    });

    it('serializes hooks field', async () => {
      const adapter = createMockAdapter({});
      const storage = new SkillStorage(adapter);
      const hooks = { PreToolUse: [{ matcher: 'Bash' }] };

      await storage.save({
        id: 'skill-hooked',
        name: 'hooked',
        content: 'prompt',
        hooks,
      });

      const written = (adapter.write as jest.Mock).mock.calls[0][1] as string;
      expect(written).toContain('hooks: ');
      expect(written).toContain(JSON.stringify(hooks));
    });

    it('serializes skill fields in kebab-case', async () => {
      const adapter = createMockAdapter({});
      const storage = new SkillStorage(adapter);

      await storage.save({
        id: 'skill-kebab',
        name: 'kebab',
        description: 'Kebab test',
        content: 'prompt',
        disableModelInvocation: true,
        userInvocable: false,
        context: 'fork',
        agent: 'code-reviewer',
      });

      const written = (adapter.write as jest.Mock).mock.calls[0][1] as string;
      expect(written).toContain('disable-model-invocation: true');
      expect(written).toContain('user-invocable: false');
      expect(written).toContain('context: fork');
      expect(written).toContain('agent: code-reviewer');
      // Should NOT contain camelCase variants
      expect(written).not.toContain('disableModelInvocation');
      expect(written).not.toContain('userInvocable');
    });

    it('omits hooks when undefined', async () => {
      const adapter = createMockAdapter({});
      const storage = new SkillStorage(adapter);

      await storage.save({
        id: 'skill-no-hooks',
        name: 'no-hooks',
        content: 'prompt',
      });

      const written = (adapter.write as jest.Mock).mock.calls[0][1] as string;
      expect(written).not.toContain('hooks:');
    });
  });

  describe('delete', () => {
    it('deletes skill file and cleans up directory', async () => {
      const adapter = createMockAdapter({
        '.claude/skills/target/SKILL.md': `---
description: Target
---
Prompt`,
      });
      const storage = new SkillStorage(adapter);

      await storage.delete('skill-target');

      expect(adapter.delete).toHaveBeenCalledWith('.claude/skills/target/SKILL.md');
      expect(adapter.deleteFolder).toHaveBeenCalledWith('.claude/skills/target');
    });
  });

  describe('loadAll parallelism', () => {
    function makeAdapter(map: Record<string, string>) {
      return {
        listFolders: jest.fn().mockResolvedValue(Object.keys(map).map((k) => `.claude/skills/${k}`)),
        exists: jest.fn().mockImplementation((p: string) => Promise.resolve(p in map || p.replace('/SKILL.md', '').split('/').pop()! in map)),
        read: jest.fn().mockImplementation((p: string) => {
          const name = p.replace('/SKILL.md', '').split('/').pop()!;
          const body = map[name];
          if (body === undefined) throw new Error(`missing ${p}`);
          return Promise.resolve(body);
        }),
      } as never;
    }

    it('returns one LoadedSkill per SKILL.md folder', async () => {
      const adapter = makeAdapter({
        tdd: '---\ndescription: TDD skill\n---\nbody',
        review: '---\ndescription: Review skill\n---\nbody',
      });
      const storage = new SkillStorage(adapter);
      const result = await storage.loadAll();
      expect(result.map((s) => s.skill.name).sort()).toEqual(['review', 'tdd']);
    });

    it('runs file reads in parallel', async () => {
      const order: string[] = [];
      const adapter = {
        listFolders: jest.fn().mockResolvedValue(['.claude/skills/a', '.claude/skills/b', '.claude/skills/c']),
        exists: jest.fn().mockResolvedValue(true),
        read: jest.fn().mockImplementation(async (p: string) => {
          order.push(`start:${p}`);
          await new Promise((r) => setTimeout(r, 5));
          order.push(`end:${p}`);
          return '---\ndescription: x\n---\n';
        }),
      } as never;
      const storage = new SkillStorage(adapter);
      await storage.loadAll();
      // Parallel: every 'start' must appear before any 'end'.
      // Sequential interleaves [start:a, end:a, start:b, end:b, ...].
      const firstEndIdx = order.findIndex((e) => e.startsWith('end:'));
      const startCount = order.filter((e) => e.startsWith('start:')).length;
      expect(firstEndIdx).toBe(startCount);
    });

    it('skips folders without a SKILL.md without throwing', async () => {
      const adapter = {
        listFolders: jest.fn().mockResolvedValue(['.claude/skills/a', '.claude/skills/orphan']),
        exists: jest.fn().mockImplementation((p: string) => Promise.resolve(p.endsWith('/a/SKILL.md'))),
        read: jest.fn().mockResolvedValue('---\ndescription: a\n---\n'),
      } as never;
      const storage = new SkillStorage(adapter);
      const result = await storage.loadAll();
      expect(result.map((s) => s.skill.name)).toEqual(['a']);
    });

    it('returns [] when root listing throws', async () => {
      const adapter = {
        listFolders: jest.fn().mockRejectedValue(new Error('nope')),
        exists: jest.fn(),
        read: jest.fn(),
      } as never;
      const storage = new SkillStorage(adapter);
      expect(await storage.loadAll()).toEqual([]);
    });
  });
});
