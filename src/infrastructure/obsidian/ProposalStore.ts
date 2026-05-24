/**
 * `ProposalStore` — in-memory queue of MCP write-tool proposals.
 *
 * The store has two layered surfaces:
 *
 *   1. **Legacy surface** (pre-feature) — `queue(toolName, params, mutate)`,
 *      `accept(id)`, `reject(id)`, `getAll()`, `get(id)`. Preserved verbatim so
 *      pre-feature consumers in `ObsidianMcpServerAdapter` keep working until
 *      T-MHP-041 rewires them. Throws on race / unknown id (the original
 *      contract). These methods are deprecated; new code MUST use the
 *      extended surface below.
 *
 *   2. **Extended surface** (T-MHP-011, SPEC-MHP-034) — `tryQueue`,
 *      `acceptBy`, `rejectBy`, `listPending`, `pendingCount`, `discardPending`.
 *      Returns `Result<T, ProposalError>`; emits `proposalEnqueued` and
 *      `proposalDecided` on the injected `ProposalEventBus`; writes one audit
 *      row per terminal outcome via the injected `AuditLogWriter`; serialises
 *      mutations per `proposalId` via an internal mutex (CLAR-MHP-008,
 *      NFR-MHP-012). Constructor deps are optional; when omitted the extended
 *      methods fall back to a no-op event bus / audit log / unknown-client
 *      identity so the legacy surface still works under the no-arg
 *      constructor (existing tests).
 *
 * Spec: SPEC-MHP-034.
 * Satisfies: REQ-MHP-006, REQ-MHP-007, REQ-MHP-008, REQ-MHP-038, REQ-MHP-039,
 *            REQ-MHP-040, REQ-MHP-042, REQ-MHP-044, REQ-MHP-045(a/d),
 *            REQ-MHP-046.
 */
import { randomUUID } from 'node:crypto'
import type { LoggerPort } from '@/domain/ports/LoggerPort'
import { ok, err, type Result } from '@/domain/shared/Result'
import type {
  AuditRow,
  ClientIdentity,
  PendingProposal as DomainPendingProposal,
  ProposalDecision,
} from '@/domain/mcp/Proposal'
import type { ProposalEventBus } from '@/infrastructure/events/ProposalEventBus'
import {
  buildAuditRow,
  buildEntry,
  buildNotFoundAuditRow,
  cloneDomainProposal,
  QUEUE_CAPACITY,
  UNKNOWN_CLIENT,
  type StoreEntry,
} from './proposalStoreInternals'

// ---------------------------------------------------------------------------
// Legacy (pre-feature) surface — kept verbatim for backwards-compat.
// ---------------------------------------------------------------------------

export interface PendingProposal {
  proposalId: string
  toolName: string
  params: unknown
  status: 'pending' | 'accepted' | 'rejected' | 'error'
}

// ---------------------------------------------------------------------------
// Extended (T-MHP-011) surface — `Result` shapes, deps, error codes.
// ---------------------------------------------------------------------------

export interface QueueOk {
  readonly proposalId: string
}

export class ProposalError extends Error {
  readonly code: 'queue_full' | 'not_found' | 'already_decided' | 'write_failed'
  readonly priorDecision?: ProposalDecision
  readonly proposalId?: string

  constructor(args: {
    code: 'queue_full' | 'not_found' | 'already_decided' | 'write_failed'
    message: string
    priorDecision?: ProposalDecision
    proposalId?: string
  }) {
    super(args.message)
    this.name = 'ProposalError'
    this.code = args.code
    this.priorDecision = args.priorDecision
    this.proposalId = args.proposalId
  }
}

/** Minimal contract the store needs from an audit writer (SPEC-MHP-035). */
export interface AuditLogSink {
  append(row: AuditRow): Promise<Result<void, Error>>
}

/** Minimal contract the store needs from a client identifier (SPEC-MHP-036). */
export interface ClientIdentifierSink {
  identityFor(connectionId: string): ClientIdentity
}

