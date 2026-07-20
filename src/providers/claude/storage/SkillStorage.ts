import { normalizePath } from 'obsidian';

import { HomeFileAdapter } from '../../../core/storage/HomeFileAdapter';
import type { VaultFileAdapter } from '../../../core/storage/VaultFileAdapter';
import type { PluginInfo, SlashCommand } from '../../../core/types';
import { parsedToSlashCommand, parseSlashCommandContent, serializeCommand } from '../../../utils/slashCommand';

export const SKILLS_PATH = '.claude/skills';

/**
 * A Claude Code plugin roots its skills at `<installPath>/skills/`, NOT under a
 * nested `.claude/` (mirrors `AgentManager`'s `<installPath>/agents/`). So plugin
 * discovery scans this dir instead of `SKILLS_PATH`.
 */
export const PLUGIN_SKILLS_PATH = 'skills';

/** A plugin's manifest, relative to its install root. */
const PLUGIN_MANIFEST_PATH = '.claude-plugin/plugin.json';

/** The manifest fields we read; a plugin may add custom skill directories. */
interface PluginManifest {
  skills?: unknown;
}

/** Coerce a manifest `skills` value (string | string[]) to a string list. */
function toPathList(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string');
  return [];
}

/**
 * Normalize a manifest skill-dir path relative to the plugin root, or null when
 * unusable. The manifest is third-party, so this REJECTS anything that could
 * escape the install dir once joined: absolute/home paths, `..` traversal, and
 * the plugin root itself (`.`/`./`, the single-`SKILL.md`-at-root case, which
 * this directory scan doesn't cover). Windows separators are normalized first.
 */
function sanitizePluginSkillRoot(raw: string): string | null {
  const p = raw.trim().replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '');
  if (!p || p === '.') return null;
  if (p.startsWith('/') || p.startsWith('~')) return null;
  if (p.split('/').some((seg) => seg === '..')) return null;
  return p;
}

/** First-wins dedupe by skill name — a skill listed in both the default and a
 * custom manifest root would otherwise surface twice with the same `/name`. */
function dedupeSkillsByName(skills: LoadedSkill[]): LoadedSkill[] {
  const seen = new Set<string>();
  return skills.filter((s) => (seen.has(s.skill.name) ? false : (seen.add(s.skill.name), true)));
}

export interface LoadedSkill {
  skill: SlashCommand;
  /** Vault-relative for vault skills; host-absolute for read-only home/plugin skills. */
  filePath: string;
  /**
   * True for skills outside the vault (`~/.claude/skills/` home scope and
   * plugin `<installPath>/skills/`): view/run only, never written back.
   */
  readOnly: boolean;
}

/** Skill discovery only reads; the vault, home, and plugin adapters satisfy this. */
type SkillReadAdapter = Pick<VaultFileAdapter, 'exists' | 'read' | 'listFolders'>;

/** Read adapter rooted at a host-absolute path (home dir or a plugin install path). */
type RootedReadAdapter = SkillReadAdapter & Pick<HomeFileAdapter, 'getAbsolutePath'>;

/** Per-root scan knobs: where to look, whether it is editable, and how ids/names are formed. */
interface RootScanConfig {
  skillsPath: string;
  readOnly: boolean;
  toSourcePath: (relativePath: string) => string;
  makeId: (skillName: string) => string;
  makeName: (skillName: string) => string;
}

export class SkillStorage {
  constructor(
    private adapter: VaultFileAdapter,
    private home?: HomeFileAdapter,
    // Injected so tests can stub plugin roots without touching the real fs;
    // production builds one home-style adapter rooted at each plugin's install path.
    private createPluginAdapter: (root: string) => RootedReadAdapter = (root) => new HomeFileAdapter(root),
  ) {}

  /** Editable vault skills under `.claude/skills/`. */
  async loadAll(): Promise<LoadedSkill[]> {
    return this.loadRoot(this.adapter, {
      skillsPath: SKILLS_PATH,
      readOnly: false,
      toSourcePath: (relPath) => relPath,
      makeId: (name) => `skill-${name}`,
      makeName: (name) => name,
    });
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
    return this.loadRoot(home, {
      skillsPath: SKILLS_PATH,
      readOnly: true,
      toSourcePath: (relPath) => home.getAbsolutePath(relPath),
      makeId: (name) => `user-skill-${name}`,
      makeName: (name) => name,
    });
  }

