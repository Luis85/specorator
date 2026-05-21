/**
 * Tests for `collectStream` (WP-12) — the pure helper that drains a
 * `ChatTransportPort.queryStream` iterable into `Result<string, ChatTransportError>`.
 *
 * Replaces the deleted `streamFromQuery` shim (which converged the other
 * direction). The four scenarios required by the brief:
 *   1. Happy path — text deltas concatenate; `done` yields ok(concat).
 *   2. Error mid-stream — `error` delta short-circuits and propagates.
 *   3. Abort — caller may abort the upstream stream; the iterable closes
 *      without a terminal delta, so `collectStream` returns the defensive
 *      "Stream closed before terminal delta" err.
 *   4. Empty stream — iterable exhausts with no deltas at all → same
 *      defensive err.
 *
 * Satisfies the brief's DoD: new `collectStream` test ≥ 90% statements.
 */
import { describe, it, expect } from 'vitest'

import { collectStream } from '@/application/chat/collectStream'
import { ChatTransportError, type StreamDelta } from '@/domain/ports/ChatTransportPort'
import { asSessionId } from '@/domain/chat/SessionId'

/** Yield each delta from `deltas` once, in order. Closes after the last. */
async function* fromArray(deltas: readonly StreamDelta[]): AsyncIterable<StreamDelta> {
  for (const d of deltas) yield d
}

describe('collectStream', () => {
  it('happy path — concatenates text deltas and resolves ok(text) on done', async () => {
    const result = await collectStream(
      fromArray([
        { type: 'text', text: 'Hello, ' },
        { type: 'text', text: 'world!' },
        { type: 'done' },
      ]),
    )
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value).toBe('Hello, world!')
  })

  it('error mid-stream — propagates err(delta.error) and stops reading', async () => {
    const failure = new ChatTransportError('QUERY_FAILED', 'boom')
    let readPastError = false
    async function* upstream(): AsyncIterable<StreamDelta> {
      yield { type: 'text', text: 'partial' }
      yield { type: 'error', error: failure }
      // The contract is "stop reading after `error`" — if collectStream pulled
      // again we'd flip this flag and the assertion below would catch it.
      readPastError = true
      yield { type: 'text', text: 'never' }
    }
    const result = await collectStream(upstream())
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe(failure)
    expect(readPastError).toBe(false)
  })

  it('ignores observable side-channel deltas (session-id, thinking, tool-use, usage, compact-boundary)', async () => {
    const result = await collectStream(
      fromArray([
        { type: 'session-id', sessionId: asSessionId('sess-abc') },
        { type: 'thinking', text: '(reasoning…)' },
        { type: 'tool-use-start', blockId: 'b1', toolName: 'read', inputJson: '' },
        { type: 'tool-use-input-delta', blockId: 'b1', inputJson: '{"a":1}' },
        { type: 'tool-use-stop', blockId: 'b1' },
        { type: 'usage', inputTokens: 10, outputTokens: 5 },
        { type: 'compact-boundary' },
        { type: 'text', text: 'visible' },
        { type: 'done' },
      ]),
    )
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value).toBe('visible')
  })

  it('empty stream — iterable exhausts with no deltas → err QUERY_FAILED', async () => {
    const result = await collectStream(fromArray([]))
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(ChatTransportError)
      expect(result.error.errorCode).toBe('QUERY_FAILED')
      expect(result.error.message).toBe('Stream closed before terminal delta')
    }
  })

  it('abort / upstream closes before terminal delta — err QUERY_FAILED', async () => {
    // Models the abort path: an upstream queryStream that begins streaming
    // text but stops yielding (e.g. AbortController fires and the adapter
    // closes the iterable) without ever emitting `done` or `error`.
    async function* aborted(): AsyncIterable<StreamDelta> {
      yield { type: 'text', text: 'half-' }
      // Iterable returns without `done` / `error` — simulates the upstream
      // adapter closing on abort and not emitting a terminal delta.
    }
    const result = await collectStream(aborted())
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(ChatTransportError)
      expect(result.error.errorCode).toBe('QUERY_FAILED')
    }
  })

  it('returns ok("") for a stream of only done', async () => {
    const result = await collectStream(fromArray([{ type: 'done' }]))
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value).toBe('')
  })
})
