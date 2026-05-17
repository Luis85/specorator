import type { LoggerPort, ObsidianMcpServerPort } from '@/domain/ports'
import { tryAsync } from '@/domain/shared/tryAsync'

export interface McpServerLifecycleDeps {
  /** When undefined, all start/stop/sync paths short-circuit to no-ops. */
  readonly port?: ObsidianMcpServerPort
  /**
   * Predicate the host supplies to gate the MCP server. Auto-start (`start()`)
   * and `syncRunning()` consult this on every call. When undefined the gate
   * resolves to "disabled" (the same semantics `PluginCore` exposed before
   * the split — pass `() => true` to opt in).
   */
  readonly isEnabled?: () => boolean
  readonly logger: LoggerPort
}

/**
 * Owns the local MCP server's running state and serialises concurrent
 * reconciliations through a single promise chain.
 *
 * Extracted from `PluginCore` in WP-17 to isolate the MCP concern from the
 * module-system lifecycle. Public methods preserve the `PluginCore` shape
 * (`start`, `stop`, `isRunning`, `syncRunning`) so the orchestrator can
 * delegate without behaviour change.
 */
export class McpServerLifecycle {
  private readonly deps: McpServerLifecycleDeps
  private _running = false
  private _syncChain: Promise<void> = Promise.resolve()

  constructor(deps: McpServerLifecycleDeps) {
    this.deps = deps
  }

  /** True iff the MCP server is currently running under this lifecycle's control. */
  isRunning(): boolean {
    return this._running
  }

  /**
   * Start the local MCP server.
   *
   * - Idempotent: no-op when already running.
   * - Gated by `deps.isEnabled()`.
   * - Errors are logged via `LoggerPort` and swallowed; the server simply
   *   remains stopped on failure.
   */
  async start(): Promise<void> {
    if (this.deps.port === undefined) return
    if (this._running) return
    if (this.deps.isEnabled?.() !== true) return

    const result = await tryAsync(() => this.deps.port!.start())
    if (!result.ok) {
      this.deps.logger.error('MCP server start failed', result.error)
      return
    }
    this._running = true
  }

  /**
   * Stop the local MCP server. Idempotent: no-op when not running.
   * Errors are logged but do not throw.
   */
  async stop(): Promise<void> {
    if (this.deps.port === undefined) return
    if (!this._running) return

    const result = await tryAsync(() => this.deps.port!.stop())
    if (!result.ok) {
      this.deps.logger.error('MCP server stop failed', result.error)
    }
    // Mark stopped even on adapter error: the running invariant is owned by
    // this lifecycle, and a failed stop should not strand future start calls.
    this._running = false
  }

  /**
   * Enqueues a reconciliation onto a serial promise chain so that concurrent
   * calls (e.g. rapid stop→start) never observe stale `_running` state.
   * Each enqueued reconciliation reads `isEnabled()` fresh when it actually
   * runs, so the last queued call always reflects the latest intent.
   */
  syncRunning(): Promise<void> {
    this._syncChain = this._syncChain
      .then(() => this._doSync())
      .catch(() => { /* start/stop errors are logged inside those methods */ })
    return this._syncChain
  }

  private async _doSync(): Promise<void> {
    if (this.deps.port === undefined) return
    const desired = this.deps.isEnabled?.() === true
    if (desired && !this._running) {
      await this.start()
    } else if (!desired && this._running) {
      await this.stop()
    }
  }
}
