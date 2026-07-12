import type { SpecoratorEventMap } from '../../../app/events/specoratorEvents';
import type { EventBus } from '../../../core/events/EventBus';
import type {
  ProviderCommandCatalog,
  ProviderCommandDropdownConfig,
} from '../../../core/providers/commands/ProviderCommandCatalog';
import type { ProviderCommandEntry } from '../../../core/providers/commands/ProviderCommandEntry';
import type { SlashCommand } from '../../../core/types';
import type { SkillMetadata } from '../runtime/codexAppServerTypes';
import {
  type CodexSkillListProvider,
  compareCodexSkillPriority,
  getCodexSkillDescription,
} from '../skills/CodexSkillListingService';
import {
  type CodexSkillStorage,
  codexSkillVaultRelativePath,
  createCodexSkillPersistenceKey,
  parseCodexSkillPersistenceKey,
  resolveCodexSkillLocationFromPath,
} from '../storage/CodexSkillStorage';

const CODEX_SKILL_ID_PREFIX = 'codex-skill-';

const CODEX_COMPACT_COMMAND: ProviderCommandEntry = {
  id: 'codex-builtin-compact',
  providerId: 'codex',
  kind: 'command',
  name: 'compact',
  description: 'Compact conversation history',
  content: '',
  scope: 'system',
  source: 'builtin',
  isEditable: false,
  isDeletable: false,
  displayPrefix: '/',
  insertPrefix: '/',
};

function buildSkillId(
  skill: Pick<SkillMetadata, 'name' | 'scope'>,
  location?: { rootId: string; name: string } | null,
): string {
  if (location) {
    return `${CODEX_SKILL_ID_PREFIX}${location.rootId}-${location.name}`;
  }

  // Non-vault (user/system/admin) skills are read-only. Key by scope + name, not
  // `path`: the host-absolute path embeds the user's home dir, and this id is
  // persisted into the vault-synced skill-index cache, so a path here would leak
  // the home path despite the sourceFilePath redaction. Names are unique per
  // scope for any skill addressable as `$name`.
  return `${CODEX_SKILL_ID_PREFIX}${skill.scope}-${encodeURIComponent(skill.name)}`;
}

function listedSkillToProviderEntry(
  skill: SkillMetadata,
  vaultPath: string | null,
): ProviderCommandEntry {
  const location = vaultPath ? resolveCodexSkillLocationFromPath(skill.path, vaultPath) : null;
  const isVault = skill.scope === 'repo' && location !== null;

  return {
    id: buildSkillId(skill, isVault ? location : null),
    providerId: 'codex',
    kind: 'skill',
    name: skill.name,
    description: getCodexSkillDescription(skill),
    content: '',
    scope: isVault ? 'vault' : 'user',
    source: 'user',
    isEditable: isVault,
    isDeletable: isVault,
    displayPrefix: '$',
    insertPrefix: '$',
    sourceFilePath: skill.path,
    ...(isVault
      ? {
          persistenceKey: createCodexSkillPersistenceKey({
            rootId: location.rootId,
            currentName: location.name,
          }),
        }
      : {}),
  };
}

export class CodexSkillCatalog implements ProviderCommandCatalog {
  constructor(
    private storage: CodexSkillStorage,
    private listProvider: CodexSkillListProvider,
    private vaultPath: string | null,
    private eventBus?: EventBus<SpecoratorEventMap>,
  ) {}

  setRuntimeCommands(_commands: SlashCommand[]): void {
    // Codex dropdown entries come from app-server metadata; runtime commands are ignored.
  }

  private async listSkillsByPriority(): Promise<SkillMetadata[]> {
    return [...(await this.listProvider.listSkills())].sort(compareCodexSkillPriority);
  }

  async listDropdownEntries(context: { includeBuiltIns: boolean }): Promise<ProviderCommandEntry[]> {
    // Dropdown/run surface: only enabled skills are invocable.
    const skills = (await this.listSkillsByPriority()).filter(skill => skill.enabled);
    const entries = skills.map(skill => listedSkillToProviderEntry(skill, this.vaultPath));
    return context.includeBuiltIns ? [CODEX_COMPACT_COMMAND, ...entries] : entries;
  }

