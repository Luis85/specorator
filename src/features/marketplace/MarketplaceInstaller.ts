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
 *
 * Multi-file **skills** install through `skillInstall.ts`; only the badge check
 * below reaches into it, so the two halves stay independent.
 */
import { normalizePath, type Vault } from 'obsidian';

import { extractString, extractStringArray, parseFrontmatter } from '../../utils/frontmatter';
import type { AgentRosterStore } from '../agents/roster/AgentRosterStore';
import { rosterIdFromSlug, slugifyRosterName } from '../agents/roster/rosterCapabilities';
import type { RosterAgent } from '../agents/roster/rosterTypes';
import { parseQuickActionContent } from '../quickActions/quickActionParse';
import { QuickActionStorage } from '../quickActions/QuickActionStorage';
import { LoopNoteStore } from '../tasks/loops/LoopNoteStore';
import { TemplateNoteStore } from '../tasks/templates/TemplateNoteStore';
import { isInstallableType,type MarketplaceItem } from './catalogTypes';
import type { InstallOutcome, MarketplaceInstallDeps, MarketplaceInstallOptions } from './installerTypes';
import { MarketplaceError } from './MarketplaceCatalogClient';
import { isSkillInstalledAnywhere } from './skillInstall';

export type { InstallOutcome, MarketplaceInstallDeps, MarketplaceInstallOptions } from './installerTypes';

/**
 * Rejects a body its own store can't parse BEFORE we write it, so the Marketplace
 * never reports `installed` for content that a later `list()` silently drops
 * (leaving the item marked installed but absent from the Library).
 */
