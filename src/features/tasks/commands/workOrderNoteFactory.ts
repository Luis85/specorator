import { normalizePath, TFile } from 'obsidian';

import type SpecoratorPlugin from '../../../main';

// Work-order note-file creation primitives, extracted from taskCommands so that hub
// stays under the LOC ratchet. Self-contained: depends only on the vault + plugin.

/** Strip a trailing `.md` (case-insensitive) so a path can seed a wikilink or an id. */
export function stripMarkdownExtension(path: string): string {
  return path.replace(/\.md$/i, '');
}

/** First free path at `basePath`, else `-2`, `-3`, … — a check-then-create reservation. */
export function uniquePath(plugin: SpecoratorPlugin, basePath: string): string {
  if (!plugin.app.vault.getAbstractFileByPath(basePath)) return basePath;
  const withoutExt = stripMarkdownExtension(basePath);
  let counter = 2;
  while (plugin.app.vault.getAbstractFileByPath(`${withoutExt}-${counter}.md`)) {
    counter += 1;
  }
  return `${withoutExt}-${counter}.md`;
}

/**
 * Create the work-order note, deriving the frontmatter `id` from the deduped filename
 * (the board/queue key) so the two never diverge, and retrying on a lost path race.
 * `uniquePath` is check-then-create: two same-second, same-title spawns can resolve the
 * SAME path before either `vault.create` lands, and the loser's create then rejects —
 * which would leave a chain predecessor without a successor. On that conflict we
 * recompute a fresh unique path + id (so the note rebuilds with the new id) and retry,
 * bounded so a persistent failure still surfaces rather than spinning. A `null` from
 * `buildContent` is a build failure, not a race, so it returns immediately.
 */
export async function createNoteWithUniqueId(
  plugin: SpecoratorPlugin,
  folder: string,
  baseName: string,
  buildContent: (id: string) => string | null,
): Promise<TFile | null> {
  const MAX_ATTEMPTS = 5;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const filePath = uniquePath(plugin, normalizePath(`${folder}/${baseName}.md`));
    const id = stripMarkdownExtension(filePath.split('/').pop() ?? filePath);
    const content = buildContent(id);
    if (content === null) return null;
    try {
      const created = await plugin.app.vault.create(filePath, content);
      return created instanceof TFile ? created : null;
    } catch (error) {
      const lostRace = plugin.app.vault.getAbstractFileByPath(filePath) !== null;
      if (!lostRace || attempt === MAX_ATTEMPTS - 1) throw error;
    }
  }
  return null;
}
