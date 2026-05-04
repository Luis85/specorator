import './core-events'
import type { SettingsPort, VaultPort, WorkspacePort, NotificationPort, LoggerPort } from '@/domain/ports'
import { createEventBus, type EventBus, type EventBusOptions, type EventEnvelope } from '@/domain/shared/event-bus'
import type { ModuleDescriptor, ModulePorts } from '@/modules'

export interface CorePorts {
  readonly settings: SettingsPort
  readonly vault: VaultPort
  readonly workspace: WorkspacePort
  readonly notifications: NotificationPort
  readonly logger: LoggerPort
}

// ── Validation helpers ────────────────────────────────────────────────────────

function validateModules(modules: ReadonlyArray<ModuleDescriptor>): void {
  const ids = new Set<string>()

  // 1a. Duplicate IDs
  for (const mod of modules) {
    if (ids.has(mod.id)) {
      throw new Error(`duplicate module id: "${mod.id}"`)
    }
    ids.add(mod.id)
  }

  for (const mod of modules) {
    const deps = mod.dependsOn ?? []

    // 1c. Self-dependency
    if (deps.includes(mod.id)) {
      throw new Error(`self-dependency detected for module "${mod.id}"`)
    }

    // 1d. Unknown deps
    for (const dep of deps) {
      if (!ids.has(dep)) {
        throw new Error(`unknown dependency "${dep}" in module "${mod.id}"`)
      }
    }
  }
}

// eslint-disable-next-line complexity
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

  // Seed queue in declaration order (stable sort)
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

  // 1e. Any remaining nodes = cycle
  if (sorted.length !== modules.length) {
    const remaining = modules
      .filter((m) => !sorted.includes(m))
      .map((m) => m.id)
      .join(', ')
    throw new Error(`cycle detected among modules: ${remaining}`)
  }

  return sorted
}

function migrateSettings(
  _modules: ReadonlyArray<ModuleDescriptor>,
  settings: Record<string, unknown>,
): Record<string, unknown> {
  return settings // W7 replaces this
}

// ── PluginCore ────────────────────────────────────────────────────────────────

export class PluginCore {
  readonly bus: EventBus
  private readonly _degradedModules: Array<{ id: string; error: Error }> = []
  private readonly ports: CorePorts
  private readonly modules: ReadonlyArray<ModuleDescriptor>
  private sorted: ModuleDescriptor[] = []
  private readonly leakMap = new Map<string, number>()

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

  async init(rawSettings: Record<string, unknown>): Promise<void> {
    // Step 1: validate
    validateModules(this.modules)

    // Step 2: topo-sort
    this.sorted = topoSort(this.modules)

    // Step 3: migrate (stub)
    const settings = migrateSettings(this.modules, rawSettings)

    // Step 4: assemble ModulePorts
    const modulePorts: ModulePorts = { ...this.ports, bus: this.bus }

    // Step 5: init each module
    for (const mod of this.sorted) {
      const subscribedCount = this.bus.listenerCount()
      this.leakMap.set(mod.id, 0) // initialise before init so destroy skips it if init fails

      // eslint-disable-next-line no-restricted-syntax
      try {
        await Promise.resolve(mod.init(modulePorts, settings))
        this.leakMap.set(mod.id, this.bus.listenerCount() - subscribedCount)
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err))
        // eslint-disable-next-line no-restricted-syntax
        try { await Promise.resolve(mod.destroy?.()) } catch { /* ignore */ }
        // Push before emit so getter is consistent when event fires
        this._degradedModules.push({ id: mod.id, error })
        this.bus.emit('core:module-degraded', { moduleId: mod.id, error })
      }
    }

    // Step 6
    this.bus.emit('core:init-complete', { degradedCount: this._degradedModules.length })
  }

  async destroy(): Promise<void> {
    const degradedIds = new Set(this._degradedModules.map((d) => d.id))
    const toDestroy = [...this.sorted].reverse().filter((m) => !degradedIds.has(m.id))

    let leakCount = 0

    for (const mod of toDestroy) {
      const beforeCount = this.bus.listenerCount()

      // eslint-disable-next-line no-restricted-syntax
      try {
        await Promise.resolve(mod.destroy?.())
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err))
        this.ports.logger.error('module destroy failed', error, { moduleId: mod.id })
        continue // skip tripwire for this module
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
}