function parseInstallable<T>(parse: () => T, label: string): T {
  try {
    return parse();
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

/** Installs an item; `'skipped'` means an item with the same natural key already exists. */
export async function installMarketplaceItem(
  item: MarketplaceItem,
  body: string,
  deps: MarketplaceInstallDeps,
  now: number,
  options: MarketplaceInstallOptions = {},
): Promise<InstallOutcome> {
  switch (item.type) {
    case 'loop': {
      const store = new LoopNoteStore();
      return installParsedNote(
        deps.vault,
        body,
        (name) => store.getFilePathForName(deps.loopFolder, name),
        (path) => store.parse(path, body).name,
        item.name,
        'loop',
      );
    }
    case 'template': {
      const store = new TemplateNoteStore();
      return installParsedNote(
        deps.vault,
        body,
        (name) => store.getFilePathForName(deps.templateFolder, name),
        (path) => store.parse(path, body).name,
        item.name,
        'template',
      );
    }
    case 'quick-action':
      return installQuickAction(deps, item.name, body);
    case 'agent':
      return installAgent(deps.rosterStore, item, body, now, deps.catalogUrl, options.boundSkills);
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
 * A catalog id scoped to the source it came from. A bare catalog id (`agents/x`)
 * is only meaningful within one catalog, so a fork that reuses the id under a
 * different `marketplaceSourceUrl` must not satisfy the original's installed
 * check. The `\0` separator can't appear in a URL or a catalog id, so the two
 * parts can't be confused.
 */
function scopedAgentCatalogKey(catalogUrl: string | undefined, id: string): string {
  return `${catalogUrl ?? ''}\u0000${id}`;
}

/**
 * The identity keys an installed agent can match on: its roster id (name-slug)
 * and, for Marketplace installs, its source-scoped catalog id. The two live in
 * disjoint namespaces (`roster:…` vs `<url>\0<type>/<slug>`), so one set serves
 * both lookups and a caller checking many agent items can precompute it once
 * (the refresh fast-path) instead of scanning the roster per item.
 */
export function installedAgentKeys(agents: readonly RosterAgent[]): Set<string> {
  const keys = new Set<string>();
  for (const agent of agents) {
    keys.add(agent.id);
    if (agent.catalog?.id) keys.add(scopedAgentCatalogKey(agent.catalog.catalogUrl, agent.catalog.id));
  }
  return keys;
}

/**
 * True when an item with the same natural key is already present (drives the
 * "Installed" badge). `agentKeys` lets a caller checking many agent items pass a
 * once-computed key set (see `installedAgentKeys`) instead of a per-item scan.
 */
export async function isItemInstalled(
  item: MarketplaceItem,
  deps: MarketplaceInstallDeps,
  agentKeys?: ReadonlySet<string>,
): Promise<boolean> {
  if (!isInstallableType(item.type)) return false;
  switch (item.type) {
    case 'loop':
      return noteExists(deps.vault, new LoopNoteStore().getFilePathForName(deps.loopFolder, item.name));
    case 'template':
      return noteExists(deps.vault, new TemplateNoteStore().getFilePathForName(deps.templateFolder, item.name));
    case 'quick-action': {
      const storage = new QuickActionStorage(deps.adapter, () => deps.quickActionsFolder);
      // A blank folder is unconfigured (install is refused for it too); don't probe
      // the vault-root path getFilePathForName would derive, or an unrelated root
      // note sharing that slug filename would falsely mark the card Installed.
      if (!storage.hasConfiguredFolder()) return false;
      return storage.exists(storage.getFilePathForName(item.name));
    }
    case 'agent': {
      // Match the roster id (name-slug) OR the source-scoped catalog id: the
      // catalog id keeps an installed agent recognized across a catalog-side
      // display-name rebrand (same source), while the roster-id fallback keeps
      // pre-provenance and hand-authored agents recognized. Scoping the catalog
      // id to `catalogUrl` stops a fork that reuses an id from false-matching.
      const keys = agentKeys ?? installedAgentKeys(await deps.rosterStore.list());
      return keys.has(agentRosterId(item)) || keys.has(scopedAgentCatalogKey(deps.catalogUrl, item.id));
    }
    case 'skill':
      // The grid/card badge: installed if present in ANY provider root + scope.
      return isSkillInstalledAnywhere(item, deps);
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

/**
 * Guards that a payload names the SAME item as its catalog entry and returns the
 * agreed install path. The body's own parsed name must slugify (via the store's
 * own `pathForName`) to the SAME path as the manifest name; otherwise the note
 * would be written under the manifest's filename while the Library displays the
 * payload's name — a provenance mismatch from a malformed/hostile catalog.
 * `parseInstallable` first rejects a body the store can't load at all. Shared by
 * every note type (loop/template/quick-action) so the guard can't drift between
 * them.
 */
function assertPayloadPath(
  pathForName: (name: string) => string,
  parseName: (path: string) => string,
  manifestName: string,
  label: string,
): string {
  const path = pathForName(manifestName);
  const parsedName = parseInstallable(() => parseName(path), label);
  if (pathForName(parsedName) !== path) {
    throw new MarketplaceError(
      `This ${label} names a different item than its catalog entry, so it can't be installed.`,
    );
  }
  return path;
}

/** Installs a loop/template body verbatim once `assertPayloadPath` clears it. */
async function installParsedNote(
  vault: Vault,
  body: string,
  pathForName: (name: string) => string,
  parseName: (path: string) => string,
  manifestName: string,
  label: string,
): Promise<InstallOutcome> {
  const path = assertPayloadPath(pathForName, parseName, manifestName, label);
  return installNoteVerbatim(vault, path, body);
}

async function installQuickAction(
  deps: MarketplaceInstallDeps,
  name: string,
  body: string,
): Promise<InstallOutcome> {
  const storage = new QuickActionStorage(deps.adapter, () => deps.quickActionsFolder);
  // A blank folder means the feature is unconfigured (the app preserves the
  // blank via `??`, and `QuickActionStorage.save` refuses it). Writing to a
  // default folder would report success and mark the card installed while the
  // Library — also unconfigured — scans nothing, so the install would be
  // invisible. Reject it visibly instead, mirroring the store's own backstop.
  if (!storage.hasConfiguredFolder()) {
    throw new MarketplaceError('Set a Quick Actions folder in Settings before installing quick actions.');
  }
  // Same identity guard loops/templates get: a body whose frontmatter name
  // slugifies to a different file than the manifest's is refused, not written
  // under the manifest filename while the Library shows the payload's name.
  const path = assertPayloadPath(
    (candidate) => storage.getFilePathForName(candidate),
    (candidatePath) => {
      const parsed = parseQuickActionContent(body, candidatePath);
      if (parsed === null) throw new Error('empty or wrong-type quick action');
      return parsed.name;
    },
    name,
    'quick action',
  );
  if (await storage.exists(path)) return 'skipped';
  // adapter.write auto-creates the parent folder; body is already native
  // `type: quick-action` frontmatter + prompt.
  await deps.adapter.write(path, body);
  return 'installed';
}

/**
 * Provenance block stamped onto a Marketplace-installed agent — where it came
 * from, so `.specorator/agents/*.json` records its origin and installed-detection
 * can key on the catalog id scoped to `catalogUrl` (the source it was fetched
 * from). Undefined attribution fields drop out of the persisted JSON
 * (JSON.stringify omits them).
 */
function marketplaceProvenance(item: MarketplaceItem, catalogUrl: string): NonNullable<RosterAgent['catalog']> {
  return {
    id: item.id,
    catalogUrl,
    source: item.source,
    author: item.author,
    license: item.license,
    version: item.version,
  };
}

async function installAgent(
  store: AgentRosterStore,
  item: MarketplaceItem,
  body: string,
  now: number,
  catalogUrl: string,
  boundSkills: readonly string[] = [],
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
    // The agent's package skills, installed just before this call, so a
    // Marketplace agent can reach them without the user granting each by hand.
    // De-duplicated because two dependencies can resolve to the same skill name.
    skills: [...new Set(boundSkills)],
    roles: normalizeRoles(extractStringArray(fm, 'roles')),
    color: extractString(fm, 'color'),
    initials: extractString(fm, 'initials'),
    icon: extractString(fm, 'icon') ?? item.icon,
    tags: extractStringArray(fm, 'tags'),
    catalog: marketplaceProvenance(item, catalogUrl),
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
