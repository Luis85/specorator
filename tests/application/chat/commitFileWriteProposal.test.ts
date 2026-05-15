/**
 * T-ASM-065 + T-ASM-066 — Tests for `commitFileWriteProposal` and
 * `rejectFileWriteProposal`.
 *
 * Covers SPEC-ASM-001 §3.6 algorithm + §6.5 module contract:
 *
 *   T-ASM-065 (happy + overwrite):
 *     - TEST-ASM-041: Accept → `writeFile` called once with validated values.
 *     - TEST-ASM-042: Existing path → `ConfirmModalPort.show` invoked;
 *                     `writeFile` fires only on `true`; not invoked on `false`.
 *     - TEST-ASM-045: folderHint → `createFolder` precedes `writeFile`.
 *     - Trust-first: mutation-tracking fake-port harness shows zero
 *       `writeFile` calls when Accept is not clicked (REQ-ASM-041, NFR-ASM-011).
 *
 *   T-ASM-066 (failures + audit row):
 *     - `OVERWRITE_CANCELLED`, `FOLDER_CREATE_FAILED`, `WRITE_FAILED`,
 *       `SESSION_LOG_FAILED` each reachable.
 *     - TEST-ASM-044: Audit row `## proposal` block is appended with
 *       `path`, `decision`, `decided_at`, and `rationale` (when present).
 *     - `appendProposalDecision` is awaited inline (the §6.7 fire-and-forget
 *       departure for audit rows).
 *
 *   T-ASM-067 (reject path):
 *     - `rejectFileWriteProposal` writes the audit row only; **never** calls
 *       any `VaultPort` mutation method (REQ-ASM-045).
 *
 * Satisfies REQ-ASM-043, REQ-ASM-044, REQ-ASM-045, REQ-ASM-046, REQ-ASM-047,
 * NFR-ASM-011.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

import { fakeModulePorts, type FakePorts } from '../../__fakes__/fake-ports'
import { MockConfirmModalPort } from '@/infrastructure/mock/MockConfirmModalPort'
import {
  commitFileWriteProposal,
  rejectFileWriteProposal,
  type CommitFileWriteDeps,
} from '@/application/chat/commitFileWriteProposal'
import { SessionLogWriter } from '@/application/chat/SessionLogWriter'
import { resolveSessionLogPath } from '@/application/chat/sessionLogPath'
import type { FileWriteProposal } from '@/application/chat/FileWriteProposal'
import type { CreateFileEnvelope } from '@/application/chat/createFileEnvelopeSchema'
import type { ChatThreadRecord } from '@/domain/chat/ChatThreadRecord'
import { asSessionId } from '@/domain/chat/SessionId'

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

const FIXED_NOW = '2026-05-14T12:34:56.000Z'

/**
 * Build a `FileWriteProposal` with the supplied envelope fields. The optional
 * `folderHint` / `rationale` are layered on via a `Record` cast so the test
 * can exercise REQ-ASM-047 + REQ-ASM-046 without forcing the schema to grow.
 */
function makeProposal(opts: {
  readonly path?: string
  readonly content?: string
  readonly folderHint?: string
  readonly rationale?: string
  readonly proposalId?: string
  readonly threadId?: string
}): FileWriteProposal {
  const baseEnvelope: CreateFileEnvelope = {
    action: 'createFile',
    path: opts.path ?? 'specs/foo/idea.md',
    content: opts.content ?? '# hello\n',
  }
  const envelope = {
    ...baseEnvelope,
    ...(opts.folderHint !== undefined ? { folderHint: opts.folderHint } : {}),
    ...(opts.rationale !== undefined ? { rationale: opts.rationale } : {}),
  } as CreateFileEnvelope
  return {
    proposalId: opts.proposalId ?? 'proposal-1',
    threadId: opts.threadId ?? 'thread-1',
    envelope,
    status: 'pending',
    proposedAt: '2026-05-14T12:00:00.000Z',
    decidedAt: null,
    failureReason: null,
    originPrompt: '/create-file specs/foo/idea.md',
  }
}

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

function makeDeps(
  ports: FakePorts,
  overrides: Partial<CommitFileWriteDeps> = {},
): CommitFileWriteDeps {
  const sessionLog = new SessionLogWriter(
    ports.vault,
    ports.logger,
    'specs',
    () => FIXED_NOW,
  )
  return {
    vault: ports.vault,
    logger: ports.logger,
    sessionLog,
    confirmModal: new MockConfirmModalPort(),
    i18n: ports.t,
    nowIso: () => FIXED_NOW,
    ...overrides,
  }
}

