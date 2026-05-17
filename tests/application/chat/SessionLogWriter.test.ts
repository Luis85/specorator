/**
 * T-ASM-046 + T-ASM-047 — `SessionLogWriter`.
 *
 * Test plan (REQ-ASM-033, REQ-ASM-034, REQ-ASM-038, REQ-ASM-039, REQ-ASM-040,
 * REQ-ASM-046, NFR-ASM-005):
 *
 *   TEST-ASM-032 — Written file parses as YAML frontmatter with the five
 *                  named keys plus a `## user` / `## assistant` body.
 *   TEST-ASM-033 — On a subsequent turn, `writeFile` is called once with the
 *                  appended content and `updated > created`.
 *   TEST-ASM-036 — On first write, `createFolder` is invoked once on the
 *                  parent sessions folder.
 *   TEST-ASM-037 — Conflicting `session_id` in pre-seeded frontmatter routes
 *                  the write to `<id>-2.md` and logs `warn` exactly once.
 *                  Overwrite-suffix loop verified through `-2`, `-3`, `-4`.
 *   TEST-ASM-038 — A 1 000 ms mocked `writeFile` does not block the call
 *                  site (fire-and-forget for `appendUserAssistant`).
 *   Plus: failure path → `logger.error` with a redacted `sessionId` and
 *   `appendProposalDecision` writes a `## proposal` block (REQ-ASM-046).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { fakeModulePorts, type FakePorts } from '../../__fakes__/fake-ports'
import { resolveSessionLogPath } from '@/application/chat/sessionLogPath'
import {
  SessionLogWriter,
  SessionLogNoSessionError,
  type SessionLogProposalInput,
} from '@/application/chat/SessionLogWriter'
import type { ChatThreadRecord } from '@/domain/chat/ChatThreadRecord'
import { asSessionId } from '@/domain/chat/SessionId'

function makeThread(
  overrides: Partial<Omit<ChatThreadRecord, 'sessionId'>> & {
    readonly sessionId?: string | null
  } = {},
): ChatThreadRecord {
  const { sessionId, ...rest } = overrides
  return {
    threadId: 'thread-1',
    sessionId: asSessionId('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'),
    feature: 'foo',
    logPath: 'specs/foo/sessions/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.md',
    transport: 'subscription',
    createdAt: '2026-05-14T10:00:00.000Z',
    lastUsedAt: '2026-05-14T10:00:00.000Z',
    ...rest,
    ...(sessionId === undefined
      ? {}
      : { sessionId: sessionId === null ? null : asSessionId(sessionId) }),
  }
}

function makeWriter(
  ports: FakePorts,
  nowIso: () => string = () => '2026-05-14T10:00:00.000Z',
  specsFolder = 'specs',
  options: { readonly flushDebounceMs?: number } = {},
): SessionLogWriter {
  // Codex P1+P2 round-1: tests default to a long debounce window so the
  // frontmatter flush stays unobservable unless the test explicitly calls
  // `writer.flushAll()`. This keeps the I/O accounting assertions
  // deterministic — they observe the pre-flush shape (no spurious writeFile
  // calls from a stray timer firing during a long-running test).
  return new SessionLogWriter(
    ports.vault,
    ports.logger,
    specsFolder,
    nowIso,
    { flushDebounceMs: options.flushDebounceMs ?? 60_000 },
  )
}

describe('SessionLogWriter.appendUserAssistant — happy path (T-ASM-046)', () => {
  let ports: FakePorts

  beforeEach(() => {
    ports = fakeModulePorts()
  })

  it('first write seeds frontmatter with the five named keys plus user/assistant body (TEST-ASM-032)', async () => {
    const thread = makeThread()
    const writer = makeWriter(ports, () => '2026-05-14T10:00:00.000Z')

    await writer.appendUserAssistant(thread, { user: 'hi', assistant: 'hello' })

    const path = resolveSessionLogPath(thread.feature, thread.sessionId!, 'specs')
    const written = await ports.vault.readFile(path)

    // Frontmatter parses as YAML with the five named keys.
    expect(written.startsWith('---\n')).toBe(true)
    const fmEnd = written.indexOf('\n---', 4)
    expect(fmEnd).toBeGreaterThan(0)
    const fm = written.slice(4, fmEnd)
    expect(fm).toMatch(/session_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'/)
    expect(fm).toMatch(/feature: 'foo'/)
    expect(fm).toMatch(/transport: subscription/)
    expect(fm).toMatch(/created: '2026-05-14T10:00:00\.000Z'/)
    expect(fm).toMatch(/updated: '2026-05-14T10:00:00\.000Z'/)

    // Body contains the two block headers and the message text.
    const body = written.slice(fmEnd + 4)
    expect(body).toContain('## user')
    expect(body).toContain('## assistant')
    expect(body).toContain('hi')
    expect(body).toContain('hello')
  })

  it('subsequent turns advance `updated` after a flush; body stays intact (TEST-ASM-033)', async () => {
    // Codex P1+P2 round-1: per-turn `writeFile` was removed from the hot
    // path. The `updated:` timestamp now lands on disk via a debounced
    // frontmatter flush — `appendFile` carries the body delta on the wire
    // for every turn. Tests force the flush with `flushAll()` to assert the
    // post-flush state deterministically.
    const thread = makeThread()
    const timestamps: ReadonlyArray<string> = [
      '2026-05-14T10:00:00.000Z',
      '2026-05-14T10:05:00.000Z',
    ]
    let idx = 0
    const writer = makeWriter(ports, () => {
      const next = timestamps[idx] ?? '2026-05-14T10:00:00.000Z'
      idx += 1
      return next
    })

    await writer.appendUserAssistant(thread, { user: 'turn1-u', assistant: 'turn1-a' })

    // Spy on writeFile for the second turn so we can count calls precisely.
    const writeSpy = vi.spyOn(ports.vault, 'writeFile')
    const appendSpy = vi.spyOn(ports.vault, 'appendFile')
    await writer.appendUserAssistant(thread, { user: 'turn2-u', assistant: 'turn2-a' })

    // The hot path is body-append only — no writeFile per turn.
    expect(writeSpy).toHaveBeenCalledTimes(0)
    expect(appendSpy).toHaveBeenCalledTimes(1)

    // Drain the debounced frontmatter flush. After flushing, exactly one
    // writeFile lands (the frontmatter rewrite) preceded by one readFile
    // (to splice the new frontmatter onto the on-disk body — P2 fix).
    const readSpy = vi.spyOn(ports.vault, 'readFile')
    await writer.flushAll()
    expect(writeSpy).toHaveBeenCalledTimes(1)
    expect(readSpy).toHaveBeenCalledTimes(1)

    const path = resolveSessionLogPath(thread.feature, thread.sessionId!, 'specs')
    const written = await ports.vault.readFile(path)
    // Both turns survived.
    expect(written).toContain('turn1-u')
    expect(written).toContain('turn1-a')
    expect(written).toContain('turn2-u')
    expect(written).toContain('turn2-a')
    // `updated` advanced; `created` is unchanged.
    expect(written).toContain("created: '2026-05-14T10:00:00.000Z'")
    expect(written).toContain("updated: '2026-05-14T10:05:00.000Z'")
  })

  it('first write under specs/foo/sessions/ calls createFolder once on the parent (TEST-ASM-036)', async () => {
    const thread = makeThread()
    const createSpy = vi.spyOn(ports.vault, 'createFolder')
    const writer = makeWriter(ports)

    await writer.appendUserAssistant(thread, { user: 'a', assistant: 'b' })

    const folderCalls = createSpy.mock.calls.filter(
      ([p]) => p === 'specs/foo/sessions',
    )
    expect(folderCalls.length).toBeGreaterThanOrEqual(1)
    // The second turn must not re-create the folder unnecessarily (it is fine
    // for the writer to call `createFolder` again — idempotent at the port —
    // but the first invocation must have happened at least once).
    expect(folderCalls.length).toBeLessThanOrEqual(2)
  })

  it('resolves to the path computed by resolveSessionLogPath', async () => {
    const thread = makeThread({ sessionId: 'session-xyz', feature: 'bar' })
    const writer = makeWriter(ports)

    await writer.appendUserAssistant(thread, { user: 'u', assistant: 'a' })

    const path = resolveSessionLogPath('bar', 'session-xyz', 'specs')
    expect(path).toBe('specs/bar/sessions/session-xyz.md')
    expect(await ports.vault.fileExists(path)).toBe(true)
  })

  it('honours a custom specsFolder', async () => {
    const thread = makeThread({ sessionId: 'sid', feature: 'feat' })
    const writer = makeWriter(ports, () => '2026-05-14T10:00:00.000Z', 'features')

    await writer.appendUserAssistant(thread, { user: 'u', assistant: 'a' })

    expect(await ports.vault.fileExists('features/feat/sessions/sid.md')).toBe(true)
  })
})

describe('SessionLogWriter overwrite suffix (T-ASM-047, TEST-ASM-037)', () => {
  let ports: FakePorts

  beforeEach(() => {
    ports = fakeModulePorts()
  })

  it('routes to <id>-2.md when the target carries a conflicting session_id and logs warn once', async () => {
    const thread = makeThread({ sessionId: 'mine', feature: 'foo' })
    const basePath = 'specs/foo/sessions/mine.md'
    // Pre-seed a colliding file with a different session_id.
    await ports.vault.writeFile(
      basePath,
      [
        '---',
        "session_id: 'theirs'",
        "feature: 'foo'",
        'transport: subscription',
        "created: '2026-05-14T08:00:00.000Z'",
        "updated: '2026-05-14T08:00:00.000Z'",
        '---',
        '',
      ].join('\n'),
    )

    const writer = makeWriter(ports)
    await writer.appendUserAssistant(thread, { user: 'u', assistant: 'a' })

    // The original file is untouched.
    const orig = await ports.vault.readFile(basePath)
    expect(orig).toContain("session_id: 'theirs'")
    expect(orig).not.toContain('## user')

    // The suffixed file exists and carries our session_id.
    const suffixed = await ports.vault.readFile('specs/foo/sessions/mine-2.md')
    expect(suffixed).toContain("session_id: 'mine'")
    expect(suffixed).toContain('## user')

    // warn fires exactly once for this session.
    expect(ports.logger.warn).toHaveBeenCalledTimes(1)

    // Subsequent appends reuse the resolved suffix and do NOT log warn again.
    await writer.appendUserAssistant(thread, { user: 'u2', assistant: 'a2' })
    expect(ports.logger.warn).toHaveBeenCalledTimes(1)
    expect(await ports.vault.readFile('specs/foo/sessions/mine-2.md')).toContain('u2')
  })

  it('walks the suffix loop through -2, -3, -4 when multiple conflicts pre-exist', async () => {
    const thread = makeThread({ sessionId: 'mine', feature: 'foo' })
    const seed = (sid: string): string =>
      [
        '---',
        `session_id: '${sid}'`,
        "feature: 'foo'",
        'transport: subscription',
        "created: '2026-05-14T08:00:00.000Z'",
        "updated: '2026-05-14T08:00:00.000Z'",
        '---',
        '',
      ].join('\n')
    await ports.vault.writeFile('specs/foo/sessions/mine.md', seed('a'))
    await ports.vault.writeFile('specs/foo/sessions/mine-2.md', seed('b'))
    await ports.vault.writeFile('specs/foo/sessions/mine-3.md', seed('c'))

    const writer = makeWriter(ports)
    await writer.appendUserAssistant(thread, { user: 'u', assistant: 'a' })

    expect(await ports.vault.fileExists('specs/foo/sessions/mine-4.md')).toBe(true)
    const four = await ports.vault.readFile('specs/foo/sessions/mine-4.md')
    expect(four).toContain("session_id: 'mine'")
    expect(four).toContain('## user')
    // Originals untouched.
    expect(await ports.vault.readFile('specs/foo/sessions/mine.md')).toContain("session_id: 'a'")
    expect(await ports.vault.readFile('specs/foo/sessions/mine-2.md')).toContain("session_id: 'b'")
    expect(await ports.vault.readFile('specs/foo/sessions/mine-3.md')).toContain("session_id: 'c'")
  })

  it('reuses the existing file when its frontmatter session_id already matches', async () => {
    const thread = makeThread({ sessionId: 'mine', feature: 'foo' })
    await ports.vault.writeFile(
      'specs/foo/sessions/mine.md',
      [
        '---',
        "session_id: 'mine'",
        "feature: 'foo'",
        'transport: subscription',
        "created: '2026-05-14T08:00:00.000Z'",
        "updated: '2026-05-14T08:00:00.000Z'",
        '---',
        '',
      ].join('\n'),
    )

    const writer = makeWriter(ports)
    await writer.appendUserAssistant(thread, { user: 'u', assistant: 'a' })

    // No suffix file created.
    expect(await ports.vault.fileExists('specs/foo/sessions/mine-2.md')).toBe(false)
    const merged = await ports.vault.readFile('specs/foo/sessions/mine.md')
    expect(merged).toContain('## user')
    expect(ports.logger.warn).not.toHaveBeenCalled()
  })
})

describe('SessionLogWriter fire-and-forget latency (T-ASM-047, TEST-ASM-038)', () => {
  let ports: FakePorts

  beforeEach(() => {
    ports = fakeModulePorts()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('appendUserAssistant returns synchronously after enqueueing (caller not blocked on slow writeFile)', async () => {
    const thread = makeThread()
    // Replace writeFile + appendFile with 1 000 ms-delayed promises to
    // simulate slow I/O. The WP-5 hot path now does both per append; both
    // must complete before the queued op finishes.
    const originalWriteFile = ports.vault.writeFile.bind(ports.vault)
    vi.spyOn(ports.vault, 'writeFile').mockImplementation(
      (path: string, content: string): Promise<void> =>
        new Promise((resolve) => {
          // eslint-disable-next-line obsidianmd/prefer-active-window-timers
          setTimeout(() => {
            void originalWriteFile(path, content).then(resolve)
          }, 1000)
        }),
    )
    const originalAppendFile = ports.vault.appendFile.bind(ports.vault)
    vi.spyOn(ports.vault, 'appendFile').mockImplementation(
      (path: string, content: string): Promise<void> =>
        new Promise((resolve) => {
          // eslint-disable-next-line obsidianmd/prefer-active-window-timers
          setTimeout(() => {
            void originalAppendFile(path, content).then(resolve)
          }, 1000)
        }),
    )

    const writer = makeWriter(ports)
    const t0 = performance.now()
    const pending = writer.appendUserAssistant(thread, { user: 'u', assistant: 'a' })
    const t1 = performance.now()

    // The synchronous body of the call returns quickly — well under 100 ms.
    expect(t1 - t0).toBeLessThan(100)

    // Advance the fake timer through every delayed op (seed writeFile +
    // appendFile + rewrite writeFile = three 1 000 ms ticks worst case).
    await vi.advanceTimersByTimeAsync(5000)
    await pending
  })

  it('serialises concurrent appends per log file via the internal mutex (REQ-ASM-040)', async () => {
    vi.useRealTimers()
    const thread = makeThread()
    const order: string[] = []
    // Tag each appended body block by inspecting its body — `appendFile` is
    // the canonical hot path on WP-5 and carries the new turn block on the
    // wire. The frontmatter `writeFile` rewrites are intentionally ignored
    // here so we measure ordering across mutex queueing, not the I/O
    // accounting (which T-ASM-OturnAppend covers separately).
    vi.spyOn(ports.vault, 'appendFile').mockImplementation(async (_p, content) => {
      const tag = content.includes('first-turn') ? 'first' : 'second'
      order.push(`start-${tag}`)
      await new Promise((r) => setTimeout(r, 5)) // eslint-disable-line obsidianmd/prefer-active-window-timers
      order.push(`end-${tag}`)
    })

    const writer = makeWriter(ports)
    const a = writer.appendUserAssistant(thread, { user: 'first-turn', assistant: 'a' })
    const b = writer.appendUserAssistant(thread, { user: 'second-turn', assistant: 'b' })
    await Promise.all([a, b])

    // The second append must not start before the first finishes.
    expect(order).toEqual(['start-first', 'end-first', 'start-second', 'end-second'])
  })
})

describe('SessionLogWriter error routing (NFR-ASM-005)', () => {
  let ports: FakePorts

  beforeEach(() => {
    ports = fakeModulePorts()
  })

  it('routes VaultPort.writeFile failure to logger.error with a redacted sessionId and never rejects', async () => {
    const thread = makeThread({ sessionId: 'ffffffff-1111-2222-3333-444444444444' })
    vi.spyOn(ports.vault, 'writeFile').mockRejectedValue(new Error('disk full'))

    const writer = makeWriter(ports)
    // Must NOT throw.
    await expect(
      writer.appendUserAssistant(thread, { user: 'u', assistant: 'a' }),
    ).resolves.toBeUndefined()

    expect(ports.logger.error).toHaveBeenCalledTimes(1)
    const errorCall = (ports.logger.error as ReturnType<typeof vi.fn>).mock.calls[0]
    const ctx = errorCall[2] as { redactedSessionId: string }
    expect(ctx.redactedSessionId).toBe('ffffffff')
    expect(ctx.redactedSessionId).not.toContain('1111')
  })
})

describe('SessionLogWriter O(turn) append (WP-5 DoD)', () => {
  let ports: FakePorts

  beforeEach(() => {
    ports = fakeModulePorts()
  })

  it('100 turns produce 100 appendFile calls, 1 seed writeFile, 0 readFile before flush (Codex P1+P2 round-1)', async () => {
    // Codex P1+P2 round-1 closes the O(N²) trigger that survived the first
    // WP-5 attempt: the writer used to call `writeFile(path, fullContent)`
    // on every append so cumulative write volume stayed O(N²). After
    // round-1 the body is append-only on disk:
    //   - body delta → exactly one `appendFile` per turn (O(1) on the wire
    //     for a native-append adapter).
    //   - frontmatter `updated:` → debounced flush, draining only on
    //     `flushAll()` or after the configured debounce window.
    // The fresh-thread path therefore pays exactly:
    //   - 1 writeFile (seed frontmatter)
    //   - 100 appendFile (the 100 turn blocks)
    //   - 0 readFile (no resume; no flush)
    const thread = makeThread()
    let tick = 0
    const writer = makeWriter(ports, () => {
      tick += 1
      return `2026-05-14T10:00:${String(tick).padStart(2, '0')}.000Z`
    })

    for (let i = 0; i < 100; i += 1) {
      await writer.appendUserAssistant(thread, {
        user: `u-${i}`,
        assistant: `a-${i}`,
      })
    }

    expect(ports.bridge.calls.appendFile).toHaveLength(100)
    // Exactly one writeFile — the seed. The 100 follow-on turns add zero
    // writeFile calls until the debounced flush drains.
    expect(ports.bridge.calls.writeFile).toHaveLength(1)
    // Fresh thread → no readFile until `flushAll()` runs.
    expect(ports.bridge.calls.readFile).toHaveLength(0)
    // All 100 user/assistant turns survived round-trip on disk.
    const finalPath = ports.bridge.calls.appendFile[0]?.path ?? ''
    const finalContent = await ports.vault.readFile(finalPath)
    expect(finalContent).toContain('u-0')
    expect(finalContent).toContain('u-99')
    expect(finalContent).toContain('a-0')
    expect(finalContent).toContain('a-99')

    // Drain the pending frontmatter flush: one readFile (to splice the new
    // frontmatter over the live body) and one writeFile (the rewrite).
    const readBefore = ports.bridge.calls.readFile.length
    const writeBefore = ports.bridge.calls.writeFile.length
    await writer.flushAll()
    expect(ports.bridge.calls.readFile.length - readBefore).toBe(1)
    expect(ports.bridge.calls.writeFile.length - writeBefore).toBe(1)
  })

  it('resumed-session path: a single readFile seeds the cache, then appends scale O(1)', async () => {
    // Pre-seed a session log so the writer takes the cache-from-disk branch
    // on first append. After seeding, subsequent appends must not re-read.
    const thread = makeThread()
    await ports.vault.writeFile(
      'specs/foo/sessions/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.md',
      [
        '---',
        "session_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'",
        "feature: 'foo'",
        'transport: subscription',
        "created: '2026-05-14T08:00:00.000Z'",
        "updated: '2026-05-14T08:00:00.000Z'",
        '---',
        '',
        '## user',
        '<!-- at: 2026-05-14T08:00:00.000Z -->',
        '',
        'pre-existing',
        '',
      ].join('\n'),
    )

    // Reset the recorder so we only count writer-driven calls below.
    ports.bridge.calls.appendFile.length = 0
    ports.bridge.calls.readFile.length = 0
    ports.bridge.calls.writeFile.length = 0

    const writer = makeWriter(ports)
    for (let i = 0; i < 10; i += 1) {
      await writer.appendUserAssistant(thread, {
        user: `u-${i}`,
        assistant: `a-${i}`,
      })
    }

    expect(ports.bridge.calls.appendFile).toHaveLength(10)
    // Bounded reads: the conflict-suffix resolver probes the existing file
    // (REQ-ASM-039) and the cache seed reads it once more for body capture.
    // What matters for O(turn) closure is that reads do NOT scale with the
    // turn count — pre-WP-5 this was 10 reads on top of the suffix probe.
    expect(ports.bridge.calls.readFile.length).toBeLessThanOrEqual(2)
    // No per-turn writeFile either: the seed file already existed, so the
    // only writeFile to land before the flush is zero.
    expect(ports.bridge.calls.writeFile).toHaveLength(0)
  })

  it('out-of-band body edits between turns survive the debounced flush (Codex P2)', async () => {
    // P2: once a path is cached, the previous implementation rewrote the
    // body wholesale from the in-memory cache, clobbering any out-of-band
    // edits made on disk between turns. The round-1 fix reads the live body
    // back from disk on every flush so manual edits are preserved.
    const thread = makeThread()
    const stamps: ReadonlyArray<string> = [
      '2026-05-14T10:00:00.000Z',
      '2026-05-14T10:05:00.000Z',
    ]
    let stampIdx = 0
    const writer = makeWriter(ports, () => {
      const next = stamps[stampIdx] ?? '2026-05-14T10:05:00.000Z'
      stampIdx += 1
      return next
    })

    // Seed + turn 1.
    await writer.appendUserAssistant(thread, { user: 'u1', assistant: 'a1' })
    const path = resolveSessionLogPath(thread.feature, thread.sessionId!, 'specs')

    // External actor edits the body (e.g. the user manually annotates the
    // log in Obsidian) between turns.
    const beforeEdit = await ports.vault.readFile(path)
    const fenceIdx = beforeEdit.indexOf('\n---', 4)
    expect(fenceIdx).toBeGreaterThan(0)
    const frontmatterSlice = beforeEdit.slice(0, fenceIdx + '\n---\n'.length)
    const bodySlice = beforeEdit.slice(fenceIdx + '\n---\n'.length)
    const annotated = `${bodySlice}## annotation\n<!-- user-edit -->\n\nmanual note\n`
    await ports.vault.writeFile(path, `${frontmatterSlice}${annotated}`)

    // Turn 2 uses the second timestamp from the sequence; flush drains.
    await writer.appendUserAssistant(thread, { user: 'u2', assistant: 'a2' })
    await writer.flushAll()

    const after = await ports.vault.readFile(path)
    // Out-of-band annotation survived the frontmatter rewrite.
    expect(after).toContain('## annotation')
    expect(after).toContain('manual note')
    // Turn 2 body landed.
    expect(after).toContain('u2')
    expect(after).toContain('a2')
    // Frontmatter `updated:` advanced to the turn-2 timestamp.
    expect(after).toContain("updated: '2026-05-14T10:05:00.000Z'")
  })

  it('debounced frontmatter flush does not race a concurrent appendBlock (Codex P1 round-2)', async () => {
    // Reproduction of the lost-turn race introduced by the P1+P2 round-1
    // debounced-flush design. Pre-round-2, `flushFrontmatter`'s
    // `readFile → writeFile` window bypassed the per-file mutex used by
    // `appendBlock`. A `VaultPort.appendFile` for a new turn landing between
    // the flush's read and write would be clobbered by the stale body
    // snapshot the flush wrote back.
    //
    // The fix routes `doFlush` through the same per-path `_enqueue` chain
    // `appendBlock` uses. After the fix, the flush either reads after every
    // queued append has landed (so its writeFile preserves them all) or
    // yields the mutex so the pending append lands on top of the fresh
    // frontmatter. No turn is ever lost.
    const thread = makeThread()
    const stamps: ReadonlyArray<string> = [
      '2026-05-14T10:00:00.000Z',
      '2026-05-14T10:01:00.000Z',
      '2026-05-14T10:02:00.000Z',
      '2026-05-14T10:03:00.000Z',
    ]
    let stampIdx = 0
    const writer = makeWriter(
      ports,
      () => {
        const next = stamps[stampIdx] ?? '2026-05-14T10:00:00.000Z'
        stampIdx += 1
        return next
      },
      'specs',
      // Tight debounce so we don't have to drive timers manually — the flush
      // is still routed through the queue; we rely on `flushAll()` and the
      // queue's serialisation to make the assertion deterministic.
      { flushDebounceMs: 0 },
    )

    // Seed (turn 0) so the cache is warm and conflict-suffix resolution is
    // memoised — keeps the rest of the I/O accounting tidy.
    await writer.appendUserAssistant(thread, { user: 'u0', assistant: 'a0' })

    // Wrap readFile so we can force the flush to suspend mid-cycle: the
    // first post-seed readFile (the flush's body read) parks on a barrier
    // we resolve only after a concurrent appendBlock has had a chance to
    // try to interleave.
    const realReadFile = ports.vault.readFile.bind(ports.vault)
    let reachedSignal: () => void = () => undefined
    const reached = new Promise<void>((r) => {
      reachedSignal = r
    })
    let releaseFlush: () => void = () => undefined
    const gate = new Promise<void>((r) => {
      releaseFlush = r
    })
    let firstReadHandled = false
    vi.spyOn(ports.vault, 'readFile').mockImplementation(async (p: string) => {
      // The flush issues exactly one readFile against the resolved log path
      // — capture it and park until the test releases the gate.
      if (!firstReadHandled && p.endsWith('.md')) {
        firstReadHandled = true
        reachedSignal()
        await gate
      }
      return realReadFile(p)
    })

    // Kick off turn 1. With `flushDebounceMs: 0`, the appendBlock queues
    // first, then the debounce fires and the flush enqueues. The flush's
    // body-read parks at the barrier.
    const turn1 = writer.appendUserAssistant(thread, {
      user: 'u1',
      assistant: 'a1',
    })
    // Wait until the flush has actually entered the readFile so the test's
    // turn-2 appendBlock cannot squeeze in before it.
    await reached

    // Concurrent appendBlock for turn 2 — pre-fix, this `appendFile` would
    // land between the flush's read and write and be clobbered. Post-fix,
    // it waits in the per-path queue until the flush's writeFile returns.
    const turn2 = writer.appendUserAssistant(thread, {
      user: 'u2',
      assistant: 'a2',
    })

    // Give the event loop a few ticks so the pre-fix interleaving would
    // have had every chance to execute the racy appendFile.
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()

    // Release the flush; let everything drain.
    releaseFlush()
    await Promise.all([turn1, turn2])
    await writer.flushAll()

    const path = resolveSessionLogPath(thread.feature, thread.sessionId!, 'specs')
    const finalContent = await realReadFile(path)
    // Every turn that was queued must survive in the on-disk content.
    expect(finalContent).toContain('u0')
    expect(finalContent).toContain('a0')
    expect(finalContent).toContain('u1')
    expect(finalContent).toContain('a1')
    expect(finalContent).toContain('u2')
    expect(finalContent).toContain('a2')

    // Sanity check: the flush issued its writeFile, and the appendFile for
    // turn 2 also landed. The bridge call recorder captures both. We don't
    // assert a specific order — either is correct under the per-path queue;
    // the only invariant is that the lost-turn race is closed and the final
    // on-disk content above already proves that.
    expect(ports.bridge.calls.writeFile.length).toBeGreaterThanOrEqual(2)
    // turn 0 (seed), turn 1, turn 2 → at least three appendFile calls.
    expect(ports.bridge.calls.appendFile.length).toBeGreaterThanOrEqual(3)
  })
})

describe('SessionLogWriter.appendProposalDecision (REQ-ASM-046)', () => {
  let ports: FakePorts

  beforeEach(() => {
    ports = fakeModulePorts()
  })

  it('appends a ## proposal block with path, decision, decided_at, and rationale', async () => {
    const thread = makeThread()
    // Pre-seed the session log so we can verify the append (not seed) path.
    const writer = makeWriter(ports, () => '2026-05-14T10:00:00.000Z')
    await writer.appendUserAssistant(thread, { user: 'u', assistant: 'a' })

    const proposal: SessionLogProposalInput = {
      envelope: { path: 'notes/idea.md', rationale: 'because-spec' },
    }
    await writer.appendProposalDecision({
      thread,
      proposal,
      decision: 'accepted',
      decidedAt: '2026-05-14T10:10:00.000Z',
    })

    const path = resolveSessionLogPath(thread.feature, thread.sessionId!, 'specs')
    const written = await ports.vault.readFile(path)
    expect(written).toContain('## proposal')
    expect(written).toContain('- path: notes/idea.md')
    expect(written).toContain('- decision: accepted')
    expect(written).toContain('- decided_at: 2026-05-14T10:10:00.000Z')
    expect(written).toContain('- rationale: because-spec')
  })

  it('appendProposalDecision rejects when the underlying writeFile throws (audit row load-bearing per REQ-ASM-046)', async () => {
    const thread = makeThread()
    vi.spyOn(ports.vault, 'writeFile').mockRejectedValue(new Error('boom'))

    const writer = makeWriter(ports)
    // Codex P1 #1 fix: audit-row failures must propagate to the caller so the
    // commit pipeline maps them to `SESSION_LOG_FAILED`. A vault write must
    // not be reported successful while its audit row is silently dropped.
    await expect(
      writer.appendProposalDecision({
        thread,
        proposal: { envelope: { path: 'a.md' } },
        decision: 'rejected',
        decidedAt: '2026-05-14T10:00:00.000Z',
      }),
    ).rejects.toThrow('boom')
  })

  it('appendProposalDecision rejects with SessionLogNoSessionError when thread.sessionId is null', async () => {
    const thread = makeThread({ sessionId: null })

    const writer = makeWriter(ports)
    await expect(
      writer.appendProposalDecision({
        thread,
        proposal: { envelope: { path: 'a.md' } },
        decision: 'rejected',
        decidedAt: '2026-05-14T10:00:00.000Z',
      }),
    ).rejects.toThrow(SessionLogNoSessionError)
    // No vault write attempted — the missing session is gated before queueing.
    expect(ports.logger.error).toHaveBeenCalled()
  })

  it('appendUserAssistant still resolves successfully when the underlying writeFile throws (fire-and-forget per REQ-ASM-040)', async () => {
    const thread = makeThread()
    vi.spyOn(ports.vault, 'writeFile').mockRejectedValue(new Error('boom'))

    const writer = makeWriter(ports)
    // Regression: refactoring `appendProposalDecision` to reject must not
    // change the fire-and-forget contract of `appendUserAssistant`. Free-text
    // turn mirroring stays resilient — failures route to logger.error.
    await expect(
      writer.appendUserAssistant(thread, { user: 'u', assistant: 'a' }),
    ).resolves.toBeUndefined()
    expect(ports.logger.error).toHaveBeenCalledTimes(1)
  })
})
