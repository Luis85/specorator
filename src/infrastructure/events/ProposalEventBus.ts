/**
 * T-MHP-003 — `ProposalEventBus` typed pub/sub.
 *
 * Spec: SPEC-MHP-040.
 * Satisfies: REQ-MHP-046 (event-bus contract); covers RISK-MHP-011.
 *
 * Synchronous fan-out: every listener for the emitted type is invoked
 * before `emit()` returns. Listener-thrown errors are caught and routed
 * to `LoggerPort.error` so one buggy subscriber cannot break the
 * `ProposalStore`'s critical section. Subsequent listeners still fire.
 */
import type { LoggerPort } from '@/domain/ports/LoggerPort'
import type {
  ProposalEnqueuedEvent,
  ProposalDecidedEvent,
} from '@/domain/mcp/Proposal'

export type ProposalEvent =
  | { type: 'proposalEnqueued'; payload: ProposalEnqueuedEvent }
  | { type: 'proposalDecided'; payload: ProposalDecidedEvent }

export type ProposalEventType = ProposalEvent['type']

export type ProposalEventPayload<T extends ProposalEventType> = Extract<
  ProposalEvent,
  { type: T }
>['payload']

export type ProposalEventListener<T extends ProposalEventType> = (
  payload: ProposalEventPayload<T>,
) => void

export class ProposalEventBus {
  readonly #logger: LoggerPort
  readonly #listeners: {
    readonly proposalEnqueued: Set<ProposalEventListener<'proposalEnqueued'>>
    readonly proposalDecided: Set<ProposalEventListener<'proposalDecided'>>
  }

  constructor(deps: { logger: LoggerPort }) {
    this.#logger = deps.logger
    this.#listeners = {
      proposalEnqueued: new Set(),
      proposalDecided: new Set(),
    }
  }

  on<T extends ProposalEventType>(
    type: T,
    handler: ProposalEventListener<T>,
  ): () => void {
    // The handler type narrows on `type`; the Set is keyed by literal type.
    // Cast through `unknown` because the discriminated union of buckets
    // cannot be inferred to a single Set<ProposalEventListener<T>>.
    const bucket = this.#listeners[type] as unknown as Set<ProposalEventListener<T>>
    bucket.add(handler)
    let subscribed = true
    return () => {
      if (!subscribed) return
      subscribed = false
      bucket.delete(handler)
    }
  }

  emit(ev: ProposalEvent): void {
    const bucket = this.#listeners[ev.type] as unknown as Set<(p: unknown) => void>
    // Iterate over a snapshot so a listener that unsubscribes during emit
    // does not perturb the fan-out for the current event.
    const snapshot = [...bucket]
    for (const listener of snapshot) {
      try {
        listener(ev.payload)
      } catch (thrown) {
        this.#logger.error('ProposalEventBus listener threw', thrown, {
          type: ev.type,
        })
      }
    }
  }

  listenerCount(type: ProposalEventType): number {
    return this.#listeners[type].size
  }
}
