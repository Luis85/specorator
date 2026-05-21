/**
 * T-MPS-061 — Tests for `CursorCliAdapter.queryStream()` NDJSON delta mapping.
 *
 * Cursor's NDJSON wire mirrors Claude's: incremental `text` chunks, a single
 * `session-id` event, and a terminal `result`. The adapter reuses
 * `SubprocessLifecycle` + `NdjsonChannel`. This suite covers the happy path
 * and the delta-mapping shape; abort is covered in
 * `CursorCliAdapter.abort.test.ts`.
 *
 * Satisfies: REQ-MPS-015.
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

function makeSettings(overrides: Partial<PluginSettings> = {}): PluginSettings {
  return { ...DEFAULT_SETTINGS, cursorCliPath: '/fake/bin/cursor-agent', ...overrides }
}

interface SpawnHandle {
  spawn: ReturnType<typeof vi.fn>
  children: FakeChild[]
  last: () => FakeChild
  emit: (chunk: string) => void
  close: (exitCode: number) => void
}

function makeSpawn(): SpawnHandle {
  const children: FakeChild[] = []
  const spawn = vi.fn(() => {
    const c = makeChild()
    children.push(c)
    return c
  })
  return {
    spawn,
    children,
    last: () => children[children.length - 1],
    emit(chunk: string) {
      children[children.length - 1].stdout.emit('data', Buffer.from(chunk, 'utf8'))
    },
    close(exitCode: number) {
      const c = children[children.length - 1]
      queueMicrotask(() => {
        c.exitCode = exitCode
        c.stdout.emit('end')
        c.stderr.emit('end')
        c.emit('close', exitCode, null)
        c.emit('exit', exitCode, null)
      })
    },
  }
}

async function makeAdapter(spawn: SpawnHandle): Promise<CursorCliAdapter> {
  const adapter = new CursorCliAdapter({
    getSettings: makeSettings,
    logger: makeLogger(),
    resolveCliPath: async () => '/fake/bin/cursor-agent',
    spawn: spawn.spawn as never,
  })
  await adapter.startup()
  return adapter
}

async function collect(stream: AsyncIterable<StreamDelta>): Promise<StreamDelta[]> {
  const out: StreamDelta[] = []
  for await (const d of stream) out.push(d)
  return out
}

describe('CursorCliAdapter — NDJSON delta mapping (REQ-MPS-015)', () => {
  it('maps assistant/message → text delta and result → done', async () => {
    const spawn = makeSpawn()
    const adapter = await makeAdapter(spawn)

    const stream = adapter.queryStream('hello')
    const iter = collect(stream)

    queueMicrotask(() => {
      spawn.emit('{"type":"system/init","session_id":"sess-1"}\n')
      spawn.emit('{"type":"assistant/message","text":"Hi"}\n')
      spawn.emit('{"type":"assistant/message","text":" there"}\n')
      spawn.emit('{"type":"result","subtype":"success"}\n')
      spawn.close(0)
    })

    const deltas = await iter
    const types = deltas.map((d) => d.type)
    expect(types).toContain('session-id')
    expect(types).toContain('text')
    expect(types[types.length - 1]).toBe('done')

    const text = deltas
      .filter((d): d is { type: 'text'; text: string } => d.type === 'text')
      .map((d) => d.text)
      .join('')
    expect(text).toBe('Hi there')
  })

  it('fires onSessionId exactly once with the captured session_id', async () => {
    const spawn = makeSpawn()
    const adapter = await makeAdapter(spawn)
    const seen: string[] = []

    const stream = adapter.queryStream('hi', { onSessionId: (sid) => seen.push(sid) })
    const iter = collect(stream)

    queueMicrotask(() => {
      spawn.emit('{"type":"system/init","session_id":"sess-42"}\n')
      spawn.emit('{"type":"system/init","session_id":"sess-other"}\n')
      spawn.emit('{"type":"result"}\n')
      spawn.close(0)
    })
    await iter
    expect(seen).toEqual(['sess-42'])
  })

  it('emits CLI_LAUNCH_FAILED error delta when the binary is not resolved', async () => {
    const spawn = makeSpawn()
    const adapter = new CursorCliAdapter({
      getSettings: () => makeSettings({ cursorCliPath: '' }),
      logger: makeLogger(),
      resolveCliPath: async () => null,
      spawn: spawn.spawn as never,
    })
    await adapter.startup()

    const deltas = await collect(adapter.queryStream('hi'))
    expect(deltas.length).toBe(1)
    expect(deltas[0].type).toBe('error')
    if (deltas[0].type === 'error') {
      expect(deltas[0].error.errorCode).toBe('CLI_LAUNCH_FAILED')
    }
  })

  it('emits QUERY_FAILED on non-zero exit before result', async () => {
    const spawn = makeSpawn()
    const adapter = await makeAdapter(spawn)

    const stream = adapter.queryStream('hi')
    const iter = collect(stream)

    queueMicrotask(() => {
      spawn.close(7)
    })

    const deltas = await iter
    const last = deltas[deltas.length - 1]
    expect(last.type).toBe('error')
    if (last.type === 'error') {
      expect(last.error.errorCode).toBe('QUERY_FAILED')
    }
  })
})
