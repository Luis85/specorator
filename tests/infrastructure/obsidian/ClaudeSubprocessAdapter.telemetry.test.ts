/**
 * T-ASM-081 — Telemetry-shape unit test for `ClaudeSubprocessAdapter`.
 *
 * Satisfies NFR-ASM-005 (no PII in logs) + NFR-ASM-012 (telemetry shape).
 * Asserts that every `LoggerPort.debug` payload emitted from the
 * `subscription.*.complete` events conforms exactly to:
 *
 *   { transport: 'subscription', sessionId: '<redacted>' | null,
 *     durationMs: number, exitCode: number | null }
 *
 * — no prompt body, no binary path, no `$HOME`, no raw session UUID.
 *
 * Two paths are covered: `query` (streaming NDJSON) and `runStructured`
 * (one-shot JSON-mode subprocess). Both must emit ONE completion-telemetry
 * event per turn with the canonical shape.
 */
import { describe, it, expect, vi } from 'vitest'
import { EventEmitter } from 'node:events'

import type { LoggerPort } from '@/domain/ports/LoggerPort'
import type { PluginSettings } from '@/domain/settings/PluginSettings'
import { DEFAULT_SETTINGS } from '@/domain/settings/PluginSettings'
import { ClaudeSubprocessAdapter } from '@/infrastructure/obsidian/ClaudeSubprocessAdapter'

interface FakeChild extends EventEmitter {
  stdout: EventEmitter
  stderr: EventEmitter
  stdin: { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> }
  kill: ReturnType<typeof vi.fn>
  killed: boolean
  exitCode: number | null
}

function makeChild(): FakeChild {
  return Object.assign(new EventEmitter(), {
    stdout: new EventEmitter(),
    stderr: new EventEmitter(),
    stdin: { write: vi.fn(), end: vi.fn() },
    kill: vi.fn(function (this: FakeChild) {
      this.killed = true
    }),
    killed: false,
    exitCode: null,
  }) as FakeChild
}

interface LogEntry {
  level: 'debug' | 'info' | 'warn' | 'error'
  message: string
  context?: Record<string, unknown>
}

function makeLogger(): LoggerPort & { entries: LogEntry[] } {
  const entries: LogEntry[] = []
  return {
    entries,
    debug(message, context) {
      entries.push({ level: 'debug', message, context })
    },
    info(message, context) {
      entries.push({ level: 'info', message, context })
    },
    warn(message, context) {
      entries.push({ level: 'warn', message, context })
    },
    error(message, _error, context) {
      entries.push({ level: 'error', message, context })
    },
  }
}

function makeSettings(): PluginSettings {
  return { ...DEFAULT_SETTINGS, transportKind: 'subscription' }
}

function makeAdapter(spawnFn: ReturnType<typeof vi.fn>) {
  const logger = makeLogger()
  const adapter = new ClaudeSubprocessAdapter({
    getSettings: () => makeSettings(),
    logger,
    resolveCliPath: vi.fn(async () => '/fake/bin/claude'),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    spawn: spawnFn as any,
    now: () => Date.now(),
  })
  return { adapter, logger }
}

const FORBIDDEN_TELEMETRY_KEYS = ['prompt', 'binaryPath', 'binary_path', 'HOME']
const PAYLOAD_KEY_ALLOW_LIST = new Set([
  'transport',
  'sessionId',
  'durationMs',
  'exitCode',
])

function assertCanonicalShape(entry: LogEntry): void {
  expect(entry.level).toBe('debug')
  expect(entry.message).toMatch(/^subscription\.(query|structured)\.complete$/)
  expect(entry.context).toBeDefined()
  const ctx = entry.context!

  // Exact-shape: only the four sanctioned keys.
  for (const key of Object.keys(ctx)) {
    expect(PAYLOAD_KEY_ALLOW_LIST.has(key), `unexpected telemetry key: ${key}`).toBe(true)
  }
  // Defence-in-depth: NFR-ASM-005 / NFR-ASM-012 forbidden surfaces.
  for (const forbidden of FORBIDDEN_TELEMETRY_KEYS) {
    expect(ctx, `forbidden key "${forbidden}" leaked into telemetry`).not.toHaveProperty(forbidden)
  }

  expect(ctx.transport).toBe('subscription')
  // sessionId is either null (no session captured) or the literal redaction
  // marker — NEVER the raw UUID.
  expect(ctx.sessionId === null || ctx.sessionId === '<redacted>').toBe(true)
  expect(typeof ctx.durationMs).toBe('number')
  expect(ctx.exitCode === null || typeof ctx.exitCode === 'number').toBe(true)
}

