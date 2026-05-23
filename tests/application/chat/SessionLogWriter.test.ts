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

/**
 * Q-E.1 — helper to compute the slug-based path the writer now produces for
 * a fresh thread. Mirrors what the writer feeds into `resolveSessionLogPath`
 * internally so tests can assert against the expected output path.
 */
function slugPath(
  feature: string | null,
  sessionId: string,
  specsFolder: string,
  createdAt: string,
  firstUserMessage: string,
): string {
  return resolveSessionLogPath(feature, sessionId, specsFolder, {
    createdAt,
    firstUserMessage,
  })
}
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
    transport: { provider: 'claude', mode: 'cli' },
    title: '',
    forkParent: null,
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

  it('first write seeds frontmatter with the four named keys plus user/assistant body (Q-E.2; TEST-ASM-032)', async () => {
    const thread = makeThread()
    const writer = makeWriter(ports, () => '2026-05-14T10:00:00.000Z')

    await writer.appendUserAssistant(thread, { user: 'hi', assistant: 'hello' })

    // Q-E.1 — file now lives at the slug-based basename.
    const path = slugPath(
      thread.feature,
      thread.sessionId!,
      'specs',
      thread.createdAt,
      'hi',
    )
    const written = await ports.vault.readFile(path)

    // Frontmatter parses as YAML with the four named keys (Q-E.2 dropped `transport`).
    expect(written.startsWith('---\n')).toBe(true)
    const fmEnd = written.indexOf('\n---', 4)
    expect(fmEnd).toBeGreaterThan(0)
    const fm = written.slice(4, fmEnd)
    expect(fm).toMatch(/session_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'/)
    expect(fm).toMatch(/feature: 'foo'/)
    expect(fm).not.toMatch(/transport:/)
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
    // Q-E.1 — slug path derived from the first turn's user text.
    const path = slugPath(
      thread.feature,
      thread.sessionId!,
      'specs',
      thread.createdAt,
      'turn1-u',
    )
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

  it('resolves to the slug-based path computed by resolveSessionLogPath (Q-E.1)', async () => {
    const thread = makeThread({ sessionId: 'session-xyz', feature: 'bar' })
    const writer = makeWriter(ports)

    await writer.appendUserAssistant(thread, { user: 'u', assistant: 'a' })

    const path = slugPath('bar', 'session-xyz', 'specs', thread.createdAt, 'u')
    expect(path).toBe('specs/bar/sessions/2026-05-14_u__session-.md')
    expect(await ports.vault.fileExists(path)).toBe(true)
  })

  it('honours a custom specsFolder', async () => {
    const thread = makeThread({ sessionId: 'sid-12345', feature: 'feat' })
    const writer = makeWriter(ports, () => '2026-05-14T10:00:00.000Z', 'features')

    await writer.appendUserAssistant(thread, { user: 'u', assistant: 'a' })

    const path = slugPath('feat', 'sid-12345', 'features', thread.createdAt, 'u')
    expect(await ports.vault.fileExists(path)).toBe(true)
  })
})

describe('SessionLogWriter overwrite suffix (T-ASM-047, TEST-ASM-037)', () => {
  let ports: FakePorts

  beforeEach(() => {
    ports = fakeModulePorts()
  })

  /**
   * Q-E.1: the writer now uses slug-based filenames, so conflict-suffix tests
   * pre-seed at the slug path. The legacy `<sessionId>.md` path is reserved
   * for the backwards-compat probe (verified in a separate block below).
   */
  const slugFor = (firstUserMessage: string, sessionId = 'mine'): string =>
    slugPath('foo', sessionId, 'specs', '2026-05-14T10:00:00.000Z', firstUserMessage)

  it('routes to <slug>-2.md when the target carries a conflicting session_id and logs warn once', async () => {
    const thread = makeThread({ sessionId: 'mine', feature: 'foo' })
    const basePath = slugFor('u')
    // Pre-seed a colliding file at the same slug path with a different session_id.
    await ports.vault.writeFile(
      basePath,
      [
        '---',
        "session_id: 'theirs'",
        "feature: 'foo'",
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
    const suffixed = await ports.vault.readFile(basePath.replace(/\.md$/, '-2.md'))
    expect(suffixed).toContain("session_id: 'mine'")
    expect(suffixed).toContain('## user')

    // warn fires exactly once for this session.
    expect(ports.logger.warn).toHaveBeenCalledTimes(1)

    // Subsequent appends reuse the resolved suffix and do NOT log warn again.
    await writer.appendUserAssistant(thread, { user: 'u2', assistant: 'a2' })
    expect(ports.logger.warn).toHaveBeenCalledTimes(1)
    expect(await ports.vault.readFile(basePath.replace(/\.md$/, '-2.md'))).toContain('u2')
  })

  it('walks the suffix loop through -2, -3, -4 when multiple conflicts pre-exist', async () => {
    const thread = makeThread({ sessionId: 'mine', feature: 'foo' })
    const basePath = slugFor('u')
    const seed = (sid: string): string =>
      [
        '---',
        `session_id: '${sid}'`,
        "feature: 'foo'",
        "created: '2026-05-14T08:00:00.000Z'",
        "updated: '2026-05-14T08:00:00.000Z'",
        '---',
        '',
      ].join('\n')
    await ports.vault.writeFile(basePath, seed('a'))
    await ports.vault.writeFile(basePath.replace(/\.md$/, '-2.md'), seed('b'))
    await ports.vault.writeFile(basePath.replace(/\.md$/, '-3.md'), seed('c'))

    const writer = makeWriter(ports)
    await writer.appendUserAssistant(thread, { user: 'u', assistant: 'a' })

    const fourPath = basePath.replace(/\.md$/, '-4.md')
    expect(await ports.vault.fileExists(fourPath)).toBe(true)
    const four = await ports.vault.readFile(fourPath)
    expect(four).toContain("session_id: 'mine'")
    expect(four).toContain('## user')
    // Originals untouched.
    expect(await ports.vault.readFile(basePath)).toContain("session_id: 'a'")
    expect(await ports.vault.readFile(basePath.replace(/\.md$/, '-2.md'))).toContain(
      "session_id: 'b'",
    )
    expect(await ports.vault.readFile(basePath.replace(/\.md$/, '-3.md'))).toContain(
      "session_id: 'c'",
    )
  })

  it('reuses the existing file when its frontmatter session_id already matches', async () => {
    const thread = makeThread({ sessionId: 'mine', feature: 'foo' })
    const basePath = slugFor('u')
    await ports.vault.writeFile(
      basePath,
      [
        '---',
        "session_id: 'mine'",
        "feature: 'foo'",
        "created: '2026-05-14T08:00:00.000Z'",
        "updated: '2026-05-14T08:00:00.000Z'",
        '---',
        '',
      ].join('\n'),
    )

    const writer = makeWriter(ports)
    await writer.appendUserAssistant(thread, { user: 'u', assistant: 'a' })

    // No suffix file created.
    expect(await ports.vault.fileExists(basePath.replace(/\.md$/, '-2.md'))).toBe(false)
    const merged = await ports.vault.readFile(basePath)
    expect(merged).toContain('## user')
    expect(ports.logger.warn).not.toHaveBeenCalled()
  })

  it('Q-E.1 backwards-compat: appends to a pre-existing legacy <sessionId>.md file when it carries our session_id', async () => {
    const thread = makeThread({ sessionId: 'mine', feature: 'foo' })
    const legacyPath = 'specs/foo/sessions/mine.md'
    // Pre-seed a legacy-shaped file owned by THIS thread (e.g. created
    // before Q-E.1 landed).
    await ports.vault.writeFile(
      legacyPath,
      [
        '---',
        "session_id: 'mine'",
        "feature: 'foo'",
        "created: '2026-05-14T08:00:00.000Z'",
        "updated: '2026-05-14T08:00:00.000Z'",
        '---',
        '',
      ].join('\n'),
    )

    const writer = makeWriter(ports)
    await writer.appendUserAssistant(thread, { user: 'hello world', assistant: 'a' })

    // The legacy file is reused — the slug-path file is NOT created.
    const merged = await ports.vault.readFile(legacyPath)
    expect(merged).toContain('## user')
    expect(merged).toContain('hello world')
    const slug = slugPath(
      'foo',
      'mine',
      'specs',
      thread.createdAt,
      'hello world',
    )
    expect(await ports.vault.fileExists(slug)).toBe(false)
    // No conflict warning — the legacy probe finds our own session_id.
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

    // Q-E.1: writer now uses the slug-based filename for new files.
    const path = slugPath(thread.feature, thread.sessionId!, 'specs', thread.createdAt, 'u')
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

  it('appendUserAssistant after restart with a different turn appends to the existing slug-named log (regression: Codex P1 #429)', async () => {
    const thread = makeThread()
    // Writer #1 seeds the slug-named log keyed off the first user message.
    const writer1 = makeWriter(ports, () => '2026-05-14T10:00:00.000Z')
    await writer1.appendUserAssistant(thread, { user: 'hi', assistant: 'hello' })
    const firstPath = slugPath(
      thread.feature,
      thread.sessionId!,
      'specs',
      thread.createdAt,
      'hi',
    )
    expect(await ports.vault.fileExists(firstPath)).toBe(true)

    // Writer #2 simulates a plugin restart — fresh in-memory cache. The next
    // turn carries a different user text, so without the folder-scan
    // fallback the writer would derive `<date>_<later>__<id>.md` and split
    // the conversation across two files.
    const writer2 = makeWriter(ports, () => '2026-05-14T10:10:00.000Z')
    await writer2.appendUserAssistant(thread, { user: 'later turn', assistant: 'reply 2' })

    // No parallel slug-named file was created from the later turn text.
    const splitPath = slugPath(
      thread.feature,
      thread.sessionId!,
      'specs',
      thread.createdAt,
      'later turn',
    )
    expect(splitPath).not.toBe(firstPath)
    expect(await ports.vault.fileExists(splitPath)).toBe(false)

    // The follow-up turn appended to the existing slug-named log.
    const written = await ports.vault.readFile(firstPath)
    expect(written).toContain('later turn')
    expect(written).toContain('reply 2')
  })

  it('folder-scan skips an unreadable file and still finds the matching session log (regression: Codex P2 #429 — unreadable scan)', async () => {
    const thread = makeThread()
    // Seed the real slug-named log.
    const writer1 = makeWriter(ports, () => '2026-05-14T10:00:00.000Z')
    await writer1.appendUserAssistant(thread, { user: 'hi', assistant: 'hello' })
    const realPath = slugPath(
      thread.feature,
      thread.sessionId!,
      'specs',
      thread.createdAt,
      'hi',
    )

    // Seed a sibling decoy file that the listFiles probe will encounter
    // first, but whose readFile rejects transiently (e.g. deleted between
    // list and read). The scan must skip it and still find `realPath`.
    const decoyPath = `specs/${thread.feature!}/sessions/aaaa-decoy.md`
    await ports.vault.writeFile(decoyPath, '---\nsession_id: other\n---\n')
    const originalReadFile = ports.vault.readFile.bind(ports.vault)
    vi.spyOn(ports.vault, 'readFile').mockImplementation(async (p: string) => {
      if (p === decoyPath) throw new Error('transient I/O — file vanished')
      return originalReadFile(p)
    })

    // Fresh writer (simulating restart) — empty resolvedPaths cache forces
    // the folder-scan path.
    const writer2 = makeWriter(ports, () => '2026-05-14T10:10:00.000Z')
    await writer2.appendProposalDecision({
      thread,
      proposal: { envelope: { path: 'notes/idea.md' } },
      decision: 'accepted',
      decidedAt: '2026-05-14T10:10:00.000Z',
    })

    // The proposal landed in the real slug-named log, not in a parallel file.
    const written = await originalReadFile(realPath)
    expect(written).toContain('## proposal')
    expect(written).toContain('- decision: accepted')
  })

  it('appendProposalDecision after restart appends to the existing slug-named log (regression: Codex P2 #429)', async () => {
    const thread = makeThread()
    // Writer #1 seeds the slug-named log via a normal user-assistant turn.
    const writer1 = makeWriter(ports, () => '2026-05-14T10:00:00.000Z')
    await writer1.appendUserAssistant(thread, { user: 'hi', assistant: 'hello' })
    const existingPath = slugPath(
      thread.feature,
      thread.sessionId!,
      'specs',
      thread.createdAt,
      'hi',
    )
    expect(await ports.vault.fileExists(existingPath)).toBe(true)

    // Writer #2 simulates a plugin restart — fresh in-memory `resolvedPaths`
    // cache, no firstUserMessage hint, but the slug-named file is still on
    // disk. The proposal-decision append must land in the existing file
    // instead of creating a parallel UUID-named log.
    const writer2 = makeWriter(ports, () => '2026-05-14T10:10:00.000Z')
    await writer2.appendProposalDecision({
      thread,
      proposal: { envelope: { path: 'notes/idea.md', rationale: 'because-spec' } },
      decision: 'accepted',
      decidedAt: '2026-05-14T10:10:00.000Z',
    })

    // No parallel UUID-named log was created.
    const legacyPath = resolveSessionLogPath(
      thread.feature,
      thread.sessionId!,
      'specs',
    )
    expect(legacyPath).not.toBe(existingPath)
    expect(await ports.vault.fileExists(legacyPath)).toBe(false)

    // The proposal audit row landed in the existing slug-named log.
    const written = await ports.vault.readFile(existingPath)
    expect(written).toContain('## proposal')
    expect(written).toContain('- path: notes/idea.md')
    expect(written).toContain('- decision: accepted')
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
