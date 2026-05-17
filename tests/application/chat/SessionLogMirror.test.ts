/**
 * WP-5 — `SessionLogMirror` facade tests.
 *
 * Asserts the facade delegates one-for-one to its underlying writer for both
 * the fire-and-forget `mirrorTurn` path and the await-required
 * `mirrorProposalDecision` path. The writer's own contract (mutex,
 * conflict-suffix loop, error routing) is covered by
 * `SessionLogWriter.test.ts`; the facade is intentionally a thin pass-through.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { fakeModulePorts, type FakePorts } from '../../__fakes__/fake-ports'
import { SessionLogMirror } from '@/application/chat/SessionLogMirror'
import {
  SessionLogNoSessionError,
  SessionLogWriter,
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

function makePair(ports: FakePorts): {
  writer: SessionLogWriter
  mirror: SessionLogMirror
} {
  const writer = new SessionLogWriter(
    ports.vault,
    ports.logger,
    'specs',
    () => '2026-05-14T10:00:00.000Z',
  )
  const mirror = new SessionLogMirror(writer)
  return { writer, mirror }
}

describe('SessionLogMirror.mirrorTurn — delegation', () => {
  let ports: FakePorts

  beforeEach(() => {
    ports = fakeModulePorts()
  })

  it('forwards to writer.appendUserAssistant with the same thread + turn', async () => {
    const { writer, mirror } = makePair(ports)
    const spy = vi.spyOn(writer, 'appendUserAssistant')
    const thread = makeThread()

    await mirror.mirrorTurn(thread, { user: 'u', assistant: 'a' })

    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledWith(thread, { user: 'u', assistant: 'a' })
  })

  it('remains fire-and-forget: never rejects when the writer swallows', async () => {
    // No `sessionId` on the thread — `appendUserAssistant` drops with a debug
    // log and resolves; the facade must propagate that resolution.
    const { mirror } = makePair(ports)
    const thread = makeThread({ sessionId: null })

    await expect(
      mirror.mirrorTurn(thread, { user: 'u', assistant: 'a' }),
    ).resolves.toBeUndefined()
  })
})

describe('SessionLogMirror.mirrorProposalDecision — delegation', () => {
  let ports: FakePorts

  beforeEach(() => {
    ports = fakeModulePorts()
  })

  it('forwards args one-for-one to writer.appendProposalDecision', async () => {
    const { writer, mirror } = makePair(ports)
    const spy = vi.spyOn(writer, 'appendProposalDecision')
    const thread = makeThread()
    const proposal: SessionLogProposalInput = {
      envelope: { path: 'specs/foo/idea.md', rationale: 'because' },
    }

    await mirror.mirrorProposalDecision({
      thread,
      proposal,
      decision: 'accepted',
      decidedAt: '2026-05-14T11:00:00.000Z',
    })

    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledWith({
      thread,
      proposal,
      decision: 'accepted',
      decidedAt: '2026-05-14T11:00:00.000Z',
    })
  })

  it('rejects with SessionLogNoSessionError when sessionId is null (REQ-ASM-046)', async () => {
    const { mirror } = makePair(ports)
    const thread = makeThread({ sessionId: null })

    await expect(
      mirror.mirrorProposalDecision({
        thread,
        proposal: { envelope: { path: 'a.md' } },
        decision: 'rejected',
        decidedAt: '2026-05-14T10:00:00.000Z',
      }),
    ).rejects.toThrow(SessionLogNoSessionError)
  })

  it('rejects when the underlying writer rejects (audit row load-bearing)', async () => {
    const { writer, mirror } = makePair(ports)
    vi.spyOn(writer, 'appendProposalDecision').mockRejectedValueOnce(
      new Error('boom'),
    )

    await expect(
      mirror.mirrorProposalDecision({
        thread: makeThread(),
        proposal: { envelope: { path: 'a.md' } },
        decision: 'rejected',
        decidedAt: '2026-05-14T10:00:00.000Z',
      }),
    ).rejects.toThrow('boom')
  })
})

describe('SessionLogMirror.ensureSessionsFolder — delegation', () => {
  let ports: FakePorts

  beforeEach(() => {
    ports = fakeModulePorts()
  })

  it('forwards to writer.ensureSessionsFolder with the same feature', async () => {
    const { writer, mirror } = makePair(ports)
    const spy = vi.spyOn(writer, 'ensureSessionsFolder')

    await mirror.ensureSessionsFolder('foo')

    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledWith('foo')
  })
})
