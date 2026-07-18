/**
 * Installs a fetched marketplace item into the vault by routing through the same
 * stores the app uses for user-authored items, so an installed item is
 * indistinguishable from a hand-authored one.
 *
 * Loops / templates / quick actions are authored in the catalog in their exact
 * native store format, so their fetched body is written **verbatim** (preserving
 * the `author`/`source`/`license` provenance frontmatter). Agents are authored
 * as Markdown + frontmatter and mapped onto a `RosterAgent` (mirroring the old
 * `presetAgentToRosterAgent`). Installs dedup on each store's natural key.
 */
import { normalizePath, type Vault } from 'obsidian';

import type { VaultFileAdapter } from '../../core/storage/VaultFileAdapter';
import { extractString, extractStringArray, parseFrontmatter } from '../../utils/frontmatter';
import type { AgentRosterStore } from '../agents/roster/AgentRosterStore';
import { rosterIdFromSlug, slugifyRosterName } from '../agents/roster/rosterCapabilities';
import type { RosterAgent } from '../agents/roster/rosterTypes';
import { QuickActionStorage } from '../quickActions/QuickActionStorage';
import { LoopNoteStore } from '../tasks/loops/LoopNoteStore';
import { TemplateNoteStore } from '../tasks/templates/TemplateNoteStore';
import { isInstallableType,type MarketplaceItem } from './catalogTypes';
import { MarketplaceError } from './MarketplaceCatalogClient';

export type InstallOutcome = 'installed' | 'skipped';

export interface MarketplaceInstallDeps {
  vault: Vault;
  adapter: VaultFileAdapter;
  rosterStore: AgentRosterStore;
  loopFolder: string;
  templateFolder: string;
  quickActionsFolder: string;
}

/** Installs an item; `'skipped'` means an item with the same natural key already exists. */
export async function installMarketplaceItem(
  item: MarketplaceItem,
  body: string,
  deps: MarketplaceInstallDeps,
  now: number,
): Promise<InstallOutcome> {
  switch (item.type) {
    case 'loop':
      return installNoteVerbatim(deps.vault, new LoopNoteStore().getFilePathForName(deps.loopFolder, item.name), body);
    case 'template':
      return installNoteVerbatim(
        deps.vault,
        new TemplateNoteStore().getFilePathForName(deps.templateFolder, item.name),
        body,
      );
    case 'quick-action':
      return installQuickAction(deps, item.name, body);
    case 'agent':
      return installAgent(deps.rosterStore, item, body, now);
    default:
      throw new MarketplaceError(`"${item.type}" items can't be installed yet.`);
  }
}

/** True when an item with the same natural key is already present (drives the "Installed" badge). */
export async function isItemInstalled(item: MarketplaceItem, deps: MarketplaceInstallDeps): Promise<boolean> {
  if (!isInstallableType(item.type)) return false;
  switch (item.type) {
    case 'loop':
      return noteExists(deps.vault, new LoopNoteStore().getFilePathForName(deps.loopFolder, item.name));
    case 'template':
      return noteExists(deps.vault, new TemplateNoteStore().getFilePathForName(deps.templateFolder, item.name));
    case 'quick-action': {
      const storage = new QuickActionStorage(deps.adapter, () => deps.quickActionsFolder);
      return storage.exists(storage.getFilePathForName(item.name));
    }
    case 'agent': {
      const id = rosterIdFromSlug(slugifyRosterName(item.name) || 'agent');
      return (await deps.rosterStore.list()).some((agent) => agent.id === id);
    }
    default:
      return false;
  }
}

function noteExists(vault: Vault, path: string): boolean {
  return vault.getAbstractFileByPath(path) !== null;
}

async function installNoteVerbatim(vault: Vault, path: string, body: string): Promise<InstallOutcome> {
  if (noteExists(vault, path)) return 'skipped';
  const folder = path.slice(0, path.lastIndexOf('/'));
  if (folder && !vault.getAbstractFileByPath(folder)) {
    await vault.createFolder(normalizePath(folder));
  }
  await vault.create(path, body);
  return 'installed';
}

async function installQuickAction(
  deps: MarketplaceInstallDeps,
  name: string,
  body: string,
): Promise<InstallOutcome> {
  const storage = new QuickActionStorage(deps.adapter, () => deps.quickActionsFolder);
  const path = storage.getFilePathForName(name);
  if (await storage.exists(path)) return 'skipped';
  // adapter.write auto-creates the parent folder; body is already native
  // `type: quick-action` frontmatter + prompt.
  await deps.adapter.write(path, body);
  return 'installed';
}

async function installAgent(
  store: AgentRosterStore,
  item: MarketplaceItem,
  body: string,
  now: number,
): Promise<InstallOutcome> {
  const parsed = parseFrontmatter(body);
  const fm = parsed?.frontmatter ?? {};
  const name = extractString(fm, 'name') ?? item.name;
  const id = rosterIdFromSlug(slugifyRosterName(name) || 'agent');
  if ((await store.list()).some((agent) => agent.id === id)) return 'skipped';

  const agent: RosterAgent = {
    id,
    name,
    description: extractString(fm, 'description') ?? item.description,
    prompt: (parsed?.body ?? body).trim(),
    disallowedTools: [],
    skills: [],
    roles: normalizeRoles(extractStringArray(fm, 'roles')),
    color: extractString(fm, 'color'),
    initials: extractString(fm, 'initials'),
    icon: extractString(fm, 'icon') ?? item.icon,
    tags: extractStringArray(fm, 'tags'),
    createdAt: now,
    updatedAt: now,
  };
  await store.save(agent);
  return 'installed';
}

function normalizeRoles(raw: string[] | undefined): Array<'worker' | 'verifier'> {
  const valid = (raw ?? []).filter((role): role is 'worker' | 'verifier' => role === 'worker' || role === 'verifier');
  return valid.length > 0 ? valid : ['worker'];
}
