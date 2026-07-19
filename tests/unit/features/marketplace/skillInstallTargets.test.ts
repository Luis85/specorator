import {
  DEFAULT_SKILL_TARGET,
  hasUnsafePathSegment,
  isSkillInstallScope,
  isSkillProviderTarget,
  SKILL_INSTALL_SCOPES,
  SKILL_PROVIDER_TARGETS,
  skillRootFor,
} from '@/features/marketplace/skillInstallTargets';

describe('skillInstallTargets', () => {
  it('offers exactly the three providers that own a skill root', () => {
    expect([...SKILL_PROVIDER_TARGETS]).toEqual(['claude', 'codex', 'cursor']);
    expect([...SKILL_INSTALL_SCOPES]).toEqual(['project', 'user']);
  });

  it('maps each provider to its skill root', () => {
    expect(skillRootFor({ provider: 'claude', scope: 'project' })).toBe('.claude/skills');
    expect(skillRootFor({ provider: 'codex', scope: 'user' })).toBe('.codex/skills');
    expect(skillRootFor({ provider: 'cursor', scope: 'project' })).toBe('.cursor/skills');
  });

  it('uses the same relative root for both scopes (scope picks vault vs. home)', () => {
    expect(skillRootFor({ provider: 'claude', scope: 'project' })).toBe(
      skillRootFor({ provider: 'claude', scope: 'user' }),
    );
  });

  it('defaults to claude / project', () => {
    expect(DEFAULT_SKILL_TARGET).toEqual({ provider: 'claude', scope: 'project' });
  });

  it('validates provider and scope values', () => {
    expect(isSkillProviderTarget('claude')).toBe(true);
    expect(isSkillProviderTarget('opencode')).toBe(false); // no own root
    expect(isSkillProviderTarget('nope')).toBe(false);
    expect(isSkillInstallScope('user')).toBe(true);
    expect(isSkillInstallScope('global')).toBe(false);
  });

  describe('hasUnsafePathSegment', () => {
    it('flags traversal, absolute, drive, and backslash paths', () => {
      expect(hasUnsafePathSegment('../evil')).toBe(true);
      expect(hasUnsafePathSegment('a/../b')).toBe(true);
      expect(hasUnsafePathSegment('/etc/passwd')).toBe(true);
      expect(hasUnsafePathSegment('C:\\Windows')).toBe(true);
      expect(hasUnsafePathSegment('a\\b')).toBe(true);
    });

    it('flags empty segments whose normalized form differs from the raw path', () => {
      // `a//b` collapses to `a/b` on disk — two raw-distinct entries could then
      // write to one destination, so an empty segment is unsafe.
      expect(hasUnsafePathSegment('scripts//run.mjs')).toBe(true);
      expect(hasUnsafePathSegment('scripts/')).toBe(true);
    });

    it('allows ordinary in-folder relative paths', () => {
      expect(hasUnsafePathSegment('scripts/setup.mjs')).toBe(false);
      expect(hasUnsafePathSegment('references/a.md')).toBe(false);
      expect(hasUnsafePathSegment('SKILL.md')).toBe(false);
      expect(hasUnsafePathSegment('project-setup')).toBe(false);
    });
  });
});