/* -------------------------------------------------------------------------- */
/* T-ASM-065 — Happy + overwrite                                              */
/* -------------------------------------------------------------------------- */

describe('commitFileWriteProposal — happy path (T-ASM-065 / TEST-ASM-041)', () => {
  let ports: FakePorts

  beforeEach(() => {
    ports = fakeModulePorts()
  })

  it('writes the envelope to the vault exactly once on a fresh path', async () => {
    const writeSpy = vi.spyOn(ports.vault, 'writeFile')
    const existsSpy = vi.spyOn(ports.vault, 'fileExists')
    const proposal = makeProposal({ path: 'specs/foo/idea.md', content: '# fresh\n' })
    const deps = makeDeps(ports)

    const result = await commitFileWriteProposal(proposal, makeThread(), deps)

    expect(result.ok).toBe(true)
    // First `fileExists` is the overwrite-guard probe on the envelope path;
    // the session-log writer probes its own path separately, so we only
    // assert the envelope-path call landed.
    expect(existsSpy).toHaveBeenCalledWith('specs/foo/idea.md')
    // The envelope must be written verbatim — path + content.
    const envelopeWrites = writeSpy.mock.calls.filter(
      ([p]) => p === 'specs/foo/idea.md',
    )
    expect(envelopeWrites).toHaveLength(1)
    expect(envelopeWrites[0]).toEqual(['specs/foo/idea.md', '# fresh\n'])
  })

  it('does NOT show the overwrite modal when the path does not exist', async () => {
    const modal = new MockConfirmModalPort()
    const deps = makeDeps(ports, { confirmModal: modal })
    const proposal = makeProposal({ path: 'specs/new/idea.md' })

    const result = await commitFileWriteProposal(proposal, makeThread(), deps)

    expect(result.ok).toBe(true)
    // Modal is gated on `fileExists === true` only — fresh paths skip it.
    expect(modal.calls).toHaveLength(0)
  })
})

describe('commitFileWriteProposal — overwrite gate (T-ASM-065 / TEST-ASM-042)', () => {
  let ports: FakePorts

  beforeEach(() => {
    ports = fakeModulePorts()
  })

  it('shows the confirm modal and writes when the user confirms', async () => {
    // Seed an existing file so the overwrite guard trips.
    await ports.bridge.writeFile('specs/foo/idea.md', 'old body')
    const modal = new MockConfirmModalPort()
    modal.nextResult = true
    const deps = makeDeps(ports, { confirmModal: modal })
    const writeSpy = vi.spyOn(ports.vault, 'writeFile')
    const proposal = makeProposal({ path: 'specs/foo/idea.md', content: 'new body' })

    const result = await commitFileWriteProposal(proposal, makeThread(), deps)

    expect(result.ok).toBe(true)
    expect(modal.calls).toHaveLength(1)
    // Modal payload pulls translated copy and includes the path in the body.
    expect(modal.calls[0]).toEqual({
      title: 'chat.proposal.overwriteTitle',
      body: 'chat.proposal.overwriteBody',
      confirmLabel: 'chat.proposal.overwriteConfirm',
      cancelLabel: 'chat.proposal.overwriteCancel',
    })
    // writeFile must be called with the new content (overwrite landed).
    const envelopeWrites = writeSpy.mock.calls.filter(
      ([p]) => p === 'specs/foo/idea.md',
    )
    expect(envelopeWrites).toHaveLength(1)
    expect(envelopeWrites[0]?.[1]).toBe('new body')
  })

  it('does NOT call writeFile when the user cancels the overwrite modal', async () => {
    await ports.bridge.writeFile('specs/foo/idea.md', 'old body')
    const modal = new MockConfirmModalPort()
    modal.nextResult = false // user cancels
    const deps = makeDeps(ports, { confirmModal: modal })
    const writeSpy = vi.spyOn(ports.vault, 'writeFile')
    const proposal = makeProposal({ path: 'specs/foo/idea.md', content: 'new body' })

    const result = await commitFileWriteProposal(proposal, makeThread(), deps)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.errorCode).toBe('OVERWRITE_CANCELLED')
    expect(modal.calls).toHaveLength(1)
    // Trust-first invariant: NO write to the envelope path.
    const envelopeWrites = writeSpy.mock.calls.filter(
      ([p]) => p === 'specs/foo/idea.md',
    )
    expect(envelopeWrites).toHaveLength(0)
    // The original content must remain untouched.
    expect(await ports.vault.readFile('specs/foo/idea.md')).toBe('old body')
  })
})

