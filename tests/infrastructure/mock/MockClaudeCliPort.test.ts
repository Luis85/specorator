/**
 * T-CCS-004 — Tests for MockClaudeCliPort all method branches.
 * Satisfies REQ-CCS-022, SPEC-CCS-001 §6, TEST-CCS-022.
 *
 * Reshaped in WP-12 (Arch review #3): the deleted `query()` method is now
 * a `collectStream(port.queryStream(...))` call. Every assertion that used
 * to exercise `query` is migrated below.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { MockClaudeCliPort } from '@/infrastructure/mock/MockClaudeCliPort'
import { ClaudeCliError } from '@/domain/ports/ClaudeCliPort'
import { collectStream } from '@/application/chat/collectStream'

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

  it('queryStream() with available=false yields err(NOT_INSTALLED) when collected', async () => {
    mock.available = false
    const result = await collectStream(mock.queryStream('hello'))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toBeInstanceOf(ClaudeCliError)
    expect(result.error.errorCode).toBe('NOT_INSTALLED')
  })

  it('queryStream() with available=true and no queryError appends to queryLog and returns ok(cannedResponse)', async () => {
    mock.available = true
    const result = await collectStream(mock.queryStream('test prompt'))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toBe(mock.cannedResponse)
    expect(mock.queryLog).toContain('test prompt')
  })

  it('queryStream() appends to queryLog even when not available', async () => {
    mock.available = false
    await collectStream(mock.queryStream('some prompt'))
    expect(mock.queryLog).toContain('some prompt')
  })

  it('queryStream() with queryError set yields err(queryError)', async () => {
    mock.available = true
    const customError = new ClaudeCliError('TIMEOUT', 'simulated timeout')
    mock.queryError = customError
    const result = await collectStream(mock.queryStream('test'))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toBe(customError)
  })

  it('queryStream() respects delayMs and resolves after the delay', async () => {
    mock.available = true
    mock.delayMs = 50
    const start = Date.now()
    await collectStream(mock.queryStream('prompt'))
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
