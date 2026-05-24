/**
 * T-MHP-010 — `ProposalStore` extended-surface tests.
 *
 * Spec: SPEC-MHP-034 (extended public surface); SPEC-MHP-003/-004 (accept/reject behaviour).
 * Satisfies:
 *   - REQ-MHP-006  (single-accept invariant under concurrent acceptBy)
 *   - REQ-MHP-007  (already_decided carries prior decision)
 *   - REQ-MHP-008  (accept commits via mutate; reject discards)
 *   - REQ-MHP-038  (shutdown discard path writes one audit row per pending)
 *   - REQ-MHP-039  (one audit row per terminal outcome)
 *   - REQ-MHP-040  (decision.by provenance: user / client / shutdown)
 *   - REQ-MHP-042  (queue cap 1000 → queue_full)
 *   - REQ-MHP-044  (post-accept failure: status=error + audit row outcome=error + write_failed)
 *   - REQ-MHP-045(a/d)  (error-row triggers + LoggerPort.warn)
 *   - REQ-MHP-046  (event-bus emission: proposalEnqueued on queue, proposalDecided on terminal)
 *   - SPEC-MHP-035 (AuditLogWriter wiring; one row before MCP response returns)
 *
 * The tests target the extended store surface authored in T-MHP-011 and the
 * audit-wiring closed in T-MHP-013. The pre-existing tests at
 * `tests/infrastructure/proposal-store.test.ts` are NOT touched — they verify
 * the deprecated arity-preserving surface and must continue to pass.
 */
import { describe, it, expect, vi } from 'vitest'
import { ProposalStore } from '@/infrastructure/obsidian/ProposalStore'
import { ProposalEventBus } from '@/infrastructure/events/ProposalEventBus'
import type {
  AuditRow,
  ClientIdentity,
  ProposalDecision,
  ProposalEnqueuedEvent,
  ProposalDecidedEvent,
} from '@/domain/mcp/Proposal'
import type { LoggerPort } from '@/domain/ports/LoggerPort'
import { ok, type Result } from '@/domain/shared/Result'

// --- Fakes ----------------------------------------------------------------

class AuditWriteError extends Error {
  readonly kind = 'filesystem' as const
}

/**
 * Tiny in-memory audit writer that mirrors the SPEC-MHP-035 contract: an async
 * `append(row): Promise<Result<void, Error>>`. The rows are captured in order so
 * the test can assert exactly-one-row-per-terminal invariants.
 */
function makeAuditLog() {
  const rows: AuditRow[] = []
  const failureScript: Array<(row: AuditRow) => Result<void, AuditWriteError> | undefined> = []
  return {
    rows,
    /** Push a synchronous override that returns a custom Result for the next call. */
    queueFailure(fn: (row: AuditRow) => Result<void, AuditWriteError>): void {
      failureScript.push(fn)
    },
    async append(row: AuditRow): Promise<Result<void, AuditWriteError>> {
      const next = failureScript.shift()
      if (next !== undefined) {
        const r = next(row)
        if (r !== undefined) return r
      }
      rows.push(row)
      return ok(undefined)
    },
  }
}

function makeClientIdentifier(identity: ClientIdentity) {
  return {
    identityFor(_connectionId: string): ClientIdentity {
      return identity
    },
  }
}

const EXTERNAL_IDENTITY: ClientIdentity = {
  id: 'claude-desktop',
  transport: 'loopback',
  address: '127.0.0.1:0',
}

interface NewStoreArgs {
  readonly client?: ClientIdentity
  readonly autoAccept?: boolean
}

function buildStore(args: NewStoreArgs = {}) {
  const warn = vi.fn()
  const error = vi.fn()
  const logger: LoggerPort = {
    debug: vi.fn(),
    info: vi.fn(),
    warn,
    error,
  }
  const eventBus = new ProposalEventBus({ logger })
  const auditLog = makeAuditLog()
  const clientIdentifier = makeClientIdentifier(args.client ?? EXTERNAL_IDENTITY)
  const enqueuedEvents: ProposalEnqueuedEvent[] = []
  const decidedEvents: ProposalDecidedEvent[] = []
  eventBus.on('proposalEnqueued', (p) => enqueuedEvents.push(p))
  eventBus.on('proposalDecided', (p) => decidedEvents.push(p))
  const store = new ProposalStore({ eventBus, auditLog, clientIdentifier, logger })
  /** Sugar over `tryQueue`: the test never expects the capacity branch. */
  const enqueue = (
    tool: string,
    params: unknown,
    mutate: () => Promise<void> = async () => undefined,
  ): string => {
    const r = store.tryQueue(tool, params, mutate)
    if (!r.ok) throw new Error(`unexpected enqueue failure: ${r.error.code}`)
    return r.value.proposalId
  }
  return {
    store,
    enqueue,
    logger: { warn, error },
    eventBus,
    auditLog,
    enqueuedEvents,
    decidedEvents,
  }
}

