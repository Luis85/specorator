import './core-events'
import type { SettingsPort, VaultPort, WorkspacePort, NotificationPort, LoggerPort, TranslationPort } from '@/domain/ports'
import { createEventBus, type EventBus, type EventBusOptions, type EventEnvelope } from '@/domain/shared/event-bus'
import { tryAsync, trySync } from '@/domain/shared/tryAsync'
import type { ModuleDescriptor, ModulePorts } from '@/modules'
import { applyModuleMessages } from './applyModuleMessages'

export interface CorePorts {
  readonly settings: SettingsPort
  readonly vault: VaultPort
  readonly workspace: WorkspacePort
  readonly notifications: NotificationPort
  readonly logger: LoggerPort
  readonly t: TranslationPort
  readonly i18nMerge?: (locale: string, messages: Record<string, string>) => void
}

// ── Validation helpers ────────────────────────────────────────────────────────

function validateSettingsKeys(modules: ReadonlyArray<ModuleDescriptor>): void {
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

function validateModules(modules: ReadonlyArray<ModuleDescriptor>): void {
  const ids = new Set<string>()

  for (const mod of modules) {
    if (ids.has(mod.id)) {
      throw new Error(`duplicate module id: "${mod.id}"`)
    }
    ids.add(mod.id)
  }

  validateSettingsKeys(modules)

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

// eslint-disable-next-line complexity -- Kahn's BFS; complexity comes from the algorithm itself, not incidental branching.
function topoSort(modules: ReadonlyArray<ModuleDescriptor>): ModuleDescriptor[] {
  const inDegree = new Map<string, number>()
  const adj = new Map<string, string[]>() // dep → dependants

  for (const mod of modules) {
    if (!inDegree.has(mod.id)) inDegree.set(mod.id, 0)
    if (!adj.has(mod.id)) adj.set(mod.id, [])
  }

  for (const mod of modules) {
    for (const dep of mod.dependsOn ?? []) {
      inDegree.set(mod.id, (inDegree.get(mod.id) ?? 0) + 1)
      if (!adj.has(dep)) adj.set(dep, [])
      adj.get(dep)!.push(mod.id)
    }
  }

  const queue: ModuleDescriptor[] = modules.filter((m) => inDegree.get(m.id) === 0)
  const sorted: ModuleDescriptor[] = []
  const byId = new Map(modules.map((m) => [m.id, m]))

  while (queue.length > 0) {
    const mod = queue.shift()!
    sorted.push(mod)
    for (const dependantId of adj.get(mod.id) ?? []) {
      const next = (inDegree.get(dependantId) ?? 1) - 1
      inDegree.set(dependantId, next)
      if (next === 0) queue.push(byId.get(dependantId)!)
    }
  }

  if (sorted.length !== modules.length) {
    const remaining = modules
      .filter((m) => !sorted.includes(m))
      .map((m) => m.id)
      .join(', ')
    throw new Error(`cycle detected among modules: ${remaining}`)
  }

  return sorted
}

// eslint-disable-next-line complexity -- Migration pipeline; each branch handles one aspect of the migration/validation/fallback spec.
function migrateSettings(
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

// ── PluginCore ────────────────────────────────────────────────────────────────

export class PluginCore {
  readonly bus: EventBus
  private readonly _degradedModules: Array<{ id: string; error: Error }> = []
  private readonly ports: CorePorts
  private readonly modules: ReadonlyArray<ModuleDescriptor>
  private sorted: ModuleDescriptor[] = []
  private readonly leakMap = new Map<string, number>()
  private readonly moduleSettingsMap = new Map<string, unknown>()
  private _initCalled = false

  constructor(
    modules: ReadonlyArray<ModuleDescriptor>,
    ports: CorePorts,
    busOptions?: EventBusOptions,
  ) {
    this.modules = modules
    this.ports = ports
    this.bus = createEventBus({
      ...busOptions,
      onListenerError: (error: unknown, envelope: EventEnvelope) => {
        const { channel, eventId, traceId } = envelope // payload never accessed
        // eslint-disable-next-line no-restricted-syntax
        try {
          ports.logger.error('event listener error', error, { channel, eventId, traceId })
        } catch {
          // discard — cannot re-enter error reporting path
        }
      },
    })
  }

  get degradedModules(): ReadonlyArray<{ id: string; error: Error }> {
    return [...this._degradedModules]
  }

  /** All registered modules in declaration order (available before init). */
  get allModules(): ReadonlyArray<ModuleDescriptor> {
    return this.modules
  }

  /** Returns the migrated, validated settings slice for a module by settingsKey. */
  getModuleSettings(settingsKey: string): unknown {
    return this.moduleSettingsMap.get(settingsKey)
  }

  /**
   * Called after a settings save to invoke the matching module's onSettingsChange hook.
   * Runs validateSettings before the hook and logs + skips on failure.
   */
  async notifySettingsChanged(settingsKey: string, rawValue: unknown): Promise<void> {
    if (!this._initCalled) return

    const mod = this.modules.find((m) => m.settingsKey === settingsKey)
    if (mod === undefined) return

    let value: unknown = rawValue
    if (mod.validateSettings !== undefined) {
      const validateResult = trySync(() => mod.validateSettings!(rawValue))
      if (!validateResult.ok) {
        this.ports.logger.warn('validateSettings failed; skipping onSettingsChange', {
          moduleId: mod.id,
          settingsKey,
          error: validateResult.error.message,
        })
        return
      }
      value = validateResult.value
    }

    this.moduleSettingsMap.set(settingsKey, value)

    if (mod.onSettingsChange === undefined) return

    const hookResult = await tryAsync(() => Promise.resolve(mod.onSettingsChange!(value as never)))
    if (!hookResult.ok) {
      this.ports.logger.error('onSettingsChange failed', hookResult.error, { moduleId: mod.id })
    }
  }

  async init(rawSettings: Record<string, unknown>): Promise<void> {
    if (this._initCalled) {
      throw new Error('PluginCore.init() has already been called')
    }
    this._initCalled = true

    validateModules(this.modules)
    this.sorted = topoSort(this.modules)

    migrateSettings(this.sorted, rawSettings, this.ports.logger)
    const settings = rawSettings

    for (const mod of this.sorted) {
      if (mod.settingsKey !== undefined) {
        this.moduleSettingsMap.set(mod.settingsKey, settings[mod.settingsKey] ?? mod.settingsDefaults ?? {})
      }
    }

    const modulePorts: ModulePorts = {
      settings: this.ports.settings,
      vault: this.ports.vault,
      workspace: this.ports.workspace,
      notifications: this.ports.notifications,
      logger: this.ports.logger,
      t: this.ports.t,
      bus: this.bus,
    }
    const degradedIds = new Set<string>()

    for (const mod of this.sorted) {
      await this.initModule(mod, modulePorts, settings, degradedIds)
    }

    this.bus.emit('core:init-complete', { degradedCount: this._degradedModules.length })
  }

  async destroy(): Promise<void> {
    const degradedIds = new Set(this._degradedModules.map((d) => d.id))
    const toDestroy = [...this.sorted].reverse().filter((m) => !degradedIds.has(m.id))

    let leakCount = 0

    for (const mod of toDestroy) {
      const beforeCount = this.bus.listenerCount()

      const result = await tryAsync(() => Promise.resolve(mod.destroy?.()))
      if (!result.ok) {
        this.ports.logger.error('module destroy failed', result.error, { moduleId: mod.id })
        continue
      }

      const afterCount = this.bus.listenerCount()
      const released = beforeCount - afterCount
      const subscribed = this.leakMap.get(mod.id) ?? 0

      if (released < subscribed) {
        this.ports.logger.warn('listener leak detected', {
          moduleId: mod.id,
          released,
          subscribed,
        })
        leakCount++
      }
    }

    this.bus.emit('core:destroy-complete', { leakCount })
  }

  private async initModule(
    mod: ModuleDescriptor,
    modulePorts: ModulePorts,
    settings: Record<string, unknown>,
    degradedIds: Set<string>,
  ): Promise<void> {
    const degradedDep = (mod.dependsOn ?? []).find((id) => degradedIds.has(id))
    if (degradedDep !== undefined) {
      const error = new Error(`prerequisite module degraded: "${degradedDep}"`)
      this._degradedModules.push({ id: mod.id, error })
      this.bus.emit('core:module-degraded', { moduleId: mod.id, error })
      degradedIds.add(mod.id)
      return
    }

    if (this.ports.i18nMerge !== undefined) {
      const mergeResult = trySync(() => { applyModuleMessages(mod, this.ports.i18nMerge!) })
      if (!mergeResult.ok) {
        this._degradedModules.push({ id: mod.id, error: mergeResult.error })
        this.bus.emit('core:module-degraded', { moduleId: mod.id, error: mergeResult.error })
        degradedIds.add(mod.id)
        return
      }
    }

    const subscribedCount = this.bus.listenerCount()
    this.leakMap.set(mod.id, 0)

    const moduleSettings =
      mod.settingsKey !== undefined
        ? (settings[mod.settingsKey] ?? mod.settingsDefaults ?? {})
        : settings

    const result = await tryAsync(() => Promise.resolve(mod.init(modulePorts, moduleSettings as never)))
    if (result.ok) {
      this.leakMap.set(mod.id, this.bus.listenerCount() - subscribedCount)
      return
    }

    await tryAsync(() => Promise.resolve(mod.destroy?.()))
    // Push before emit so getter is consistent when event fires
    this._degradedModules.push({ id: mod.id, error: result.error })
    this.bus.emit('core:module-degraded', { moduleId: mod.id, error: result.error })
    degradedIds.add(mod.id)
  }
}
