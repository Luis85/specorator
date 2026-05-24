/**
 * T-MHP-101 — ProposalNoticeEmitter.
 *
 * Spec: SPEC-MHP-042. Satisfies REQ-MHP-046.
 *
 * Subscribes to `proposalEnqueued` on the injected `EventBus`. On every
 * event whose payload `status === 'pending'`, invokes
 * `NotificationPort.showInfo` with the verbatim Part B §S15 copy:
 *
 *   `Pending MCP proposal from <client.id>. Review in your MCP client.`
 *
 * Per-proposalId idempotence — defensive guard against duplicate emissions:
 * a Set tracks seen ids so a second emission for the same id is silent.
 * Auto-accepted entries (`status === 'accepted'`) are silent per Part A §F2.
 */
import type { EventBus } from '@/domain/shared/event-bus'
import type { NotificationPort } from '@/domain/ports/NotificationPort'

interface EnqueuedPayloadShape {
  readonly proposalId?: string
  readonly status?: string
  readonly client?: { readonly id?: string }
}

export interface ProposalNoticeEmitterDeps {
  readonly bus: EventBus
  readonly notify: NotificationPort
}

export class ProposalNoticeEmitter {
  readonly #bus: EventBus
  readonly #notify: NotificationPort
  readonly #seen = new Set<string>()
  #unsub: (() => void) | null = null
  #disposed = false

  constructor(deps: ProposalNoticeEmitterDeps) {
    this.#bus = deps.bus
    this.#notify = deps.notify
  }

  start(): void {
    if (this.#disposed || this.#unsub !== null) return
    this.#unsub = this.#bus.on(
      'proposalEnqueued' as never,
      (envelope: unknown) => {
        this.#handle(envelope)
      },
    )
  }

  dispose(): void {
    if (this.#disposed) return
    this.#disposed = true
    this.#unsub?.()
    this.#unsub = null
  }

  #handle(envelope: unknown): void {
    if (this.#disposed) return
    const payload = this.#payloadOf(envelope)
    if (payload === undefined) return
    if (payload.status !== 'pending') return
    const id = payload.proposalId ?? ''
    if (id === '' || this.#seen.has(id)) return
    this.#seen.add(id)
    const clientId = payload.client?.id ?? 'unknown'
    this.#notify.showInfo(
      `Pending MCP proposal from ${clientId}. Review in your MCP client.`,
    )
  }

  #payloadOf(envelope: unknown): EnqueuedPayloadShape | undefined {
    if (envelope === null || typeof envelope !== 'object') return undefined
    const candidate = envelope as { readonly payload?: EnqueuedPayloadShape | null }
    const payload = candidate.payload
    if (payload === null || payload === undefined || typeof payload !== 'object') return undefined
    return payload
  }
}
