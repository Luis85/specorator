/**
 * T-MHP-012 — Best-effort shutdown flush within 500 ms (CLAR-MHP-016).
 *
 * Spec: SPEC-MHP-034 (`discardPending`), REQ-MHP-038, REQ-MHP-040 (`shutdown`
 * provenance); TEST-MHP-039, TEST-MHP-040.
 *
 * Contract under test:
 *  - `discardPending()` writes ONE audit row per remaining pending entry with
 *    `decision.by: 'shutdown'` and `decision.outcome: 'discarded'`.
 *  - Terminal entries (accepted / rejected / error) are not touched.
 *  - When the caller wraps `discardPending()` in a 500 ms budget and the
 *    audit-writer never resolves, the caller surfaces the budget exhaustion
 *    via a `Promise.race` timeout — `discardPending()` itself does not throw,
 *    and unwritten rows are dropped silently (no error path).
 */
import { describe, it, expect, vi } from 'vitest'
import { ProposalStore, type AuditLogSink } from '@/infrastructure/obsidian/ProposalStore'
import { ProposalEventBus } from '@/infrastructure/events/ProposalEventBus'
import type { AuditRow } from '@/domain/mcp/Proposal'
import type { ProposalDecision } from '@/domain/mcp/Proposal'

function makeLogger(): { debug: ReturnType<typeof vi.fn>; info: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> } {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}

function recordingAudit(): { rows: AuditRow[]; sink: AuditLogSink } {
  const rows: AuditRow[] = []
  return {
    rows,
    sink: {
      async append(row: AuditRow) {
        rows.push(row)
        return { ok: true, value: undefined }
      },
    },
  }
}

function decision(by: 'user' | 'client', outcome: 'accepted' | 'rejected'): ProposalDecision {
  return { by, outcome, rule: '', at: '2026-05-24T00:00:00.000Z' }
}

describe('T-MHP-012 — ProposalStore.discardPending() shutdown flush', () => {
  it('writes one shutdown row per pending entry (TEST-MHP-039)', async () => {
    const logger = makeLogger()
    const { rows, sink } = recordingAudit()
    const bus = new ProposalEventBus({ logger })
    const store = new ProposalStore({ eventBus: bus, auditLog: sink, logger })

    store.tryQueue('vault_write_note', { path: 'a.md' }, async () => undefined)
    store.tryQueue('vault_write_note', { path: 'b.md' }, async () => undefined)
    store.tryQueue('vault_write_note', { path: 'c.md' }, async () => undefined)

    await store.discardPending()

    expect(rows).toHaveLength(3)
    for (const row of rows) {
      expect(row.decision.by).toBe('shutdown')
      expect(row.decision.outcome).toBe('discarded')
      expect(row.result.ok).toBe(true)
    }
  })

  it('leaves terminal entries alone (TEST-MHP-040)', async () => {
    const logger = makeLogger()
    const { rows, sink } = recordingAudit()
    const bus = new ProposalEventBus({ logger })
    const store = new ProposalStore({ eventBus: bus, auditLog: sink, logger })

    const a = store.tryQueue('vault_write_note', { path: 'a.md' }, async () => undefined)
    store.tryQueue('vault_write_note', { path: 'b.md' }, async () => undefined)
    expect(a.ok).toBe(true)
    if (!a.ok) return

    // Accept one entry → terminal; only the still-pending entry should be
    // discarded on shutdown.
    const acceptResult = await store.acceptBy(a.value.proposalId, decision('user', 'accepted'))
    expect(acceptResult.ok).toBe(true)
    const acceptedRowCount = rows.length // 1 (the accepted row)
    await store.discardPending()
    expect(rows.length - acceptedRowCount).toBe(1)
    expect(rows[rows.length - 1]?.decision.by).toBe('shutdown')
  })

  it('completes within the 500 ms budget when audit writer is fast', async () => {
    const logger = makeLogger()
    const { sink } = recordingAudit()
    const bus = new ProposalEventBus({ logger })
    const store = new ProposalStore({ eventBus: bus, auditLog: sink, logger })

    for (let i = 0; i < 10; i++) {
      store.tryQueue('vault_write_note', { path: `n${i}.md` }, async () => undefined)
    }
    const start = Date.now()
    const budget = new Promise<'timeout'>((resolve) =>
      setTimeout(() => { resolve('timeout') }, 500),
    )
    const result = await Promise.race([
      store.discardPending().then(() => 'done' as const),
      budget,
    ])
    const elapsed = Date.now() - start
    expect(result).toBe('done')
    expect(elapsed).toBeLessThan(500)
  })

  it('caller times out gracefully when audit writer hangs (CLAR-MHP-016)', async () => {
    const logger = makeLogger()
    const bus = new ProposalEventBus({ logger })
    // Hung writer: never resolves the append promise.
    const hung: AuditLogSink = {
      append: () => new Promise(() => undefined),
    }
    const store = new ProposalStore({ eventBus: bus, auditLog: hung, logger })
    store.tryQueue('vault_write_note', { path: 'x.md' }, async () => undefined)

    const budget = new Promise<'timeout'>((resolve) =>
      setTimeout(() => { resolve('timeout') }, 100),
    )
    const outcome = await Promise.race([
      store.discardPending().then(() => 'done' as const),
      budget,
    ])
    // discardPending() awaits the hung writer, so the caller's budget wins.
    expect(outcome).toBe('timeout')
  })
})
