/**
 * T-MPS-046 — MockCursorApiAdapter parity smoke test.
 *
 * Verifies the `setAvailability` / `setNextDelta` / `setError` fluent
 * helpers match the documented contract and that the default
 * `available = false` path yields a NOT_INSTALLED error.
 */
import { describe, it, expect } from 'vitest'
import { MockCursorApiAdapter } from '@/infrastructure/mock/MockCursorApiAdapter'
import { MockCursorApiAdapter as FakeReexport } from '../../__fakes__/MockCursorApiAdapter'
import { ChatTransportError, type StreamDelta } from '@/domain/ports/ChatTransportPort'

async function collect(iter: AsyncIterable<StreamDelta>): Promise<StreamDelta[]> {
  const out: StreamDelta[] = []
  for await (const d of iter) out.push(d)
  return out
}

describe('MockCursorApiAdapter (T-MPS-046)', () => {
  it('exposes the same class through tests/__fakes__/', () => {
    expect(FakeReexport).toBe(MockCursorApiAdapter)
  })

  it('defaults to available=false and emits NOT_INSTALLED', async () => {
    const fake = new MockCursorApiAdapter()
    expect(await fake.isAvailable()).toBe(false)
    const deltas = await collect(fake.queryStream('hi'))
    expect(deltas[0].type).toBe('error')
    if (deltas[0].type === 'error') {
      expect(deltas[0].error.errorCode).toBe('NOT_INSTALLED')
    }
    expect(deltas[deltas.length - 1]).toEqual({ type: 'done' })
  })

  it('setAvailability(true) + cannedResponse yields a text delta + done', async () => {
    const fake = new MockCursorApiAdapter().setAvailability(true)
    fake.cannedResponse = 'hello from mock'
    const deltas = await collect(fake.queryStream('hi'))
    expect(deltas).toContainEqual({ type: 'text', text: 'hello from mock' })
    expect(deltas[deltas.length - 1]).toEqual({ type: 'done' })
  })

  it('setError forces the next call to terminate with the given error', async () => {
    const fake = new MockCursorApiAdapter().setAvailability(true)
    fake.setError(new ChatTransportError('QUERY_FAILED', 'forced'))
    const deltas = await collect(fake.queryStream('hi'))
    expect(deltas[0].type).toBe('error')
    if (deltas[0].type === 'error') expect(deltas[0].error.message).toBe('forced')
  })

  it('setNextDelta scripts the exact emitted sequence (one-shot)', async () => {
    const fake = new MockCursorApiAdapter().setAvailability(true)
    fake.setNextDelta([
      { type: 'text', text: 'a' },
      { type: 'text', text: 'b' },
      { type: 'done' },
    ])
    const deltas = await collect(fake.queryStream('hi'))
    expect(deltas).toEqual([
      { type: 'text', text: 'a' },
      { type: 'text', text: 'b' },
      { type: 'done' },
    ])
    // Script is consumed — subsequent call uses cannedResponse path.
    const second = await collect(fake.queryStream('next'))
    expect(second.some((d) => d.type === 'text')).toBe(true)
  })

  it('records prompts and options to queryLog/optionsLog', async () => {
    const fake = new MockCursorApiAdapter().setAvailability(true)
    await collect(fake.queryStream('first'))
    await collect(fake.queryStream('second', { timeoutMs: 5_000 }))
    expect(fake.queryLog).toEqual(['first', 'second'])
    expect(fake.optionsLog[1]?.timeoutMs).toBe(5_000)
  })
})
