/**
 * T-CCS-002 — Tests for the `ChatTransportPort` domain types: the
 * `ChatTransportError` class and its discriminator codes.
 *
 * Satisfies REQ-CCS-021, SPEC-CCS-001 §2.1–§2.3, TEST-CCS-021.
 *
 * Reshaped in WP-12 (Arch review #3): the `streamFromQuery` helper that this
 * file also used to cover is deleted — non-streaming consumers now use
 * `collectStream` from `@/application/chat/collectStream` (tested in its
 * sibling `tests/application/chat/collectStream.test.ts`).
 */
import { describe, it, expect } from 'vitest'
import { ChatTransportError } from '@/domain/ports/ChatTransportPort'

describe('REQ-CCS-021: ChatTransportError', () => {
  it('stores errorCode on construction', () => {
    const err = new ChatTransportError('NOT_INSTALLED', 'binary missing')
    expect(err.errorCode).toBe('NOT_INSTALLED')
  })

  it('stores message on construction', () => {
    const err = new ChatTransportError('TIMEOUT', 'took too long')
    expect(err.message).toBe('took too long')
  })

  it('stores optional cause on construction', () => {
    const cause = new Error('original')
    const err = new ChatTransportError('QUERY_FAILED', 'sdk error', cause)
    expect(err.cause).toBe(cause)
  })

  it('has cause === undefined when not provided', () => {
    const err = new ChatTransportError('API_KEY_MISSING', 'no key')
    expect(err.cause).toBeUndefined()
  })

  it('name is "ChatTransportError"', () => {
    const err = new ChatTransportError('NOT_INSTALLED', 'test')
    expect(err.name).toBe('ChatTransportError')
  })

  it('extends Error', () => {
    const err = new ChatTransportError('TIMEOUT', 'test')
    expect(err).toBeInstanceOf(Error)
  })

  it('instanceof ChatTransportError is true after prototype-chain restoration', () => {
    const err = new ChatTransportError('QUERY_FAILED', 'test')
    expect(err).toBeInstanceOf(ChatTransportError)
  })

  it('supports all ChatTransportErrorCode values', () => {
    const codes = ['NOT_INSTALLED', 'API_KEY_MISSING', 'TIMEOUT', 'QUERY_FAILED'] as const
    for (const code of codes) {
      const err = new ChatTransportError(code, 'msg')
      expect(err.errorCode).toBe(code)
    }
  })
})
