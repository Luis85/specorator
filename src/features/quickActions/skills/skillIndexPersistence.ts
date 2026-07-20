import type { ProviderCommandEntry } from '../../../core/providers/commands/ProviderCommandEntry';
import type { ProviderId } from '../../../core/providers/types';

// v3: the persisted shape now also carries plugin-scope (`<installPath>/skills`)
// entries and redacts their host-absolute paths alongside user-scope ones. A v2
// index (written before plugin-skill discovery) holds vault + user skills but no
// plugin skills; hydrating it serves that stale set for the TTL, so the Library
// — which loads once on mount, unlike the refreshable quick-actions tab — could
// show vault/user skills while omitting plugin ones until a manual reload.
// Rejecting older versions forces a cold, complete refetch on upgrade. Bump this
// whenever the persisted entry shape or its redaction changes.
export const PERSISTED_SCHEMA_VERSION = 3;

interface PersistedShape {
  schemaVersion: number;
  writtenAt: number;
  buckets: Record<string, ProviderCommandEntry[]>;
}

/**
 * Serializes the in-memory per-provider buckets to a JSON string for
 * `.specorator/cache/skill-index.json`. Skill bodies (`content`) are stripped
 * before write — they are large and the Skills tab only renders metadata.
 * `runVaultSkill` re-reads the actual `SKILL.md` at execution time anyway.
 *
 * User-scope (`~/.claude/skills/`) and plugin-scope (`<installPath>/skills/`)
 * entries carry a host-absolute `sourceFilePath` such as `/Users/alice/.claude/...`.
 * This index can sync or back up with the vault, so that host path is redacted
 * before write; the entry is re-discovered with its real path in memory on the
 * next fetch, and being read-only it never needs the path persisted.
 */
export function serializePersistedSkillIndex(
  buckets: Map<ProviderId, ProviderCommandEntry[]>,
  writtenAt: number,
): string {
  const out: PersistedShape = {
    schemaVersion: PERSISTED_SCHEMA_VERSION,
    writtenAt,
    buckets: {},
  };
  for (const [providerId, entries] of buckets) {
    out.buckets[providerId] = entries.map((e) =>
      e.scope === 'user' || e.scope === 'plugin'
        ? { ...e, content: '', sourceFilePath: undefined }
        : { ...e, content: '' },
    );
  }
  return JSON.stringify(out);
}

/**
 * Returns the deserialized per-provider buckets, or `null` if the JSON is
 * malformed, the schema version does not match, or required fields are
 * missing. Callers treat `null` as "cold cache" and continue normally.
 */
export function parsePersistedSkillIndex(
  raw: string,
): Map<ProviderId, ProviderCommandEntry[]> | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const shape = parsed as Partial<PersistedShape>;
  if (shape.schemaVersion !== PERSISTED_SCHEMA_VERSION) return null;
  if (!shape.buckets || typeof shape.buckets !== 'object') return null;

  const out = new Map<ProviderId, ProviderCommandEntry[]>();
  for (const [providerId, entries] of Object.entries(shape.buckets)) {
    if (!Array.isArray(entries)) continue;
    out.set(providerId, entries.filter(isSaneEntry));
  }
  return out;
}

/**
 * Type sanity for a cache-hydrated entry — the file is world-writable, so
 * dropping malformed entries beats casting blind. Full path-shape validation
 * belongs to the clone/delete gate (`vaultSkillFolderOf`); here we only refuse
 * non-objects and a `sourceFilePath` that is present but not a string, which
 * downstream code would otherwise feed into path-derivation logic.
 */
function isSaneEntry(entry: unknown): entry is ProviderCommandEntry {
  if (!entry || typeof entry !== 'object') return false;
  const sourceFilePath = (entry as { sourceFilePath?: unknown }).sourceFilePath;
  return sourceFilePath === undefined || sourceFilePath === null || typeof sourceFilePath === 'string';
}
