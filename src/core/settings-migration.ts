import type { LoggerPort } from '@/domain/ports'
import { trySync } from '@/domain/shared/tryAsync'
import type { ModuleDescriptor } from '@/modules'

/**
 * Mutates `settings` in-place: for every module with a `settingsKey`,
 *
 * 1. Reads the stored version from `settings._moduleVersions` (falling back
 *    to 0 when the entry is missing or the container is corrupted).
 * 2. Runs `mod.migrate(storedVersion, blob)` when `storedVersion <
 *    mod.settingsVersion ?? 0`. A throwing migrate falls back to
 *    `mod.settingsDefaults ?? {}` and logs a warning.
 * 3. Runs `mod.validateSettings(blob)` when declared. A throwing validator
 *    falls back to defaults and logs a warning.
 * 4. Writes the resulting blob to `settings[settingsKey]` and bumps
 *    `settings._moduleVersions[settingsKey]` to the target version.
 *
 * Single-port dependency (`LoggerPort`) — kept narrow so this stays pure of
 * the `CorePorts` aggregate.
 */
// eslint-disable-next-line complexity -- Migration pipeline; each branch handles one aspect of the migration/validation/fallback spec.
export function migrateSettings(
  modules: ReadonlyArray<ModuleDescriptor>,
  settings: Record<string, unknown>,
  logger: LoggerPort,
): void {
  const raw = settings._moduleVersions
  const versions: Record<string, number> =
    raw !== null && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, number>)
      : {}

  for (const mod of modules) {
    if (mod.settingsKey === undefined) continue

    const key = mod.settingsKey
    const storedVersion = versions[key] ?? 0
    const targetVersion = mod.settingsVersion ?? 0

    let blob: unknown = settings[key] ?? {}

    if (storedVersion < targetVersion && mod.migrate !== undefined) {
      const migrateResult = trySync(() => mod.migrate!(storedVersion, blob))
      if (migrateResult.ok) {
        blob = migrateResult.value
      } else {
        logger.warn('settings migration failed; falling back to defaults', {
          moduleId: mod.id,
          settingsKey: key,
          fromVersion: storedVersion,
          toVersion: targetVersion,
          error: migrateResult.error.message,
        })
        blob = mod.settingsDefaults ?? {}
      }
    }

    if (mod.validateSettings !== undefined) {
      const validateResult = trySync(() => mod.validateSettings!(blob))
      if (validateResult.ok) {
        blob = validateResult.value
      } else {
        logger.warn('validateSettings failed; falling back to defaults', {
          moduleId: mod.id,
          settingsKey: key,
          error: validateResult.error.message,
        })
        blob = mod.settingsDefaults ?? {}
      }
    }

    settings[key] = blob
    versions[key] = targetVersion
  }

  settings._moduleVersions = versions
}
