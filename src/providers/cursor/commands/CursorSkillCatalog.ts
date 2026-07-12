import type {
  ProviderCommandCatalog,
  ProviderCommandDropdownConfig,
} from '../../../core/providers/commands/ProviderCommandCatalog';
import type { ProviderCommandEntry } from '../../../core/providers/commands/ProviderCommandEntry';
import type { SlashCommand } from '../../../core/types';
import type { CursorSkillEntry, CursorSkillStorage } from '../storage/CursorSkillStorage';

function skillToEntry(skill: CursorSkillEntry): ProviderCommandEntry {
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
    // Read-only everywhere: Cursor has no in-app skill editor and its globals
    // live outside the vault. `isEditable/isDeletable: false` plus the absence
    // of `.cursor/skills` from the shared VAULT_SKILL_ROOTS keep the Library's
    // edit / clone / delete affordances off. `scope: 'user'` for globals drives
    // the persisted-index host-path redaction; project skills stay `vault`.
    scope: skill.provenance === 'vault' ? 'vault' : 'user',
    source: 'user',
    isEditable: false,
    isDeletable: false,
    // Cursor invokes skills as `/skill-name` (its slash-command menu), unlike
    // the `$` skill prefix Claude/Codex use.
    displayPrefix: '/',
    insertPrefix: '/',
    sourceFilePath: skill.sourceFilePath,
  };
}

/**
 * Read-only command catalog surfacing Cursor Agent Skills in the Library /
 * Quick Actions (and the chat `/` dropdown). Cursor owns skill authoring, so
 * the write seams intentionally reject — nothing in Specorator should call
 * them (every entry is `isEditable: false`, and the shared skill-path gates
 * keep the edit/clone/delete UI off).
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
    throw new Error('Cursor skills are read-only in Specorator; edit them in Cursor.');
  }

  async deleteVaultEntry(_entry: ProviderCommandEntry): Promise<void> {
    throw new Error('Cursor skills are read-only in Specorator; delete them in Cursor.');
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
