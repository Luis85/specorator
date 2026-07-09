import type { VaultFileAdapter } from '../../core/storage/VaultFileAdapter';
import { librarySlug, uniqueChildDir } from '../../utils/libraryView';

// Canonical vault skill location (Claude-compatible). Kept local so the view
// stays in the features layer rather than importing provider storage.
export const SKILLS_DIR = '.claude/skills';

/**
 * Every root a vault skill folder may live under. Deliberately duplicated from
 * the provider storage modules (`CodexSkillStorage` etc.) rather than imported
 * — features must not depend on providers (boundary rule) — and safe to
 * duplicate because these roots are stable storage contracts catalogued in the
 * root CLAUDE.md storage table.
 */
export const VAULT_SKILL_ROOTS: readonly string[] = [SKILLS_DIR, '.codex/skills', '.agents/skills'];

/**
 * The one folder clone/delete may act on for a skill source path, or null when
 * the path is not EXACTLY the `<root>/<name>/SKILL.md` shape with `<root>` in
 * `VAULT_SKILL_ROOTS`. Rows can carry arbitrary paths (the aggregator hydrates
 * from an unvalidated on-disk cache), and a looser derivation is catastrophic:
 * `'SKILL.md'` would yield the vault root, `'.claude/skills/SKILL.md'` a whole
 * skills root. Also rejects host-absolute/`~`/drive/backslash paths and `.`/
 * `..` name segments, so the folder can never escape the skill's own dir.
 */
export function vaultSkillFolderOf(p: string | null): string | null {
  if (!p || p.startsWith('/') || p.startsWith('~') || p.startsWith('\\')) return null;
  if (/^[A-Za-z]:/.test(p) || p.includes('\\')) return null; // Windows drive / UNC / host separators
  const segments = p.split('/');
  if (segments.length !== 4 || segments[3] !== 'SKILL.md') return null;
  const name = segments[2];
  if (!name || name === '.' || name === '..') return null;
  const root = `${segments[0]}/${segments[1]}`;
  if (!VAULT_SKILL_ROOTS.includes(root)) return null;
  return `${root}/${name}`;
}

/**
 * Clone/delete writability gate, shared by the Vue Skills panel and the legacy
 * view. Both actions go through the vault adapter, which only understands
 * vault-relative paths: vault-rooted skills surface those regardless of
 * provider (Codex vault entries are relativized in
 * `CodexSkillCatalog.listVaultEntries`); only NON-VAULT skills stay
 * host-absolute (global/home scope) and runtime-discovered skills have no path
 * at all. Beyond that, the gate requires the exact `<root>/<name>/SKILL.md`
 * shape (see `vaultSkillFolderOf`) so a malformed row can neither scatter a
 * misplaced clone nor derive a delete target outside its own skill folder.
 */
export function isCloneableSkillPath(p: string | null): p is string {
  return vaultSkillFolderOf(p) !== null;
}

/**
 * Write half of skill duplication, shared by the legacy SkillLibraryView and
 * the Vue skill store: copy `<root>/<name>/SKILL.md` into a fresh
 * `<root>/<slug>-copy[-n]/` dir and return the clone's SKILL.md path. Callers
 * gate `sourceFilePath` through `isCloneableSkillPath` first.
 */
export async function writeSkillClone(
  adapter: VaultFileAdapter,
  sourceFilePath: string,
  name: string,
): Promise<string> {
  const root = sourceFilePath.split('/').slice(0, -2).join('/'); // `.claude/skills`
  const content = await adapter.read(sourceFilePath).catch(() => '');
  const dir = await uniqueChildDir(adapter, root, `${librarySlug(name)}-copy`);
  const path = `${dir}/SKILL.md`;
  await adapter.write(path, content);
  return path;
}

export function skillTemplate(name: string): string {
  return `---
description: Describe what this skill does and when to use it.
---

# ${name}

Write the skill instructions here.
`;
}
