import type { ModuleDescriptor } from '@/modules'

/**
 * Asserts URI action names are unique across the module set.
 *
 * Pure — depends only on the module descriptor array; no port dependency.
 */
export function validateUriActions(modules: ReadonlyArray<ModuleDescriptor>): void {
  const seen = new Set<string>()
  for (const mod of modules) {
    for (const uriAction of mod.uriActions ?? []) {
      if (seen.has(uriAction.action)) {
        throw new Error(`duplicate URI action "${uriAction.action}" in module "${mod.id}"`)
      }
      seen.add(uriAction.action)
    }
  }
}

/**
 * Asserts settingsKey values are unique and do not collide with the reserved
 * `_`-prefix namespace (`_moduleVersions` etc.).
 *
 * Pure — depends only on the module descriptor array; no port dependency.
 */
export function validateSettingsKeys(modules: ReadonlyArray<ModuleDescriptor>): void {
  const seen = new Set<string>()
  for (const mod of modules) {
    if (mod.settingsKey === undefined) continue
    if (mod.settingsKey.startsWith('_')) {
      throw new Error(`reserved settingsKey "${mod.settingsKey}" in module "${mod.id}"`)
    }
    if (seen.has(mod.settingsKey)) {
      throw new Error(`duplicate settingsKey "${mod.settingsKey}" in module "${mod.id}"`)
    }
    seen.add(mod.settingsKey)
  }
}

/**
 * Asserts the module registry is internally consistent: unique IDs, unique
 * settings keys, unique URI actions, no self-dependency, no unknown
 * `dependsOn` references. Cycles are caught downstream by `topoSort`.
 *
 * Pure — depends only on the module descriptor array; no port dependency.
 */
export function validateModules(modules: ReadonlyArray<ModuleDescriptor>): void {
  const ids = new Set<string>()

  for (const mod of modules) {
    if (ids.has(mod.id)) {
      throw new Error(`duplicate module id: "${mod.id}"`)
    }
    ids.add(mod.id)
  }

  validateSettingsKeys(modules)
  validateUriActions(modules)

  for (const mod of modules) {
    const deps = mod.dependsOn ?? []

    if (deps.includes(mod.id)) {
      throw new Error(`self-dependency detected for module "${mod.id}"`)
    }

    for (const dep of deps) {
      if (!ids.has(dep)) {
        throw new Error(`unknown dependency "${dep}" in module "${mod.id}"`)
      }
    }
  }
}
