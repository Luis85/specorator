/**
 * T-MHP-015 — `workflow_proposal_*` MCP tool registrar tests (FAILING-FIRST, TDD).
 *
 * Owner: qa. Drives the contract for the 4-tool registrar at
 * `src/infrastructure/obsidian/mcp/registerWorkflowProposalTools.ts`
 * declared in SPEC-MHP-001..004.
 *
 * Satisfies:
 *   - REQ-MHP-001 (workflow_proposal_list returns pending-only snapshot)
 *   - REQ-MHP-002 (workflow_proposal_get returns full record)
 *   - REQ-MHP-003 (get on unknown id → not_found)
 *   - REQ-MHP-004 (accept commits via mutate)
 *   - REQ-MHP-005 (reject discards without mutate)
 *   - REQ-MHP-006 (per-id mutex; already_decided on second decision)
 *   - REQ-MHP-007 (already_decided carries priorDecision)
 *   - REQ-MHP-045(d) (not_found on accept/reject writes error audit row)
 *   - REQ-MHP-034..036 (client.id capture via McpClientIdentifier)
 * Covers TEST-MHP-001..005, TEST-MHP-007, TEST-MHP-008.
 *
 * TDD invariant: imports the unimplemented registrar module. Vitest fails at
 * module resolution until T-MHP-016 lands.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

import { registerWorkflowProposalTools } from '@/infrastructure/obsidian/mcp/registerWorkflowProposalTools'
import { ProposalStore } from '@/infrastructure/obsidian/ProposalStore'
import { ProposalEventBus } from '@/infrastructure/events/ProposalEventBus'
import type { AuditRow, ClientIdentity } from '@/domain/mcp/Proposal'
import type { LoggerPort } from '@/domain/ports/LoggerPort'
import { ok, type Result } from '@/domain/shared/Result'

// --- Fakes ----------------------------------------------------------------

interface RegisteredTool {
  name: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  schema?: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler?: (input: any) => Promise<unknown>
}

/**
 * Minimal MCP-server stub. The four-tool registrar may invoke either
 * `registerTool(name, descriptor, handler)` (live SDK shape used by sibling
 * registrars) or the lighter `tool(name, schema, handler)` shape used by
 * `registerObsidianCliReadTools`. The stub captures both.
 */
