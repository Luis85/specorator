import type { VaultFileAdapter } from '../../../../src/core/storage/VaultFileAdapter';
import { isCloneableSkillPath, SKILLS_DIR, skillTemplate, writeSkillClone } from '../../../../src/features/skills/skillCloning';

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
    [`${SKILLS_DIR}/deep/nested/SKILL.md`],
    ['.codex/skills/b/SKILL.md'],
  ])('accepts vault-relative path %s', (path) => {
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
  ])('rejects %s', (_label, path) => {
    expect(isCloneableSkillPath(path)).toBe(false);
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
