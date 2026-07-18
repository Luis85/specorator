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
import { parseQuickActionContent } from '../quickActions/quickActionParse';
import { QuickActionStorage } from '../quickActions/QuickActionStorage';
import { LoopNoteStore } from '../tasks/loops/LoopNoteStore';
import { TemplateNoteStore } from '../tasks/templates/TemplateNoteStore';
import { isInstallableType,type MarketplaceItem } from './catalogTypes';
import { MarketplaceError } from './MarketplaceCatalogClient';

/**
 * Rejects a body its own store can't parse BEFORE we write it, so the Marketplace
 * never reports `installed` for content that a later `list()` silently drops
 * (leaving the item marked installed but absent from the Library).
 */
function assertInstallableBody(parse: () => unknown, label: string): void {
  try {
    parse();
  } catch (error) {
    throw new MarketplaceError(
      `This ${label}'s content is malformed and can't be installed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * The agent equivalent of `assertInstallableBody`: agents are mapped by hand (no
 * store `.parse()` that throws), so guard the two ways a catalog agent body can
 * be unusable — a wrong marker type or an empty prompt — before the roster save,
 * so a malformed agent fails visibly instead of installing as a blank entry the
 * card still reports "installed".
 */
function assertInstallableAgentBody(fm: Record<string, unknown>, prompt: string): void {
  if (extractString(fm, 'type') !== 'specorator-agent' || !prompt) {
    throw new MarketplaceError(
      "This agent's content is malformed and can't be installed (needs `type: specorator-agent` frontmatter and a non-empty body).",
    );
  }
}

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
    case 'loop': {
      const store = new LoopNoteStore();
      const path = store.getFilePathForName(deps.loopFolder, item.name);
      assertInstallableBody(() => store.parse(path, body), 'loop');
      return installNoteVerbatim(deps.vault, path, body);
    }
    case 'template': {
      const store = new TemplateNoteStore();
      const path = store.getFilePathForName(deps.templateFolder, item.name);
      assertInstallableBody(() => store.parse(path, body), 'template');
      return installNoteVerbatim(deps.vault, path, body);
    }
    case 'quick-action':
      return installQuickAction(deps, item.name, body);
    case 'agent':
      return installAgent(deps.rosterStore, item, body, now);
    default:
      throw new MarketplaceError(`"${item.type}" items can't be installed yet.`);
  }
}

/**
 * Roster id an agent item installs under. Both the installer and the
 * installed-check derive it HERE from the manifest `item.name` so the two can
 * never drift — a mismatch made the "Installed" badge flip back after a refresh.
 */
function agentRosterId(item: MarketplaceItem): string {
  return rosterIdFromSlug(slugifyRosterName(item.name) || 'agent');
}

/**
 * True when an item with the same natural key is already present (drives the
 * "Installed" badge). `rosterIds` lets a caller checking many agent items pass a
 * once-computed roster id set instead of forcing a full roster scan per item.
 */
export async function isItemInstalled(
  item: MarketplaceItem,
  deps: MarketplaceInstallDeps,
  rosterIds?: ReadonlySet<string>,
): Promise<boolean> {
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
      const ids = rosterIds ?? new Set((await deps.rosterStore.list()).map((agent) => agent.id));
      return ids.has(agentRosterId(item));
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
  assertInstallableBody(() => {
    if (parseQuickActionContent(body, path) === null) throw new Error('empty or wrong-type quick action');
  }, 'quick action');
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
  const prompt = (parsed?.body ?? body).trim();
  assertInstallableAgentBody(fm, prompt);
  // Identity keys on the manifest `item.name` (via agentRosterId), not the body
  // frontmatter name, so it matches isItemInstalled and the card's display name.
  const id = agentRosterId(item);
  if ((await store.list()).some((agent) => agent.id === id)) return 'skipped';

  const agent: RosterAgent = {
    id,
    name: item.name,
    description: extractString(fm, 'description') ?? item.description,
    prompt,
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
