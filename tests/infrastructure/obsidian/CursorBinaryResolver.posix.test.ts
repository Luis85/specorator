/**
 * T-MPS-054 — `CursorBinaryResolver` darwin/linux branch.
 *
 * Sibling of `ClaudeBinaryResolver` (T-ASM-008). Mirrors the resolver shape
 * but discovers `cursor-agent` instead of `claude`.
 *
 * Satisfies: REQ-MPS-015 (binary discovery), NFR-MPS-007 (5 s timeout),
 *            REQ-MPS-016 (no `~/.cursor/` reads).
 *
 * Spec reference: SPEC-MPS-001 §6 / DESIGN §C9.
 *
 * The module under test does not exist yet; this file MUST fail with
 * "Cannot find module" until T-MPS-058 lands. TDD pair.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { EventEmitter } from 'node:events'

import { CursorBinaryResolver } from '@/infrastructure/obsidian/CursorBinaryResolver'

interface FakeChildProcess extends EventEmitter {
  stdout: EventEmitter
  stderr: EventEmitter
  kill: ReturnType<typeof vi.fn>
}

interface SpawnCall {
  command: string
  args: readonly string[]
  options?: Record<string, unknown>
}

interface FakeSpawnHandle {
  spawn: (
    command: string,
    args: readonly string[],
    options?: Record<string, unknown>,
  ) => FakeChildProcess
  calls: SpawnCall[]
  reply: (opts: { stdout?: string; stderr?: string; exitCode?: number }) => void
  fail: (err: NodeJS.ErrnoException) => void
  lastChild: () => FakeChildProcess | undefined
}

function makeFakeSpawn(): FakeSpawnHandle {
  const calls: SpawnCall[] = []
  const children: FakeChildProcess[] = []
  let pending: FakeChildProcess | null = null

  const spawn = (
    command: string,
    args: readonly string[],
    options?: Record<string, unknown>,
  ): FakeChildProcess => {
    calls.push({ command, args, options })
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
    reply({ stdout = '', stderr = '', exitCode = 0 }) {
      const child = pending
      if (!child) throw new Error('reply() called before spawn()')
      queueMicrotask(() => {
        if (stdout) child.stdout.emit('data', Buffer.from(stdout, 'utf8'))
        if (stderr) child.stderr.emit('data', Buffer.from(stderr, 'utf8'))
        child.stdout.emit('end')
        child.stderr.emit('end')
        child.emit('close', exitCode, null)
        child.emit('exit', exitCode, null)
      })
    },
    fail(err) {
      const child = pending
      if (!child) throw new Error('fail() called before spawn()')
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

describe('CursorBinaryResolver — POSIX discovery (REQ-MPS-015)', () => {
  it('darwin: shells out to `sh -lc "command -v cursor-agent"`', async () => {
    const fake = makeFakeSpawn()
    const resolver = new CursorBinaryResolver({ platform: 'darwin', spawn: fake.spawn })

    const promise = resolver.resolve()
    fake.reply({ stdout: '/usr/local/bin/cursor-agent\n', exitCode: 0 })

    const result = await promise

    expect(result).toBe('/usr/local/bin/cursor-agent')
    expect(fake.calls).toHaveLength(1)
    expect(fake.calls[0].command).toBe('sh')
    expect(fake.calls[0].args).toEqual(['-lc', 'command -v cursor-agent'])
  })

  it('linux: shells out to `sh -lc "command -v cursor-agent"`', async () => {
    const fake = makeFakeSpawn()
    const resolver = new CursorBinaryResolver({ platform: 'linux', spawn: fake.spawn })

    const promise = resolver.resolve()
    fake.reply({ stdout: '/usr/bin/cursor-agent\n', exitCode: 0 })

    expect(await promise).toBe('/usr/bin/cursor-agent')
    expect(fake.calls[0].command).toBe('sh')
    expect(fake.calls[0].args).toEqual(['-lc', 'command -v cursor-agent'])
  })

  it('returns null when discovery exits non-zero with no stdout', async () => {
    const fake = makeFakeSpawn()
    const resolver = new CursorBinaryResolver({ platform: 'linux', spawn: fake.spawn })

    const promise = resolver.resolve()
    fake.reply({ stdout: '', stderr: 'cursor-agent: not found\n', exitCode: 1 })

    expect(await promise).toBeNull()
  })

  it('returns null and kills the child when discovery exceeds the 5 s timeout (NFR-MPS-007)', async () => {
    vi.useFakeTimers()
    const fake = makeFakeSpawn()
    const resolver = new CursorBinaryResolver({ platform: 'linux', spawn: fake.spawn })

    const promise = resolver.resolve()
    await vi.advanceTimersByTimeAsync(5_500)

    expect(await promise).toBeNull()
    expect(fake.lastChild()!.kill).toHaveBeenCalled()
  })

  it('returns null on spawn ENOENT', async () => {
    const fake = makeFakeSpawn()
    const resolver = new CursorBinaryResolver({ platform: 'linux', spawn: fake.spawn })

    const promise = resolver.resolve()
    const enoent: NodeJS.ErrnoException = Object.assign(new Error('spawn sh ENOENT'), {
      code: 'ENOENT',
    })
    fake.fail(enoent)

    expect(await promise).toBeNull()
  })
})
