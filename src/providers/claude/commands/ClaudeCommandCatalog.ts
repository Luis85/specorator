import type { SpecoratorEventMap } from '../../../app/events/specoratorEvents';
import type { EventBus } from '../../../core/events/EventBus';
import type {
  ProviderCommandCatalog,
  ProviderCommandDropdownConfig,
} from '../../../core/providers/commands/ProviderCommandCatalog';
import type {
  ProviderCommandEntry,
  ProviderCommandScope,
} from '../../../core/providers/commands/ProviderCommandEntry';
import type { AppPluginManager } from '../../../core/providers/types';
import type { SlashCommand } from '../../../core/types';
import { isSkill } from '../../../utils/slashCommand';
import type { SkillStorage } from '../storage/SkillStorage';
import type { SlashCommandStorage } from '../storage/SlashCommandStorage';

function slashCommandToEntry(
  cmd: SlashCommand,
  options: { sourceFilePath?: string; readOnly?: boolean; scope?: ProviderCommandScope } = {},
): ProviderCommandEntry {
  const skill = isSkill(cmd);
  // Home-scope (`~/.claude/skills/`) and plugin (`<installPath>/skills/`) skills
  // are view/run only: the vault adapter can't write outside the vault, so
  // surface them read-only and gate the Library's edit/delete affordances off.
  const readOnly = options.readOnly ?? false;
  const editable = !readOnly && cmd.source !== 'sdk';
  return {
    id: cmd.id,
    providerId: 'claude',
    kind: skill ? 'skill' : 'command',
    name: cmd.name,
    description: cmd.description,
    content: cmd.content,
    argumentHint: cmd.argumentHint,
    allowedTools: cmd.allowedTools,
    model: cmd.model,
    disableModelInvocation: cmd.disableModelInvocation,
    userInvocable: cmd.userInvocable,
    context: cmd.context,
    agent: cmd.agent,
    hooks: cmd.hooks,
    scope: options.scope ?? (readOnly ? 'user' : cmd.source === 'sdk' ? 'runtime' : 'vault'),
    source: cmd.source ?? 'user',
    isEditable: editable,
    isDeletable: editable,
    displayPrefix: '/',
    insertPrefix: '/',
    ...(options.sourceFilePath ? { sourceFilePath: options.sourceFilePath } : {}),
  };
}

function entryToSlashCommand(entry: ProviderCommandEntry): SlashCommand {
  return {
    id: entry.id,
    name: entry.name,
    description: entry.description,
    content: entry.content,
    argumentHint: entry.argumentHint,
    allowedTools: entry.allowedTools,
    model: entry.model,
    disableModelInvocation: entry.disableModelInvocation,
    userInvocable: entry.userInvocable,
    context: entry.context,
    agent: entry.agent,
    hooks: entry.hooks,
    source: entry.source,
    kind: entry.kind,
  };
}

// SDK built-in skills that have no meaning inside Specorator
const BUILTIN_HIDDEN_COMMANDS = new Set([
  'context', 'cost', 'debug', 'extra-usage', 'heapdump', 'init',
  'insights', 'loop', 'schedule', 'security-review', 'simplify', 'update-config',
]);

export type CommandProbe = () => Promise<SlashCommand[]>;

export class ClaudeCommandCatalog implements ProviderCommandCatalog {
  private sdkCommands: SlashCommand[] = [];
  private probePromise: Promise<void> | null = null;

  constructor(
    private commandStorage: SlashCommandStorage,
    private skillStorage: SkillStorage,
    private probe?: CommandProbe,
    private eventBus?: EventBus<SpecoratorEventMap>,
    // Optional so cold-path/test construction stays lightweight; when wired,
    // effectively-enabled plugins' skills are folded into `listVaultEntries()`.
    private pluginManager?: Pick<AppPluginManager, 'getEffectivelyEnabledPlugins'>,
  ) {}

  setRuntimeCommands(commands: SlashCommand[]): void {
    this.sdkCommands = commands;
  }

  async listDropdownEntries(context: { includeBuiltIns: boolean }): Promise<ProviderCommandEntry[]> {
    void context;
    // SDK commands already include vault commands/skills (the SDK scans
    // .claude/commands/ and .claude/skills/ internally). No file scan needed.
    // When the cache is empty (cold start, no active runtime), probe the SDK.
    if (this.sdkCommands.length === 0 && this.probe) {
      await this.ensureProbed();
    }
    const runtimeEntries = this.sdkCommands
      .filter(cmd => !BUILTIN_HIDDEN_COMMANDS.has(cmd.name.toLowerCase()))
      .map((cmd) => slashCommandToEntry(cmd));
    if (runtimeEntries.length > 0) {
      return runtimeEntries;
    }
    return this.listVaultEntries();
  }

