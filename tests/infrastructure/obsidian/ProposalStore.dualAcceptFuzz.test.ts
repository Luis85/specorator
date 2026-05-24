/**
 * T-MHP-014 — Dual-accept stress fuzz: 1000 concurrent-pair runs.
 *
 * Spec: NFR-MHP-012 (0 dual-execution events across 1000 dual-accept fuzz
 * runs); REQ-MHP-006 (per-id mutex); TEST-MHP-006.
 *
 * Each iteration runs a fresh ProposalStore + paired
 * `Promise.all([acceptBy(id), acceptBy(id)])` and asserts:
 *   - the mutate callback was invoked exactly ONCE for that pair;
 *   - one accept returned `ok`;
 *   - the other accept returned the `already_decided` ProposalError code;
 *   - the audit log contains exactly one `accepted` row.
 */
import { describe, it, expect, vi } from 'vitest'
import { ProposalStore, ProposalError, type AuditLogSink } from '@/infrastructure/obsidian/ProposalStore'
import { ProposalEventBus } from '@/infrastructure/events/ProposalEventBus'
import type { AuditRow, ProposalDecision } from '@/domain/mcp/Proposal'

function makeLogger() {
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

const DECISION: ProposalDecision = {
  by: 'user',
  outcome: 'accepted',
  rule: '',
  at: '2026-05-24T00:00:00.000Z',
}

describe('T-MHP-014 — ProposalStore dual-accept fuzz (NFR-MHP-012)', () => {
  it('mutate fires exactly once across 1000 paired Promise.all races', async () => {
    const ITERATIONS = 1000
    let dualExecutionEvents = 0
    let extraOkResults = 0
    let extraAuditRows = 0

    for (let i = 0; i < ITERATIONS; i++) {
      const logger = makeLogger()
      const { rows, sink } = recordingAudit()
      const bus = new ProposalEventBus({ logger })
      const store = new ProposalStore({ eventBus: bus, auditLog: sink, logger })

      let invokeCount = 0
      const mutate = async (): Promise<void> => {
        invokeCount++
      }
      const queued = store.tryQueue('vault_write_note', { path: `n${i}.md` }, mutate)
      expect(queued.ok).toBe(true)
      if (!queued.ok) continue
      const id = queued.value.proposalId

      const [first, second] = await Promise.all([
        store.acceptBy(id, DECISION),
        store.acceptBy(id, DECISION),
      ])

      if (invokeCount !== 1) dualExecutionEvents++

      const okCount = [first, second].filter((r) => r.ok).length
      if (okCount !== 1) extraOkResults++

      const loser = first.ok ? second : first
      if (loser.ok) {
        // both accepted — already accounted for above
      } else {
        const error: unknown = loser.error
        if (!(error instanceof ProposalError) || error.code !== 'already_decided') {
          extraOkResults++
        }
      }

      // Exactly one `accepted` audit row should have been written.
      const acceptedRows = rows.filter((r) => r.decision.outcome === 'accepted')
      if (acceptedRows.length !== 1) extraAuditRows++
    }

    expect(dualExecutionEvents).toBe(0)
    expect(extraOkResults).toBe(0)
    expect(extraAuditRows).toBe(0)
  }, 30_000)
})
