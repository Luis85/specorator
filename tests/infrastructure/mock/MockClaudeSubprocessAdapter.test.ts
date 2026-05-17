/**
 * T-ASM-012 — TDD pair for the mock subscription adapter.
 *
 * Verifies the field-driven `MockClaudeSubprocessAdapter` (SPEC-ASM-001 §5)
 * mirrors `MockClaudeCliPort` style: every behaviour is configurable through
 * public fields; no I/O; safe-by-default (`available = false`).
 *
 * Satisfies:
 *   - REQ-ASM-001 (transport-agnostic port construction; no I/O)
 *   - REQ-ASM-031 (session_id capture surface)
 *   - NFR-ASM-006 (startup never throws)
 *   - NFR-ASM-007 (shutdown is idempotent / no-op-safe)
 *
 * Reshaped in WP-12 (Arch review #3): the deleted `query()` method on the
 * port is now `collectStream(port.queryStream(...))` from
 * `@/application/chat/collectStream`.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

import { MockClaudeSubprocessAdapter } from '@/infrastructure/mock/MockClaudeSubprocessAdapter'
import { ClaudeCliError } from '@/domain/ports/ClaudeCliPort'
import { asSessionId } from '@/domain/chat/SessionId'
import { collectStream } from '@/application/chat/collectStream'

describe('REQ-ASM-001 / REQ-ASM-031: MockClaudeSubprocessAdapter', () => {
  let mock: MockClaudeSubprocessAdapter

  beforeEach(() => {
    mock = new MockClaudeSubprocessAdapter()
  })

  // ── Availability defaults ───────────────────────────────────────────────

  it('isAvailable() returns false by default (safe-by-default for tests)', async () => {
    expect(await mock.isAvailable()).toBe(false)
  })

  it('isAvailableSync() returns false by default and performs no I/O', () => {
    // Spy on every async I/O candidate the mock might call. The sync accessor
    // must never invoke any of them — it should read a cached field only.
    const isAvailableSpy = vi.spyOn(mock, 'isAvailable')
    const startupSpy = vi.spyOn(mock, 'startup')

    const result = mock.isAvailableSync()

    expect(result).toBe(false)
    expect(isAvailableSpy).not.toHaveBeenCalled()
    expect(startupSpy).not.toHaveBeenCalled()
  })

  it('setting available = true flips both isAvailable() and isAvailableSync()', async () => {
    mock.available = true
    expect(await mock.isAvailable()).toBe(true)
    expect(mock.isAvailableSync()).toBe(true)
  })

  // ── Lifecycle ───────────────────────────────────────────────────────────

  it('startup() is a no-op that does not throw (NFR-ASM-006)', async () => {
    await expect(mock.startup()).resolves.toBeUndefined()
  })

  it('shutdown() is a no-op that does not throw and is idempotent (NFR-ASM-007)', () => {
    expect(() => {
      mock.shutdown()
    }).not.toThrow()
    expect(() => {
      mock.shutdown()
    }).not.toThrow()
    // A third call for good measure — still safe.
    expect(() => {
      mock.shutdown()
    }).not.toThrow()
  })

  // ── queryStream() — observability ──────────────────────────────────────

  it('queryStream() appends to queryLog even when available === false (test observability)', async () => {
    mock.available = false
    await collectStream(mock.queryStream('observed-while-unavailable'))
    expect(mock.queryLog).toContain('observed-while-unavailable')
  })

  it('queryStream() returns ok(cannedResponse) when available and no queryError', async () => {
    mock.available = true
    mock.cannedResponse = 'hello from mock subscription'

    const result = await collectStream(mock.queryStream('any prompt'))

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toBe('hello from mock subscription')
    expect(mock.queryLog).toContain('any prompt')
  })

  it('queryStream() returns err(queryError) when set, regardless of cannedResponse', async () => {
    mock.available = true
    mock.cannedResponse = 'should-not-be-returned'
    const simulated = new ClaudeCliError('QUERY_FAILED', 'simulated subprocess failure')
    mock.queryError = simulated

    const result = await collectStream(mock.queryStream('prompt'))

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toBe(simulated)
    expect(result.error).toBeInstanceOf(ClaudeCliError)
    expect(result.error.errorCode).toBe('QUERY_FAILED')
  })

  // ── delayMs ─────────────────────────────────────────────────────────────

  describe('delayMs', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('causes queryStream() to await the configured delay before resolving', async () => {
      mock.available = true
      mock.delayMs = 250

      let settled = false
      const pending = collectStream(mock.queryStream('delayed')).then((r: unknown) => {
        settled = true
        return r
      })

      // Advance just under the delay — promise must still be pending.
      await vi.advanceTimersByTimeAsync(249)
      expect(settled).toBe(false)

      // Cross the threshold — promise resolves.
      await vi.advanceTimersByTimeAsync(1)
      const result = (await pending) as { ok: boolean }
      expect(settled).toBe(true)
      expect(result.ok).toBe(true)
    })
  })

  // ── sessionId capture (REQ-ASM-031) ─────────────────────────────────────

  it('cannedSessionId defaults to null', () => {
    expect(mock.cannedSessionId).toBeNull()
  })

  it('exposes the configured cannedSessionId after a successful queryStream()', async () => {
    mock.available = true
    const sid = asSessionId('mock-session-abc123')
    mock.cannedSessionId = sid

    const result = await collectStream(
      mock.queryStream('prompt that captures a session'),
    )

    expect(result.ok).toBe(true)
    expect(mock.cannedSessionId).toBe(sid)
  })

  // ── option recording for assertions ─────────────────────────────────────

  it('records resumeSessionId from queryStream() options onto queryLog entry', async () => {
    mock.available = true
    const sid = asSessionId('mock-resume-xyz')

    await collectStream(mock.queryStream('resume-prompt', { resumeSessionId: sid }))

    // queryLog is the canonical surface for prompt-string assertions.
    expect(mock.queryLog).toContain('resume-prompt')

    // The mock additionally records option metadata so tests can assert that
    // the chat-store wired resumeSessionId through. The exact field name is
    // implementation-defined (see SPEC §5 / T-ASM-013); we look for any
    // observable entry containing the SessionId string.
    const serialised = JSON.stringify(mock)
    expect(serialised).toContain('mock-resume-xyz')
  })

  it('records systemPromptSuffix from queryStream() options', async () => {
    mock.available = true

    await collectStream(
      mock.queryStream('stage-aware prompt', {
        systemPromptSuffix: 'STAGE_SUFFIX::idea',
      }),
    )

    expect(mock.queryLog).toContain('stage-aware prompt')

    const serialised = JSON.stringify(mock)
    expect(serialised).toContain('STAGE_SUFFIX::idea')
  })
})