  /** Probe the SDK for commands. Deduplicates concurrent calls. */
  private async ensureProbed(): Promise<void> {
    if (!this.probe) return;
    if (!this.probePromise) {
      this.probePromise = this.probe().then((commands) => {
        // Only apply probe results if the runtime hasn't provided fresher data
        if (this.sdkCommands.length === 0 && commands.length > 0) {
          this.sdkCommands = commands;
        }
      }).catch(() => {
        // Probe is best-effort
      }).finally(() => {
        this.probePromise = null;
      });
    }
    await this.probePromise;
  }

  /**
   * Vault commands + skills, plus read-only user-scope (`~/.claude/skills/`)
   * skills and read-only plugin skills (`<installPath>/skills/`). The name
   * predates home/plugin discovery — it feeds the Library Skills tab, the
   * cold-start dropdown fallback, AND the settings slash-command manager.
   *
   * Same-named personal + project skills are BOTH listed, not deduped: dropping
   * either breaks a real consumer — dropping the project skill removes the only
   * in-app edit/delete affordance (the manager reads this list); dropping the
   * personal skill hides the one `/name` actually resolves to (personal
   * overrides project — https://code.claude.com/docs/en/skills.md). A shared
   * name is inherently ambiguous over the `/name` wire, so the listing surfaces
   * both and lets the runtime resolve. They carry distinct ids (`user-skill-`
   * vs `skill-`) so both survive the aggregator's id-keyed maps. Home skills
   * carry a host-absolute `sourceFilePath`, so downstream `isCloneableSkillPath`
   * keeps them view/run only; the manager additionally filters user scope out
   * (it only manages editable vault entries).
   *
   * Plugin skills come from enabled Claude Code plugins the user manages via the
   * CLI/settings. They are surfaced `scope: 'plugin'` (read-only, host-absolute
   * path) with a `plugin:skill` namespaced name — the exact form the runtime
   * resolves — so the Library and cold dropdown can show and dispatch them even
   * before a warm session's SDK `slash_commands` list would.
   */
  async listVaultEntries(): Promise<ProviderCommandEntry[]> {
    const commands = await this.commandStorage.loadAll();
    const skills = await this.skillStorage.loadAll();
    const userSkills = await this.skillStorage.loadUserAll();
    const pluginSkills = this.pluginManager
      ? await this.skillStorage.loadPluginAll(this.pluginManager.getEffectivelyEnabledPlugins())
      : [];
    const readOnlySkill = (scope: ProviderCommandScope) =>
      (entry: { skill: SlashCommand; filePath: string }) =>
        slashCommandToEntry(entry.skill, { sourceFilePath: entry.filePath, readOnly: true, scope });
    return [
      ...commands.map((cmd) => slashCommandToEntry(cmd)),
      ...skills.map((entry) => slashCommandToEntry(entry.skill, { sourceFilePath: entry.filePath })),
      ...userSkills.map(readOnlySkill('user')),
      ...pluginSkills.map(readOnlySkill('plugin')),
    ];
  }

  async saveVaultEntry(entry: ProviderCommandEntry): Promise<void> {
    const cmd = entryToSlashCommand(entry);
    if (entry.kind === 'skill') {
      await this.skillStorage.save(cmd);
      this.eventBus?.emit('vaultSkill.changed', { providerId: 'claude' });
    } else {
      await this.commandStorage.save(cmd);
    }
  }

  async deleteVaultEntry(entry: ProviderCommandEntry): Promise<void> {
    if (entry.kind === 'skill') {
      await this.skillStorage.delete(entry.id);
      this.eventBus?.emit('vaultSkill.changed', { providerId: 'claude' });
    } else {
      await this.commandStorage.delete(entry.id);
    }
  }

  getDropdownConfig(): ProviderCommandDropdownConfig {
    return {
      providerId: 'claude',
      triggerChars: ['/'],
      builtInPrefix: '/',
      skillPrefix: '/',
      commandPrefix: '/',
    };
  }

  async refresh(): Promise<void> {
    // Claude revalidation happens externally via setRuntimeCommands
  }
}
