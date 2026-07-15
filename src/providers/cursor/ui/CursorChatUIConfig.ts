import { getRuntimeEnvironmentVariables } from '../../../core/providers/providerEnvironment';
import type {
  ProviderChatUIConfig,
  ProviderPermissionModeToggleConfig,
  ProviderReasoningOption,
  ProviderUIOption,
} from '../../../core/providers/types';
import { CURSOR_PROVIDER_ICON } from '../../../shared/icons';
import { formatCursorModelLabel } from '../modelLabels';
import { STATIC_FALLBACK_MODEL_IDS } from '../runtime/cursorModelCatalog';
import {
  buildCursorFamilies,
  CURSOR_STANDARD_MODE,
  extractCursorModeValue,
  resolveCursorFamilyId,
} from '../runtime/cursorModelFamily';
import {
  fromCursorModelValue,
  isCursorModelValue,
  toCursorModelValue,
} from '../runtime/cursorModelId';
import { cursorModelContextWindow, cursorModelPricing } from '../runtime/cursorModelWindowCatalog';
import {
  getCursorEnabledModels,
  getCursorProviderSettings,
  updateCursorProviderSettings,
} from '../settings';

const CURSOR_PERMISSION_MODE_TOGGLE: ProviderPermissionModeToggleConfig = {
  inactiveValue: 'normal',
  inactiveLabel: 'Safe',
  activeValue: 'yolo',
  activeLabel: 'YOLO',
  planValue: 'plan',
  planLabel: 'Plan',
};

const DEFAULT_CONTEXT_WINDOW = 200_000;

const NAMESPACED_FALLBACK_MODEL_VALUES = new Set(
  STATIC_FALLBACK_MODEL_IDS.map(toCursorModelValue),
);

// Curated raw ids the user enabled, plus an env CURSOR_MODEL override. This is
// the source of truth for both the family picker and the per-family mode list.
function enabledRawIds(settings: Record<string, unknown>): string[] {
  const envVars = getRuntimeEnvironmentVariables(settings, 'cursor');
  const ids = [...getCursorEnabledModels(settings)];
  if (envVars.CURSOR_MODEL?.trim()) {
    ids.push(envVars.CURSOR_MODEL.trim());
  }
  return ids;
}

function familyIdFromModelValue(model: string, settings: Record<string, unknown>): string {
  return resolveCursorFamilyId(fromCursorModelValue(model), enabledRawIds(settings));
}

export const cursorChatUIConfig: ProviderChatUIConfig = {
  getModelOptions(settings: Record<string, unknown>): ProviderUIOption[] {
    const cursorSettings = getCursorProviderSettings(settings);
    const curated = getCursorEnabledModels(settings);
    const curatedFamilyIds = new Set(buildCursorFamilies(curated).map((family) => family.familyId));

    const autoValue = toCursorModelValue('auto');
    const options: ProviderUIOption[] = [{ value: autoValue, label: formatCursorModelLabel('auto') }];
    const seen = new Set<string>([autoValue]);

    for (const family of buildCursorFamilies(enabledRawIds(settings))) {
      const value = toCursorModelValue(family.familyId);
      if (seen.has(value)) {
        continue;
      }
      seen.add(value);
      const isEnvOnly = !curatedFamilyIds.has(family.familyId);
      const modeCount = family.variants.length;
      const description = isEnvOnly
        ? 'Custom (env)'
        : modeCount > 1
          ? `${family.vendor} · ${modeCount} modes`
          : family.vendor;
      options.push({ value, label: family.label, description, group: family.vendor });
    }

    for (const row of cursorSettings.customModels) {
      const value = toCursorModelValue(row.id);
      if (seen.has(value)) {
        continue;
      }
      seen.add(value);
      options.push({
        value,
        label: row.label ?? formatCursorModelLabel(row.id),
        description: 'Custom model',
        ...(row.contextWindow !== undefined ? { contextWindow: row.contextWindow } : {}),
      });
    }

    return options;
  },

  ownsModel(model: string, _settings: Record<string, unknown>): boolean {
    if (isCursorModelValue(model)) {
      return true;
    }
    return /^composer-/i.test(model) || model === 'auto';
  },

  isAdaptiveReasoningModel(_model: string, _settings: Record<string, unknown>): boolean {
    return false;
  },

  getReasoningOptions(_model: string, _settings: Record<string, unknown>): ProviderReasoningOption[] {
    // CLI model suffixes describe one-shot `agent --model` inputs, not legal
    // ACP session configuration. Cursor ACP currently advertises no independent
    // thought-level selector, so exposing these as an editable chat effort
    // control would claim capabilities the active session cannot apply.
    return [];
  },

  getDefaultReasoningValue(_model: string, _settings: Record<string, unknown>): string {
    return CURSOR_STANDARD_MODE;
  },

  getContextWindowSize(model: string, _customLimits?: Record<string, number>): number {
    // Picker values arrive namespaced (`cursor:<rawId>`); the catalog is keyed
    // by raw ids, so strip the prefix or non-200k windows fall back to default.
    return cursorModelContextWindow(fromCursorModelValue(model)) || DEFAULT_CONTEXT_WINDOW;
  },

  getModelPricing(modelId: string) {
    return cursorModelPricing(fromCursorModelValue(modelId));
  },

  isDefaultModel(model: string): boolean {
    return NAMESPACED_FALLBACK_MODEL_VALUES.has(model);
  },

  applyModelDefaults(model: string, settings: unknown): void {
    const target = settings as Record<string, unknown>;
    // Reference the typed const rather than `this`: object-literal method `this`
    // is inferred as `any` under the marketplace validator's TS, tripping the
    // no-unsafe-* rules. `cursorChatUIConfig` carries the `ProviderChatUIConfig` type.
    const familyValue = cursorChatUIConfig.normalizeModelVariant(model, target);
    const familyId = fromCursorModelValue(familyValue);
    if (!familyId) {
      return;
    }
    updateCursorProviderSettings(target, { lastModel: familyId });
  },

  normalizeModelVariant(model: string, settings: Record<string, unknown>): string {
    if (!isCursorModelValue(model) && !/^composer-/i.test(model) && model !== 'auto') {
      return model;
    }
    const rawId = fromCursorModelValue(model);
    return extractCursorModeValue(rawId, enabledRawIds(settings))
      ? toCursorModelValue(rawId)
      : toCursorModelValue(familyIdFromModelValue(model, settings));
  },

  getCustomModelIds(envVars: Record<string, string>): Set<string> {
    const ids = new Set<string>();
    if (envVars.CURSOR_MODEL && !STATIC_FALLBACK_MODEL_IDS.includes(envVars.CURSOR_MODEL)) {
      ids.add(resolveCursorFamilyId(envVars.CURSOR_MODEL, STATIC_FALLBACK_MODEL_IDS));
    }
    return ids;
  },

  getPermissionModeToggle(): ProviderPermissionModeToggleConfig {
    return CURSOR_PERMISSION_MODE_TOGGLE;
  },

  isBangBashEnabled(): boolean {
    return false;
  },

  getProviderIcon() {
    return CURSOR_PROVIDER_ICON;
  },
};