// --- T-MHP-010 — extended-surface tests -----------------------------------

describe('ProposalStore extended surface (SPEC-MHP-034)', () => {
  // ---- acceptBy shape -----------------------------------------------------

  describe('acceptBy() (REQ-MHP-008, REQ-MHP-039)', () => {
    it('returns ok with the AuditRow on the success path', async () => {
      const { store, enqueue, auditLog } = buildStore()
      const id = enqueue('vault_write_note', { path: 'a.md' }, async () => undefined)
      const decision: ProposalDecision = {
        outcome: 'accepted',
        by: 'client',
        rule: '',
        at: '2026-05-24T00:00:00.000Z',
      }
      const result = await store.acceptBy(id, decision)
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.value.proposal.id).toBe(id)
      expect(result.value.decision.outcome).toBe('accepted')
      expect(result.value.decision.by).toBe('client')
      expect(result.value.result.ok).toBe(true)
      expect(auditLog.rows).toHaveLength(1)
      expect(auditLog.rows[0]).toBe(result.value)
    })

    it('writes the audit row BEFORE returning the MCP response (TEST-MHP-041)', async () => {
      const { store, enqueue, auditLog } = buildStore()
      const mutate = vi.fn().mockResolvedValue(undefined)
      const id = enqueue('vault_write_note', { path: 'a.md' }, mutate)
      const decision: ProposalDecision = {
        outcome: 'accepted',
        by: 'user',
        rule: '',
        at: '2026-05-24T00:00:00.000Z',
      }
      expect(auditLog.rows).toHaveLength(0)
      await store.acceptBy(id, decision)
      // One row by the time the call has resolved.
      expect(auditLog.rows).toHaveLength(1)
      expect(mutate).toHaveBeenCalledOnce()
    })

    it('rejects unknown id with not_found AND writes one error audit row (REQ-MHP-045(d))', async () => {
      const { store, auditLog, logger } = buildStore()
      const decision: ProposalDecision = {
        outcome: 'accepted',
        by: 'client',
        rule: '',
        at: '2026-05-24T00:00:00.000Z',
      }
      const result = await store.acceptBy('no-such-id', decision)
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error.code).toBe('not_found')
      expect(auditLog.rows).toHaveLength(1)
      expect(auditLog.rows[0].decision.outcome).toBe('error')
      expect(auditLog.rows[0].result.ok).toBe(false)
      expect(logger.warn).toHaveBeenCalled()
    })
  })

  describe('rejectBy() (REQ-MHP-005, REQ-MHP-039)', () => {
    it('returns ok with the AuditRow and never invokes mutate', async () => {
      const { store, enqueue, auditLog } = buildStore()
      const mutate = vi.fn().mockResolvedValue(undefined)
      const id = enqueue('vault_write_note', { path: 'a.md' }, mutate)
      const decision: ProposalDecision = {
        outcome: 'rejected',
        by: 'user',
        rule: '',
        at: '2026-05-24T00:00:00.000Z',
      }
      const result = await store.rejectBy(id, decision)
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.value.decision.outcome).toBe('rejected')
      expect(mutate).not.toHaveBeenCalled()
      expect(auditLog.rows).toHaveLength(1)
    })

    it('rejects unknown id with not_found AND writes one error audit row', async () => {
      const { store, auditLog } = buildStore()
      const decision: ProposalDecision = {
        outcome: 'rejected',
        by: 'client',
        rule: '',
        at: '2026-05-24T00:00:00.000Z',
      }
      const result = await store.rejectBy('no-such-id', decision)
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error.code).toBe('not_found')
      expect(auditLog.rows).toHaveLength(1)
      expect(auditLog.rows[0].decision.outcome).toBe('error')
    })
  })

  // ---- Single-accept invariant & per-id mutex ----------------------------

  describe('single-accept invariant under concurrent acceptBy (REQ-MHP-006, CLAR-MHP-008)', () => {
    it('runs mutate exactly once across two concurrent acceptBy calls; second returns already_decided', async () => {
      const { store, enqueue, auditLog } = buildStore()
      const mutate = vi.fn().mockResolvedValue(undefined)
      const id = enqueue('vault_write_note', { path: 'a.md' }, mutate)
      const decisionA: ProposalDecision = {
        outcome: 'accepted',
        by: 'client',
        rule: '',
        at: '2026-05-24T00:00:00.000Z',
      }
      const decisionB: ProposalDecision = {
        outcome: 'accepted',
        by: 'user',
        rule: '',
        at: '2026-05-24T00:00:00.001Z',
      }
      const [resA, resB] = await Promise.all([
        store.acceptBy(id, decisionA),
        store.acceptBy(id, decisionB),
      ])
      expect(mutate).toHaveBeenCalledTimes(1)
      const results = [resA, resB]
      const winners = results.filter((r): r is Extract<typeof r, { ok: true }> => r.ok)
      const losers = results.filter((r): r is Extract<typeof r, { ok: false }> => !r.ok)
      expect(winners).toHaveLength(1)
      expect(losers).toHaveLength(1)
      const loser = losers[0]
      expect(loser.error.code).toBe('already_decided')
      // priorDecision is whichever decision won.
      expect(loser.error.priorDecision?.outcome).toBe('accepted')
      // Audit log has exactly one accepted row (TEST-MHP-006).
      expect(auditLog.rows.filter((r) => r.decision.outcome === 'accepted')).toHaveLength(1)
    })

    it('fuzz: 100 paired Promise.all races each invoke mutate exactly once', async () => {
      for (let i = 0; i < 100; i++) {
        const { store, enqueue } = buildStore()
        const mutate = vi.fn().mockResolvedValue(undefined)
        const id = enqueue('vault_write_note', { path: `f-${i}.md` }, mutate)
        const decision: ProposalDecision = {
          outcome: 'accepted',
          by: 'client',
          rule: '',
          at: '2026-05-24T00:00:00.000Z',
        }
        const results = await Promise.all([
          store.acceptBy(id, decision),
          store.acceptBy(id, decision),
        ])
        expect(mutate).toHaveBeenCalledTimes(1)
        const okCount = results.filter((r) => r.ok).length
        expect(okCount).toBe(1)
      }
    })

    it('second acceptBy on an already-accepted proposal returns already_decided + no extra mutate (EC-MHP-002, REQ-MHP-007)', async () => {
      const { store, enqueue, auditLog } = buildStore()
      const mutate = vi.fn().mockResolvedValue(undefined)
      const id = enqueue('vault_write_note', { path: 'a.md' }, mutate)
      const decision: ProposalDecision = {
        outcome: 'accepted',
        by: 'client',
        rule: '',
        at: '2026-05-24T00:00:00.000Z',
      }
      const first = await store.acceptBy(id, decision)
      expect(first.ok).toBe(true)
      const second = await store.acceptBy(id, decision)
      expect(second.ok).toBe(false)
      if (second.ok) return
      expect(second.error.code).toBe('already_decided')
      expect(mutate).toHaveBeenCalledTimes(1)
      // EC-MHP-002: no NEW row for the second attempt (only the original accepted row).
      expect(auditLog.rows).toHaveLength(1)
    })
  })

  // ---- Event-bus emission (REQ-MHP-046) ----------------------------------

  describe('event-bus emission (REQ-MHP-046, SPEC-MHP-040)', () => {
    it('emits proposalEnqueued on queue with the assigned client.id', () => {
      const { enqueue, enqueuedEvents } = buildStore({ client: EXTERNAL_IDENTITY })
      const id = enqueue('vault_write_note', { path: 'a.md' }, async () => undefined)
      expect(enqueuedEvents).toHaveLength(1)
      expect(enqueuedEvents[0].proposalId).toBe(id)
      expect(enqueuedEvents[0].client.id).toBe('claude-desktop')
      expect(enqueuedEvents[0].status).toBe('pending')
    })

    it('emits proposalDecided on terminal accept', async () => {
      const { store, enqueue, decidedEvents } = buildStore()
      const id = enqueue('vault_write_note', { path: 'a.md' }, async () => undefined)
      await store.acceptBy(id, {
        outcome: 'accepted',
        by: 'client',
        rule: '',
        at: '2026-05-24T00:00:00.000Z',
      })
      expect(decidedEvents).toHaveLength(1)
      expect(decidedEvents[0].proposalId).toBe(id)
      expect(decidedEvents[0].decision.outcome).toBe('accepted')
    })

    it('emits proposalDecided on terminal reject', async () => {
      const { store, enqueue, decidedEvents } = buildStore()
      const id = enqueue('vault_write_note', { path: 'a.md' }, async () => undefined)
      await store.rejectBy(id, {
        outcome: 'rejected',
        by: 'user',
        rule: '',
        at: '2026-05-24T00:00:00.000Z',
      })
      expect(decidedEvents).toHaveLength(1)
      expect(decidedEvents[0].decision.outcome).toBe('rejected')
    })

    it('emits proposalDecided with outcome:error on post-accept mutate failure', async () => {
      const { store, enqueue, decidedEvents } = buildStore()
      const id = enqueue('vault_write_note', { path: 'a.md' }, async () => {
        throw new Error('disk full')
      })
      await store.acceptBy(id, {
        outcome: 'accepted',
        by: 'client',
        rule: '',
        at: '2026-05-24T00:00:00.000Z',
      })
      expect(decidedEvents).toHaveLength(1)
      expect(decidedEvents[0].decision.outcome).toBe('error')
    })
  })

  // ---- Post-accept failure (REQ-MHP-044, EC-MHP-007) ---------------------

  describe('post-accept mutate failure (REQ-MHP-044, REQ-MHP-045(a), CLAR-MHP-011)', () => {
    it('transitions status to error, writes one error audit row, returns write_failed', async () => {
      const { store, enqueue, auditLog, logger } = buildStore()
      const id = enqueue('vault_write_note', { path: 'a.md' }, async () => {
        throw new Error('disk full')
      })
      const result = await store.acceptBy(id, {
        outcome: 'accepted',
        by: 'client',
        rule: '',
        at: '2026-05-24T00:00:00.000Z',
      })
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error.code).toBe('write_failed')
      expect(result.error.proposalId).toBe(id)
      expect(auditLog.rows).toHaveLength(1)
      expect(auditLog.rows[0].decision.outcome).toBe('error')
      expect(auditLog.rows[0].result.ok).toBe(false)
      expect(auditLog.rows[0].result.error).toContain('disk full')
      expect(logger.warn).toHaveBeenCalled()
      // EC-MHP-007: proposal still retrievable via _get until shutdown.
      const snapshot = store.get(id)
      expect(snapshot?.status).toBe('error')
    })

    it('decision.by on the error row carries the deciding party (auto/user/client)', async () => {
      const { store, enqueue, auditLog } = buildStore()
      const id = enqueue('vault_write_note', { path: 'a.md' }, async () => {
        throw new Error('boom')
      })
      await store.acceptBy(id, {
        outcome: 'accepted',
        by: 'user',
        rule: '',
        at: '2026-05-24T00:00:00.000Z',
      })
      expect(auditLog.rows[0].decision.by).toBe('user')
    })
  })

  // ---- Shutdown discard path (REQ-MHP-038) -------------------------------

  describe('discardPending() shutdown path (REQ-MHP-038, EC-MHP-014)', () => {
    it('writes one audit row per pending proposal with decision.by:"shutdown"', async () => {
      const { store, enqueue, auditLog } = buildStore()
      const id1 = enqueue('vault_write_note', { path: 'a.md' }, async () => undefined)
      const id2 = enqueue('vault_write_note', { path: 'b.md' }, async () => undefined)
      const id3 = enqueue('vault_write_note', { path: 'c.md' }, async () => undefined)
      await store.discardPending()
      expect(auditLog.rows).toHaveLength(3)
      for (const row of auditLog.rows) {
        expect(row.decision.by).toBe('shutdown')
        expect(row.decision.outcome).toBe('discarded')
      }
      const ids = auditLog.rows.map((r) => r.proposal.id).sort()
      expect(ids).toEqual([id1, id2, id3].sort())
    })

    it('does NOT write audit rows for already-terminal entries', async () => {
      const { store, enqueue, auditLog } = buildStore()
      const id1 = enqueue('vault_write_note', { path: 'a.md' }, async () => undefined)
      const id2 = enqueue('vault_write_note', { path: 'b.md' }, async () => undefined)
      await store.acceptBy(id1, {
        outcome: 'accepted',
        by: 'client',
        rule: '',
        at: '2026-05-24T00:00:00.000Z',
      })
      const rowsBefore = auditLog.rows.length // 1 from accept
      await store.discardPending()
      const newRows = auditLog.rows.slice(rowsBefore)
      expect(newRows).toHaveLength(1) // only id2 (pending) discards
      expect(newRows[0].proposal.id).toBe(id2)
      expect(newRows[0].decision.by).toBe('shutdown')
    })
  })

  // ---- Queue cap enforcement (REQ-MHP-042) -------------------------------

  describe('queue capacity (REQ-MHP-042, EC-MHP-006)', () => {
    it('exposes a tryQueue/queue_full sentinel when 1000 pending entries already exist', async () => {
      const { store, enqueue } = buildStore()
      // Fill the queue to capacity using the new-shape entrypoint.
      for (let i = 0; i < 1000; i++) {
        enqueue('vault_write_note', { path: `p-${i}.md` }, async () => undefined)
      }
      expect(store.pendingCount()).toBe(1000)
      // The 1001th queue attempt must reject with queue_full WITHOUT mutating the store.
      const result = store.tryQueue('vault_write_note', { path: 'overflow.md' }, async () => undefined)
      expect(result.ok).toBe(false)
      if (result.ok) return
      expect(result.error.code).toBe('queue_full')
      expect(store.pendingCount()).toBe(1000)
    })

    it('tryQueue returns ok with proposalId on the happy path', () => {
      const { store } = buildStore()
      const result = store.tryQueue('vault_write_note', { path: 'a.md' }, async () => undefined)
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(typeof result.value.proposalId).toBe('string')
      expect(result.value.proposalId.length).toBeGreaterThan(0)
    })
  })

  // ---- pendingCount + listPending ----------------------------------------

  describe('pendingCount() + listPending()', () => {
    it('pendingCount reflects pending-only entries; accepted/rejected/error are excluded', async () => {
      const { store, enqueue } = buildStore()
      const id1 = enqueue('vault_write_note', { path: 'a.md' }, async () => undefined)
      const id2 = enqueue('vault_write_note', { path: 'b.md' }, async () => undefined)
      enqueue('vault_write_note', { path: 'c.md' }, async () => undefined)
      expect(store.pendingCount()).toBe(3)
      await store.acceptBy(id1, {
        outcome: 'accepted',
        by: 'client',
        rule: '',
        at: '2026-05-24T00:00:00.000Z',
      })
      await store.rejectBy(id2, {
        outcome: 'rejected',
        by: 'user',
        rule: '',
        at: '2026-05-24T00:00:00.000Z',
      })
      expect(store.pendingCount()).toBe(1)
    })

    it('listPending returns deep-cloned snapshots of pending entries ordered by enqueuedAt', async () => {
      const { store, enqueue } = buildStore()
      const id1 = enqueue('vault_write_note', { path: 'a.md' }, async () => undefined)
      // small delay so enqueuedAt differs deterministically
      await new Promise((r) => setTimeout(r, 2))
      const id2 = enqueue('vault_write_note', { path: 'b.md' }, async () => undefined)
      const pending = store.listPending()
      expect(pending.map((p) => p.proposalId)).toEqual([id1, id2])
      // deep-clone: mutating result must not affect store
      const snapshot = pending[0] as { params: { path: string } }
      snapshot.params.path = 'tampered.md'
      const reread = store.listPending()
      expect((reread[0].params as { path: string }).path).toBe('a.md')
    })
  })
})

// --- Backwards-compat smoke test ----------------------------------------
//
// The pre-feature `new ProposalStore()` (no args) + `accept(id)` + `reject(id)`
// shape must keep working for the pre-feature consumers in
// `ObsidianMcpServerAdapter` until T-MHP-041 rewires them. The dedicated suite
// at `tests/infrastructure/proposal-store.test.ts` is the canonical assertion;
// this is one belt-and-braces smoke test to flag a regression early.

describe('ProposalStore backwards-compat surface', () => {
  it('constructs without deps and runs the legacy queue/accept loop', async () => {
    const store = new ProposalStore()
    const mutate = vi.fn().mockResolvedValue(undefined)
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- legacy contract under test
    const id = store.queue('vault_write_note', { path: 'a.md' }, mutate)
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- legacy contract under test
    await store.accept(id)
    expect(mutate).toHaveBeenCalledOnce()
    expect(store.get(id)?.status).toBe('accepted')
  })
})
