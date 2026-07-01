import type { SkillTabEntry } from '@/features/quickActions/skills/types';
import { toSkillLibraryRows } from '@/features/skills/skillLibraryRows';

function entry(over: Partial<SkillTabEntry> = {}): SkillTabEntry {
  return {
    id: 'claude:skill-a', providerId: 'claude', providerDisplayName: 'Claude', name: 'a',
    description: 'desc', insertPrefix: '$', sourceFilePath: '.claude/skills/a/SKILL.md',
    providerEnabled: true, ...over,
  };
}

describe('toSkillLibraryRows', () => {
  it('marks file-backed entries editable and runtime entries read-only', () => {
    const rows = toSkillLibraryRows([
      entry({ id: 'claude:tdd', sourceFilePath: '.claude/skills/tdd/SKILL.md' }),
      entry({ id: 'opencode:x', providerId: 'opencode', sourceFilePath: null }),
    ]);
    expect(rows.find((r) => r.id === 'claude:tdd')?.editable).toBe(true);
    expect(rows.find((r) => r.id === 'opencode:x')?.editable).toBe(false);
  });

  it('sorts by name', () => {
    const rows = toSkillLibraryRows([
      entry({ id: 'b', name: 'beta' }),
      entry({ id: 'a', name: 'alpha' }),
    ]);
    expect(rows.map((r) => r.name)).toEqual(['alpha', 'beta']);
  });

  it('defaults tags to an empty array', () => {
    const [row] = toSkillLibraryRows([entry()]);
    expect(row.tags).toEqual([]);
  });

  it('applies tags from the supplied tag map', () => {
    const [row] = toSkillLibraryRows([entry()], new Map([['claude:skill-a', ['x', 'y']]]));
    expect(row.tags).toEqual(['x', 'y']);
  });

  it('carries the entry providerId onto the row (drives the invalidation bucket)', () => {
    const [row] = toSkillLibraryRows([entry({ providerId: 'codex' })]);
    expect(row.providerId).toBe('codex');
  });
});
