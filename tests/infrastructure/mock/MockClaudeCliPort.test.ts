/**
 * T-CCS-004 — Tests for MockClaudeCliPort all method branches.
 * Satisfies REQ-CCS-022, SPEC-CCS-001 §6, TEST-CCS-022.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { MockClaudeCliPort } from '@/infrastructure/mock/MockClaudeCliPort'
import { ClaudeCliError } from '@/domain/ports/ClaudeCliPort'

describe('REQ-CCS-022: MockClaudeCliPort', () => {
  let mock: MockClaudeCliPort

  beforeEach(() => {
    mock = new MockClaudeCliPort()
  })

  it('isAvailable() returns false by default', async () => {
    expect(await mock.isAvailable()).toBe(false)
  })

  it('isAvailable() returns true when available is set to true', async () => {
    mock.available = true
    expect(await mock.isAvailable()).toBe(true)
  })

  it('startup() is a no-op and does not throw', async () => {
    await expect(mock.startup()).resolves.toBeUndefined()
  })

  it('shutdown() is a no-op and does not throw', () => {
    expect(() => { mock.shutdown() }).not.toThrow()
  })

  it('query() with available=false returns err(NOT_INSTALLED)', async () => {
    mock.available = false
    const result = await mock.query('hello')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toBeInstanceOf(ClaudeCliError)
    expect(result.error.errorCode).toBe('NOT_INSTALLED')
  })

  it('query() with available=true and no queryError appends to queryLog and returns ok(cannedResponse)', async () => {
    mock.available = true
    const result = await mock.query('test prompt')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toBe(mock.cannedResponse)
    expect(mock.queryLog).toContain('test prompt')
  })

  it('query() appends to queryLog even when not available', async () => {
    mock.available = false
    await mock.query('some prompt')
    expect(mock.queryLog).toContain('some prompt')
  })

  it('query() with queryError set returns err(queryError)', async () => {
    mock.available = true
    const customError = new ClaudeCliError('TIMEOUT', 'simulated timeout')
    mock.queryError = customError
    const result = await mock.query('test')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toBe(customError)
  })

  it('query() respects delayMs and resolves after the delay', async () => {
    mock.available = true
    mock.delayMs = 50
    const start = Date.now()
    await mock.query('prompt')
    const elapsed = Date.now() - start
    expect(elapsed).toBeGreaterThanOrEqual(40)
  })

  it('queryLog is initially empty', () => {
    expect(mock.queryLog).toHaveLength(0)
  })

  it('cannedResponse is the default response string', () => {
    expect(mock.cannedResponse).toBe('Mock response from MockClaudeCliPort.')
  })

  it('delayMs defaults to 0', () => {
    expect(mock.delayMs).toBe(0)
  })

  it('queryError defaults to null', () => {
    expect(mock.queryError).toBeNull()
  })
})