describe('commitFileWriteProposal — folder hint (T-ASM-065 / TEST-ASM-045)', () => {
  let ports: FakePorts

  beforeEach(() => {
    ports = fakeModulePorts()
  })

  it('calls createFolder for the folderHint before writeFile', async () => {
    const createFolderSpy = vi.spyOn(ports.vault, 'createFolder')
    const writeSpy = vi.spyOn(ports.vault, 'writeFile')
    const proposal = makeProposal({
      path: 'specs/new-feature/idea.md',
      folderHint: 'specs/new-feature',
    })
    const deps = makeDeps(ports)

    const result = await commitFileWriteProposal(proposal, makeThread(), deps)
    expect(result.ok).toBe(true)

    // createFolder must have been called with the hint.
    const hintCalls = createFolderSpy.mock.invocationCallOrder.filter(
      (_order, i) => createFolderSpy.mock.calls[i]?.[0] === 'specs/new-feature',
    )
    expect(hintCalls.length).toBeGreaterThanOrEqual(1)
    const envelopeWriteCallIndex = writeSpy.mock.calls.findIndex(
      ([p]) => p === 'specs/new-feature/idea.md',
    )
    expect(envelopeWriteCallIndex).toBeGreaterThanOrEqual(0)
    const envelopeWriteOrder = writeSpy.mock.invocationCallOrder[envelopeWriteCallIndex]
    // The folder-hint createFolder ran before the envelope write.
    expect(Math.min(...hintCalls)).toBeLessThan(envelopeWriteOrder)
  })

  it('skips createFolder when folderHint is absent or empty', async () => {
    const createFolderSpy = vi.spyOn(ports.vault, 'createFolder')
    const proposal = makeProposal({ path: 'specs/foo/idea.md', folderHint: '' })
    const deps = makeDeps(ports)

    const result = await commitFileWriteProposal(proposal, makeThread(), deps)
    expect(result.ok).toBe(true)

    // No `createFolder('')` call. The SessionLogWriter may still create its
    // parent folder, so we filter specifically for the empty-hint pattern.
    expect(
      createFolderSpy.mock.calls.some(([p]) => p === ''),
    ).toBe(false)
  })
})

/* -------------------------------------------------------------------------- */
/* T-ASM-066 — Failure modes + audit row                                      */
/* -------------------------------------------------------------------------- */

