import { describe, expect, it } from 'vitest'

import {
  ClaudeSubscriptionError,
  CommitProposalError,
  EnvelopeParseError,
  PathValidationError,
} from '@/application/chat/errors'

/**
 * T-ASM-031 — DoD: "Prototype-chain test (one per class) asserts `instanceof`
 * works." The pattern guards against ES5/CommonJS transpilation breaking
 * `instanceof` for subclasses of built-in `Error`, which was the historical
 * reason for the `Object.setPrototypeOf(this, new.target.prototype)` line.
 */
describe('application/chat/errors prototype chain', () => {
  it('EnvelopeParseError preserves instanceof Error and EnvelopeParseError', () => {
    const e = new EnvelopeParseError('PRIMARY_ZOD_FAILED', 'boom')
    expect(e).toBeInstanceOf(Error)
    expect(e).toBeInstanceOf(EnvelopeParseError)
    expect(e.name).toBe('EnvelopeParseError')
    expect(e.errorCode).toBe('STRUCTURED_PARSE_FAILED')
    expect(e.kind).toBe('PRIMARY_ZOD_FAILED')
  })

  it('PathValidationError preserves instanceof Error and PathValidationError', () => {
    const e = new PathValidationError('CONTAINS_DOTDOT', 'nope')
    expect(e).toBeInstanceOf(Error)
    expect(e).toBeInstanceOf(PathValidationError)
    expect(e.name).toBe('PathValidationError')
    expect(e.errorCode).toBe('PATH_INVALID')
    expect(e.kind).toBe('CONTAINS_DOTDOT')
  })

  it('CommitProposalError preserves instanceof Error and CommitProposalError', () => {
    const cause = new Error('underlying')
    const e = new CommitProposalError('WRITE_FAILED', 'could not write', cause)
    expect(e).toBeInstanceOf(Error)
    expect(e).toBeInstanceOf(CommitProposalError)
    expect(e.name).toBe('CommitProposalError')
    expect(e.errorCode).toBe('WRITE_FAILED')
    expect(e.cause).toBe(cause)
  })

  it('ClaudeSubscriptionError preserves instanceof Error and ClaudeSubscriptionError', () => {
    const e = new ClaudeSubscriptionError('SPAWN_FAILED', 'spawn ENOENT')
    expect(e).toBeInstanceOf(Error)
    expect(e).toBeInstanceOf(ClaudeSubscriptionError)
    expect(e.name).toBe('ClaudeSubscriptionError')
    expect(e.errorCode).toBe('SPAWN_FAILED')
  })
})