export interface ProposalStoreDeps {
  readonly eventBus?: ProposalEventBus
  readonly auditLog?: AuditLogSink
  readonly clientIdentifier?: ClientIdentifierSink
  readonly logger?: LoggerPort
}

export class ProposalStore {
  private readonly entries = new Map<string, StoreEntry>()
  /** Per-id mutex: each acceptBy/rejectBy awaits the prior promise. */
  private readonly mutex = new Map<string, Promise<void>>()
  private readonly eventBus?: ProposalEventBus
  private readonly auditLog?: AuditLogSink
  private readonly clientIdentifier?: ClientIdentifierSink
  private readonly logger?: LoggerPort
  private nextEnqueueSeq = 0

  constructor(deps: ProposalStoreDeps = {}) {
    this.eventBus = deps.eventBus
    this.auditLog = deps.auditLog
    this.clientIdentifier = deps.clientIdentifier
    this.logger = deps.logger
  }

  // -------------------------------------------------------------------------
  // Legacy surface (pre-feature; kept for ObsidianMcpServerAdapter wiring
  // until T-MHP-041 rewires the call sites onto `tryQueue` / `acceptBy`).
  // -------------------------------------------------------------------------

  /** @deprecated Use `tryQueue` (capacity-checked) for new code. */
  queue(toolName: string, params: unknown, mutate: () => Promise<void>): string {
    const proposalId = randomUUID()
    const entry = this.#newEntry(proposalId, toolName, params, mutate)
    this.entries.set(proposalId, entry)
    this.#emitEnqueued(entry)
    return proposalId
  }

  /** @deprecated Use `acceptBy` for new code. Throws on race / unknown id. */
  async accept(proposalId: string): Promise<void> {
    const entry = this.#getOrThrow(proposalId)
    this.#assertPending(entry)
    entry.status = 'accepted'
    try {
      await entry.mutate()
    } catch (e) {
      entry.status = 'pending'
      throw e
    }
  }

  /** @deprecated Use `rejectBy` for new code. Throws on race / unknown id. */
  reject(proposalId: string): void {
    const entry = this.#getOrThrow(proposalId)
    this.#assertPending(entry)
    entry.status = 'rejected'
  }

  getAll(): ReadonlyArray<PendingProposal> {
    return Array.from(this.entries.values()).map(({ proposalId, toolName, params, status }) => ({
      proposalId,
      toolName,
      params: structuredClone(params),
      status,
    }))
  }

  get(proposalId: string): PendingProposal | undefined {
    const entry = this.entries.get(proposalId)
    if (!entry) return undefined
    return {
      proposalId: entry.proposalId,
      toolName: entry.toolName,
      params: structuredClone(entry.params),
      status: entry.status,
    }
  }

  // -------------------------------------------------------------------------
  // Extended surface (T-MHP-011 / SPEC-MHP-034).
  // -------------------------------------------------------------------------

  /**
   * Capacity-checked queue. Returns `queue_full` when 1000 pending entries
   * already exist (REQ-MHP-042). Otherwise enqueues and emits
   * `proposalEnqueued`.
   */
  tryQueue(
    toolName: string,
    params: unknown,
    mutate: () => Promise<void>,
  ): Result<QueueOk, ProposalError> {
    if (this.pendingCount() >= QUEUE_CAPACITY) {
      return err(
        new ProposalError({
          code: 'queue_full',
          message: `queue at capacity (${QUEUE_CAPACITY} pending)`,
        }),
      )
    }
    const proposalId = randomUUID()
    const entry = this.#newEntry(proposalId, toolName, params, mutate)
    this.entries.set(proposalId, entry)
    this.#emitEnqueued(entry)
    return ok({ proposalId })
  }

  pendingCount(): number {
    let n = 0
    for (const entry of this.entries.values()) {
      if (entry.status === 'pending') n++
    }
    return n
  }

  /** Deep-cloned snapshot of pending entries, ordered by enqueuedAt ascending. */
  listPending(): ReadonlyArray<DomainPendingProposal> {
    return Array.from(this.entries.values())
      .filter((e) => e.status === 'pending')
      .sort((a, b) => a.enqueuedAt - b.enqueuedAt)
      .map((e) => cloneDomainProposal(e))
  }