function makeMcpServerStub(): {
  registered: RegisteredTool[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  server: any
} {
  const registered: RegisteredTool[] = []
  const server = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerTool: (name: string, descriptor: any, handler: any): void => {
      registered.push({ name, schema: descriptor, handler })
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tool: (name: string, schema: any, handler: any): void => {
      registered.push({ name, schema, handler })
    },
  }
  return { registered, server }
}

class FakeAuditLog {
  readonly rows: AuditRow[] = []
  async append(row: AuditRow): Promise<Result<void, Error>> {
    this.rows.push(row)
    return ok(undefined)
  }
}

const EXTERNAL_IDENTITY: ClientIdentity = {
  id: 'claude-desktop',
  transport: 'loopback',
  address: '127.0.0.1:0',
}

function buildLogger(): LoggerPort {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}

function buildStore(args: { client?: ClientIdentity } = {}) {
  const logger = buildLogger()
  const eventBus = new ProposalEventBus({ logger })
  const auditLog = new FakeAuditLog()
  const clientIdentifier = {
    identityFor(_connectionId: string): ClientIdentity {
      return args.client ?? EXTERNAL_IDENTITY
    },
  }
  const store = new ProposalStore({ eventBus, auditLog, clientIdentifier, logger })
  return { store, auditLog, logger, clientIdentifier }
}

/**
 * Find a registered tool by name and invoke its handler with the given input,
 * extracting the JSON payload from the MCP `content` envelope when present.
 */
async function callTool(
  registered: RegisteredTool[],
  name: string,
  input: Record<string, unknown>,
): Promise<unknown> {
  const entry = registered.find((t) => t.name === name)
  if (!entry?.handler) throw new Error(`Tool ${name} not registered`)
  const raw: unknown = await entry.handler(input)
  if (
    raw !== null &&
    typeof raw === 'object' &&
    'content' in raw &&
    Array.isArray((raw as { content: unknown[] }).content)
  ) {
    const envelope = raw as { content: Array<{ type: string; text: string }> }
    return JSON.parse(envelope.content[0].text) as unknown
  }
  return raw
}

// --- Tests ---------------------------------------------------------------

describe('registerWorkflowProposalTools (SPEC-MHP-001..004)', () => {
  let registered: RegisteredTool[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let server: any
  let deps: ReturnType<typeof buildStore>

  beforeEach(() => {
    const stub = makeMcpServerStub()
    registered = stub.registered
    server = stub.server
    deps = buildStore()
    registerWorkflowProposalTools(server, deps.store, deps.clientIdentifier)
  })

  it('registers exactly the 4 workflow_proposal_* tools', () => {
    const names = registered.map((t) => t.name).sort()
    expect(names).toEqual([
      'workflow_proposal_accept',
      'workflow_proposal_get',
      'workflow_proposal_list',
      'workflow_proposal_reject',
    ])
  })

  describe('workflow_proposal_list (SPEC-MHP-001 / REQ-MHP-001)', () => {
    it('returns empty proposals array when none pending', async () => {
      const result = (await callTool(registered, 'workflow_proposal_list', {})) as {
        proposals: unknown[]
      }
      expect(result.proposals).toEqual([])
    })

    it('returns pending-only entries in enqueue order', async () => {
      const r1 = deps.store.tryQueue('vault_write_note', { path: 'a.md' }, async () => {})
      const r2 = deps.store.tryQueue('vault_append_to_note', { path: 'b.md' }, async () => {})
      const r3 = deps.store.tryQueue('vault_write_note', { path: 'c.md' }, async () => {})
      if (!r1.ok || !r2.ok || !r3.ok) throw new Error('seed queue failed')

      // Decide the middle one — it must NOT appear in `list`.
      await deps.store.rejectBy(r2.value.proposalId, {
        outcome: 'rejected',
        by: 'client',
        rule: '',
        at: new Date().toISOString(),
      })

      const result = (await callTool(registered, 'workflow_proposal_list', {})) as {
        proposals: Array<{ proposalId: string; status: string }>
      }
      expect(result.proposals).toHaveLength(2)
      expect(result.proposals.map((p) => p.proposalId)).toEqual([
        r1.value.proposalId,
        r3.value.proposalId,
      ])
      for (const p of result.proposals) {
        expect(p.status).toBe('pending')
      }
    })

    it('does NOT write an audit row for the list read', async () => {
      const r = deps.store.tryQueue('vault_write_note', { path: 'a.md' }, async () => {})
      if (!r.ok) throw new Error('seed queue failed')
      await callTool(registered, 'workflow_proposal_list', {})
      expect(deps.auditLog.rows).toHaveLength(0)
    })
  })

  describe('workflow_proposal_get (SPEC-MHP-002 / REQ-MHP-002..003)', () => {
    it('returns the full record for a known proposalId', async () => {
      const q = deps.store.tryQueue('vault_write_note', { path: 'a.md' }, async () => {})
      if (!q.ok) throw new Error('seed queue failed')
      const result = (await callTool(registered, 'workflow_proposal_get', {
        proposalId: q.value.proposalId,
      })) as { proposalId: string; status: string; tool: string }
      expect(result.proposalId).toBe(q.value.proposalId)
      expect(result.status).toBe('pending')
      expect(result.tool).toBe('vault_write_note')
    })

    it('returns error proposal_not_found for unknown proposalId (REQ-MHP-003)', async () => {
      const result = (await callTool(registered, 'workflow_proposal_get', {
        proposalId: '00000000-0000-0000-0000-000000000000',
      })) as { error: string }
      expect(result.error).toBe('proposal_not_found')
    })

    it('does NOT write an audit row for the get read (SPEC-MHP-002 post-condition)', async () => {
      const q = deps.store.tryQueue('vault_write_note', { path: 'a.md' }, async () => {})
      if (!q.ok) throw new Error('seed queue failed')
      await callTool(registered, 'workflow_proposal_get', { proposalId: q.value.proposalId })
      expect(deps.auditLog.rows).toHaveLength(0)
    })
  })

  describe('workflow_proposal_accept (SPEC-MHP-003 / REQ-MHP-004,006,007,008)', () => {
    it('on pending: invokes mutate, returns ok + decision, writes one audit row', async () => {
      const mutate = vi.fn().mockResolvedValue(undefined)
      const q = deps.store.tryQueue('vault_write_note', { path: 'a.md' }, mutate)
      if (!q.ok) throw new Error('seed queue failed')

      const result = (await callTool(registered, 'workflow_proposal_accept', {
        proposalId: q.value.proposalId,
      })) as { ok: boolean; decision: { outcome: string; by: string } }

      expect(mutate).toHaveBeenCalledTimes(1)
      expect(result.ok).toBe(true)
      expect(result.decision.outcome).toBe('accepted')
      expect(deps.auditLog.rows).toHaveLength(1)
      expect(deps.auditLog.rows[0].decision.outcome).toBe('accepted')
    })

    it('on already-decided: returns already_decided with priorDecision (REQ-MHP-007)', async () => {
      const q = deps.store.tryQueue('vault_write_note', { path: 'a.md' }, async () => {})
      if (!q.ok) throw new Error('seed queue failed')

      // First accept commits.
      await callTool(registered, 'workflow_proposal_accept', {
        proposalId: q.value.proposalId,
      })

      // Second accept must report already_decided + carry priorDecision.
      const second = (await callTool(registered, 'workflow_proposal_accept', {
        proposalId: q.value.proposalId,
      })) as { error: string; priorDecision?: { outcome: string } }

      expect(second.error).toBe('already_decided')
      expect(second.priorDecision?.outcome).toBe('accepted')
    })

    it('captures client.id from McpClientIdentifier on the decision (REQ-MHP-034..036, REQ-MHP-040)', async () => {
      // Custom identity for this test.
      const myIdentity: ClientIdentity = {
        id: 'cursor',
        transport: 'loopback',
        address: '127.0.0.1:42',
      }
      const stub = makeMcpServerStub()
      const local = buildStore({ client: myIdentity })
      registerWorkflowProposalTools(stub.server, local.store, local.clientIdentifier)

      const q = local.store.tryQueue('vault_write_note', { path: 'a.md' }, async () => {})
      if (!q.ok) throw new Error('seed queue failed')
      await callTool(stub.registered, 'workflow_proposal_accept', {
        proposalId: q.value.proposalId,
      })
      expect(local.auditLog.rows).toHaveLength(1)
      expect(local.auditLog.rows[0].client.id).toBe('cursor')
    })

    it('on unknown id: writes one error audit row (REQ-MHP-045(d))', async () => {
      const result = (await callTool(registered, 'workflow_proposal_accept', {
        proposalId: '00000000-0000-0000-0000-000000000000',
      })) as { error: string }
      expect(result.error).toBe('not_found')
      expect(deps.auditLog.rows).toHaveLength(1)
      expect(deps.auditLog.rows[0].result.ok).toBe(false)
    })
  })

  describe('workflow_proposal_reject (SPEC-MHP-004 / REQ-MHP-005,007)', () => {
    it('on pending: no mutate, returns ok + decision rejected, writes one audit row', async () => {
      const mutate = vi.fn().mockResolvedValue(undefined)
      const q = deps.store.tryQueue('vault_write_note', { path: 'a.md' }, mutate)
      if (!q.ok) throw new Error('seed queue failed')

      const result = (await callTool(registered, 'workflow_proposal_reject', {
        proposalId: q.value.proposalId,
      })) as { ok: boolean; decision: { outcome: string } }

      expect(mutate).not.toHaveBeenCalled()
      expect(result.ok).toBe(true)
      expect(result.decision.outcome).toBe('rejected')
      expect(deps.auditLog.rows).toHaveLength(1)
      expect(deps.auditLog.rows[0].decision.outcome).toBe('rejected')
    })

    it('on already-decided: returns already_decided with priorDecision', async () => {
      const q = deps.store.tryQueue('vault_write_note', { path: 'a.md' }, async () => {})
      if (!q.ok) throw new Error('seed queue failed')
      await callTool(registered, 'workflow_proposal_reject', { proposalId: q.value.proposalId })

      const second = (await callTool(registered, 'workflow_proposal_reject', {
        proposalId: q.value.proposalId,
      })) as { error: string; priorDecision?: { outcome: string } }
      expect(second.error).toBe('already_decided')
      expect(second.priorDecision?.outcome).toBe('rejected')
    })

    it('on unknown id: writes one error audit row (REQ-MHP-045(d))', async () => {
      const result = (await callTool(registered, 'workflow_proposal_reject', {
        proposalId: '00000000-0000-0000-0000-000000000000',
      })) as { error: string }
      expect(result.error).toBe('not_found')
      expect(deps.auditLog.rows).toHaveLength(1)
    })
  })
})
