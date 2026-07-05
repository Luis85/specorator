import { defineStore } from 'pinia';
import { ref, shallowRef } from 'vue';

import type SpecoratorPlugin from '../../../../main';
import { extractStringArray, parseFrontmatter } from '../../../../utils/frontmatter';
import type { SkillTabEntry } from '../../../quickActions/skills/types';
import { refreshSkillCatalogBestEffort } from '../../../skills/refreshSkillCatalogBestEffort';
import { isCloneableSkillPath, vaultSkillFolderOf, writeSkillClone } from '../../../skills/skillCloning';
import type { SkillLibraryRow } from '../../../skills/skillLibraryRows';
import { toSkillLibraryRows } from '../../../skills/skillLibraryRows';
import { resolveSkillVaultPath } from '../../../skills/skillPaths';
import { mergeById } from '../mergeById';

/**
 * Reactive projection of the skill aggregator (SkillLibraryView.render's data
 * half). `entryFor`/`mtimeFor` mirror the legacy view's entryById/skillMtime
 * lookups; `loadSkillTags` ports its frontmatter + mtime read verbatim.
 */
export const useSkillLibraryStore = defineStore('library-skills', () => {
  const rows = shallowRef<SkillLibraryRow[]>([]);
  const loading = ref(false);

  let plugin: SpecoratorPlugin | null = null;
  let entryById = new Map<string, SkillTabEntry>();
  let mtimeById = new Map<string, number>();
  let loadToken = 0;

  function init(p: SpecoratorPlugin): void {
    plugin = p;
  }

  function entryFor(id: string): SkillTabEntry | undefined {
    return entryById.get(id);
  }

  function mtimeFor(id: string): number {
    return mtimeById.get(id) ?? 0;
  }

  /** Read frontmatter `tags` and file mtime for vault-file skills. Non-vault
   * skills surface a host-absolute `sourceFilePath`; `resolveSkillVaultPath`
   * relativizes an in-vault one so the adapter can read it — otherwise the
   * skill loses tags + sorts as `updated=0`. Genuinely out-of-vault
   * (home-scope) paths still fail and yield no tags/mtime. */
  async function loadSkillTags(
    entries: SkillTabEntry[],
    mtimes: Map<string, number>,
  ): Promise<Map<string, string[]>> {
    const p = plugin;
    if (!p) throw new Error('skillLibraryStore used before init()');
    const out = new Map<string, string[]>();
    await Promise.all(entries.map(async (e) => {
      if (!e.sourceFilePath) return;
      const readPath = resolveSkillVaultPath(p.app, e.sourceFilePath);
      if (!readPath) return;
      try {
        const content = await p.vaultFileAdapter.read(readPath);
        const parsed = parseFrontmatter(content);
        const tags = parsed ? extractStringArray(parsed.frontmatter, 'tags') : undefined;
        if (tags && tags.length > 0) out.set(e.id, tags);
        const st = await p.vaultFileAdapter.stat(readPath);
        if (st) mtimes.set(e.id, st.mtime);
      } catch { /* out-of-vault path or missing -> no tags/mtime */ }
    }));
    return out;
  }

  async function load(): Promise<void> {
    const p = plugin;
    if (!p) throw new Error('skillLibraryStore used before init()');
    // Request-token guard: a slow load that STARTED before a mutation must not
    // resolve AFTER the mutation's reload and overwrite fresher data (two
    // leaves open, or the mount load overlapping clone/create). ALL state —
    // rows AND the entry/mtime lookup maps — commits behind the token check so
    // a stale read can't desync the lookups from the rows either.
    const token = ++loadToken;
    loading.value = true;
    try {
      const entries = (await p.vaultSkillAggregator?.listAll()) ?? [];
      const mtimes = new Map<string, number>();
      const tagsById = await loadSkillTags(entries, mtimes);
      if (token !== loadToken) return; // superseded by a newer load — drop stale result
      entryById = new Map(entries.map((e) => [e.id, e]));
      mtimeById = mtimes;
      // Merge by identity so untouched skill rows keep their previous reference
      // (no card icon/tag repaint on a mutation reload — see mergeById).
      rows.value = mergeById(rows.value, toSkillLibraryRows(entries, tagsById), (r) => r.id);
    } finally {
      if (token === loadToken) loading.value = false;
    }
  }

  /** Port of SkillLibraryView.cloneSkill's write half; returns the clone path.
   * writeSkillClone derives the root from the source path, so a Codex clone
   * stays under `.codex/skills/` — invalidation must follow the owning
   * provider for the same reason. */
  async function clone(row: SkillLibraryRow): Promise<string | null> {
    const p = plugin;
    if (!p) throw new Error('skillLibraryStore used before init()');
    if (!isCloneableSkillPath(row.sourceFilePath)) return null;
    const path = await writeSkillClone(p.vaultFileAdapter, row.sourceFilePath, row.name);
    p.events.emit('vaultSkill.changed', { providerId: row.providerId });
    await refreshSkillCatalogBestEffort(p, row.providerId);
    await load();
    return path;
  }

  /**
   * Delete shares the clone writability gate (`vaultSkillFolderOf`, which
   * `isCloneableSkillPath` wraps): only exact `<root>/<name>/SKILL.md` sources
   * are deletable — host-absolute (global/home), runtime-discovered, and
   * malformed cache-hydrated paths all yield no folder and stay untouchable.
   * A skill IS its folder, so the whole dir goes.
   */
  async function remove(row: SkillLibraryRow): Promise<boolean> {
    const p = plugin;
    if (!p) throw new Error('skillLibraryStore used before init()');
    const folder = vaultSkillFolderOf(row.sourceFilePath);
    if (!folder) return false;
    await p.vaultFileAdapter.deleteFolderRecursive(folder);
    // Same seam as SkillEditorModal.save: skill dot-folders bypass the vault
    // watcher, so invalidate the aggregator bucket AND force-reload the owning
    // provider's catalog (Codex serves a 5s listing cache the event can't clear).
    p.events.emit('vaultSkill.changed', { providerId: row.providerId });
    await refreshSkillCatalogBestEffort(p, row.providerId);
    await load();
    return true;
  }

  return { rows, loading, init, load, clone, remove, entryFor, mtimeFor };
});
