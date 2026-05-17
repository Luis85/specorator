import './core-events'
import type { SettingsPort, VaultPort, WorkspacePort, NotificationPort, LoggerPort, TranslationPort, ObsidianMcpServerPort } from '@/domain/ports'
import { createEventBus, type EventBus, type EventBusOptions, type EventEnvelope } from '@/domain/shared/event-bus'
import { tryAsync, trySync } from '@/domain/shared/tryAsync'
import type { ModuleDescriptor, ModulePorts } from '@/modules'
import { applyModuleMessages } from './applyModuleMessages'
import { validateModules } from './module-validation'
import { topoSort } from './module-topo-sort'
import { migrateSettings } from './settings-migration'
import { McpServerLifecycle } from './mcp-server-lifecycle'

export interface CorePorts {
  readonly settings: SettingsPort
  readonly vault: VaultPort
  readonly workspace: WorkspacePort
  readonly notifications: NotificationPort
  readonly logger: LoggerPort
  readonly t: TranslationPort
  readonly i18nMerge?: (locale: string, messages: Record<string, string>) => void
  readonly mcpServer?: ObsidianMcpServerPort
  /**
   * Predicate the host (plugin) supplies to gate the MCP server start path.
   * `PluginCore` calls this on its auto-start (during `init`) and on the
   * settings-toggle path. The explicit command path passes `{ force: true }`
   * to `startMcpServer` and bypasses this gate. When undefined (e.g. in unit
   * tests that don't care about gating), `PluginCore` treats MCP as disabled
   * for the auto-start path — pass `() => true` to opt in.
   */
  readonly isMcpServerEnabled?: () => boolean
}

export class PluginCore {
  readonly bus: EventBus
  private readonly _degradedModules: Array<{ id: string; error: Error }> = []
  private readonly ports: CorePorts
  private readonly modules: ReadonlyArray<ModuleDescriptor>
  private readonly mcpLifecycle: McpServerLifecycle
  private sorted: ModuleDescriptor[] = []
  private readonly leakMap = new Map<string, number>()
  private readonly moduleSettingsMap = new Map<string, unknown>()
  private readonly uriDispatch = new Map<string, (params: URLSearchParams) => void>()
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
    this.mcpLifecycle = new McpServerLifecycle({
      port: ports.mcpServer,
      isEnabled: ports.isMcpServerEnabled,
      logger: ports.logger,
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

  /** Dispatch an obsidian://specorator URI to the matching module handler. Returns true if handled. */
  handleUri(params: URLSearchParams): boolean {
    const action = params.get('action')
    if (action === null) return false
    const handler = this.uriDispatch.get(action)
    if (handler === undefined) return false
    const result = trySync(() => { handler(params) })
    if (!result.ok) {
      this.ports.logger.error('URI action handler failed', result.error, { action })
    }
    return true
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

    if (mod.onSettingsChange !== undefined) {
      const hookResult = await tryAsync(() => Promise.resolve(mod.onSettingsChange!(value as never)))
      if (!hookResult.ok) {
        this.ports.logger.error('onSettingsChange failed', hookResult.error, { moduleId: mod.id })
      }
    }

    // Reconcile MCP after every settings change — the sync is a cheap no-op
    // when desired === running, so we avoid hardcoding which module's
    // settingsKey owns the toggle.
    await this.mcpLifecycle.syncRunning()
  }

  /** True iff the MCP server is currently running under PluginCore's control. */
  isMcpServerRunning(): boolean {
    return this.mcpLifecycle.isRunning()
  }

  async startMcpServer(): Promise<void> {
    await this.mcpLifecycle.start()
  }

  async stopMcpServer(): Promise<void> {
    await this.mcpLifecycle.stop()
  }

  async init(rawSettings: Record<string, unknown>): Promise<void> {
    if (this._initCalled) {
      throw new Error('PluginCore.init() has already been called')
    }
    this._initCalled = true

    validateModules(this.modules)
    this.sorted = topoSort(this.modules)

    for (const mod of this.modules) {
      for (const uriAction of mod.uriActions ?? []) {
        this.uriDispatch.set(uriAction.action, uriAction.handler)
      }
    }

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

    await this.mcpLifecycle.start()

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

    await this.mcpLifecycle.stop()

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
