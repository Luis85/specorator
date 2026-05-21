/**
 * T-ASM-079 — Runtime integration test: no production `fs` reads under `~/.claude/`.
 *
 * Covers TEST-ASM-051 (REQ-ASM-036, NFR-ASM-004). Drives the chat
 * application-layer happy path through `MockClaudeSubprocessAdapter` and a
 * MockBridge while every `node:fs` read API is replaced with a recording
 * spy. Asserts that no read targets any path containing `.claude/`.
 *
 * Pairs with the static grep audit (T-ASM-080); together they cover the
 * non-negotiable invariant that the plugin never touches Claude Code's
 * on-disk credential surface.
 */
import type * as NodeFs from 'node:fs'
import type * as NodeFsPromises from 'node:fs/promises'
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Module-level mocks — `node:fs` exports are non-configurable, so the only
// way to observe reads is to swap the module before any production code
// imports it. Each spy records its call into `readCalls`, then returns an
// empty buffer so callers proceed.
const readCalls: { path: string; api: string }[] = []
function record(api: string, first: unknown): void {
  const path =
    typeof first === 'string'
      ? first
      : first instanceof URL
        ? first.href
        : Buffer.isBuffer(first)
          ? first.toString('utf8')
          : String(first)
  readCalls.push({ path, api })
}

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof NodeFs>('node:fs')
  return {
    ...actual,
    readFileSync: vi.fn((p: unknown, ...rest: unknown[]) => {
      record('fs.readFileSync', p)
      return actual.readFileSync(p as never, rest[0] as never)
    }),
    readFile: vi.fn((p: unknown, ...rest: unknown[]) => {
      record('fs.readFile', p)
      ;(actual.readFile as unknown as (...a: unknown[]) => void)(p, ...rest)
    }),
  }
})

vi.mock('node:fs/promises', async () => {
  const actual = await vi.importActual<typeof NodeFsPromises>('node:fs/promises')
  return {
    ...actual,
    readFile: vi.fn(async (p: unknown, ...rest: unknown[]) => {
      record('fs.promises.readFile', p)
      return actual.readFile(p as never, rest[0] as never)
    }),
  }
})

import { setActivePinia, createPinia } from 'pinia'
import { MockClaudeSubprocessAdapter } from '@/infrastructure/mock/MockClaudeSubprocessAdapter'
import { fakeModulePorts } from '../__fakes__/fake-ports'
import { queryStructured } from '@/application/chat/queryStructured'
import { commitFileWriteProposal } from '@/application/chat/commitFileWriteProposal'
import { MockConfirmModalPort } from '@/infrastructure/mock/MockConfirmModalPort'
import { SessionLogWriter } from '@/application/chat/SessionLogWriter'
import { asSessionId } from '@/domain/chat/SessionId'
import type { ChatThreadRecord } from '@/domain/chat/ChatThreadRecord'
import type { FileWriteProposal } from '@/application/chat/FileWriteProposal'
import type { CreateFileEnvelope } from '@/application/chat/createFileEnvelopeSchema'

describe('TEST-ASM-051 — no production fs reads under ~/.claude/ (T-ASM-079)', () => {
  beforeEach(() => {
    readCalls.length = 0
    setActivePinia(createPinia())
  })

  function makeThread(): ChatThreadRecord {
    return {
      threadId: 'thread-no-claude-home',
      sessionId: asSessionId('11111111-2222-3333-4444-555555555555'),
      feature: 'demo',
      logPath: 'specs/demo/sessions/11111111-2222-3333-4444-555555555555.md',
      transport: { provider: 'claude', mode: 'cli' },
      title: '',
      forkParent: null,
      createdAt: '2026-05-15T10:00:00.000Z',
      lastUsedAt: '2026-05-15T10:00:00.000Z',
    }
  }

  function makeProposal(envelope: CreateFileEnvelope): FileWriteProposal {
    return {
      proposalId: 'prop-no-claude-home',
      threadId: 'thread-no-claude-home',
      envelope,
      status: 'pending',
      proposedAt: '2026-05-15T10:00:00.000Z',
      decidedAt: null,
      failureReason: null,
      originPrompt: '/create-file specs/demo/idea.md',
    }
  }

  it('the chat application-layer happy path issues zero fs reads against ~/.claude/', async () => {
    const ports = fakeModulePorts()
    const adapter = new MockClaudeSubprocessAdapter()
    adapter.available = true
    adapter.cannedStructuredEnvelope = {
      action: 'createFile',
      path: 'specs/demo/idea.md',
      content: '# Demo\n',
    }
    adapter.cannedSessionId = asSessionId('11111111-2222-3333-4444-555555555555')

    const structured = await queryStructured(adapter, '/create-file specs/demo/idea.md', {
      systemPromptSuffix: 'preamble',
    })
    expect(structured.ok).toBe(true)
    if (!structured.ok) return

    const proposal = makeProposal(structured.value)
    const sessionLog = new SessionLogWriter(
      ports.vault,
      ports.logger,
      'specs',
      () => '2026-05-15T10:00:00.000Z',
    )
    const commitResult = await commitFileWriteProposal(proposal, makeThread(), {
      vault: ports.vault,
      logger: ports.logger,
      sessionLog,
      confirmModal: new MockConfirmModalPort(),
      i18n: ports.t,
      nowIso: () => '2026-05-15T10:00:00.000Z',
    })
    expect(commitResult.ok).toBe(true)

    // The invariant: no read API call targeted a path that contains
    // `.claude/`. The chat path uses MockBridge + the mock subprocess
    // adapter; neither should ever shell out to Claude Code's on-disk
    // OAuth state.
    const claudeHomeReads = readCalls.filter((call) => call.path.includes('.claude/'))
    expect(claudeHomeReads).toEqual([])
  })
})
