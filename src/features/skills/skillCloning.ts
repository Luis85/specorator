import type { VaultFileAdapter } from '../../core/storage/VaultFileAdapter';
import { librarySlug, uniqueChildDir } from '../../utils/libraryView';

// Canonical vault skill location (Claude-compatible). Kept local so the view
// stays in the features layer rather than importing provider storage.
export const SKILLS_DIR = '.claude/skills';

/**
 * Clone/delete writability gate. Both actions write through the vault adapter,
 * which only understands vault-relative paths. Vault-rooted skills surface
 * those regardless of provider (Codex vault entries are relativized in
 * `CodexSkillCatalog.listVaultEntries`); only NON-VAULT skills stay
 * host-absolute (global/home scope) and runtime-discovered skills have no path
 * at all — both would make a write scatter a misplaced/empty tree inside the
 * vault. Gate the actions to paths the adapter can actually touch:
 * vault-relative, no drive letter, no `..` escape.
 */
export function isCloneableSkillPath(p: string | null): p is string {
  if (!p || p.startsWith('/') || p.startsWith('~') || p.startsWith('\\')) return false;
  if (/^[A-Za-z]:/.test(p) || p.includes('\\')) return false; // Windows drive / UNC / host separators
  return !p.split('/').some((segment) => segment === '..');
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
