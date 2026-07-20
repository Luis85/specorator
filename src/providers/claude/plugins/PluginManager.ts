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

// Resolves one installed plugin id to a PluginInfo, or null when no entry
// matches this vault. Project enabled-state wins, then global, then default-on.
function buildPluginInfo(
  pluginId: string,
  entries: InstalledPluginEntry | InstalledPluginEntry[],
  normalizedVaultPath: string,
  enabledLookup: PluginEnabledLookup,
): PluginInfo | null {
  if (!entries || (Array.isArray(entries) && entries.length === 0)) {
    return null;
  }

  const entriesArray = normalizeInstalledEntries(pluginId, entries);
  const entry = selectInstalledPluginEntry(entriesArray, normalizedVaultPath);
  if (!entry) {
    return null;
  }

  const scope: PluginScope = entry.scope === 'project' ? 'project' : 'user';
  const enabled = enabledLookup.project[pluginId] ?? enabledLookup.userGlobal[pluginId] ?? true;

  return {
    id: pluginId,
    name: extractPluginName(pluginId),
    enabled,
    scope,
    installPath: entry.installPath,
  };
}

function comparePluginsByScopeThenId(a: PluginInfo, b: PluginInfo): number {
  if (a.scope !== b.scope) {
    return a.scope === 'project' ? -1 : 1;
  }
  return a.id.localeCompare(b.id);
}

export class PluginManager {
  private ccSettingsStorage: CCSettingsStorage;
  private vaultPath: string;
  private plugins: PluginInfo[] = [];

  constructor(vaultPath: string, ccSettingsStorage: CCSettingsStorage) {
    this.vaultPath = vaultPath;
    this.ccSettingsStorage = ccSettingsStorage;
  }

  async loadPlugins(): Promise<void> {
    const installedPlugins = readJsonFile<InstalledPluginsFile>(INSTALLED_PLUGINS_PATH);
    const globalSettings = readJsonFile<SettingsFile>(GLOBAL_SETTINGS_PATH);
    const projectSettings = await this.loadProjectSettings();

    const enabledLookup: PluginEnabledLookup = {
      project: projectSettings?.enabledPlugins ?? {},
      userGlobal: globalSettings?.enabledPlugins ?? {},
    };

    const normalizedVaultPath = normalizePathForComparison(this.vaultPath);
    this.plugins = Object.entries(installedPlugins?.plugins ?? {})
      .map(([id, entries]) => buildPluginInfo(id, entries, normalizedVaultPath, enabledLookup))
      .filter((p): p is PluginInfo => p !== null)
      .sort(comparePluginsByScopeThenId);
  }

  private async loadProjectSettings(): Promise<SettingsFile | null> {
    return readJsonFile(path.join(this.vaultPath, '.claude', 'settings.json'));
  }

  getPlugins(): PluginInfo[] {
    return [...this.plugins];
  }

  /**
   * Enabled plugins only — what skill/agent discovery scans. Enablement reflects
   * what's on disk (`enabledPlugins`, project over user); like the user-scope
   * skill path, discovery mirrors disk and the runtime resolves `/<plugin>:<skill>`
   * (a plugin the runtime happens not to load in a rare withheld-source config
   * simply no-ops if invoked).
   */
  getEnabledPlugins(): PluginInfo[] {
    return this.plugins.filter((p) => p.enabled);
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
    plugin.enabled = !plugin.enabled;
    await this.ccSettingsStorage.setPluginEnabled(pluginId, plugin.enabled);
  }

  async enablePlugin(pluginId: string): Promise<void> {
    const plugin = this.plugins.find((p) => p.id === pluginId);
    if (!plugin || plugin.enabled) {
      return;
    }
    plugin.enabled = true;
    await this.ccSettingsStorage.setPluginEnabled(pluginId, true);
  }

  async disablePlugin(pluginId: string): Promise<void> {
    const plugin = this.plugins.find((p) => p.id === pluginId);
    if (!plugin || !plugin.enabled) {
      return;
    }
    plugin.enabled = false;
    await this.ccSettingsStorage.setPluginEnabled(pluginId, false);
  }
}
