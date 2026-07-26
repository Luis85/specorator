import {
  SPECORATOR_SETTINGS_PATH,
} from '../../core/bootstrap/StoragePaths';
import { ProviderRegistry } from '../../core/providers/ProviderRegistry';
import { ProviderSettingsCoordinator } from '../../core/providers/ProviderSettingsCoordinator';
import type { VaultFileAdapter } from '../../core/storage/VaultFileAdapter';
import type {
  SpecoratorSettings,
} from '../../core/types/settings';
import { DEFAULT_SPECORATOR_SETTINGS } from './defaultSettings';
import { migrateTabBudget } from './migrateTabBudget';
import { migrateModelOverrides } from './migrations/migrateModelOverrides';

export {
  SPECORATOR_SETTINGS_PATH,
};

export type StoredSpecoratorSettings = SpecoratorSettings;

// Settings keys retired in earlier Specorator versions but still possibly present
// in user-vault `specorator-settings.json`. Stripped on load and save so the
// merged settings shape never carries dead fields forward. Name kept neutral
// per settings overhaul Phase I1 acceptance (grep cleanliness).
const DEPRECATED_SETTING_FIELDS = [
  'activeConversationId',
  'show1MModel',
  'hiddenSlashCommands',
  'slashCommands',
  'allowExternalAccess',
  'allowedExportPaths',
  'enableBlocklist',
  'blockedCommands',
  'claudeSafeMode',
  'codexSafeMode',
  'claudeCliPath',
  'claudeCliPathsByHost',
  'codexCliPath',
  'codexCliPathsByHost',
  'codexReasoningSummary',
  'loadUserClaudeSettings',
  'codexEnabled',
  'lastClaudeModel',
  'enableChrome',
  'enableBangBash',
  'enableOpus1M',
  'enableSonnet1M',
  'environmentVariables',
  'lastEnvHash',
  'lastCodexEnvHash',
  'openInMainTab',
] as const;

function stripDeprecatedFields(settings: Record<string, unknown>): Record<string, unknown> {
  const cleaned = { ...settings };
  for (const key of DEPRECATED_SETTING_FIELDS) {
    delete cleaned[key];
  }
  return cleaned;
}

export class SpecoratorSettingsStorage {
  /**
   * Tail of the settings-write chain. Two saves can overlap — every settings
   * control persists on touch, so toggling two provider cards (or a toggle plus
   * a background write) starts a second `save()` while the first is still in
   * `adapter.write`. The snapshot each call serializes is correct, but the
   * writes themselves are independent async operations: if the FIRST one lands
   * last, the file ends up holding the older snapshot and the second change is
   * lost on disk while memory still shows it. Chaining them keeps last-call-wins
   * on the file. Never rejects (a failed write must not wedge later saves).
   */
  private writeChain: Promise<void> = Promise.resolve();

  constructor(private adapter: VaultFileAdapter) {}

  async load(): Promise<StoredSpecoratorSettings> {
    if (!await this.adapter.exists(SPECORATOR_SETTINGS_PATH)) {
      return this.getDefaults();
    }

    const content = await this.adapter.read(SPECORATOR_SETTINGS_PATH);
    const stored = JSON.parse(content) as Record<string, unknown>;

    // Migrate raw stored shape BEFORE the defaults merge so legacy values copy
    // forward to the new keys instead of being shadowed by the defaults.
    migrateTabBudget(stored);

    const merged = {
      ...this.getDefaults(),
      ...stripDeprecatedFields(stored),
    };

    const migrated = migrateModelOverrides(merged);
    const didMigrateModelOverrides = migrated !== merged;

    // Providers repair their own persisted state on load behind the generic
    // coordinator hook, so the app shell stays provider-neutral.
    const didNormalizeProviders = ProviderSettingsCoordinator.normalizeOnLoad(
      migrated,
    );

    if (didMigrateModelOverrides || didNormalizeProviders) {
      await this.save(migrated);
    }

    return migrated;
  }

  async save(settings: StoredSpecoratorSettings): Promise<void> {
    // Serialized here, synchronously, so the queued write persists the state as
    // of THIS call rather than whatever the shared settings object holds by the
    // time its turn comes.
    const content = JSON.stringify(
      stripDeprecatedFields(settings),
      null,
      2,
    );
    const write = this.writeChain.then(
      () => this.adapter.write(SPECORATOR_SETTINGS_PATH, content),
    );
    this.writeChain = write.catch(() => {});
    await write;
  }

  async exists(): Promise<boolean> {
    return this.adapter.exists(SPECORATOR_SETTINGS_PATH);
  }

  async update(updates: Partial<StoredSpecoratorSettings>): Promise<void> {
    const current = await this.load();
    await this.save({ ...current, ...updates });
  }

  async setLastModel(model: string, isCustom: boolean): Promise<void> {
    if (isCustom) {
      await this.update({ lastCustomModel: model });
      return;
    }

    const current = await this.load();
    ProviderSettingsCoordinator.persistProviderLastModel(
      current,
      ProviderRegistry.resolveSettingsProviderId(current),
      model,
    );
    await this.save(current);
  }

  async setLastEnvHash(hash: string): Promise<void> {
    const current = await this.load();
    ProviderSettingsCoordinator.persistProviderEnvironmentHash(
      current,
      ProviderRegistry.resolveSettingsProviderId(current),
      hash,
    );
    await this.save(current);
  }

  private getDefaults(): StoredSpecoratorSettings {
    // Spread (not the shared reference) so `providerConfigs` is materialized as a
    // writable data property here — DEFAULT_SPECORATOR_SETTINGS exposes it as a
    // getter (ARCH-2 cycle avoidance), and returning that object directly would
    // make `settings.providerConfigs = ...` throw (getter-only) on a fresh install
    // and would let mutations clobber the shared module-level default.
    return { ...DEFAULT_SPECORATOR_SETTINGS };
  }
}
