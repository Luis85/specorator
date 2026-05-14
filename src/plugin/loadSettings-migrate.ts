import type { PluginSettings } from '@/domain/settings/PluginSettings'

/** Keys that belong to the flat PluginSettings namespace (W7 storage migration). */
export const PLUGIN_SETTINGS_KEYS: ReadonlyArray<keyof PluginSettings> = [
  'locale',
  'specsFolder',
  'archiveFolder',
  'decisionsFolder',
  'constitutionFile',
  'gateStrictness',
  'teamMode',
  'logLevel',
  'mcpServerEnabled',
  'anthropicApiKey',
]

/**
 * Pure migration helper: promotes legacy flat `PluginSettings` keys stored at
 * the top level of the data blob into a `specorator` sub-key, and rewrites the
 * legacy `featuresFolder` field to `specsFolder` (NFR-AVS-004).
 *
 * Does NOT mutate the input. Returns a new object.
 *
 * Behaviour:
 *  - `featuresFolder` is rewritten to `specsFolder` only when `specsFolder` is
 *    absent. An existing `specsFolder` is always preserved.
 *  - If a `specorator` sub-key is already present, the blob is returned
 *    unchanged (double-promotion guard).
 *  - Top-level keys that are not in `PLUGIN_SETTINGS_KEYS` (e.g. `hello`,
 *    `_moduleVersions`) are preserved untouched at the top level.
 */
export function promoteLegacyFlatSettings(
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...raw }

  // NFR-AVS-004: treat legacy `featuresFolder` as `specsFolder` if present.
  if (typeof next.featuresFolder === 'string' && typeof next.specsFolder !== 'string') {
    next.specsFolder = next.featuresFolder
  }

  // Double-promotion guard.
  if ('specorator' in next) return next

  const specorator: Record<string, unknown> = {}
  for (const key of PLUGIN_SETTINGS_KEYS) {
    if (key in next) specorator[key] = next[key]
  }
  next.specorator = specorator
  return next
}
