/**
 * T-MPS-062 — `CursorCliAdapter.queryStream()` honours `options.signal`:
 * SIGTERM the subprocess and yield a QUERY_FAILED error delta.
 *
 * The SIGKILL ladder lives inside `SubprocessLifecycle` and is exercised
 * by its own unit suite (`SubprocessLifecycle.test.ts`). Here we assert
 * the adapter wiring: aborting an in-flight `queryStream()` results in
 * a single `kill('SIGTERM')` call and a terminal error delta.
 *
 * Satisfies: NFR-MPS-007.
 */
import { describe, it, expect, vi } from 'vitest'
import { EventEmitter } from 'node:events'

import type { StreamDelta } from '@/domain/ports/ChatTransportPort'
import type { LoggerPort } from '@/domain/ports/LoggerPort'
import { DEFAULT_SETTINGS, type PluginSettings } from '@/domain/settings/PluginSettings'
import { CursorCliAdapter } from '@/infrastructure/obsidian/CursorCliAdapter'

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

function makeLogger(): LoggerPort {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}

function makeSettings(): PluginSettings {
  return { ...DEFAULT_SETTINGS, cursorCliPath: '/fake/bin/cursor-agent' }
}

describe('CursorCliAdapter — abort signal (NFR-MPS-007)', () => {
  it('SIGTERMs the in-flight subprocess and yields QUERY_FAILED on abort', async () => {
    const children: FakeChild[] = []
    const spawn = vi.fn(() => {
      const c = makeChild()
      children.push(c)
      return c
    })
    const adapter = new CursorCliAdapter({
      getSettings: makeSettings,
      logger: makeLogger(),
      resolveCliPath: async () => '/fake/bin/cursor-agent',
      spawn: spawn as never,
    })
    await adapter.startup()

    const controller = new AbortController()
    const stream = adapter.queryStream('hi', { signal: controller.signal })

    const deltas: StreamDelta[] = []
    const iter = (async () => {
      for await (const d of stream) deltas.push(d)
    })()

    // Let spawn happen and then abort.
    await new Promise((r) => setTimeout(r, 5))
    controller.abort()
    // Drain the iterable.
    await iter

    expect(children.length).toBe(1)
    expect(children[0].kill).toHaveBeenCalled()
    const term = (children[0].kill as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(term).toBe('SIGTERM')

    const last = deltas[deltas.length - 1]
    expect(last?.type).toBe('error')
    if (last && last.type === 'error') {
      expect(last.error.errorCode).toBe('QUERY_FAILED')
    }
  })

  it('aborts before send when the caller-supplied signal is already aborted', async () => {
    const spawn = vi.fn(() => makeChild())
    const adapter = new CursorCliAdapter({
      getSettings: makeSettings,
      logger: makeLogger(),
      resolveCliPath: async () => '/fake/bin/cursor-agent',
      spawn: spawn as never,
    })
    await adapter.startup()

    const controller = new AbortController()
    controller.abort()
    const stream = adapter.queryStream('hi', { signal: controller.signal })

    const deltas: StreamDelta[] = []
    for await (const d of stream) deltas.push(d)

    expect(spawn).not.toHaveBeenCalled()
    expect(deltas.length).toBe(1)
    expect(deltas[0].type).toBe('error')
  })
})
