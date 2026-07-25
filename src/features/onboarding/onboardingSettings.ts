import { normalizePath } from 'obsidian';

import { getProviderConfig, setProviderConfig } from '@/core/providers/providerConfig';
import { ProviderRegistry } from '@/core/providers/ProviderRegistry';
import { ProviderSettingsCoordinator } from '@/core/providers/ProviderSettingsCoordinator';
import type { ProviderId } from '@/core/providers/types';
import type { PluginContext } from '@/core/types/PluginContext';
import { asSettingsBag } from '@/core/types/settings';

/**
 * Every write the setup view performs goes through `plugin.saveSettings()` the
 * moment a control is touched — the wizard is a *view over settings*, not a
 * staging buffer. Leaving early therefore keeps exactly what was already
 * confirmed, and a user who reopens the flow sees live state rather than a
 * half-applied draft.
 */

export async function setProviderEnabled(
  plugin: PluginContext,
  providerId: ProviderId,
  enabled: boolean,
): Promise<void> {
  const settings = asSettingsBag(plugin.settings);
  const config = getProviderConfig(settings, providerId);
  setProviderConfig(settings, providerId, { ...config, enabled });
  await plugin.saveSettings();
}

/**
 * Pins an explicit CLI path for this host, the escape hatch for a binary in a
 * place no PATH scan reaches. Host-scoped (`cliPathsByHost`) rather than the
 * legacy flat `cliPath`, so a synced vault cannot push one machine's path onto
 * another. A blank value clears the pin and restores auto-detection.
 */
export async function setProviderCliPathForHost(
  plugin: PluginContext,
  providerId: ProviderId,
  hostnameKey: string,
  cliPath: string,
): Promise<void> {
  const settings = asSettingsBag(plugin.settings);
  const config = getProviderConfig(settings, providerId);
  const existing = config.cliPathsByHost;
  const byHost: Record<string, string> = existing && typeof existing === 'object' && !Array.isArray(existing)
    ? { ...(existing as Record<string, string>) }
    : {};

  const trimmed = cliPath.trim();
  if (trimmed) {
    byHost[hostnameKey] = trimmed;
  } else {
    delete byHost[hostnameKey];
  }

  setProviderConfig(settings, providerId, { ...config, cliPathsByHost: byHost });
  await plugin.saveSettings();
}

/**
 * Top-level settings the wizard touches. Deliberately enumerated: it keeps the
 * flow from becoming a second, untyped settings editor, and every key here has
 * a matching control on one of the five steps.
 *
 * `permissionMode` is offered as `normal` / `plan` only — `yolo` stays behind
 * the toolbar toggle and its one-time warning (SEC-1), which a setup wizard has
 * no business bypassing.
 */
export type OnboardingScalarKey =
  | 'model'
  | 'permissionMode'
  | 'enableAutoTitleGeneration'
  | 'chatViewPlacement'
  | 'maxChatTabs'
  | 'marketplaceNetworkEnabled';

export function readAppSetting(plugin: PluginContext, key: OnboardingScalarKey): unknown {
  return asSettingsBag(plugin.settings)[key];
}

export async function setAppSetting(
  plugin: PluginContext,
  key: OnboardingScalarKey,
  value: string | number | boolean,
): Promise<void> {
  asSettingsBag(plugin.settings)[key] = value;
  await plugin.saveSettings();
}

/**
 * Commits a default-model choice to the provider that OWNS the model.
 *
 * Writing only the top-level `model` does not survive: `ProviderSettingsCoordinator`
 * projects per-provider state, and projecting a provider that doesn't own the
 * current model replaces it with that provider's own first option. With Claude
 * and Codex both enabled, picking a Codex model and writing `model` alone
 * therefore reverts to a Claude model the next time Claude's state is projected
 * — the chosen default silently never applies.
 *
 * So this does what the settings-tab and chat pickers do:
 * - points `settingsProvider` at the owning provider, so it is the one a blank
 *   chat prefers (and so the projection treats the model as "current"),
 * - applies the model's own reasoning defaults (`applyModelDefaults`), and
 * - persists the projection maps (`savedProviderModel[owner]` and friends) via
 *   `persistProjectedProviderState`, which is what makes the choice durable
 *   across later projections.
 */
