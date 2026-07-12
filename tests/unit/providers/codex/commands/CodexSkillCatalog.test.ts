import type { SpecoratorEventMap } from '@/app/events/specoratorEvents';
import { EventBus } from '@/core/events/EventBus';
import type { ProviderCommandEntry } from '@/core/providers/commands/ProviderCommandEntry';
import type { VaultFileAdapter } from '@/core/storage/VaultFileAdapter';
import { CodexSkillCatalog } from '@/providers/codex/commands/CodexSkillCatalog';
import type { SkillMetadata } from '@/providers/codex/runtime/codexAppServerTypes';
import type { CodexSkillListProvider } from '@/providers/codex/skills/CodexSkillListingService';
import {
  CodexSkillStorage,
  createCodexSkillPersistenceKey,
} from '@/providers/codex/storage/CodexSkillStorage';

function createMockAdapter(files: Record<string, string> = {}): VaultFileAdapter {
  return {
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
}

function createMockSkillListProvider(
  skills: SkillMetadata[] = [],
): CodexSkillListProvider {
  return {
    listSkills: jest.fn().mockResolvedValue(skills),
    invalidate: jest.fn(),
  };
}

describe('CodexSkillCatalog', () => {
  describe('listDropdownEntries', () => {
    it('returns skills from app-server metadata instead of directory scans', async () => {
      const storage = new CodexSkillStorage(createMockAdapter({}), createMockAdapter({}));
      const listProvider = createMockSkillListProvider([
        {
          name: 'my-skill',
          description: 'A Codex skill',
          path: '/test/vault/.codex/skills/my-skill/SKILL.md',
          scope: 'repo',
          enabled: true,
        },
        {
          name: 'home-skill',
          description: 'Home skill',
          path: '/Users/test/.codex/skills/home-skill/SKILL.md',
          scope: 'user',
          enabled: true,
        },
      ]);
      const catalog = new CodexSkillCatalog(storage, listProvider, '/test/vault');

      const entries = await catalog.listDropdownEntries({ includeBuiltIns: false });

      expect(entries).toHaveLength(2);
      expect(entries.some(e => e.name === 'compact')).toBe(false);

      const vaultEntry = entries.find(e => e.name === 'my-skill');
      expect(vaultEntry).toBeDefined();
      expect(vaultEntry!.providerId).toBe('codex');
      expect(vaultEntry!.kind).toBe('skill');
      expect(vaultEntry!.scope).toBe('vault');
      expect(vaultEntry!.displayPrefix).toBe('$');
      expect(vaultEntry!.insertPrefix).toBe('$');
      expect(vaultEntry!.source).toBe('user');
      expect(vaultEntry!.content).toBe('');
      expect(vaultEntry!.persistenceKey).toBe(
        createCodexSkillPersistenceKey({
          rootId: 'vault-codex',
          currentName: 'my-skill',
        }),
      );
      expect(vaultEntry!.id).toBe('codex-skill-vault-codex-my-skill');

      const homeEntry = entries.find(e => e.name === 'home-skill');
      expect(homeEntry).toBeDefined();
      expect(homeEntry!.scope).toBe('user');
      expect(homeEntry!.isEditable).toBe(false);
      expect(homeEntry!.isDeletable).toBe(false);
      expect(homeEntry!.persistenceKey).toBeUndefined();
      // Read-only skill ids key off scope + name, never the host-absolute path —
      // the id is persisted into the vault-synced cache and must not leak `~`.
      expect(homeEntry!.id).toBe('codex-skill-user-home-skill');
      expect(homeEntry!.id).not.toContain('/Users/test');
    });

    it('sets sourceFilePath on dropdown entries', async () => {
      const storage = new CodexSkillStorage(createMockAdapter({}), createMockAdapter({}));
      const listProvider = createMockSkillListProvider([
        {
          name: 'my-skill',
          description: 'A vault skill',
          path: '/test/vault/.codex/skills/my-skill/SKILL.md',
          scope: 'repo',
          enabled: true,
        },
        {
          name: 'home-skill',
          description: 'Home skill',
          path: '/Users/test/.codex/skills/home-skill/SKILL.md',
          scope: 'user',
          enabled: true,
        },
      ]);
      const catalog = new CodexSkillCatalog(storage, listProvider, '/test/vault');

      const entries = await catalog.listDropdownEntries({ includeBuiltIns: false });
      const vault = entries.find(e => e.name === 'my-skill')!;
      const home = entries.find(e => e.name === 'home-skill')!;
      expect(vault.sourceFilePath).toBe('/test/vault/.codex/skills/my-skill/SKILL.md');
      expect(home.sourceFilePath).toBe('/Users/test/.codex/skills/home-skill/SKILL.md');
    });

    it('omits disabled skills from dropdown entries', async () => {
      const storage = new CodexSkillStorage(createMockAdapter({}), createMockAdapter({}));
      const listProvider = createMockSkillListProvider([
        {
          name: 'enabled-skill',
          description: 'Enabled',
          path: '/test/vault/.codex/skills/enabled-skill/SKILL.md',
          scope: 'repo',
          enabled: true,
        },
        {
          name: 'disabled-skill',
          description: 'Disabled',
          path: '/test/vault/.codex/skills/disabled-skill/SKILL.md',
          scope: 'repo',
          enabled: false,
        },
      ]);
      const catalog = new CodexSkillCatalog(storage, listProvider, '/test/vault');

      const entries = await catalog.listDropdownEntries({ includeBuiltIns: false });

      expect(entries.map(entry => entry.name)).toEqual(['enabled-skill']);
    });
  });

  describe('listVaultEntries', () => {
    it('returns editable repo skills plus read-only user/global skills', async () => {
      const vaultAdapter = createMockAdapter({
        '.codex/skills/vault-skill/SKILL.md': `---
description: Vault
---
Prompt`,
      });
      const storage = new CodexSkillStorage(vaultAdapter, createMockAdapter({}));
      const listProvider = createMockSkillListProvider([
        {
          name: 'vault-skill',
          description: 'Vault',
          path: '/test/vault/.codex/skills/vault-skill/SKILL.md',
          scope: 'repo',
          enabled: true,
        },
        {
          name: 'home-skill',
          description: 'Home',
          path: '/Users/test/.codex/skills/home-skill/SKILL.md',
          scope: 'user',
          enabled: true,
        },
        {
          name: 'other-repo-skill',
          description: 'Other repo',
          path: '/test/vault/scripts/skills/other-repo-skill/SKILL.md',
          scope: 'repo',
          enabled: true,
        },
      ]);
      const catalog = new CodexSkillCatalog(storage, listProvider, '/test/vault');

      const entries = await catalog.listVaultEntries();

      // Editable vault skill (loaded from storage) + read-only home skill. A repo
      // skill outside a managed root stays excluded (can't edit, not user-scope).
      expect(entries).toHaveLength(2);

      const vault = entries.find(e => e.name === 'vault-skill')!;
      expect(vault.scope).toBe('vault');
      expect(vault.isEditable).toBe(true);
      expect(vault.content).toBe('Prompt');
      // Vault-relative, NOT the host-absolute wire path: the Skills tab's
      // clone/delete gate and the vault adapter both act on this value.
      expect(vault.sourceFilePath).toBe('.codex/skills/vault-skill/SKILL.md');

      const home = entries.find(e => e.name === 'home-skill')!;
      expect(home.scope).toBe('user');
      expect(home.isEditable).toBe(false);
      expect(home.isDeletable).toBe(false);
      // Host-absolute wire path — the read-only gates key off this shape.
      expect(home.sourceFilePath).toBe('/Users/test/.codex/skills/home-skill/SKILL.md');
      // ...but the id (which IS persisted) stays path-free.
      expect(home.id).toBe('codex-skill-user-home-skill');

      expect(entries.find(e => e.name === 'other-repo-skill')).toBeUndefined();
    });

    it('retains disabled repo skills (editable) so they stay manageable in settings', async () => {
      const vaultAdapter = createMockAdapter({
        '.codex/skills/disabled-vault-skill/SKILL.md': `---
description: Disabled but editable
---
Prompt`,
      });
      const storage = new CodexSkillStorage(vaultAdapter, createMockAdapter({}));
      const listProvider = createMockSkillListProvider([
        {
          name: 'disabled-vault-skill',
          description: 'Disabled but editable',
          path: '/test/vault/.codex/skills/disabled-vault-skill/SKILL.md',
          scope: 'repo',
          enabled: false,
        },
      ]);
      const catalog = new CodexSkillCatalog(storage, listProvider, '/test/vault');

      // The dropdown/run surface hides it (not invocable while disabled)...
      const dropdown = await catalog.listDropdownEntries({ includeBuiltIns: false });
      expect(dropdown.find(e => e.name === 'disabled-vault-skill')).toBeUndefined();

      // ...but the management listing keeps it editable so the user can still
      // edit/delete it in Codex settings without touching files by hand.
      const vaultEntries = await catalog.listVaultEntries();
      const disabled = vaultEntries.find(e => e.name === 'disabled-vault-skill')!;
      expect(disabled).toBeDefined();
      expect(disabled.isEditable).toBe(true);
      expect(disabled.isDeletable).toBe(true);
    });

    it('surfaces vault-relative sourceFilePath for both managed roots', async () => {
      const vaultAdapter = createMockAdapter({
        '.codex/skills/codex-skill/SKILL.md': '---\ndescription: A\n---\nPrompt',
        '.agents/skills/agents-skill/SKILL.md': '---\ndescription: B\n---\nPrompt',
      });
      const storage = new CodexSkillStorage(vaultAdapter, createMockAdapter({}));
      const listProvider = createMockSkillListProvider([
        {
          name: 'codex-skill',
          description: 'A',
          path: '/test/vault/.codex/skills/codex-skill/SKILL.md',
          scope: 'repo',
          enabled: true,
        },
        {
          name: 'agents-skill',
          description: 'B',
          path: '/test/vault/.agents/skills/agents-skill/SKILL.md',
          scope: 'repo',
          enabled: true,
        },
      ]);
      const catalog = new CodexSkillCatalog(storage, listProvider, '/test/vault');

      const entries = await catalog.listVaultEntries();

      expect(entries.map(e => e.sourceFilePath).sort()).toEqual([
        '.agents/skills/agents-skill/SKILL.md',
        '.codex/skills/codex-skill/SKILL.md',
      ]);
    });

    it('recognizes repo skills under a \\\\wsl$ vault path', async () => {
      const vaultAdapter = createMockAdapter({
        '.codex/skills/vault-skill/SKILL.md': `---
description: Vault
---
Prompt`,
      });
      const storage = new CodexSkillStorage(vaultAdapter, createMockAdapter({}));
      const listProvider = createMockSkillListProvider([
        {
          name: 'vault-skill',
          description: 'Vault',
          path: '\\\\wsl$\\Ubuntu\\home\\user\\vault\\.codex\\skills\\vault-skill\\SKILL.md',
          scope: 'repo',
          enabled: true,
        },
      ]);
      const catalog = new CodexSkillCatalog(storage, listProvider, '\\\\wsl$\\Ubuntu\\home\\user\\vault');

      const entries = await catalog.listVaultEntries();

      expect(entries).toHaveLength(1);
      expect(entries[0].name).toBe('vault-skill');
      expect(entries[0].scope).toBe('vault');
    });

  });

  describe('saveVaultEntry', () => {
    it('saves through storage to vault .codex/skills', async () => {
      const adapter = createMockAdapter({});
      const storage = new CodexSkillStorage(adapter);
      const listProvider = createMockSkillListProvider();
      const catalog = new CodexSkillCatalog(storage, listProvider, '/test/vault');

      await catalog.saveVaultEntry({
        id: 'codex-skill-new',
        providerId: 'codex',
        kind: 'skill',
        name: 'new-skill',
        description: 'New skill',
        content: 'Do things',
        scope: 'vault',
        source: 'user',
        isEditable: true,
        isDeletable: true,
        displayPrefix: '$',
        insertPrefix: '$',
        persistenceKey: createCodexSkillPersistenceKey({
          rootId: 'vault-codex',
          currentName: 'old-skill',
        }),
      });

      expect(adapter.ensureFolder).toHaveBeenCalledWith('.codex/skills/new-skill');
      expect(adapter.write).toHaveBeenCalledWith(
        '.codex/skills/new-skill/SKILL.md',
        expect.stringContaining('Do things'),
      );
      expect(adapter.delete).toHaveBeenCalledWith('.codex/skills/old-skill/SKILL.md');
      expect(listProvider.invalidate).toHaveBeenCalled();
    });

    it('preserves .agents storage root when editing an existing .agents skill', async () => {
      const adapter = createMockAdapter({});
      const storage = new CodexSkillStorage(adapter);
      const catalog = new CodexSkillCatalog(storage, createMockSkillListProvider(), '/test/vault');

      await catalog.saveVaultEntry({
        id: 'codex-skill-agent',
        providerId: 'codex',
        kind: 'skill',
        name: 'agent',
        description: 'Agent skill',
        content: 'Do things',
        scope: 'vault',
        source: 'user',
        isEditable: true,
        isDeletable: true,
        displayPrefix: '$',
        insertPrefix: '$',
        persistenceKey: createCodexSkillPersistenceKey({
          rootId: 'vault-agents',
          currentName: 'agent',
        }),
      });

      expect(adapter.ensureFolder).toHaveBeenCalledWith('.agents/skills/agent');
      expect(adapter.write).toHaveBeenCalledWith(
        '.agents/skills/agent/SKILL.md',
        expect.stringContaining('Do things'),
      );
    });
  });

  describe('deleteVaultEntry', () => {
    it('deletes through storage', async () => {
      const adapter = createMockAdapter({
        '.codex/skills/target/SKILL.md': `---
description: Target
---
Prompt`,
      });
      const storage = new CodexSkillStorage(adapter);
      const listProvider = createMockSkillListProvider();
      const catalog = new CodexSkillCatalog(storage, listProvider, '/test/vault');

      await catalog.deleteVaultEntry({
        id: 'codex-skill-target',
        providerId: 'codex',
        kind: 'skill',
        name: 'target',
        description: 'Target',
        content: 'Prompt',
        scope: 'vault',
        source: 'user',
        isEditable: true,
        isDeletable: true,
        displayPrefix: '$',
        insertPrefix: '$',
      });

      expect(adapter.delete).toHaveBeenCalledWith('.codex/skills/target/SKILL.md');
      expect(listProvider.invalidate).toHaveBeenCalled();
    });

    it('deletes from .agents when the persistence key points there', async () => {
      const adapter = createMockAdapter({
        '.agents/skills/target/SKILL.md': `---
description: Target
---
Prompt`,
      });
      const storage = new CodexSkillStorage(adapter);
      const catalog = new CodexSkillCatalog(storage, createMockSkillListProvider(), '/test/vault');

      await catalog.deleteVaultEntry({
        id: 'codex-skill-target',
        providerId: 'codex',
        kind: 'skill',
        name: 'target',
        description: 'Target',
        content: 'Prompt',
        scope: 'vault',
        source: 'user',
        isEditable: true,
        isDeletable: true,
        displayPrefix: '$',
        insertPrefix: '$',
        persistenceKey: createCodexSkillPersistenceKey({
          rootId: 'vault-agents',
          currentName: 'target',
        }),
      });

      expect(adapter.delete).toHaveBeenCalledWith('.agents/skills/target/SKILL.md');
    });
  });

  describe('getDropdownConfig', () => {
    it('returns Codex-specific config with $ for skills', () => {
      const adapter = createMockAdapter({});
      const storage = new CodexSkillStorage(adapter);
      const catalog = new CodexSkillCatalog(storage, createMockSkillListProvider(), '/test/vault');

      const config = catalog.getDropdownConfig();

      expect(config.triggerChars).toEqual(['/', '$']);
      expect(config.builtInPrefix).toBe('/');
      expect(config.skillPrefix).toBe('$');
      expect(config.commandPrefix).toBe('/');
    });
  });

  describe('refresh', () => {
    it('forces an app-server reload instead of relying on scans', async () => {
      const adapter = createMockAdapter({});
      const storage = new CodexSkillStorage(adapter);
      const listProvider = createMockSkillListProvider([]);
      const catalog = new CodexSkillCatalog(storage, listProvider, '/test/vault');

      await catalog.refresh();

      expect(listProvider.invalidate).toHaveBeenCalledTimes(1);
      expect(listProvider.listSkills).toHaveBeenCalledWith({ forceReload: true });
    });
  });

  describe('built-in /compact command', () => {
    it('includes /compact in dropdown entries', async () => {
      const adapter = createMockAdapter({});
      const storage = new CodexSkillStorage(adapter);
      const catalog = new CodexSkillCatalog(storage, createMockSkillListProvider(), '/test/vault');

      const entries = await catalog.listDropdownEntries({ includeBuiltIns: true });
      const compactEntry = entries.find(e => e.name === 'compact');

      expect(compactEntry).toBeDefined();
      expect(compactEntry!.providerId).toBe('codex');
      expect(compactEntry!.kind).toBe('command');
      expect(compactEntry!.displayPrefix).toBe('/');
      expect(compactEntry!.insertPrefix).toBe('/');
      expect(compactEntry!.isEditable).toBe(false);
      expect(compactEntry!.isDeletable).toBe(false);
      expect(compactEntry!.source).toBe('builtin');
    });

    it('places /compact before scan-backed skills', async () => {
      const storage = new CodexSkillStorage(createMockAdapter({}), createMockAdapter({}));
      const listProvider = createMockSkillListProvider([
        {
          name: 'my-skill',
          description: 'A skill',
          path: '/test/vault/.codex/skills/my-skill/SKILL.md',
          scope: 'repo',
          enabled: true,
        },
      ]);
      const catalog = new CodexSkillCatalog(storage, listProvider, '/test/vault');

      const entries = await catalog.listDropdownEntries({ includeBuiltIns: true });

      const compactIndex = entries.findIndex(e => e.name === 'compact');
      const skillIndex = entries.findIndex(e => e.name === 'my-skill');

      expect(compactIndex).toBeGreaterThanOrEqual(0);
      expect(skillIndex).toBeGreaterThanOrEqual(0);
      expect(compactIndex).toBeLessThan(skillIndex);
    });

    it('does not include /compact in vault entries', async () => {
      const adapter = createMockAdapter({});
      const storage = new CodexSkillStorage(adapter);
      const catalog = new CodexSkillCatalog(storage, createMockSkillListProvider(), '/test/vault');

      const entries = await catalog.listVaultEntries();
      const compactEntry = entries.find(e => e.name === 'compact');

      expect(compactEntry).toBeUndefined();
    });
  });
});

describe('CodexSkillCatalog EventBus emission', () => {
  function skillEntry(): ProviderCommandEntry {
    return {
      id: 'codex-skill-vault-codex-x',
      providerId: 'codex',
      kind: 'skill',
      name: 'x',
      description: '',
      content: 'body',
      scope: 'vault',
      source: 'user',
      isEditable: true,
      isDeletable: true,
      displayPrefix: '$',
      insertPrefix: '$',
      sourceFilePath: '.codex/skills/x/SKILL.md',
      persistenceKey: 'vault-codex::x',
    };
  }
  function mkStorage() {
    return {
      save: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
      load: jest.fn().mockResolvedValue(null),
    } as never;
  }
  function mkListProvider() {
    return {
      listSkills: jest.fn().mockResolvedValue([]),
      invalidate: jest.fn(),
    } as never;
  }

  it('emits vaultSkill.changed on save', async () => {
    const bus = new EventBus<{ 'vaultSkill.changed': { providerId: 'codex' } }>();
    const events: Array<{ providerId: string }> = [];
    bus.on('vaultSkill.changed', (p) => { events.push(p); });
    const catalog = new CodexSkillCatalog(
      mkStorage(), mkListProvider(), '/vault', bus as unknown as EventBus<SpecoratorEventMap>,
    );
    await catalog.saveVaultEntry(skillEntry());
    expect(events).toEqual([{ providerId: 'codex' }]);
  });

  it('emits vaultSkill.changed on delete', async () => {
    const bus = new EventBus<{ 'vaultSkill.changed': { providerId: 'codex' } }>();
    const events: Array<{ providerId: string }> = [];
    bus.on('vaultSkill.changed', (p) => { events.push(p); });
    const catalog = new CodexSkillCatalog(
      mkStorage(), mkListProvider(), '/vault', bus as unknown as EventBus<SpecoratorEventMap>,
    );
    await catalog.deleteVaultEntry(skillEntry());
    expect(events).toEqual([{ providerId: 'codex' }]);
  });

  it('works without an EventBus', async () => {
    const catalog = new CodexSkillCatalog(
      mkStorage(), mkListProvider(), '/vault',
    );
    await expect(catalog.saveVaultEntry(skillEntry())).resolves.not.toThrow();
  });
});
