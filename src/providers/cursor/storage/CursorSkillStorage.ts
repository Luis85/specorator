import type { HomeFileAdapter } from '../../../core/storage/HomeFileAdapter';
import type { VaultFileAdapter } from '../../../core/storage/VaultFileAdapter';
import { parseSlashCommandContent } from '../../../utils/slashCommand';

/** Project (vault) skill root Cursor loads. */
export const CURSOR_SKILL_VAULT_ROOT = '.cursor/skills';
/**
 * User-global skill roots Cursor loads, relative to the home dir
 * (`HomeFileAdapter` root). Only Cursor's OWN global roots are scanned:
 * `.claude/skills`, `.codex/skills`, and vault `.agents/skills` are already
 * surfaced under their owning provider, so re-listing them here would just
 * duplicate Library rows.
 */
export const CURSOR_SKILL_HOME_ROOTS = ['.agents/skills', '.cursor/skills'] as const;

export type CursorSkillProvenance = 'vault' | 'home';

export interface CursorSkillEntry {
  name: string;
  description?: string;
  content: string;
  /** Vault-relative for project skills; host-absolute for read-only home skills. */
  sourceFilePath: string;
  provenance: CursorSkillProvenance;
}

/** Skill discovery only reads; both the vault and home adapters satisfy this. */
type CursorSkillReadAdapter = Pick<VaultFileAdapter, 'exists' | 'read' | 'listFolders'>;

/**
 * Discovers Cursor Agent Skills (the `SKILL.md` open standard) from Cursor's
 * own roots and surfaces them read-only, mirroring how Claude's `~/.claude`
 * and Codex's global skills appear in the Library. Cursor has no in-app skill
 * editor, so nothing here is writable.
 *
 * Skills are de-duplicated by name with project (vault) shadowing global,
 * matching Cursor's own precedence, so each `/name` card reflects the skill
 * that Cursor actually resolves.
 */
export class CursorSkillStorage {
  constructor(
    private readonly vaultAdapter: CursorSkillReadAdapter,
    private readonly homeAdapter?: HomeFileAdapter,
  ) {}

  async loadAll(): Promise<CursorSkillEntry[]> {
    const byName = new Map<string, CursorSkillEntry>();
    const collect = (skills: CursorSkillEntry[]): void => {
      for (const skill of skills) {
        const key = skill.name.toLowerCase();
        byName.delete(key);
        byName.set(key, skill);
      }
    };

    // Scan low→high precedence (later wins): global roots first, project last.
    const home = this.homeAdapter;
    if (home) {
      for (const root of CURSOR_SKILL_HOME_ROOTS) {
        collect(await this.scanRoot(home, root, 'home', (p) => home.getAbsolutePath(p)));
      }
    }
    collect(await this.scanRoot(this.vaultAdapter, CURSOR_SKILL_VAULT_ROOT, 'vault', (p) => p));

    return Array.from(byName.values());
  }

  private async scanRoot(
    adapter: CursorSkillReadAdapter,
    root: string,
    provenance: CursorSkillProvenance,
    toSourcePath: (relativePath: string) => string,
  ): Promise<CursorSkillEntry[]> {
    try {
      const folders = await adapter.listFolders(root);
      const results = await Promise.all(
        folders.map((folder) => this.loadOne(adapter, root, folder, provenance, toSourcePath)),
      );
      return results.filter((x): x is CursorSkillEntry => x !== null);
    } catch {
      // Root doesn't exist or can't be read.
      return [];
    }
  }

  private async loadOne(
    adapter: CursorSkillReadAdapter,
    root: string,
    folder: string,
    provenance: CursorSkillProvenance,
    toSourcePath: (relativePath: string) => string,
  ): Promise<CursorSkillEntry | null> {
    const name = folder.split('/').pop() ?? '';
    if (!name) return null;
    const skillPath = `${root}/${name}/SKILL.md`;
    try {
      if (!(await adapter.exists(skillPath))) return null;
      const parsed = parseSlashCommandContent(await adapter.read(skillPath));
      return {
        name,
        description: parsed.description,
        content: parsed.promptContent,
        sourceFilePath: toSourcePath(skillPath),
        provenance,
      };
    } catch {
      // Skip unreadable/malformed files; the rest of the scan still succeeds.
      return null;
    }
  }
}
