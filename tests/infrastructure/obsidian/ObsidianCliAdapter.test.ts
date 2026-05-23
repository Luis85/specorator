/**
 * T-OCM-013 — `ObsidianCliAdapter`. Verifies shell-free spawn, error mapping,
 * timeout, and JSON parsing. REQ-OCM-001..007. (Under src/infrastructure/obsidian/**,
 * so not coverage-gated, but behaviour is asserted here.)
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { EventEmitter } from 'node:events'

import { ObsidianCliAdapter } from '@/infrastructure/obsidian/ObsidianCliAdapter'

interface FakeChildProcess extends EventEmitter {
  stdout: EventEmitter
  stderr: EventEmitter
  kill: ReturnType<typeof vi.fn>
}

interface SpawnCall {
  command: string
  args: readonly string[]
}

function makeFakeSpawn() {
  const calls: SpawnCall[] = []
  const children: FakeChildProcess[] = []
  let pending: FakeChildProcess | null = null

  const spawn = (command: string, args: readonly string[]): FakeChildProcess => {
    calls.push({ command, args })
    const child = Object.assign(new EventEmitter(), {
      stdout: new EventEmitter(),
      stderr: new EventEmitter(),
      kill: vi.fn(),
    }) as FakeChildProcess
    children.push(child)
    pending = child
    return child
  }

  return {
    spawn,
    calls,
    reply({ stdout = '', stderr = '', exitCode = 0 }: { stdout?: string; stderr?: string; exitCode?: number }) {
      const child = pending
      if (!child) throw new Error('reply() before spawn()')
      queueMicrotask(() => {
        if (stdout) child.stdout.emit('data', Buffer.from(stdout, 'utf8'))
        if (stderr) child.stderr.emit('data', Buffer.from(stderr, 'utf8'))
        child.emit('close', exitCode, null)
      })
    },
    fail(err: Error) {
      const child = pending
      if (!child) throw new Error('fail() before spawn()')
      queueMicrotask(() => child.emit('error', err))
    },
    terminate(signal: NodeJS.Signals = 'SIGTERM') {
      const child = pending
      if (!child) throw new Error('terminate() before spawn()')
      queueMicrotask(() => child.emit('close', null, signal))
    },
    lastChild: () => children[children.length - 1],
  }
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('ObsidianCliAdapter', () => {
  it('available reflects whether a path is configured', () => {
    expect(new ObsidianCliAdapter({ spawn: makeFakeSpawn().spawn, resolvePath: () => '' }).available).toBe(false)
    expect(
      new ObsidianCliAdapter({ spawn: makeFakeSpawn().spawn, resolvePath: () => '/bin/obsidian' }).available,
    ).toBe(true)
  })

  it('returns not-configured without spawning when no path is set', async () => {
    const fake = makeFakeSpawn()
    const adapter = new ObsidianCliAdapter({ spawn: fake.spawn, resolvePath: () => '' })

    const res = await adapter.run('search', ['query=foo'])

    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error.code).toBe('not-configured')
    expect(fake.calls).toHaveLength(0)
  })

  it('spawns the binary shell-free with [command, ...args] and returns stdout on success', async () => {
    const fake = makeFakeSpawn()
    const adapter = new ObsidianCliAdapter({ spawn: fake.spawn, resolvePath: () => '/bin/obsidian' })

    const promise = adapter.run('search', ['query=foo'])
    fake.reply({ stdout: 'hello', exitCode: 0 })
    const res = await promise

    expect(res.ok).toBe(true)
    if (res.ok) expect(res.value.stdout).toBe('hello')
    expect(fake.calls[0]).toEqual({ command: '/bin/obsidian', args: ['search', 'query=foo'] })
  })

  it('maps a non-zero exit to nonzero-exit with exitCode + stderr', async () => {
    const fake = makeFakeSpawn()
    const adapter = new ObsidianCliAdapter({ spawn: fake.spawn, resolvePath: () => '/bin/obsidian' })

    const promise = adapter.run('read', ['path=missing.md'])
    fake.reply({ stderr: 'not found', exitCode: 2 })
    const res = await promise

    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.error.code).toBe('nonzero-exit')
      expect(res.error.exitCode).toBe(2)
      expect(res.error.stderr).toBe('not found')
    }
  })

  it('treats a signal-terminated run (exitCode null) as a failure, not success', async () => {
    const fake = makeFakeSpawn()
    const adapter = new ObsidianCliAdapter({ spawn: fake.spawn, resolvePath: () => '/bin/obsidian' })

    const promise = adapter.run('append', ['path=n.md', 'content=x'])
    fake.terminate('SIGKILL')
    const res = await promise

    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error.code).toBe('signal-terminated')
  })

  it('maps a child error event to spawn-failed', async () => {
    const fake = makeFakeSpawn()
    const adapter = new ObsidianCliAdapter({ spawn: fake.spawn, resolvePath: () => '/bin/obsidian' })

    const promise = adapter.run('daily')
    fake.fail(new Error('EPIPE'))
    const res = await promise

    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error.code).toBe('spawn-failed')
  })

  it('maps a synchronous spawn throw to spawn-failed', async () => {
    const adapter = new ObsidianCliAdapter({
      spawn: () => {
        throw new Error('boom')
      },
      resolvePath: () => '/bin/obsidian',
    })
    const res = await adapter.run('daily')
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error.code).toBe('spawn-failed')
  })

  it('kills the child and returns timeout when the call exceeds the timeout', async () => {
    vi.useFakeTimers()
    const fake = makeFakeSpawn()
    const adapter = new ObsidianCliAdapter({
      spawn: fake.spawn,
      resolvePath: () => '/bin/obsidian',
      timeoutMs: 1_000,
    })

    const promise = adapter.run('search', ['query=x'])
    await vi.advanceTimersByTimeAsync(1_500)
    const res = await promise

    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error.code).toBe('timeout')
    expect(fake.lastChild().kill).toHaveBeenCalled()
  })

  it('runJson appends format=json and parses JSON stdout', async () => {
    const fake = makeFakeSpawn()
    const adapter = new ObsidianCliAdapter({ spawn: fake.spawn, resolvePath: () => '/bin/obsidian' })

    const promise = adapter.runJson('properties', ['path=note.md'])
    fake.reply({ stdout: '{"title":"Note"}', exitCode: 0 })
    const res = await promise

    expect(res.ok).toBe(true)
    if (res.ok) expect(res.value).toEqual({ title: 'Note' })
    expect(fake.calls[0].args).toEqual(['properties', 'path=note.md', 'format=json'])
  })

  it('runJson returns invalid-json on non-JSON stdout', async () => {
    const fake = makeFakeSpawn()
    const adapter = new ObsidianCliAdapter({ spawn: fake.spawn, resolvePath: () => '/bin/obsidian' })

    const promise = adapter.runJson('search', ['query=x'])
    fake.reply({ stdout: 'not json', exitCode: 0 })
    const res = await promise

    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error.code).toBe('invalid-json')
  })

  it('runJson propagates an underlying run error', async () => {
    const adapter = new ObsidianCliAdapter({ spawn: makeFakeSpawn().spawn, resolvePath: () => '' })
    const res = await adapter.runJson('search', ['query=x'])
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error.code).toBe('not-configured')
  })
})
