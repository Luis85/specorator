/**
 * T-CCS-002 — Tests for ClaudeCliPort interface shape and ClaudeCliError class.
 * Satisfies REQ-CCS-021, SPEC-CCS-001 §2.1–§2.3, TEST-CCS-021.
 */
import { describe, it, expect } from 'vitest'
import { ClaudeCliError } from '@/domain/ports/ClaudeCliPort'

describe('REQ-CCS-021: ClaudeCliPort interface and ClaudeCliError', () => {
  describe('ClaudeCliError', () => {
    it('stores errorCode on construction', () => {
      const err = new ClaudeCliError('NOT_INSTALLED', 'binary missing')
      expect(err.errorCode).toBe('NOT_INSTALLED')
    })

    it('stores message on construction', () => {
      const err = new ClaudeCliError('TIMEOUT', 'took too long')
      expect(err.message).toBe('took too long')
    })

    it('stores optional cause on construction', () => {
      const cause = new Error('original')
      const err = new ClaudeCliError('QUERY_FAILED', 'sdk error', cause)
      expect(err.cause).toBe(cause)
    })

    it('has cause === undefined when not provided', () => {
      const err = new ClaudeCliError('API_KEY_MISSING', 'no key')
      expect(err.cause).toBeUndefined()
    })

    it('name is "ClaudeCliError"', () => {
      const err = new ClaudeCliError('NOT_INSTALLED', 'test')
      expect(err.name).toBe('ClaudeCliError')
    })

    it('extends Error', () => {
      const err = new ClaudeCliError('TIMEOUT', 'test')
      expect(err).toBeInstanceOf(Error)
    })

    it('instanceof ClaudeCliError is true after prototype-chain restoration', () => {
      const err = new ClaudeCliError('QUERY_FAILED', 'test')
      expect(err).toBeInstanceOf(ClaudeCliError)
    })

    it('supports all ClaudeCliErrorCode values', () => {
      const codes = ['NOT_INSTALLED', 'API_KEY_MISSING', 'TIMEOUT', 'QUERY_FAILED'] as const
      for (const code of codes) {
        const err = new ClaudeCliError(code, 'msg')
        expect(err.errorCode).toBe(code)
      }
    })
  })
})
