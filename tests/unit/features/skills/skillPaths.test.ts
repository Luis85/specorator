import { resolveSkillVaultPath } from '@/features/skills/skillPaths';

const app = { vault: { adapter: { basePath: '/vault' } } } as never;

describe('resolveSkillVaultPath', () => {
  it('passes an already vault-relative Claude path through untouched', () => {
    expect(resolveSkillVaultPath(app, '.claude/skills/tdd/SKILL.md')).toBe('.claude/skills/tdd/SKILL.md');
  });

  it('converts a host-absolute in-vault Codex path back to vault-relative', () => {
    expect(resolveSkillVaultPath(app, '/vault/.codex/skills/review/SKILL.md'))
      .toBe('.codex/skills/review/SKILL.md');
  });

  it('returns null for a genuinely out-of-vault (home-scope) path', () => {
    expect(resolveSkillVaultPath(app, '/home/me/.codex/skills/review/SKILL.md')).toBeNull();
  });
});
