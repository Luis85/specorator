import type { ProviderCommandEntry } from '@/core/providers/commands/ProviderCommandEntry';
import type { ProviderId } from '@/core/providers/types';
import {
  parsePersistedSkillIndex,
  PERSISTED_SCHEMA_VERSION,
  serializePersistedSkillIndex,
} from '@/features/quickActions/skills/skillIndexPersistence';

function entry(overrides: Partial<ProviderCommandEntry> = {}): ProviderCommandEntry {
  return {
    id: 'skill-a',
    providerId: 'claude',
    kind: 'skill',
    name: 'a',
    description: 'd',
    content: 'long body here',
    scope: 'vault',
    source: 'user',
    isEditable: true,
    isDeletable: true,
    displayPrefix: '/',
    insertPrefix: '/',
    sourceFilePath: '.claude/skills/a/SKILL.md',
    ...overrides,
  };
}

describe('skillIndexPersistence', () => {
  it('serializes buckets with content stripped', () => {
    const buckets = new Map<ProviderId, ProviderCommandEntry[]>([
      ['claude', [entry({ content: 'should be stripped' })]],
    ]);
    const json = serializePersistedSkillIndex(buckets, 1_700_000_000_000);
    const parsed = JSON.parse(json);
    expect(parsed.schemaVersion).toBe(PERSISTED_SCHEMA_VERSION);
    expect(parsed.writtenAt).toBe(1_700_000_000_000);
    expect(parsed.buckets.claude[0].content).toBe('');
  });

  it('redacts host-absolute sourceFilePath for user-scope (home) skills', () => {
    const buckets = new Map<ProviderId, ProviderCommandEntry[]>([
      ['claude', [
        entry({ id: 'skill-vault', scope: 'vault', sourceFilePath: '.claude/skills/vault/SKILL.md' }),
        entry({ id: 'skill-user', scope: 'user', sourceFilePath: '/Users/alice/.claude/skills/global/SKILL.md' }),
      ]],
    ]);
    const parsed = JSON.parse(serializePersistedSkillIndex(buckets, 1));
    const [vault, user] = parsed.buckets.claude;
    // Vault paths are vault-relative and safe to keep.
    expect(vault.sourceFilePath).toBe('.claude/skills/vault/SKILL.md');
    // The home path must never land in the vault-synced index.
    expect(user.sourceFilePath).toBeUndefined();
    expect(JSON.stringify(parsed)).not.toContain('/Users/alice');
  });

  it('round-trips via parse', () => {
    const original = new Map<ProviderId, ProviderCommandEntry[]>([
      ['codex', [entry({ providerId: 'codex', insertPrefix: '$' })]],
    ]);
    const json = serializePersistedSkillIndex(original, 1);
    const out = parsePersistedSkillIndex(json);
    expect(out).not.toBeNull();
    expect(out!.get('codex')?.[0].name).toBe('a');
  });

  it('returns null on malformed JSON', () => {
    expect(parsePersistedSkillIndex('not-json')).toBeNull();
  });

  it('returns null on schema mismatch', () => {
    const json = JSON.stringify({
      schemaVersion: 999,
      writtenAt: 0,
      buckets: { claude: [] },
    });
    expect(parsePersistedSkillIndex(json)).toBeNull();
  });

  it('discards a v1 index on upgrade so the refetch includes user skills', () => {
    // A pre-user-skill v1 cache holds vault skills but no ~/.claude ones. It must
    // be rejected (→ cold refetch) rather than served stale, which otherwise left
    // the Library showing vault skills while omitting global ones until a reload.
    const v1 = JSON.stringify({ schemaVersion: 1, writtenAt: 0, buckets: { claude: [entry()] } });
    expect(parsePersistedSkillIndex(v1)).toBeNull();
  });

  it('returns null on missing buckets field', () => {
    const json = JSON.stringify({
      schemaVersion: PERSISTED_SCHEMA_VERSION,
      writtenAt: 0,
    });
    expect(parsePersistedSkillIndex(json)).toBeNull();
  });

  it('drops corrupt entries (non-object, or sourceFilePath not a string) instead of casting blind', () => {
    const json = JSON.stringify({
      schemaVersion: PERSISTED_SCHEMA_VERSION,
      writtenAt: 0,
      buckets: {
        claude: [
          entry(),
          null,
          'not-an-entry',
          { ...entry({ id: 'skill-bad' }), sourceFilePath: 42 },
        ],
      },
    });
    const out = parsePersistedSkillIndex(json);
    expect(out).not.toBeNull();
    expect(out!.get('claude')?.map((e) => e.id)).toEqual(['skill-a']);
  });
});
