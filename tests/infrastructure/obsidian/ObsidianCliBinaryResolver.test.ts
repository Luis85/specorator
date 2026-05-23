/**
 * T-OCM-013 — `ObsidianCliBinaryResolver`. Mirrors the Cursor/Claude resolver
 * tests; discovers the official `obsidian` binary. REQ-OCM-008, REQ-OCM-009,
 * NFR-OCM-004.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { EventEmitter } from 'node:events'

import { ObsidianCliBinaryResolver } from '@/infrastructure/obsidian/ObsidianCliBinaryResolver'

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
    reply({ stdout = '', exitCode = 0 }: { stdout?: string; exitCode?: number }) {
      const child = pending
      if (!child) throw new Error('reply() before spawn()')
      queueMicrotask(() => {
        if (stdout) child.stdout.emit('data', Buffer.from(stdout, 'utf8'))
        child.emit('close', exitCode, null)
      })
    },
    fail(err: NodeJS.ErrnoException) {
      const child = pending
      if (!child) throw new Error('fail() before spawn()')
      queueMicrotask(() => {
        child.emit('error', err)
        child.emit('close', null, null)
      })
    },
    lastChild: () => children[children.length - 1],
  }
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('ObsidianCliBinaryResolver', () => {
  it('POSIX: shells out to `sh -lc "command -v obsidian"` and returns the absolute path', async () => {
    const fake = makeFakeSpawn()
    const resolver = new ObsidianCliBinaryResolver({ platform: 'darwin', spawn: fake.spawn })

    const promise = resolver.resolve()
    fake.reply({ stdout: '/usr/local/bin/obsidian\n' })

    expect(await promise).toBe('/usr/local/bin/obsidian')
    expect(fake.calls[0].command).toBe('sh')
    expect(fake.calls[0].args).toEqual(['-lc', 'command -v obsidian'])
  })

  it('win32: shells out to `where.exe obsidian`', async () => {
    const fake = makeFakeSpawn()
    const resolver = new ObsidianCliBinaryResolver({ platform: 'win32', spawn: fake.spawn })

    const promise = resolver.resolve()
    fake.reply({ stdout: 'C:\\Program Files\\Obsidian\\obsidian.exe\r\n' })

    expect(await promise).toBe('C:\\Program Files\\Obsidian\\obsidian.exe')
    expect(fake.calls[0].command).toBe('where.exe')
    expect(fake.calls[0].args).toEqual(['obsidian'])
  })

  it('returns null when output is a relative path / alias notice', async () => {
    const fake = makeFakeSpawn()
    const resolver = new ObsidianCliBinaryResolver({ platform: 'linux', spawn: fake.spawn })

    const promise = resolver.resolve()
    fake.reply({ stdout: 'obsidian: aliased to /opt/obsidian\n' })

    expect(await promise).toBeNull()
  })

  it('returns null on empty stdout', async () => {
    const fake = makeFakeSpawn()
    const resolver = new ObsidianCliBinaryResolver({ platform: 'linux', spawn: fake.spawn })

    const promise = resolver.resolve()
    fake.reply({ stdout: '', exitCode: 1 })

    expect(await promise).toBeNull()
  })

  it('returns null and kills the child on timeout', async () => {
    vi.useFakeTimers()
    const fake = makeFakeSpawn()
    const resolver = new ObsidianCliBinaryResolver({ platform: 'linux', spawn: fake.spawn })

    const promise = resolver.resolve()
    await vi.advanceTimersByTimeAsync(5_500)

    expect(await promise).toBeNull()
    expect(fake.lastChild().kill).toHaveBeenCalled()
  })

  it('returns null on spawn ENOENT', async () => {
    const fake = makeFakeSpawn()
    const resolver = new ObsidianCliBinaryResolver({ platform: 'linux', spawn: fake.spawn })

    const promise = resolver.resolve()
    fake.fail(Object.assign(new Error('spawn sh ENOENT'), { code: 'ENOENT' }))

    expect(await promise).toBeNull()
  })

  it('returns null when spawn throws synchronously', async () => {
    const resolver = new ObsidianCliBinaryResolver({
      platform: 'linux',
      spawn: () => {
        throw new Error('boom')
      },
    })
    expect(await resolver.resolve()).toBeNull()
  })
})