export async function setDefaultModel(plugin: PluginContext, model: string): Promise<void> {
  const settings = asSettingsBag(plugin.settings);
  const owner = ProviderRegistry.resolveProviderForModel(model, settings, {
    onlyEnabledProviders: true,
  });

  settings.model = model;
  settings.settingsProvider = owner;
  ProviderRegistry.getChatUIConfig(owner).applyModelDefaults(model, settings);
  ProviderSettingsCoordinator.persistProjectedProviderState(settings, owner);
  await plugin.saveSettings();
}

/** The vault folders the Board, Library, and Quick Actions surfaces read from. */
export const ONBOARDING_FOLDER_KEYS = [
  'agentBoardWorkOrderFolder',
  'agentBoardTemplateFolder',
  'agentBoardLoopFolder',
  'agentBoardArchiveFolder',
  'quickActionsFolder',
] as const;

export type OnboardingFolderKey = typeof ONBOARDING_FOLDER_KEYS[number];

export interface OnboardingFolderState {
  key: OnboardingFolderKey;
  path: string;
  exists: boolean;
}

export function readFolderSetting(plugin: PluginContext, key: OnboardingFolderKey): string {
  const value = asSettingsBag(plugin.settings)[key];
  return typeof value === 'string' ? value : '';
}

export async function setFolderSetting(
  plugin: PluginContext,
  key: OnboardingFolderKey,
  value: string,
): Promise<void> {
  asSettingsBag(plugin.settings)[key] = value.trim();
  await plugin.saveSettings();
}

/**
 * Creates the configured folders that don't exist yet. A blank setting is
 * skipped, never defaulted: the Library and the Marketplace installer both read
 * blank as "unconfigured" and refuse to write there, so materializing a default
 * folder here would land content somewhere nothing scans.
 */
export async function ensureOnboardingFolders(
  plugin: PluginContext,
  adapter: { exists(path: string): Promise<boolean>; ensureFolder(path: string): Promise<void> },
): Promise<OnboardingFolderState[]> {
  const states: OnboardingFolderState[] = [];

  for (const key of ONBOARDING_FOLDER_KEYS) {
    const raw = readFolderSetting(plugin, key).trim();
    if (!raw) {
      states.push({ key, path: '', exists: false });
      continue;
    }

    const path = normalizePath(raw);
    if (!(await adapter.exists(path))) {
      await adapter.ensureFolder(path);
    }
    states.push({ key, path, exists: true });
  }

  return states;
}

/** Reads current existence for each configured folder without creating anything. */
export async function readOnboardingFolders(
  plugin: PluginContext,
  adapter: { exists(path: string): Promise<boolean> },
): Promise<OnboardingFolderState[]> {
  const states: OnboardingFolderState[] = [];

  for (const key of ONBOARDING_FOLDER_KEYS) {
    const raw = readFolderSetting(plugin, key).trim();
    states.push({
      key,
      path: raw ? normalizePath(raw) : '',
      exists: raw ? await adapter.exists(normalizePath(raw)) : false,
    });
  }

  return states;
}

/**
 * Marks the first-run flow finished. Reuses the existing `firstRunDismissed`
 * flag rather than adding a second one, so completing the setup view also
 * retires the Settings → General banner that gates on the same boolean.
 */
export async function completeOnboarding(plugin: PluginContext): Promise<void> {
  asSettingsBag(plugin.settings).firstRunDismissed = true;
  await plugin.saveSettings();
}

export function isOnboardingComplete(plugin: PluginContext): boolean {
  return asSettingsBag(plugin.settings).firstRunDismissed === true;
}