  /**
   * Accept a proposal under a per-id mutex. On success the queued mutation has
   * been committed before the response returns, and one audit row has been
   * appended via the injected `AuditLogWriter`. Returns:
   *   - `ok(AuditRow)` on success (REQ-MHP-008, REQ-MHP-039);
   *   - `err(ProposalError{code:'not_found'})` for unknown id (REQ-MHP-045(d));
   *   - `err(ProposalError{code:'already_decided', priorDecision})` when the
   *     entry is no longer pending by the time the mutex was acquired
   *     (REQ-MHP-007, CLAR-MHP-008);
   *   - `err(ProposalError{code:'write_failed', proposalId})` when the queued
   *     `mutate()` throws or rejects post-accept (REQ-MHP-044, EC-MHP-007).
   */
  async acceptBy(
    proposalId: string,
    decision: ProposalDecision,
  ): Promise<Result<AuditRow, ProposalError>> {
    return this.#withMutex(proposalId, () => this.#acceptCritical(proposalId, decision))
  }

  /** Reject a proposal under the same per-id mutex as accept. */
  async rejectBy(
    proposalId: string,
    decision: ProposalDecision,
  ): Promise<Result<AuditRow, ProposalError>> {
    return this.#withMutex(proposalId, () => this.#rejectCritical(proposalId, decision))
  }

  /**
   * Best-effort shutdown discard. Writes one audit row per remaining `pending`
   * entry with `decision.by:'shutdown'` and `decision.outcome:'discarded'`
   * (REQ-MHP-038, EC-MHP-014). Terminal entries (accepted / rejected / error)
   * are left untouched.
   */
  async discardPending(): Promise<void> {
    const now = new Date().toISOString()
    const pending = Array.from(this.entries.values()).filter((e) => e.status === 'pending')
    for (const entry of pending) {
      const decision: ProposalDecision = {
        outcome: 'discarded',
        by: 'shutdown',
        rule: '',
        at: now,
      }
      const row = buildAuditRow(entry, decision, { ok: true, error: null })
      await this.#appendAudit(row)
      this.entries.delete(entry.proposalId)
    }
  }

  // -------------------------------------------------------------------------
  // Internals.
  // -------------------------------------------------------------------------