  async listVaultEntries(): Promise<ProviderCommandEntry[]> {
    // Management/browse listing — NOT filtered by `enabled`. A disabled vault
    // skill must stay editable/deletable in Codex settings; the enabled filter
    // is a dropdown/run concern only.
    const listedSkills = await this.listSkillsByPriority();
    const entries: ProviderCommandEntry[] = [];

    for (const listedSkill of listedSkills) {
      if (listedSkill.scope !== 'repo') {
        // User / system / admin skills are read-only: surface them so global
        // Codex skills appear in the Library like Claude's `~/.claude` skills.
        // Host-absolute path + isEditable false keep the Library's edit/clone/
        // delete gates off; the Codex settings manager filters them out (it
        // manages editable vault skills only).
        //
        // Only while enabled, though: a read-only global can't be edited here,
        // and the provider won't resolve a disabled skill's `$name`, so a
        // disabled global would be a dead, unrunnable Library row. (Repo skills
        // below stay regardless of `enabled` — those remain editable/deletable
        // in Codex settings even when disabled.)
        if (!listedSkill.enabled) {
          continue;
        }
        entries.push(listedSkillToProviderEntry(listedSkill, this.vaultPath));
        continue;
      }

      // Editable vault (repo) skill — load full content from storage for the
      // editor; skip when it isn't vault-reachable/loadable.
      const location = this.vaultPath
        ? resolveCodexSkillLocationFromPath(listedSkill.path, this.vaultPath)
        : null;
      if (!location) {
        continue;
      }

      const storedSkill = await this.storage.load(location);
      if (!storedSkill) {
        continue;
      }

      entries.push({
        id: `${CODEX_SKILL_ID_PREFIX}${location.rootId}-${storedSkill.name}`,
        providerId: 'codex',
        kind: 'skill',
        name: storedSkill.name,
        description: storedSkill.description ?? getCodexSkillDescription(listedSkill),
        content: storedSkill.content,
        scope: 'vault',
        source: 'user',
        isEditable: true,
        isDeletable: true,
        displayPrefix: '$',
        insertPrefix: '$',
        // Vault entries surface the vault-relative path, not the host-absolute
        // wire path: the Skills tab's clone/delete gate and the vault adapter
        // act on it directly. Dropdown entries and the raw listing keep host
        // paths for runtime consumers.
        sourceFilePath: codexSkillVaultRelativePath(location),
        persistenceKey: createCodexSkillPersistenceKey({
          rootId: location.rootId,
          currentName: location.name,
        }),
      });
    }

    return entries;
  }

  async saveVaultEntry(entry: ProviderCommandEntry): Promise<void> {
    const persistenceState = parseCodexSkillPersistenceKey(entry.persistenceKey);
    await this.storage.save({
      name: entry.name,
      description: entry.description,
      content: entry.content,
      rootId: persistenceState?.rootId,
      previousLocation: persistenceState?.currentName
        ? { rootId: persistenceState.rootId, name: persistenceState.currentName }
        : undefined,
    });
    this.listProvider.invalidate();
    this.eventBus?.emit('vaultSkill.changed', { providerId: 'codex' });
  }

  async deleteVaultEntry(entry: ProviderCommandEntry): Promise<void> {
    const persistenceState = parseCodexSkillPersistenceKey(entry.persistenceKey);
    await this.storage.delete({
      name: persistenceState?.currentName ?? entry.name,
      rootId: persistenceState?.rootId ?? 'vault-codex',
    });
    this.listProvider.invalidate();
    this.eventBus?.emit('vaultSkill.changed', { providerId: 'codex' });
  }

  getDropdownConfig(): ProviderCommandDropdownConfig {
    return {
      providerId: 'codex',
      triggerChars: ['/', '$'],
      builtInPrefix: '/',
      skillPrefix: '$',
      commandPrefix: '/',
    };
  }

  async refresh(): Promise<void> {
    this.listProvider.invalidate();
    await this.listProvider.listSkills({ forceReload: true });
  }
}
