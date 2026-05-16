/**
 * T-CCS-002 — Tests for ClaudeCliPort interface shape and ClaudeCliError class.
 * Satisfies REQ-CCS-021, SPEC-CCS-001 §2.1–§2.3, TEST-CCS-021.
 */
import { describe, it, expect } from 'vitest'
import { ClaudeCliError, streamFromQuery } from '@/domain/ports/ClaudeCliPort'
import type { ClaudeCliQueryOptions, StreamDelta } from '@/domain/ports/ClaudeCliPort'
import { ok, err, type Result } from '@/domain/shared/Result'

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

  describe('streamFromQuery helper (PR-ASV-2-port)', () => {
    async function collect(stream: AsyncIterable<StreamDelta>): Promise<StreamDelta[]> {
      const out: StreamDelta[] = []
      for await (const d of stream) out.push(d)
      return out
    }

    it('emits text + done on a successful query', async () => {
      const query = async (
        _p: string,
        _o?: ClaudeCliQueryOptions,
      ): Promise<Result<string, ClaudeCliError>> => ok('hello world')
      const out = await collect(streamFromQuery(query, 'prompt'))
      expect(out).toEqual([
        { type: 'text', text: 'hello world' },
        { type: 'done' },
      ])
    })

    it('emits a single error delta on query failure', async () => {
      const failure = new ClaudeCliError('QUERY_FAILED', 'boom')
      const query = async (): Promise<Result<string, ClaudeCliError>> => err(failure)
      const out = await collect(streamFromQuery(query, 'prompt'))
      expect(out).toEqual([{ type: 'error', error: failure }])
    })

    it('short-circuits when signal is already aborted before send (Codex P2)', async () => {
      const controller = new AbortController()
      controller.abort()
      const query = async (): Promise<Result<string, ClaudeCliError>> => ok('should not run')
      const out = await collect(streamFromQuery(query, 'p', { signal: controller.signal }))
      expect(out).toHaveLength(1)
      expect(out[0]?.type).toBe('error')
    })

    it('honours mid-flight abort and returns an error delta (Codex P2 mid-flight gap)', async () => {
      const controller = new AbortController()
      // Query never resolves on its own — only the abort signal can end the stream.
      const query = (): Promise<Result<string, ClaudeCliError>> =>
        new Promise<Result<string, ClaudeCliError>>(() => {
          /* never */
        })
      const streamPromise = collect(streamFromQuery(query, 'p', { signal: controller.signal }))
      // Schedule the abort after the stream has started awaiting. Tests run
      // in Vitest's jsdom env where the Obsidian-flavoured `activeWindow`
      // timer rule has no meaning; the rule is silenced inline per Codex
      // P2 mid-flight gap regression coverage.
      // eslint-disable-next-line obsidianmd/prefer-active-window-timers
      setTimeout(() => {
        controller.abort()
      }, 5)
      const out = await streamPromise
      expect(out).toHaveLength(1)
      expect(out[0]?.type).toBe('error')
      if (out[0]?.type === 'error') {
        expect(out[0].error).toBeInstanceOf(ClaudeCliError)
      }
    })

    it('does not yield text/done after a mid-flight abort wins the race', async () => {
      const controller = new AbortController()
      let resolveQuery!: (v: Result<string, ClaudeCliError>) => void
      const query = (): Promise<Result<string, ClaudeCliError>> =>
        new Promise<Result<string, ClaudeCliError>>((resolve) => {
          resolveQuery = resolve
        })
      const streamPromise = collect(streamFromQuery(query, 'p', { signal: controller.signal }))
      // eslint-disable-next-line obsidianmd/prefer-active-window-timers
      setTimeout(() => {
        controller.abort()
      }, 5)
      // After the abort wins, resolving the query late must NOT inject more deltas.
      // eslint-disable-next-line obsidianmd/prefer-active-window-timers
      setTimeout(() => {
        resolveQuery(ok('too late'))
      }, 20)
      const out = await streamPromise
      expect(out.find((d) => d.type === 'done')).toBeUndefined()
      expect(out.find((d) => d.type === 'text')).toBeUndefined()
    })
  })
})
