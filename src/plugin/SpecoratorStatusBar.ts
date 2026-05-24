/**
 * T-MHP-091 — SpecoratorStatusBar (Obsidian status-bar item).
 *
 * Spec: SPEC-MHP-041. Satisfies REQ-MHP-046; covers RISK-MHP-012.
 *
 * Subscribes to `proposalEnqueued` (status: 'pending' increments) and
 * `proposalDecided` (decrements) on the injected EventBus and maintains a
 * count. Shows the status-bar element with text `MCP: <N> pending` and
 * `aria-live="polite"`; the element is REMOVED from the DOM when the count
 * returns to 0 (not `display: none`) per Part A §F7 / EC-MHP-035.
 *
 * Plain DOM (no Vue) per the plugin-chrome rule. `dispose()` unsubscribes
 * from the bus BEFORE releasing the DOM element so a late event cannot
 * resurrect the badge after teardown (RISK-MHP-012).
 */
import type { EventBus } from '@/domain/shared/event-bus'
import type { LoggerPort } from '@/domain/ports/LoggerPort'

const STATUS_TESTID = 'mcp-status-bar'

interface PluginLike {
  addStatusBarItem(): HTMLElement
}

interface PortsLike {
  readonly logger?: LoggerPort
}

interface EnqueuedPayloadShape {
  readonly status?: string
}

export interface SpecoratorStatusBarDeps {
  readonly plugin: PluginLike
  readonly bus: EventBus
  readonly ports?: PortsLike
}

export class SpecoratorStatusBar {
  readonly #plugin: PluginLike
  readonly #bus: EventBus
  #unsubEnqueued: (() => void) | null = null
  #unsubDecided: (() => void) | null = null
  #element: HTMLElement | null = null
  #count = 0
  #disposed = false

  constructor(deps: SpecoratorStatusBarDeps) {
    this.#plugin = deps.plugin
    this.#bus = deps.bus
  }

  mount(): void {
    if (this.#disposed) return
    this.#unsubEnqueued = this.#bus.on(
      'proposalEnqueued' as never,
      (envelope: unknown) => {
        const payload = this.#payloadOf(envelope) as EnqueuedPayloadShape | undefined
        if (payload?.status !== 'pending') return
        this.#count++
        this.#render()
      },
    )
    this.#unsubDecided = this.#bus.on('proposalDecided' as never, () => {
      if (this.#count > 0) this.#count--
      this.#render()
    })
  }

  dispose(): void {
    if (this.#disposed) return
    this.#disposed = true
    // RISK-MHP-012: unsubscribe BEFORE releasing the DOM so a listener
    // fan-out that fires during dispose cannot re-create the element.
    this.#unsubEnqueued?.()
    this.#unsubDecided?.()
    this.#unsubEnqueued = null
    this.#unsubDecided = null
    this.#removeElement()
    this.#count = 0
  }

  #render(): void {
    if (this.#disposed) return
    if (this.#count <= 0) {
      this.#removeElement()
      return
    }
    if (this.#element === null) {
      const el = this.#plugin.addStatusBarItem()
      el.setAttribute('data-testid', STATUS_TESTID)
      el.setAttribute('aria-live', 'polite')
      this.#element = el
    }
    this.#element.textContent = `MCP: ${this.#count} pending`
  }

  #removeElement(): void {
    if (this.#element === null) return
    const parent = this.#element.parentNode
    if (parent !== null) parent.removeChild(this.#element)
    this.#element = null
  }

  #payloadOf(envelope: unknown): unknown {
    if (envelope === null || typeof envelope !== 'object') return undefined
    const candidate = envelope as { payload?: unknown }
    return candidate.payload
  }
}
