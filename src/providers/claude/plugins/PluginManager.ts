/**
 * PluginManager - Discover and manage Claude Code plugins.
 *
 * Plugins are discovered from two sources:
 * - installed_plugins.json: install paths for scanning agents
 * - settings.json: enabled state (project overrides global)
 */

import * as fs from 'fs';
import { Notice } from 'obsidian';
import * as os from 'os';
import * as path from 'path';

import type { PluginInfo, PluginScope } from '../../../core/types';
import { t } from '../../../i18n/i18n';
import type { CCSettingsStorage } from '../storage/CCSettingsStorage';
import type { InstalledPluginEntry, InstalledPluginsFile } from '../types/plugins';

const INSTALLED_PLUGINS_PATH = path.join(os.homedir(), '.claude', 'plugins', 'installed_plugins.json');
const GLOBAL_SETTINGS_PATH = path.join(os.homedir(), '.claude', 'settings.json');

interface SettingsFile {
  enabledPlugins?: Record<string, boolean>;
}

function readJsonFile<T>(filePath: string): T | null {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

function normalizePathForComparison(p: string): string {
  try {
    const resolved = fs.realpathSync(p);
    if (typeof resolved === 'string' && resolved.length > 0) {
      return resolved;
    }
  } catch {
    // ignore
  }

  return path.resolve(p);
}

function selectInstalledPluginEntry(
  entries: InstalledPluginEntry[],
  normalizedVaultPath: string
): InstalledPluginEntry | null {
  for (const entry of entries) {
    if (entry.scope !== 'project') continue;
    if (!entry.projectPath) continue;
    if (normalizePathForComparison(entry.projectPath) === normalizedVaultPath) {
      return entry;
    }
  }

  return entries.find(e => e.scope === 'user') ?? null;
}

function extractPluginName(pluginId: string): string {
  const atIndex = pluginId.indexOf('@');
  if (atIndex > 0) {
    return pluginId.substring(0, atIndex);
  }
  return pluginId;
}

// Coerces a raw installed_plugins value into an entry array, surfacing a
// notice when the stored shape isn't the expected array.
function normalizeInstalledEntries(
  pluginId: string,
  entries: InstalledPluginEntry | InstalledPluginEntry[],
): InstalledPluginEntry[] {
  if (Array.isArray(entries)) {
    return entries;
  }

  new Notice(t('provider.claude.plugin.malformedEntry', { id: pluginId, type: typeof entries }));
  return [entries];
}

interface PluginEnabledLookup {
  project: Record<string, boolean>;
  // Named `userGlobal` (not `global`) to satisfy obsidianmd/no-global-this.
  userGlobal: Record<string, boolean>;
}

/** Raw `enabledPlugins[id]` value per setting source (undefined = unmentioned). */
interface PluginEnableSources {
  project?: boolean;
  user?: boolean;
}

/**
 * The runtime's effective Claude setting sources, after the `loadUserSettings`
 * toggle and the vault-trust gate have been applied. `project` covers both the
 * `project` and `local` sources (they load or withhold together).
 */
export interface EffectivePluginSources {
  project: boolean;
  user: boolean;
}

/** Internal record: public PluginInfo plus the per-source enable state discovery needs. */
interface PluginRecord extends PluginInfo {
  enableSources: PluginEnableSources;
}

/**
 * Whether the runtime will actually load a plugin, given the effective setting
 * sources. The CLI reads `enabledPlugins` only from sources it loads (`user`
 * gated by `loadUserSettings`; `project`/`local` gated by vault trust), merging
 * with project/local over user. So a plugin enabled ONLY via a withheld source
 * — user settings with `loadUserSettings` off, or project settings on an
 * untrusted vault — is NOT effectively enabled: surfacing its `/<plugin>:<skill>`
 * would dispatch a command the runtime can't resolve. A plugin unmentioned by
 * every source keeps the prior installed-default-on. Callers additionally gate
 * on the raw `enabled` flag, so an explicitly-disabled plugin never reaches here
 * as enabled.
 */
export function isPluginEffectivelyEnabled(
  sources: PluginEnableSources,
  effective: EffectivePluginSources,
): boolean {
  if (effective.project && sources.project !== undefined) return sources.project;
  if (effective.user && sources.user !== undefined) return sources.user;
  const enabledOnlyViaWithheldSource =
    (!effective.project && sources.project === true) ||
    (!effective.user && sources.user === true);
  return !enabledOnlyViaWithheldSource;
}

// Resolves one installed plugin id to a PluginRecord, or null when no entry
// matches this vault. Project enabled-state wins, then global, then default-on.
function buildPluginRecord(
  pluginId: string,
  entries: InstalledPluginEntry | InstalledPluginEntry[],
  normalizedVaultPath: string,
  enabledLookup: PluginEnabledLookup,
): PluginRecord | null {
  if (!entries || (Array.isArray(entries) && entries.length === 0)) {
    return null;
  }

  const entriesArray = normalizeInstalledEntries(pluginId, entries);
  const entry = selectInstalledPluginEntry(entriesArray, normalizedVaultPath);
  if (!entry) {
    return null;
  }

  const scope: PluginScope = entry.scope === 'project' ? 'project' : 'user';
  const enableSources: PluginEnableSources = {
    project: enabledLookup.project[pluginId],
    user: enabledLookup.userGlobal[pluginId],
  };
  const enabled = enableSources.project ?? enableSources.user ?? true;

  return {
    id: pluginId,
    name: extractPluginName(pluginId),
    enabled,
    scope,
    installPath: entry.installPath,
    enableSources,
  };
}

function comparePluginsByScopeThenId(a: PluginInfo, b: PluginInfo): number {
  if (a.scope !== b.scope) {
    return a.scope === 'project' ? -1 : 1;
  }
  return a.id.localeCompare(b.id);
}

/** Strip the internal per-source enable state back to the public shape. */
function toPluginInfo(record: PluginRecord): PluginInfo {
  const { enableSources: _enableSources, ...info } = record;
  return info;
}

// Both sources effective: the default when no resolver is injected, so callers
// that don't care about the trust/`loadUserSettings` gate see raw enabled state.
const ALL_SOURCES_EFFECTIVE: EffectivePluginSources = { project: true, user: true };

export class PluginManager {
  private ccSettingsStorage: CCSettingsStorage;
  private vaultPath: string;
  private plugins: PluginRecord[] = [];
  private resolveEffectiveSources: () => EffectivePluginSources;

  constructor(
    vaultPath: string,
    ccSettingsStorage: CCSettingsStorage,
    // Reports which Claude setting sources the runtime currently loads (after
    // `loadUserSettings` + vault trust). Injected by the workspace so discovery
    // can skip plugins the runtime won't actually load. Defaults to "both on".
    resolveEffectiveSources: () => EffectivePluginSources = () => ALL_SOURCES_EFFECTIVE,
  ) {
    this.vaultPath = vaultPath;
    this.ccSettingsStorage = ccSettingsStorage;
    this.resolveEffectiveSources = resolveEffectiveSources;
  }

  async loadPlugins(): Promise<void> {
    const installedPlugins = readJsonFile<InstalledPluginsFile>(INSTALLED_PLUGINS_PATH);
    const globalSettings = readJsonFile<SettingsFile>(GLOBAL_SETTINGS_PATH);
    const projectSettings = await this.loadProjectSettings();

    const enabledLookup: PluginEnabledLookup = {
      project: projectSettings?.enabledPlugins ?? {},
      userGlobal: globalSettings?.enabledPlugins ?? {},
    };

    const plugins: PluginRecord[] = [];
    const normalizedVaultPath = normalizePathForComparison(this.vaultPath);

    if (installedPlugins?.plugins) {
      for (const [pluginId, entries] of Object.entries(installedPlugins.plugins)) {
        const plugin = buildPluginRecord(pluginId, entries, normalizedVaultPath, enabledLookup);
        if (plugin) {
          plugins.push(plugin);
        }
      }
    }

    this.plugins = plugins.sort(comparePluginsByScopeThenId);
  }

  private async loadProjectSettings(): Promise<SettingsFile | null> {
    const projectSettingsPath = path.join(this.vaultPath, '.claude', 'settings.json');
    return readJsonFile(projectSettingsPath);
  }

  getPlugins(): PluginInfo[] {
    return this.plugins.map(toPluginInfo);
  }

  /**
   * Plugins the runtime will actually load right now — enabled AND enabled via a
   * setting source that isn't withheld by `loadUserSettings`/vault-trust. This
   * is what skill/agent discovery scans, so a plugin enabled only through a
   * withheld source isn't surfaced as a runnable `/<plugin>:<skill>` the runtime
   * would silently drop.
   */
  getEffectivelyEnabledPlugins(): PluginInfo[] {
    const effective = this.resolveEffectiveSources();
    return this.plugins
      .filter((p) => p.enabled && isPluginEffectivelyEnabled(p.enableSources, effective))
      .map(toPluginInfo);
  }

  hasPlugins(): boolean {
    return this.plugins.length > 0;
  }

  hasEnabledPlugins(): boolean {
    return this.plugins.some((p) => p.enabled);
  }

  getEnabledCount(): number {
    return this.plugins.filter((p) => p.enabled).length;
  }

  /** Used to detect changes that require restarting the persistent query. */
  getPluginsKey(): string {
    const enabledPlugins = this.plugins
      .filter((p) => p.enabled)
      .sort((a, b) => a.id.localeCompare(b.id));

    if (enabledPlugins.length === 0) {
      return '';
    }

    return enabledPlugins.map((p) => `${p.id}:${p.installPath}`).join('|');
  }

  /** Writes to project .claude/settings.json so CLI respects the state. */
  async togglePlugin(pluginId: string): Promise<void> {
    const plugin = this.plugins.find((p) => p.id === pluginId);
    if (!plugin) {
      return;
    }

    this.applyLocalEnabled(plugin, !plugin.enabled);
    await this.ccSettingsStorage.setPluginEnabled(pluginId, plugin.enabled);
  }

  async enablePlugin(pluginId: string): Promise<void> {
    const plugin = this.plugins.find((p) => p.id === pluginId);
    if (!plugin || plugin.enabled) {
      return;
    }

    this.applyLocalEnabled(plugin, true);
    await this.ccSettingsStorage.setPluginEnabled(pluginId, true);
  }

  async disablePlugin(pluginId: string): Promise<void> {
    const plugin = this.plugins.find((p) => p.id === pluginId);
    if (!plugin || !plugin.enabled) {
      return;
    }

    this.applyLocalEnabled(plugin, false);
    await this.ccSettingsStorage.setPluginEnabled(pluginId, false);
  }

  // `setPluginEnabled` writes the project `.claude/settings.json`, so keep both
  // the raw flag and the project enable-source in sync — otherwise a
  // just-toggled plugin would carry a stale `enableSources` into the next
  // `getEffectivelyEnabledPlugins()` and be wrongly filtered from discovery.
  private applyLocalEnabled(plugin: PluginRecord, enabled: boolean): void {
    plugin.enabled = enabled;
    plugin.enableSources.project = enabled;
  }
}
