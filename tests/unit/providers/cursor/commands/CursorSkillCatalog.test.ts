import { CursorSkillCatalog } from '@/providers/cursor/commands/CursorSkillCatalog';
import type { CursorSkillEntry, CursorSkillStorage } from '@/providers/cursor/storage/CursorSkillStorage';

function fakeStorage(skills: CursorSkillEntry[]): CursorSkillStorage {
  return { loadAll: jest.fn().mockResolvedValue(skills) } as unknown as CursorSkillStorage;
}

const PROJECT_SKILL: CursorSkillEntry = {
  name: 'refactor',
  description: 'Refactor helper',
  content: 'Do the refactor',
  sourceFilePath: '.cursor/skills/refactor/SKILL.md',
  provenance: 'vault',
};

const GLOBAL_SKILL: CursorSkillEntry = {
  name: 'review',
  description: 'Review helper',
  content: 'Do the review',
  sourceFilePath: '/home/tester/.cursor/skills/review/SKILL.md',
  provenance: 'home',
};

describe('CursorSkillCatalog', () => {
  it('maps project skills to editable vault entries with the `/` prefix', async () => {
    const catalog = new CursorSkillCatalog(fakeStorage([PROJECT_SKILL]));

    const [entry] = await catalog.listVaultEntries();

    expect(entry).toMatchObject({
      id: 'cursor-skill-refactor',
      providerId: 'cursor',
      kind: 'skill',
      name: 'refactor',
      scope: 'vault',
      // Project skills are editable via the Library's in-place editor
      // (`.cursor/skills` is in the shared VAULT_SKILL_ROOTS); globals stay read-only.
      isEditable: true,
      isDeletable: true,
      displayPrefix: '/',
      insertPrefix: '/',
      sourceFilePath: '.cursor/skills/refactor/SKILL.md',
    });
  });

  it('maps global skills to read-only user-scope entries with a path-free id', async () => {
    const catalog = new CursorSkillCatalog(fakeStorage([GLOBAL_SKILL]));

    const [entry] = await catalog.listVaultEntries();

    expect(entry.scope).toBe('user');
    expect(entry.isEditable).toBe(false);
    // The id must not embed the host-absolute path (it is persisted into the
    // vault-synced skill-index cache); the host path stays only on sourceFilePath,
    // which the persistence layer redacts for user-scope entries.
    expect(entry.id).toBe('cursor-skill-review');
    expect(entry.id).not.toContain('/home/tester');
    expect(entry.sourceFilePath).toBe('/home/tester/.cursor/skills/review/SKILL.md');
  });

  it('exposes the same skills through the chat dropdown listing', async () => {
    const catalog = new CursorSkillCatalog(fakeStorage([PROJECT_SKILL, GLOBAL_SKILL]));

    const entries = await catalog.listDropdownEntries({ includeBuiltIns: true });

    expect(entries.map((e) => e.name).sort()).toEqual(['refactor', 'review']);
  });

  it('advertises `/` as the trigger and skill prefix', () => {
    const config = new CursorSkillCatalog(fakeStorage([])).getDropdownConfig();

    expect(config.providerId).toBe('cursor');
    expect(config.triggerChars).toEqual(['/']);
    expect(config.skillPrefix).toBe('/');
  });

  it('rejects catalog writes — Cursor editing flows through the Library editor', async () => {
    const catalog = new CursorSkillCatalog(fakeStorage([PROJECT_SKILL]));

    await expect(catalog.saveVaultEntry(undefined as never)).rejects.toThrow(/Library editor/);
    await expect(catalog.deleteVaultEntry(undefined as never)).rejects.toThrow(/Library editor/);
  });

  it('refreshes without throwing (filesystem is re-scanned per call)', async () => {
    await expect(new CursorSkillCatalog(fakeStorage([])).refresh()).resolves.toBeUndefined();
  });
});
