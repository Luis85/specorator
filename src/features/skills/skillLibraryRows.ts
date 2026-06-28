import type { SkillTabEntry } from '../quickActions/skills/types';

export interface SkillLibraryRow {
  id: string;
  name: string;
  description: string;
  providerDisplayName: string;
  sourceFilePath: string | null;
  editable: boolean;
  /** Frontmatter tags; populated by `toSkillLibraryRows` (defaults to []). */
  tags?: string[];
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
      providerDisplayName: e.providerDisplayName,
      sourceFilePath: e.sourceFilePath,
      editable: e.sourceFilePath !== null,
      tags: tagsById?.get(e.id) ?? [],
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
