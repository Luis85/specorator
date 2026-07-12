import type { VaultFileAdapter } from '../../../../src/core/storage/VaultFileAdapter';
import { isCloneableSkillPath, SKILLS_DIR, skillTemplate, vaultSkillFolderOf, writeSkillClone } from '../../../../src/features/skills/skillCloning';

describe('skillTemplate', () => {
  it('emits the exact frontmatter + heading scaffold for a new skill', () => {
    expect(skillTemplate('My Skill')).toBe(`---
description: Describe what this skill does and when to use it.
---

# My Skill

Write the skill instructions here.
`);
  });
});

describe('isCloneableSkillPath', () => {
  it.each([
    ['.claude/skills/a/SKILL.md'],
    ['.codex/skills/b/SKILL.md'],
    ['.agents/skills/c/SKILL.md'],
    ['.cursor/skills/d/SKILL.md'],
    [`${SKILLS_DIR}/my-skill-copy/SKILL.md`],
  ])('accepts the <root>/<name>/SKILL.md shape %s', (path) => {
    expect(isCloneableSkillPath(path)).toBe(true);
  });

  it.each([
    ['null (runtime-discovered skill)', null],
    ['empty string', ''],
    ['host-absolute POSIX path', '/home/u/.codex/skills/a/SKILL.md'],
    ['home-relative path', '~/.claude/skills/a/SKILL.md'],
    ['UNC-style leading backslash', '\\\\server\\share\\SKILL.md'],
    ['Windows drive letter', 'C:/Users/u/.claude/skills/a/SKILL.md'],
    ['backslash separators', '.claude\\skills\\a\\SKILL.md'],
    ['parent-dir escape', '.claude/skills/../../secrets/SKILL.md'],
    // Shape violations: a delete derived from these would escape the skill's
    // own folder (vault root, a whole skills root, or an arbitrary vault note).
    ['bare SKILL.md (folder would be the vault root)', 'SKILL.md'],
    ['SKILL.md directly under a root (folder would be ALL skills)', '.claude/skills/SKILL.md'],
    ['arbitrary vault note', 'Notes/x.md'],
    ['nested beyond <root>/<name> (5 segments)', '.claude/skills/a/b/SKILL.md'],
    ['unknown root', 'foo/skills/a/SKILL.md'],
    ['wrong filename', '.claude/skills/a/OTHER.md'],
    ['dot name (folder would be the root itself)', '.claude/skills/./SKILL.md'],
    ['dot-dot name (folder would be the root parent)', '.claude/skills/../SKILL.md'],
    ['empty name segment', '.claude/skills//SKILL.md'],
  ])('rejects %s', (_label, path) => {
    expect(isCloneableSkillPath(path)).toBe(false);
  });
});

describe('vaultSkillFolderOf', () => {
  it.each([
    ['.claude/skills/a/SKILL.md', '.claude/skills/a'],
    ['.codex/skills/b/SKILL.md', '.codex/skills/b'],
    ['.agents/skills/c/SKILL.md', '.agents/skills/c'],
    ['.cursor/skills/d/SKILL.md', '.cursor/skills/d'],
  ])('returns the skill folder for %s', (path, folder) => {
    expect(vaultSkillFolderOf(path)).toBe(folder);
  });

  it.each([
    [null],
    ['SKILL.md'],
    ['.claude/skills/SKILL.md'],
    ['Notes/x.md'],
    ['.claude/skills/a/b/SKILL.md'],
    ['foo/skills/a/SKILL.md'],
    ['/home/u/.codex/skills/a/SKILL.md'],
  ])('returns null for %s so no delete target can be derived', (path) => {
    expect(vaultSkillFolderOf(path)).toBeNull();
  });
});

describe('writeSkillClone', () => {
  function makeAdapter(overrides: Partial<Record<'read' | 'exists', jest.Mock>> = {}) {
    return {
      read: overrides.read ?? jest.fn().mockResolvedValue('source content'),
      exists: overrides.exists ?? jest.fn().mockResolvedValue(false),
      write: jest.fn().mockResolvedValue(undefined),
    };
  }

  it('derives the skills root from the source path and writes the copy beside it', async () => {
    const adapter = makeAdapter();
    const path = await writeSkillClone(adapter as unknown as VaultFileAdapter, '.claude/skills/a/SKILL.md', 'My Skill');
    expect(path).toBe('.claude/skills/my-skill-copy/SKILL.md');
    expect(adapter.write).toHaveBeenCalledWith('.claude/skills/my-skill-copy/SKILL.md', 'source content');
  });

  it('probes -copy-2 when the -copy dir is already taken', async () => {
    const adapter = makeAdapter({
      exists: jest.fn().mockImplementation((dir: string) => Promise.resolve(dir === '.codex/skills/a-copy')),
    });
    const path = await writeSkillClone(adapter as unknown as VaultFileAdapter, '.codex/skills/a/SKILL.md', 'a');
    expect(path).toBe('.codex/skills/a-copy-2/SKILL.md');
  });

  it('falls back to empty content when the source read fails', async () => {
    const adapter = makeAdapter({ read: jest.fn().mockRejectedValue(new Error('gone')) });
    const path = await writeSkillClone(adapter as unknown as VaultFileAdapter, '.claude/skills/a/SKILL.md', 'a');
    expect(path).toBe('.claude/skills/a-copy/SKILL.md');
    expect(adapter.write).toHaveBeenCalledWith('.claude/skills/a-copy/SKILL.md', '');
  });
});