describe('T-ASM-081 — ClaudeSubprocessAdapter telemetry shape', () => {
  it('runStructured emits exactly one subscription.structured.complete event with the canonical shape', async () => {
    const child = makeChild()
    const spawnFn = vi.fn(() => child)
    const { adapter, logger } = makeAdapter(spawnFn)
    await adapter.startup()

    const sessionId = '11111111-2222-3333-4444-555555555555'
    const structuredBody = JSON.stringify({
      result: 'ok',
      structured_output: { action: 'createFile', path: 'specs/demo/idea.md', content: '#\n' },
      session_id: sessionId,
    })

    const promptBody = 'unique-prompt-marker-zzqx-7f3a1b'
    const pending = adapter.runStructured(promptBody, {})
    // Drive the close on the next microtask so the subprocess wiring settles.
    queueMicrotask(() => {
      child.stdout.emit('data', Buffer.from(structuredBody, 'utf8'))
      child.exitCode = 0
      child.emit('close', 0, null)
    })
    const result = await pending
    expect(result.ok).toBe(true)

    const completions = logger.entries.filter(
      (e) => e.level === 'debug' && e.message === 'subscription.structured.complete',
    )
    expect(completions).toHaveLength(1)
    assertCanonicalShape(completions[0])

    const ctx = completions[0].context!
    expect(ctx.sessionId).toBe('<redacted>')
    expect(ctx.exitCode).toBe(0)
    expect(ctx.durationMs).toBeGreaterThanOrEqual(0)
    // Defence-in-depth: prompt body never appears (NFR-ASM-005).
    const serialised = JSON.stringify(ctx)
    expect(serialised).not.toContain(promptBody)
    // The raw UUID must never appear in the payload.
    expect(serialised).not.toContain(sessionId)
  })

  it('runStructured with no session_id in the response emits sessionId: null', async () => {
    const child = makeChild()
    const spawnFn = vi.fn(() => child)
    const { adapter, logger } = makeAdapter(spawnFn)
    await adapter.startup()

    const structuredBody = JSON.stringify({
      result: 'ok',
      structured_output: { action: 'createFile', path: 'root-file.md', content: '#\n' },
    })

    const pending = adapter.runStructured('p', {})
    queueMicrotask(() => {
      child.stdout.emit('data', Buffer.from(structuredBody, 'utf8'))
      child.exitCode = 0
      child.emit('close', 0, null)
    })
    await pending

    const completion = logger.entries.find(
      (e) => e.level === 'debug' && e.message === 'subscription.structured.complete',
    )
    expect(completion).toBeDefined()
    assertCanonicalShape(completion!)
    expect(completion!.context!.sessionId).toBeNull()
  })

  it('query emits exactly one subscription.query.complete event with the canonical shape', async () => {
    const child = makeChild()
    const spawnFn = vi.fn(() => child)
    const { adapter, logger } = makeAdapter(spawnFn)
    await adapter.startup()

    const sessionId = '99999999-aaaa-bbbb-cccc-dddddddddddd'
    const pending = adapter.query('hello', {})
    queueMicrotask(() => {
      // system/init carries the session id; result then closes the turn.
      const lines = [
        JSON.stringify({ type: 'system/init', session_id: sessionId }),
        JSON.stringify({ type: 'assistant/message', text: 'hi' }),
        JSON.stringify({ type: 'result', result: 'hi' }),
      ].join('\n') + '\n'
      child.stdout.emit('data', Buffer.from(lines, 'utf8'))
      child.exitCode = 0
      child.emit('close', 0, null)
    })
    const result = await pending
    expect(result.ok).toBe(true)

    const completions = logger.entries.filter(
      (e) => e.level === 'debug' && e.message === 'subscription.query.complete',
    )
    expect(completions).toHaveLength(1)
    assertCanonicalShape(completions[0])

    const ctx = completions[0].context!
    expect(ctx.sessionId).toBe('<redacted>')
    expect(ctx.exitCode).toBe(0)
    // The raw UUID must never appear in the payload.
    expect(JSON.stringify(ctx)).not.toContain(sessionId)
  })
})
