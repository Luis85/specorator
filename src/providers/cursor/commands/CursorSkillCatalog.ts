import type {
  ProviderCommandCatalog,
  ProviderCommandDropdownConfig,
} from '../../../core/providers/commands/ProviderCommandCatalog';
import type { ProviderCommandEntry } from '../../../core/providers/commands/ProviderCommandEntry';
import type { SlashCommand } from '../../../core/types';
import type { CursorSkillEntry, CursorSkillStorage } from '../storage/CursorSkillStorage';

function skillToEntry(skill: CursorSkillEntry): ProviderCommandEntry {
  // Project (vault) skills under `.cursor/skills` are editable/clonable/deletable
  // through the Library's in-place editor, which writes SKILL.md via the vault
  // adapter — enabled by `.cursor/skills` now being in the shared VAULT_SKILL_ROOTS.
  // Global skills live outside the vault (host-absolute path) and stay read-only.
  const editable = skill.provenance === 'vault';
  return {
    // Keyed by name (skills are de-duplicated by name in storage), never the
    // host-absolute path — the id is persisted into the vault-synced skill-index
    // cache, so a path here would leak the user's home dir.
    id: `cursor-skill-${skill.name}`,
    providerId: 'cursor',
    kind: 'skill',
    name: skill.name,
    description: skill.description,
    content: skill.content,
    // `scope: 'user'` for globals drives the persisted-index host-path redaction;
    // project skills stay `vault`.
    scope: editable ? 'vault' : 'user',
    source: 'user',
    isEditable: editable,
    isDeletable: editable,
    // Cursor invokes skills as `/skill-name` (its slash-command menu), unlike
    // the `$` skill prefix Claude/Codex use.
    displayPrefix: '/',
    insertPrefix: '/',
    sourceFilePath: skill.sourceFilePath,
  };
}

/**
 * Command catalog surfacing Cursor Agent Skills in the Library / Quick Actions
 * (and the chat `/` dropdown). Project skills under `.cursor/skills` are
 * editable/clonable/deletable through the Library's in-place editor (which
 * writes SKILL.md via the vault adapter); global skills are read-only. Cursor
 * owns skill *authoring*, so there is no in-settings skill manager — the catalog
 * write seams below stay unused (editing flows through the Library editor, not
 * the catalog) and reject to make an accidental call obvious.
 */
export class CursorSkillCatalog implements ProviderCommandCatalog {
  constructor(private readonly storage: CursorSkillStorage) {}

  async listDropdownEntries(_context: { includeBuiltIns: boolean }): Promise<ProviderCommandEntry[]> {
    return (await this.storage.loadAll()).map(skillToEntry);
  }

  async listVaultEntries(): Promise<ProviderCommandEntry[]> {
    return (await this.storage.loadAll()).map(skillToEntry);
  }

  async saveVaultEntry(_entry: ProviderCommandEntry): Promise<void> {
    throw new Error('Cursor skills are edited via the Library editor, not the catalog seam.');
  }

  async deleteVaultEntry(_entry: ProviderCommandEntry): Promise<void> {
    throw new Error('Cursor skills are deleted via the Library editor, not the catalog seam.');
  }

  setRuntimeCommands(_commands: SlashCommand[]): void {
    // Cursor skills come from disk scans; runtime command discovery is not wired.
  }

  getDropdownConfig(): ProviderCommandDropdownConfig {
    return {
      providerId: 'cursor',
      triggerChars: ['/'],
      builtInPrefix: '/',
      skillPrefix: '/',
      commandPrefix: '/',
    };
  }

  async refresh(): Promise<void> {
    // Each scan reads the filesystem directly; there is no cache to invalidate.
    // Freshness relies on the aggregator TTL + the Library's manual refresh.
  }
}
