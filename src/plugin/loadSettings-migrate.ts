import type { PluginSettings } from '@/domain/settings/PluginSettings'

/** Keys that belong to the flat PluginSettings namespace (W7 storage migration).
 *
 *  Must list every PluginSettings field that could exist at the top level of a
 *  legacy (pre-W7) data blob. Missing keys are silently dropped during the
 *  flat→nested migration and the user is forced through onboarding again
 *  (Codex P2, PR #350) — `userPersona` and `onboardingComplete` were
 *  previously omitted, costing upgraded users their persona selection.
 */
export const PLUGIN_SETTINGS_KEYS: ReadonlyArray<keyof PluginSettings> = [
  'locale',
  'specsFolder',
  'archiveFolder',
  'decisionsFolder',
  'constitutionFile',
  'gateStrictness',
  'teamMode',
  'logLevel',
  'userPersona',
  'onboardingComplete',
  'claudeCliPath',
  // `transportKind` retained for legacy flat-blob promotion; migration
  // (`migrateProviderSelection`) translates it before any consumer reads it.
  'transportKind',
  'providerSelection',
  'cursorCliPath',
  'cursorApiPreview',
  'autoPreferProvider',
  'providerModel',
  'chatTabCap',
]

/**
 * Legacy MCP keys that were removed when the MCP server was extracted into
 * the standalone `specorator-obsidian-mcp` plugin. Strip them silently from
 * the persisted `specorator` blob so they do not accumulate as dead weight.
 *
 * - `mcpServerEnabled` — was the opt-in toggle for the embedded MCP server.
 * - `obsidianCliPath`  — was the path to the `obsidian` CLI binary used by
 *                        the MCP CLI-backed tool group (ADR-018).
 */
const MCP_LEGACY_KEYS = ['mcpServerEnabled', 'obsidianCliPath'] as const

/**
 * Strip legacy MCP keys from the `specorator` sub-blob. Idempotent and
 * pure: returns the original object unchanged when none of the keys are
 * present (avoids an unnecessary `saveData` round-trip on clean installs).
 */
export function stripMcpLegacy(
  raw: Record<string, unknown>,
): { result: Record<string, unknown>; stripped: boolean } {
  const specorator = raw.specorator
  if (specorator === null || typeof specorator !== 'object' || Array.isArray(specorator)) {
    return { result: raw, stripped: false }
  }
  const blob = specorator as Record<string, unknown>
  const keysPresent = MCP_LEGACY_KEYS.filter((k) => k in blob)
  if (keysPresent.length === 0) return { result: raw, stripped: false }

  const nextBlob: Record<string, unknown> = Object.fromEntries(
    Object.entries(blob).filter(([k]) => !MCP_LEGACY_KEYS.includes(k as (typeof MCP_LEGACY_KEYS)[number])),
  )
  return { result: { ...raw, specorator: nextBlob }, stripped: true }
}

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
