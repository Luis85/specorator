import { normalizePath } from 'obsidian';

import type { HomeFileAdapter } from '../../../core/storage/HomeFileAdapter';
import type { VaultFileAdapter } from '../../../core/storage/VaultFileAdapter';
import type { SlashCommand } from '../../../core/types';
import { parsedToSlashCommand, parseSlashCommandContent, serializeCommand } from '../../../utils/slashCommand';

export const SKILLS_PATH = '.claude/skills';

export interface LoadedSkill {
  skill: SlashCommand;
  /** Vault-relative for vault skills; host-absolute for read-only home skills. */
  filePath: string;
  /** True for `~/.claude/skills/` (home scope): outside the vault, view/run only. */
  readOnly: boolean;
}

/** Skill discovery only reads; both the vault and home adapters satisfy this. */
type SkillReadAdapter = Pick<VaultFileAdapter, 'exists' | 'read' | 'listFolders'>;

export class SkillStorage {
  constructor(
    private adapter: VaultFileAdapter,
    private home?: HomeFileAdapter,
  ) {}

  /** Editable vault skills under `.claude/skills/`. */
  async loadAll(): Promise<LoadedSkill[]> {
    return this.loadRoot(this.adapter, (relPath) => relPath, false);
  }

  /**
   * Read-only skills under the user's `~/.claude/skills/`. Surfaced so the
   * user's global Claude skills appear in the plugin even though they live
   * outside the vault. Paths are host-absolute so `VaultFileAdapter` (and the
   * Library's clone/delete gate) recognize them as out-of-vault and keep them
   * view/run only — writing them would fabricate a bogus in-vault tree. Returns
   * [] when no home adapter is wired (tests, mobile).
   */
  async loadUserAll(): Promise<LoadedSkill[]> {
    const home = this.home;
    if (!home) return [];
    return this.loadRoot(home, (relPath) => home.getAbsolutePath(relPath), true);
  }

  private async loadRoot(
    adapter: SkillReadAdapter,
    toSourcePath: (relativePath: string) => string,
    readOnly: boolean,
  ): Promise<LoadedSkill[]> {
    try {
      const folders = await adapter.listFolders(SKILLS_PATH);
      const results = await Promise.all(
        folders.map((f) => this.loadOne(adapter, f, toSourcePath, readOnly)),
      );
      return results.filter((x): x is LoadedSkill => x !== null);
    } catch {
      return [];
    }
  }

  private async loadOne(
    adapter: SkillReadAdapter,
    folder: string,
    toSourcePath: (relativePath: string) => string,
    readOnly: boolean,
  ): Promise<LoadedSkill | null> {
    const skillName = folder.split('/').pop()!;
    const skillPath = `${SKILLS_PATH}/${skillName}/SKILL.md`;
    try {
      if (!(await adapter.exists(skillPath))) return null;
      const content = await adapter.read(skillPath);
      const parsed = parseSlashCommandContent(content);
      return {
        skill: {
          ...parsedToSlashCommand(parsed, {
            id: `skill-${skillName}`,
            name: skillName,
            source: 'user',
          }),
          kind: 'skill',
        },
        filePath: toSourcePath(skillPath),
        readOnly,
      };
    } catch {
      return null;
    }
  }

  async save(skill: SlashCommand): Promise<void> {
    const name = skill.name;
    // Skill name is user-/agent-supplied; normalize the vault path it forms.
    const dirPath = normalizePath(`${SKILLS_PATH}/${name}`);
    const filePath = normalizePath(`${dirPath}/SKILL.md`);

    await this.adapter.ensureFolder(dirPath);
    await this.adapter.write(filePath, serializeCommand(skill));
  }

  async delete(skillId: string): Promise<void> {
    const name = skillId.replace(/^skill-/, '');
    const dirPath = normalizePath(`${SKILLS_PATH}/${name}`);
    const filePath = normalizePath(`${dirPath}/SKILL.md`);
    await this.adapter.delete(filePath);
    await this.adapter.deleteFolder(dirPath);
  }
}
