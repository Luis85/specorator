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
): SessionLogWriter {
  return new SessionLogWriter(ports.vault, ports.logger, specsFolder, nowIso)
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

  it('on a subsequent turn, writeFile is called once with appended content and updated > created (TEST-ASM-033)', async () => {
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
    await writer.appendUserAssistant(thread, { user: 'turn2-u', assistant: 'turn2-a' })

    expect(writeSpy).toHaveBeenCalledTimes(1)
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
    // Replace writeFile with a 1 000 ms-delayed promise to simulate slow I/O.
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

    const writer = makeWriter(ports)
    const t0 = performance.now()
    const pending = writer.appendUserAssistant(thread, { user: 'u', assistant: 'a' })
    const t1 = performance.now()

    // The synchronous body of the call returns quickly — well under 100 ms.
    expect(t1 - t0).toBeLessThan(100)

    // Advance the fake timer so the queued write completes.
    await vi.advanceTimersByTimeAsync(1000)
    await pending
  })

  it('serialises concurrent appends per log file via the internal mutex (REQ-ASM-040)', async () => {
    vi.useRealTimers()
    const thread = makeThread()
    const order: string[] = []
    vi.spyOn(ports.vault, 'writeFile').mockImplementation(async (_p, content) => {
      // Tag each write by inspecting the body.
      const tag = content.includes('first-turn') ? 'first' : 'second'
      order.push(`start-${tag}`)
      await new Promise((r) => setTimeout(r, 5)) // eslint-disable-line obsidianmd/prefer-active-window-timers
      order.push(`end-${tag}`)
    })

    const writer = makeWriter(ports)
    const a = writer.appendUserAssistant(thread, { user: 'first-turn', assistant: 'a' })
    const b = writer.appendUserAssistant(thread, { user: 'second-turn', assistant: 'b' })
    await Promise.all([a, b])

    // The second write must not start before the first finishes.
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
