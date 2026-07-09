import type { ProviderId } from '../../core/providers/types';
import type { LibraryItemAccessors } from '../../shared/libraryToolbar';
import type { SkillTabEntry } from '../quickActions/skills/types';

export interface SkillLibraryRow {
  id: string;
  name: string;
  description: string;
  /** Owning provider — drives the `vaultSkill.changed` invalidation bucket. */
  providerId: ProviderId;
  providerDisplayName: string;
  sourceFilePath: string | null;
  editable: boolean;
  /** Frontmatter tags; populated by `toSkillLibraryRows` (defaults to []). */
  tags?: string[];
}

/**
 * Search/sort/tag accessors shared by the legacy SkillLibraryView and the Vue
 * Skills panel so both surfaces rank and filter skills identically. Provider is
 * a filter facet too (mirrors the agent view feeding roles), so a provider chip
 * filters the list and matches the card's provider chip label. `mtimeFor` reads
 * the caller's mtime lookup (populated by its loadSkillTags pass), falling back
 * to 0 for skills without a local source file (e.g. runtime-discovered Opencode
 * skills).
 */
export function skillLibraryAccessors(
  mtimeFor: (id: string) => number,
): LibraryItemAccessors<SkillLibraryRow> {
  return {
    getName: (r) => r.name,
    getDescription: (r) => r.description,
    getTags: (r) => [r.providerDisplayName, ...(r.tags ?? [])],
    getUpdatedAt: (r) => mtimeFor(r.id),
  };
}

/**
 * Map aggregator entries to library rows. `tagsById` carries frontmatter tags
 * parsed by the view for vault-file skills; entries absent from the map get `[]`.
 */
export function toSkillLibraryRows(
  entries: SkillTabEntry[],
  tagsById?: Map<string, string[]>,
): SkillLibraryRow[] {
  return entries
    .map((e) => ({
      id: e.id,
      name: e.name,
      description: e.description,
      providerId: e.providerId,
      providerDisplayName: e.providerDisplayName,
      sourceFilePath: e.sourceFilePath,
      editable: e.sourceFilePath !== null,
      tags: tagsById?.get(e.id) ?? [],
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
