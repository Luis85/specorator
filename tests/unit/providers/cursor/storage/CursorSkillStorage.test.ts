import type { HomeFileAdapter } from '@/core/storage/HomeFileAdapter';
import type { VaultFileAdapter } from '@/core/storage/VaultFileAdapter';
import { CursorSkillStorage } from '@/providers/cursor/storage/CursorSkillStorage';

const HOME_ROOT = '/home/tester';

function createReadAdapter(files: Record<string, string>, homeRoot?: string): VaultFileAdapter {
  const adapter: Record<string, unknown> = {
    exists: jest.fn(async (p: string) => p in files),
    read: jest.fn(async (p: string) => {
      if (!(p in files)) throw new Error(`File not found: ${p}`);
      return files[p];
    }),
    listFolders: jest.fn(async (folder: string) => {
      const prefix = folder.endsWith('/') ? folder : `${folder}/`;
      const folders = new Set<string>();
      for (const p of Object.keys(files)) {
        if (p.startsWith(prefix)) {
          const rest = p.slice(prefix.length);
          const slash = rest.indexOf('/');
          if (slash >= 0) folders.add(prefix + rest.slice(0, slash));
        }
      }
      return Array.from(folders);
    }),
  };
  if (homeRoot) {
    adapter.getAbsolutePath = (rel: string) => `${homeRoot}/${rel}`;
  }
  return adapter as unknown as VaultFileAdapter;
}

function homeAdapter(files: Record<string, string>): HomeFileAdapter {
  return createReadAdapter(files, HOME_ROOT) as unknown as HomeFileAdapter;
}

function skillMd(description: string, body = 'Body'): string {
  return `---\ndescription: ${description}\n---\n${body}`;
}

describe('CursorSkillStorage', () => {
  it('discovers project skills from .cursor/skills with a vault-relative path', async () => {
    const vault = createReadAdapter({ '.cursor/skills/proj/SKILL.md': skillMd('Project skill') });
    const storage = new CursorSkillStorage(vault, homeAdapter({}));

    const skills = await storage.loadAll();

    expect(skills).toHaveLength(1);
    expect(skills[0]).toMatchObject({
      name: 'proj',
      description: 'Project skill',
      content: 'Body',
      sourceFilePath: '.cursor/skills/proj/SKILL.md',
      provenance: 'vault',
    });
  });

  it('discovers global skills from ~/.cursor/skills and ~/.agents/skills with host-absolute paths', async () => {
    const storage = new CursorSkillStorage(
      createReadAdapter({}),
      homeAdapter({
        '.cursor/skills/cursor-global/SKILL.md': skillMd('Cursor global'),
        '.agents/skills/agents-global/SKILL.md': skillMd('Agents global'),
      }),
    );

    const skills = await storage.loadAll();

    const byName = new Map(skills.map((s) => [s.name, s]));
    expect(byName.get('cursor-global')).toMatchObject({
      provenance: 'home',
      sourceFilePath: `${HOME_ROOT}/.cursor/skills/cursor-global/SKILL.md`,
    });
    expect(byName.get('agents-global')).toMatchObject({
      provenance: 'home',
      sourceFilePath: `${HOME_ROOT}/.agents/skills/agents-global/SKILL.md`,
    });
  });

  it('lets a project skill shadow a same-named global skill', async () => {
    const storage = new CursorSkillStorage(
      createReadAdapter({ '.cursor/skills/dup/SKILL.md': skillMd('from project') }),
      homeAdapter({ '.cursor/skills/dup/SKILL.md': skillMd('from global') }),
    );

    const skills = await storage.loadAll();

    expect(skills).toHaveLength(1);
    expect(skills[0]).toMatchObject({ name: 'dup', description: 'from project', provenance: 'vault' });
  });

  it('lets ~/.cursor/skills shadow a same-named ~/.agents/skills skill', async () => {
    const storage = new CursorSkillStorage(
      createReadAdapter({}),
      homeAdapter({
        '.agents/skills/dup/SKILL.md': skillMd('from agents'),
        '.cursor/skills/dup/SKILL.md': skillMd('from cursor'),
      }),
    );

    const skills = await storage.loadAll();

    expect(skills).toHaveLength(1);
    expect(skills[0].description).toBe('from cursor');
  });

  it('scans only the vault root when no home adapter is wired', async () => {
    const storage = new CursorSkillStorage(
      createReadAdapter({ '.cursor/skills/proj/SKILL.md': skillMd('Project') }),
    );

    const skills = await storage.loadAll();

    expect(skills.map((s) => s.name)).toEqual(['proj']);
  });

  it('skips folders without a SKILL.md', async () => {
    const storage = new CursorSkillStorage(
      createReadAdapter({ '.cursor/skills/not-a-skill/README.md': 'nope' }),
      homeAdapter({}),
    );

    expect(await storage.loadAll()).toEqual([]);
  });
});