describe('commitFileWriteProposal — error codes (T-ASM-066)', () => {
  let ports: FakePorts

  beforeEach(() => {
    ports = fakeModulePorts()
  })

  it('returns OVERWRITE_CANCELLED when the user cancels the modal and skips the write', async () => {
    await ports.bridge.writeFile('specs/foo/idea.md', 'old')
    const modal = new MockConfirmModalPort() // nextResult = false
    const deps = makeDeps(ports, { confirmModal: modal })
    const writeSpy = vi.spyOn(ports.vault, 'writeFile')
    const proposal = makeProposal({ path: 'specs/foo/idea.md' })

    const result = await commitFileWriteProposal(proposal, makeThread(), deps)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.errorCode).toBe('OVERWRITE_CANCELLED')
    // The envelope write was suppressed.
    expect(writeSpy.mock.calls.filter(([p]) => p === 'specs/foo/idea.md')).toHaveLength(0)
  })

  it('returns FOLDER_CREATE_FAILED when createFolder for the hint throws', async () => {
    const proposal = makeProposal({
      path: 'specs/new/idea.md',
      folderHint: 'specs/new',
    })
    const failingVault = {
      ...ports.vault,
      fileExists: ports.vault.fileExists.bind(ports.vault),
      readFile: ports.vault.readFile.bind(ports.vault),
      writeFile: vi.fn<typeof ports.vault.writeFile>(),
      createFolder: vi.fn(async (p: string) => {
        if (p === 'specs/new') throw new Error('boom: folder create denied')
        // The session-log writer also creates folders — let those succeed.
      }),
      deleteFile: ports.vault.deleteFile.bind(ports.vault),
      listFiles: ports.vault.listFiles.bind(ports.vault),
      listFolders: ports.vault.listFolders.bind(ports.vault),
    }
    const deps = makeDeps(ports, { vault: failingVault })

    const result = await commitFileWriteProposal(proposal, makeThread(), deps)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.errorCode).toBe('FOLDER_CREATE_FAILED')
    // writeFile must NOT have been called for the envelope path after a
    // failed folder hint.
    expect(
      failingVault.writeFile.mock.calls.some(([p]) => p === 'specs/new/idea.md'),
    ).toBe(false)
  })

  it('returns WRITE_FAILED when vault.writeFile throws on the envelope path and appends a failed audit row (Codex P2 fix)', async () => {
    const proposal = makeProposal({
      path: 'specs/foo/idea.md',
      content: 'body',
      rationale: 'because-spec',
    })
    // Track every appendProposalDecision call against a real SessionLogWriter
    // so we can verify the failed audit row is appended without coupling to
    // the underlying vault wire format. The vault.writeFile remains spied to
    // make the envelope write fail.
    const sessionLog = new SessionLogWriter(
      ports.vault,
      ports.logger,
      'specs',
      () => FIXED_NOW,
    )
    const appendSpy = vi.spyOn(sessionLog, 'appendProposalDecision')
    const writeSpy = vi
      .spyOn(ports.vault, 'writeFile')
      .mockImplementationOnce(async () => {
        throw new Error('boom: disk full')
      })
    const deps = makeDeps(ports, { sessionLog })

    const result = await commitFileWriteProposal(proposal, makeThread(), deps)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.errorCode).toBe('WRITE_FAILED')
    expect(result.error.cause).toBeInstanceOf(Error)
    expect(writeSpy.mock.calls[0]?.[0]).toBe('specs/foo/idea.md')

    // Codex P2 — trust-first invariant: a failed terminal state must still
    // mirror to the audit log so the session history reflects the decided
    // outcome. The audit row carries `decision: failed` plus the rationale.
    expect(appendSpy).toHaveBeenCalledTimes(1)
    const args = appendSpy.mock.calls[0][0]
    expect(args.decision).toBe('failed')
    expect(args.proposal.envelope.path).toBe('specs/foo/idea.md')
    expect(args.proposal.envelope.rationale).toBe('because-spec')
  })

  it('WRITE_FAILED is preserved even when the failed-audit-row append itself fails (P2 best-effort)', async () => {
    const proposal = makeProposal({ path: 'specs/foo/idea.md', content: 'body' })
    const sessionLog = new SessionLogWriter(
      ports.vault,
      ports.logger,
      'specs',
      () => FIXED_NOW,
    )
    // Both the envelope write AND the audit-row append fail. The original
    // WRITE_FAILED code must NOT be overridden — the audit row append is
    // best-effort in this terminal branch.
    vi.spyOn(ports.vault, 'writeFile').mockRejectedValue(new Error('boom: disk full'))
    vi.spyOn(sessionLog, 'appendProposalDecision').mockRejectedValueOnce(
      new Error('audit row offline'),
    )
    const deps = makeDeps(ports, { sessionLog })

    const result = await commitFileWriteProposal(proposal, makeThread(), deps)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.errorCode).toBe('WRITE_FAILED')
  })

  it('returns SESSION_LOG_FAILED when the audit-row append rejects', async () => {
    const proposal = makeProposal({
      path: 'specs/foo/idea.md',
      content: 'body',
      rationale: 'because',
    })
    // Stub SessionLogWriter.appendProposalDecision to reject.
    const sessionLog = new SessionLogWriter(
      ports.vault,
      ports.logger,
      'specs',
      () => FIXED_NOW,
    )
    vi.spyOn(sessionLog, 'appendProposalDecision').mockRejectedValueOnce(
      new Error('boom: log offline'),
    )
    const deps = makeDeps(ports, { sessionLog })

    const result = await commitFileWriteProposal(proposal, makeThread(), deps)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.errorCode).toBe('SESSION_LOG_FAILED')
    // The vault write succeeded before the audit-row write was attempted —
    // §3.6 step 4 explicitly notes the write is not rolled back.
    expect(await ports.vault.readFile('specs/foo/idea.md')).toBe('body')
  })
})

