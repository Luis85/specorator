/**
 * T-MHP-002 — `ProposalEventBus` typed pub/sub contract test.
 *
 * Satisfies: REQ-MHP-046 (event-bus contract); covers RISK-MHP-011.
 * Spec: SPEC-MHP-040.
 *
 * TDD: this test MUST fail before `src/infrastructure/events/ProposalEventBus.ts`
 * lands. The module import is the first failure mode.
 */
import { describe, it, expect, vi } from 'vitest'
import { ProposalEventBus } from '@/infrastructure/events/ProposalEventBus'
import type {
  ProposalEnqueuedEvent,
  ProposalDecidedEvent,
  ClientIdentity,
} from '@/domain/mcp/Proposal'

function makeLogger() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }
}

const CLIENT: ClientIdentity = {
  id: 'test-client',
  transport: 'loopback',
  address: '127.0.0.1:0',
}

function makeEnqueued(proposalId: string): ProposalEnqueuedEvent {
  return {
    proposalId,
    kind: 'vault_write_note',
    tool: 'vault_write_note',
    client: CLIENT,
    enqueuedAt: '2026-05-24T00:00:00.000Z',
    status: 'pending',
  }
}

function makeDecided(proposalId: string): ProposalDecidedEvent {
  return {
    proposalId,
    decision: {
      outcome: 'accepted',
      by: 'client',
      rule: '',
      at: '2026-05-24T00:00:00.000Z',
    },
    decidedByClient: CLIENT,
  }
}

describe('ProposalEventBus (SPEC-MHP-040 / REQ-MHP-046)', () => {
  it('emits proposalEnqueued payload to every subscribed listener synchronously', () => {
    const logger = makeLogger()
    const bus = new ProposalEventBus({ logger })

    const listenerA = vi.fn()
    const listenerB = vi.fn()
    bus.on('proposalEnqueued', listenerA)
    bus.on('proposalEnqueued', listenerB)

    const payload = makeEnqueued('p-1')
    bus.emit({ type: 'proposalEnqueued', payload })

    expect(listenerA).toHaveBeenCalledTimes(1)
    expect(listenerA).toHaveBeenCalledWith(payload)
    expect(listenerB).toHaveBeenCalledTimes(1)
    expect(listenerB).toHaveBeenCalledWith(payload)
  })

  it('emits proposalDecided payload only to proposalDecided listeners', () => {
    const logger = makeLogger()
    const bus = new ProposalEventBus({ logger })

    const enqueuedListener = vi.fn()
    const decidedListener = vi.fn()
    bus.on('proposalEnqueued', enqueuedListener)
    bus.on('proposalDecided', decidedListener)

    const payload = makeDecided('p-2')
    bus.emit({ type: 'proposalDecided', payload })

    expect(decidedListener).toHaveBeenCalledTimes(1)
    expect(decidedListener).toHaveBeenCalledWith(payload)
    expect(enqueuedListener).not.toHaveBeenCalled()
  })

  it('listenerCount reflects active subscriptions per type', () => {
    const logger = makeLogger()
    const bus = new ProposalEventBus({ logger })

    expect(bus.listenerCount('proposalEnqueued')).toBe(0)
    expect(bus.listenerCount('proposalDecided')).toBe(0)

    const unsub1 = bus.on('proposalEnqueued', vi.fn())
    bus.on('proposalEnqueued', vi.fn())
    bus.on('proposalDecided', vi.fn())

    expect(bus.listenerCount('proposalEnqueued')).toBe(2)
    expect(bus.listenerCount('proposalDecided')).toBe(1)

    unsub1()
    expect(bus.listenerCount('proposalEnqueued')).toBe(1)
  })

  it('unsubscribe handle removes the listener (subsequent emits do not call it)', () => {
    const logger = makeLogger()
    const bus = new ProposalEventBus({ logger })

    const listener = vi.fn()
    const unsubscribe = bus.on('proposalEnqueued', listener)

    bus.emit({ type: 'proposalEnqueued', payload: makeEnqueued('p-3') })
    expect(listener).toHaveBeenCalledTimes(1)

    unsubscribe()
    bus.emit({ type: 'proposalEnqueued', payload: makeEnqueued('p-3') })
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('catches listener-thrown errors, logs via LoggerPort.error, does NOT re-throw to emitter', () => {
    const logger = makeLogger()
    const bus = new ProposalEventBus({ logger })

    const boom = new Error('listener boom')
    const throwing = vi.fn(() => {
      throw boom
    })
    const survivor = vi.fn()

    bus.on('proposalEnqueued', throwing)
    bus.on('proposalEnqueued', survivor)

    const payload = makeEnqueued('p-4')

    // emit MUST NOT throw despite the first listener throwing
    expect(() => { bus.emit({ type: 'proposalEnqueued', payload }); }).not.toThrow()

    expect(throwing).toHaveBeenCalledTimes(1)
    // Fan-out continues to the second listener after the first threw
    expect(survivor).toHaveBeenCalledTimes(1)
    expect(survivor).toHaveBeenCalledWith(payload)

    // Error is reported via LoggerPort.error (not re-thrown)
    expect(logger.error).toHaveBeenCalled()
  })

  it('idempotent unsubscribe: calling the handle twice does not corrupt other listeners', () => {
    const logger = makeLogger()
    const bus = new ProposalEventBus({ logger })

    const a = vi.fn()
    const b = vi.fn()
    const unsubA = bus.on('proposalDecided', a)
    bus.on('proposalDecided', b)

    unsubA()
    unsubA() // second call: must be a no-op
    bus.emit({ type: 'proposalDecided', payload: makeDecided('p-5') })

    expect(a).not.toHaveBeenCalled()
    expect(b).toHaveBeenCalledTimes(1)
  })
})
