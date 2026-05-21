/**
 * T-MPS-056 — `CursorBinaryResolver` rejects relative paths.
 *
 * Mirror of REQ-ASM-005 for the Cursor resolver. When `command -v cursor-agent`
 * (or `where.exe cursor-agent`) returns a relative path, the resolver yields
 * `null` so the caller folds to `cursorCliResolved === false` and the selector
 * picks a different cell (REQ-MPS-015 edge case, spec §10 row 6).
 *
 * Satisfies: REQ-MPS-015.
 */
import { describe, it, expect, vi } from 'vitest'
import { EventEmitter } from 'node:events'

import { CursorBinaryResolver } from '@/infrastructure/obsidian/CursorBinaryResolver'

interface FakeChild extends EventEmitter {
  stdout: EventEmitter
  stderr: EventEmitter
  kill: ReturnType<typeof vi.fn>
}

function makeFakeSpawn(): {
  spawn: (cmd: string, args: readonly string[]) => FakeChild
  reply: (stdout: string) => void
} {
  let pending: FakeChild | null = null
  const spawn = (): FakeChild => {
    const child = Object.assign(new EventEmitter(), {
      stdout: new EventEmitter(),
      stderr: new EventEmitter(),
      kill: vi.fn(),
    }) as FakeChild
    pending = child
    return child
  }
  return {
    spawn,
    reply(stdout: string) {
      const child = pending
      if (!child) throw new Error('reply before spawn')
      queueMicrotask(() => {
        child.stdout.emit('data', Buffer.from(stdout, 'utf8'))
        child.emit('close', 0, null)
      })
    },
  }
}

describe('CursorBinaryResolver — relative path rejection (REQ-MPS-015 edge case)', () => {
  it('returns null when discovery yields a relative POSIX path', async () => {
    const fake = makeFakeSpawn()
    const resolver = new CursorBinaryResolver({ platform: 'linux', spawn: fake.spawn })

    const promise = resolver.resolve()
    fake.reply('./cursor-agent\n')

    expect(await promise).toBeNull()
  })

  it('returns null when discovery yields a shell-alias string', async () => {
    const fake = makeFakeSpawn()
    const resolver = new CursorBinaryResolver({ platform: 'darwin', spawn: fake.spawn })

    const promise = resolver.resolve()
    fake.reply('cursor-agent: aliased to /usr/local/bin/cursor-agent\n')

    expect(await promise).toBeNull()
  })

  it('returns null when discovery yields a relative Windows path (win32 branch)', async () => {
    const fake = makeFakeSpawn()
    const resolver = new CursorBinaryResolver({ platform: 'win32', spawn: fake.spawn })

    const promise = resolver.resolve()
    fake.reply('cursor-agent.exe\r\n')

    expect(await promise).toBeNull()
  })
})