describe('commitFileWriteProposal — audit row (T-ASM-066 / TEST-ASM-044)', () => {
  let ports: FakePorts

  beforeEach(() => {
    ports = fakeModulePorts()
  })

  it('appends a ## proposal block with path, decision, decided_at, and rationale (accepted)', async () => {
    const proposal = makeProposal({
      path: 'specs/foo/idea.md',
      content: 'body',
      rationale: 'because spec says so',
    })
    const thread = makeThread()
    const deps = makeDeps(ports)

    const result = await commitFileWriteProposal(proposal, thread, deps)
    expect(result.ok).toBe(true)

    const logPath = resolveSessionLogPath(thread.feature, thread.sessionId!, 'specs')
    const log = await ports.vault.readFile(logPath)
    expect(log).toContain('## proposal')
    expect(log).toContain(`- path: specs/foo/idea.md`)
    expect(log).toContain(`- decision: accepted`)
    expect(log).toContain(`- decided_at: ${FIXED_NOW}`)
    expect(log).toContain(`- rationale: because spec says so`)
  })

  it('records a rejected audit row when the user cancels the overwrite modal', async () => {
    await ports.bridge.writeFile('specs/foo/idea.md', 'old')
    const modal = new MockConfirmModalPort() // nextResult = false
    const thread = makeThread()
    const deps = makeDeps(ports, { confirmModal: modal })
    const proposal = makeProposal({
      path: 'specs/foo/idea.md',
      rationale: 'considered overwrite',
    })

    const result = await commitFileWriteProposal(proposal, thread, deps)
    expect(result.ok).toBe(false)

    const logPath = resolveSessionLogPath(thread.feature, thread.sessionId!, 'specs')
    const log = await ports.vault.readFile(logPath)
    expect(log).toContain('## proposal')
    expect(log).toContain(`- decision: rejected`)
    expect(log).toContain(`- path: specs/foo/idea.md`)
  })
})

/* -------------------------------------------------------------------------- */
/* T-ASM-067 — rejectFileWriteProposal                                        */
/* -------------------------------------------------------------------------- */

describe('rejectFileWriteProposal (T-ASM-067 / REQ-ASM-045)', () => {
  let ports: FakePorts

  beforeEach(() => {
    ports = fakeModulePorts()
  })

  it('appends a rejected audit row and never touches the vault as a mutation', async () => {
    const proposal = makeProposal({
      path: 'specs/foo/idea.md',
      rationale: 'looks risky',
    })
    const thread = makeThread()
    const writeSpy = vi.spyOn(ports.vault, 'writeFile')
    const createFolderSpy = vi.spyOn(ports.vault, 'createFolder')
    const deleteFileSpy = vi.spyOn(ports.vault, 'deleteFile')
    const sessionLog = new SessionLogWriter(
      ports.vault,
      ports.logger,
      'specs',
      () => FIXED_NOW,
    )

    await rejectFileWriteProposal(proposal, thread, {
      sessionLog,
      logger: ports.logger,
      nowIso: () => FIXED_NOW,
    })

    // The session log itself uses writeFile internally to persist its file.
    // The trust-first invariant we assert here is: **no write to the envelope
    // path** and **no createFolder of the envelope's parent**.
    expect(writeSpy.mock.calls.some(([p]) => p === 'specs/foo/idea.md')).toBe(false)
    expect(createFolderSpy.mock.calls.some(([p]) => p === 'specs/foo')).toBe(false)
    expect(deleteFileSpy).not.toHaveBeenCalled()

    // The audit row landed.
    const logPath = resolveSessionLogPath(thread.feature, thread.sessionId!, 'specs')
    const log = await ports.vault.readFile(logPath)
    expect(log).toContain('## proposal')
    expect(log).toContain(`- decision: rejected`)
    expect(log).toContain(`- path: specs/foo/idea.md`)
    expect(log).toContain(`- rationale: looks risky`)
    expect(log).toContain(`- decided_at: ${FIXED_NOW}`)
  })

  it('does not throw when the audit-row append fails; routes to logger.error', async () => {
    const proposal = makeProposal({ path: 'specs/foo/idea.md' })
    const thread = makeThread()
    const sessionLog = new SessionLogWriter(
      ports.vault,
      ports.logger,
      'specs',
      () => FIXED_NOW,
    )
    vi.spyOn(sessionLog, 'appendProposalDecision').mockRejectedValueOnce(
      new Error('boom: log offline'),
    )

    await expect(
      rejectFileWriteProposal(proposal, thread, {
        sessionLog,
        logger: ports.logger,
        nowIso: () => FIXED_NOW,
      }),
    ).resolves.toBeUndefined()

    expect(ports.logger.error).toHaveBeenCalled()
  })
})
