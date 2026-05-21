/**
 * T-MPS-055 — `CursorBinaryResolver` Windows branch (`where.exe cursor-agent`).
 *
 * Satisfies: REQ-MPS-015.
 * Spec reference: SPEC-MPS-001 §6 / DESIGN §C9.
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
}

function makeFakeSpawn(): {
  spawn: (command: string, args: readonly string[]) => FakeChildProcess
  calls: SpawnCall[]
  reply: (opts: { stdout?: string; exitCode?: number }) => void
} {
  const calls: SpawnCall[] = []
  let pending: FakeChildProcess | null = null
  const spawn = (command: string, args: readonly string[]): FakeChildProcess => {
    calls.push({ command, args })
    const child = Object.assign(new EventEmitter(), {
      stdout: new EventEmitter(),
      stderr: new EventEmitter(),
      kill: vi.fn(),
    }) as FakeChildProcess
    pending = child
    return child
  }
  return {
    spawn,
    calls,
    reply({ stdout = '', exitCode = 0 }) {
      const child = pending
      if (!child) throw new Error('reply() called before spawn()')
      queueMicrotask(() => {
        if (stdout) child.stdout.emit('data', Buffer.from(stdout, 'utf8'))
        child.emit('close', exitCode, null)
      })
    },
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('CursorBinaryResolver — win32 branch (REQ-MPS-015)', () => {
  it('win32: shells out to `where.exe cursor-agent`', async () => {
    const fake = makeFakeSpawn()
    const resolver = new CursorBinaryResolver({ platform: 'win32', spawn: fake.spawn })

    const promise = resolver.resolve()
    fake.reply({ stdout: 'C:\\Users\\u\\AppData\\Local\\cursor-agent.exe\r\n', exitCode: 0 })

    expect(await promise).toBe('C:\\Users\\u\\AppData\\Local\\cursor-agent.exe')
    expect(fake.calls[0].command).toBe('where.exe')
    expect(fake.calls[0].args).toEqual(['cursor-agent'])
  })

  it('win32: takes the first path when `where.exe` lists multiple', async () => {
    const fake = makeFakeSpawn()
    const resolver = new CursorBinaryResolver({ platform: 'win32', spawn: fake.spawn })

    const promise = resolver.resolve()
    fake.reply({
      stdout: 'C:\\Program Files\\Cursor\\cursor-agent.exe\r\nD:\\tools\\cursor-agent.exe\r\n',
      exitCode: 0,
    })

    expect(await promise).toBe('C:\\Program Files\\Cursor\\cursor-agent.exe')
  })
})