  /**
   * Read-only skills contributed by enabled Claude Code plugins, discovered
   * from each plugin's `<installPath>/skills/<name>/SKILL.md` (mirrors how
   * `AgentManager` scans `<installPath>/agents/`). Disabled plugins are skipped
   * — their skills do not load in the runtime either.
   *
   * Plugin skills are invoked NAMESPACED as `/<plugin>:<skill>` (Claude
   * namespaces them to prevent cross-plugin collisions —
   * https://code.claude.com/docs/en/plugins-reference.md), so the surfaced
   * `name` carries that `plugin:skill` form, which is exactly what the SDK
   * returns in its `slash_commands` list and what `runVaultSkill` dispatches.
   * Paths are host-absolute (outside the vault) so the clone/delete gate keeps
   * them view/run only.
   */
  async loadPluginAll(plugins: PluginInfo[]): Promise<LoadedSkill[]> {
    const perPlugin = await Promise.all(
      plugins.filter((p) => p.enabled).map((p) => this.loadPluginRoot(p)),
    );
    return perPlugin.flat();
  }

  private async loadPluginRoot(plugin: PluginInfo): Promise<LoadedSkill[]> {
    const adapter = this.createPluginAdapter(plugin.installPath);
    const roots = await this.resolvePluginSkillRoots(adapter);
    const perRoot = await Promise.all(
      roots.map((skillsPath) =>
        this.loadRoot(adapter, {
          skillsPath,
          readOnly: true,
          toSourcePath: (relPath) => adapter.getAbsolutePath(relPath),
          // Namespace id AND name by plugin so two plugins can ship a same-named
          // skill without colliding in the aggregator's id-keyed maps or the
          // `/name` wire.
          makeId: (name) => `plugin-skill-${plugin.name}-${name}`,
          makeName: (name) => `${plugin.name}:${name}`,
        }),
      ),
    );
    return dedupeSkillsByName(perRoot.flat());
  }

  /**
   * The skill directories to scan for a plugin: the default `skills/` root is
   * ALWAYS scanned, and any directories the plugin's `.claude-plugin/plugin.json`
   * lists under `skills` are scanned alongside it (additive — matching the
   * runtime — https://code.claude.com/docs/en/plugins-reference.md). Absent or
   * unreadable manifest falls back to just the default.
   */
  private async resolvePluginSkillRoots(adapter: RootedReadAdapter): Promise<string[]> {
    const roots = [PLUGIN_SKILLS_PATH];
    const manifest = await this.readPluginManifest(adapter);
    for (const raw of toPathList(manifest?.skills)) {
      const clean = sanitizePluginSkillRoot(raw);
      if (clean && !roots.includes(clean)) roots.push(clean);
    }
    return roots;
  }

  private async readPluginManifest(adapter: RootedReadAdapter): Promise<PluginManifest | null> {
    try {
      if (!(await adapter.exists(PLUGIN_MANIFEST_PATH))) return null;
      const parsed: unknown = JSON.parse(await adapter.read(PLUGIN_MANIFEST_PATH));
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
      return null;
    }
  }

  private async loadRoot(
    adapter: SkillReadAdapter,
    config: RootScanConfig,
  ): Promise<LoadedSkill[]> {
    try {
      const folders = await adapter.listFolders(config.skillsPath);
      const results = await Promise.all(
        folders.map((f) => this.loadOne(adapter, f, config)),
      );
      return results.filter((x): x is LoadedSkill => x !== null);
    } catch {
      return [];
    }
  }

  private async loadOne(
    adapter: SkillReadAdapter,
    folder: string,
    config: RootScanConfig,
  ): Promise<LoadedSkill | null> {
    const skillName = folder.split('/').pop()!;
    const skillPath = `${config.skillsPath}/${skillName}/SKILL.md`;
    try {
      if (!(await adapter.exists(skillPath))) return null;
      const content = await adapter.read(skillPath);
      const parsed = parseSlashCommandContent(content);
      return {
        skill: {
          ...parsedToSlashCommand(parsed, {
            // Distinct id per scope so a same-named personal + project skill
            // (which Claude allows — personal shadows project at `/name`) both
            // survive the aggregator's id-keyed maps instead of colliding.
            id: config.makeId(skillName),
            name: config.makeName(skillName),
            source: 'user',
          }),
          kind: 'skill',
        },
        filePath: config.toSourcePath(skillPath),
        readOnly: config.readOnly,
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
