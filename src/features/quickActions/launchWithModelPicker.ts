import { Notice } from 'obsidian';

import { ProviderRegistry } from '@/core/providers/ProviderRegistry';
import type { ProviderId } from '@/core/providers/types';
import { asSettingsBag } from '@/core/types/settings';
import { resolveBlankTabModel } from '@/features/chat/tabs/tabShared';
import { t } from '@/i18n/i18n';
import type SpecoratorPlugin from '@/main';
import { ModelLaunchModal, type ModelLaunchProvider } from '@/shared/modals/ModelLaunchModal';

export interface ModelPickerLaunch {
  /** Persistence key for the last-used provider/model memo. */
  lastUsedKey: string;
  /** Modal title (already composed by the caller). */
  title: string;
  onConfirm: (choice: { providerId: ProviderId; model: string }) => void;
}

/**
 * Resolve the preset (stored last-used or global default), validate it against
 * the currently enabled providers + their model catalog, open the model picker,
 * persist the confirmed choice, and invoke `onConfirm`. The single seam reused
 * by quick actions and loop prompting.
 */
export function launchWithModelPicker(plugin: SpecoratorPlugin, launch: ModelPickerLaunch): void {
  const settings = asSettingsBag(plugin.settings);
  const enabledProviders = buildEnabledProviders(settings);
  const enabledIds = new Set(enabledProviders.map((p) => p.id));
  const stored = plugin.quickActionLastUsedStore?.get(launch.lastUsedKey) ?? null;

  let presetProviderId: ProviderId;
  let presetModel: string;
  let fallbackNotice: { storedProviderLabel: string; storedModelLabel: string } | undefined;

  const storedIsValid = !!stored
    && enabledIds.has(stored.providerId)
    && !!enabledProviders.find((p) => p.id === stored.providerId)?.models.some((m) => m.value === stored.model);

  if (stored && storedIsValid) {
    presetProviderId = stored.providerId;
    presetModel = stored.model;
  } else {
    presetProviderId = ProviderRegistry.resolveSettingsProviderId(settings);
    presetModel = resolveBlankTabModel(plugin, presetProviderId);
    if (stored) {
      fallbackNotice = {
        storedProviderLabel: resolveProviderLabel(stored.providerId),
        storedModelLabel: resolveModelLabel(stored.providerId, stored.model, settings),
      };
      plugin.quickActionLastUsedStore?.delete(launch.lastUsedKey);
    }
  }

  new ModelLaunchModal({
    app: plugin.app,
    title: launch.title,
    presetProviderId,
    presetModel,
    enabledProviders,
    resolveDefaultModelForProvider: (providerId) => resolveBlankTabModel(plugin, providerId),
    fallbackNotice,
    onConfirm: (choice) => {
      if (!ProviderRegistry.isEnabled(choice.providerId, settings)) {
        new Notice(t('quickActions.launchModal.providerDisabled'));
        return;
      }
      plugin.quickActionLastUsedStore?.set(launch.lastUsedKey, choice);
      launch.onConfirm(choice);
    },
  }).open();
}

function buildEnabledProviders(settings: Record<string, unknown>): ModelLaunchProvider[] {
  const out: ModelLaunchProvider[] = [];
  for (const id of ProviderRegistry.getRegisteredProviderIds()) {
    if (!ProviderRegistry.isEnabled(id, settings)) continue;
    const models = ProviderRegistry.getChatUIConfig(id)
      .getModelOptions(settings)
      .map((opt) => ({ value: opt.value, label: opt.label }));
    out.push({ id, displayName: ProviderRegistry.getProviderDisplayName(id), models });
  }
  return out;
}

function resolveProviderLabel(providerId: ProviderId): string {
  try {
    return ProviderRegistry.getProviderDisplayName(providerId);
  } catch {
    return providerId;
  }
}

function resolveModelLabel(providerId: ProviderId, model: string, settings: Record<string, unknown>): string {
  try {
    const found = ProviderRegistry.getChatUIConfig(providerId).getModelOptions(settings).find((o) => o.value === model);
    if (found) return found.label;
  } catch { /* provider may no longer be registered */ }
  return model;
}