  #newEntry(
    proposalId: string,
    toolName: string,
    params: unknown,
    mutate: () => Promise<void>,
  ): StoreEntry {
    const client = this.clientIdentifier?.identityFor(proposalId) ?? UNKNOWN_CLIENT
    return buildEntry(proposalId, toolName, params, mutate, this.nextEnqueueSeq++, client)
  }

  async #withMutex<T>(
    proposalId: string,
    fn: () => Promise<Result<T, ProposalError>>,
  ): Promise<Result<T, ProposalError>> {
    const prior = this.mutex.get(proposalId) ?? Promise.resolve()
    let release!: () => void
    const next = new Promise<void>((resolve) => {
      release = resolve
    })
    this.mutex.set(proposalId, prior.then(() => next))
    try {
      await prior
      return await fn()
    } finally {
      release()
      // Drop the lock when no further mutator chained on, so the map does not
      // leak across the entry's lifetime.
      if (this.mutex.get(proposalId) === next) {
        this.mutex.delete(proposalId)
      }
    }
  }

  async #acceptCritical(
    proposalId: string,
    decision: ProposalDecision,
  ): Promise<Result<AuditRow, ProposalError>> {
    const entry = this.entries.get(proposalId)
    if (entry === undefined) return this.#emitNotFoundError(proposalId, decision)
    if (entry.status !== 'pending') return this.#alreadyDecided(entry)
    entry.status = 'accepted'
    entry.decision = decision
    try {
      await entry.mutate()
    } catch (cause) {
      return this.#onMutateFailure(entry, decision, cause)
    }
    const row = buildAuditRow(entry, decision, { ok: true, error: null })
    await this.#appendAudit(row)
    this.#emitDecided(proposalId, decision, entry.client)
    return ok(row)
  }

  async #onMutateFailure(
    entry: StoreEntry,
    decision: ProposalDecision,
    cause: unknown,
  ): Promise<Result<AuditRow, ProposalError>> {
    const message = cause instanceof Error ? cause.message : String(cause)
    entry.status = 'error'
    const errorDecision: ProposalDecision = { ...decision, outcome: 'error' }
    entry.decision = errorDecision
    const row = buildAuditRow(entry, errorDecision, { ok: false, error: message })
    await this.#appendAudit(row)
    this.logger?.warn('mhp.proposal.error', {
      proposalId: entry.proposalId,
      trigger: 'post-accept-write',
      message,
    })
    this.#emitDecided(entry.proposalId, errorDecision, entry.client)
    return err(
      new ProposalError({
        code: 'write_failed',
        message,
        proposalId: entry.proposalId,
      }),
    )
  }

  async #rejectCritical(
    proposalId: string,
    decision: ProposalDecision,
  ): Promise<Result<AuditRow, ProposalError>> {
    const entry = this.entries.get(proposalId)
    if (entry === undefined) return this.#emitNotFoundError(proposalId, decision)
    if (entry.status !== 'pending') return this.#alreadyDecided(entry)
    entry.status = 'rejected'
    entry.decision = decision
    const row = buildAuditRow(entry, decision, { ok: true, error: null })
    await this.#appendAudit(row)
    this.#emitDecided(proposalId, decision, entry.client)
    return ok(row)
  }

  #alreadyDecided(entry: StoreEntry): Result<AuditRow, ProposalError> {
    return err(
      new ProposalError({
        code: 'already_decided',
        message: `proposal ${entry.proposalId} already ${entry.status}`,
        priorDecision: entry.decision,
      }),
    )
  }

  /**
   * Build an `error` audit row for a `not_found` accept/reject attempt
   * (REQ-MHP-045(d)). The row carries a synthetic proposal stub so the JSONL
   * line is still well-formed.
   */
  async #emitNotFoundError(
    proposalId: string,
    decision: ProposalDecision,
  ): Promise<Result<AuditRow, ProposalError>> {
    const row = buildNotFoundAuditRow(proposalId, decision)
    await this.#appendAudit(row)
    this.logger?.warn('mhp.proposal.error', {
      proposalId,
      trigger: 'not-found-on-accept',
    })
    return err(
      new ProposalError({
        code: 'not_found',
        message: `proposal ${proposalId} not found`,
      }),
    )
  }

  async #appendAudit(row: AuditRow): Promise<void> {
    if (this.auditLog === undefined) return
    await this.auditLog.append(row)
    // AuditLogWriter routes any filesystem failure through LoggerPort.error +
    // NotificationPort.showError itself (REQ-MHP-025). No further surfacing
    // here: the MCP response still reports the vault-mutation outcome.
  }

  #emitEnqueued(entry: StoreEntry): void {
    if (this.eventBus === undefined) return
    this.eventBus.emit({
      type: 'proposalEnqueued',
      payload: {
        proposalId: entry.proposalId,
        kind: entry.kind,
        tool: entry.toolName,
        client: { ...entry.client },
        enqueuedAt: new Date(entry.enqueuedAt).toISOString(),
        status: entry.status === 'pending' ? 'pending' : 'accepted',
      },
    })
  }

  #emitDecided(
    proposalId: string,
    decision: ProposalDecision,
    decidedByClient: ClientIdentity,
  ): void {
    if (this.eventBus === undefined) return
    this.eventBus.emit({
      type: 'proposalDecided',
      payload: {
        proposalId,
        decision,
        decidedByClient: { ...decidedByClient },
      },
    })
  }

  #getOrThrow(proposalId: string): StoreEntry {
    const entry = this.entries.get(proposalId)
    if (!entry) throw new Error(`Unknown proposal: ${proposalId}`)
    return entry
  }

  #assertPending(entry: StoreEntry): void {
    if (entry.status !== 'pending')
      throw new Error(`Proposal not pending: ${entry.proposalId} (${entry.status})`)
  }
}
