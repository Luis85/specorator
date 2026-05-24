/**
 * Internal helpers for `ProposalStore`. Extracted from `ProposalStore.ts` to
 * keep the store class under the project's `max-lines` lint threshold.
 *
 * Public re-exports here are NOT intended for consumers outside the store.
 * They form part of the store's package-private surface (T-MHP-011).
 */
import type {
  AuditRow,
  ClientIdentity,
  PendingProposal as DomainPendingProposal,
  ProposalDecision,
  ProposalKind,
} from '@/domain/mcp/Proposal'

export const QUEUE_CAPACITY = 1000

export const UNKNOWN_CLIENT: ClientIdentity = {
  id: 'unknown',
  transport: 'loopback',
  address: '',
}

const KNOWN_KINDS: ReadonlySet<ProposalKind> = new Set<ProposalKind>([
  'vault_write_note',
  'vault_append_to_note',
  'obsidian_cli_append_note',
  'canvas_create',
  'canvas_add_text_node',
  'canvas_add_file_node',
  'canvas_add_edge',
  'canvas_update_node',
  'dev_screenshot',
  'dev_errors',
  'dev_console',
  'dev_dom',
  'dev_cdp',
  'dev_debug',
  'dev_mobile',
  'devtools',
])

/**
 * Best-effort: map the pre-feature `toolName` string to a domain
 * `ProposalKind` literal. Unknown names fall through to a stable default so
 * audit-row construction never throws; the strict-typed kind discriminator
 * is enforced by the write-tool registrars themselves (T-MHP-021).
 */
export function coerceKind(toolName: string): ProposalKind {
  return KNOWN_KINDS.has(toolName as ProposalKind)
    ? (toolName as ProposalKind)
    : 'vault_write_note'
}

export interface StoreEntry {
  proposalId: string
  toolName: string
  params: unknown
  status: 'pending' | 'accepted' | 'rejected' | 'error'
  mutate: () => Promise<void>
  enqueuedAt: number
  client: ClientIdentity
  kind: ProposalKind
  intent: string
  paths: string[]
  decision?: ProposalDecision
}

/**
 * Build an in-memory store entry. The `enqueuedAt` is a monotonic ordinal
 * (assigned by the caller); the public-facing ISO timestamp is derived later
 * via `cloneDomainProposal` when the entry crosses an API boundary.
 */
export function buildEntry(
  proposalId: string,
  toolName: string,
  params: unknown,
  mutate: () => Promise<void>,
  enqueuedAt: number,
  client: ClientIdentity,
): StoreEntry {
  return {
    proposalId,
    toolName,
    params,
    status: 'pending',
    mutate,
    enqueuedAt,
    client,
    kind: coerceKind(toolName),
    intent: '',
    paths: [],
  }
}

/** Deep-clone snapshot for the public read surface. */
export function cloneDomainProposal(entry: StoreEntry): DomainPendingProposal {
  return {
    proposalId: entry.proposalId,
    kind: entry.kind,
    tool: entry.toolName,
    intent: entry.intent,
    paths: [...entry.paths],
    client: { ...entry.client },
    status: entry.status,
    enqueuedAt: new Date(entry.enqueuedAt).toISOString(),
    decision: entry.decision === undefined ? undefined : { ...entry.decision },
    params: structuredClone(entry.params),
  }
}

/**
 * Construct a JSONL audit row from a store entry + decision + write-result
 * (REQ-MHP-022). The `paths[*]` array is copied; POSIX normalisation happens
 * downstream in `AuditLogWriter.append`.
 */
export function buildAuditRow(
  entry: StoreEntry,
  decision: ProposalDecision,
  result: { ok: boolean; error: string | null },
): AuditRow {
  return {
    ts: new Date().toISOString(),
    schema: 1,
    client: { ...entry.client },
    tool: entry.toolName,
    proposal: {
      id: entry.proposalId,
      kind: entry.kind,
      intent: entry.intent,
      paths: [...entry.paths],
    },
    decision,
    result,
  }
}

/**
 * Build the synthetic audit row used when `acceptBy`/`rejectBy` cannot find
 * a proposal (REQ-MHP-045(d)). The row carries a placeholder proposal stub so
 * the JSONL line is still well-formed.
 */
export function buildNotFoundAuditRow(
  proposalId: string,
  decision: ProposalDecision,
): AuditRow {
  return {
    ts: new Date().toISOString(),
    schema: 1,
    client: UNKNOWN_CLIENT,
    tool: '',
    proposal: {
      id: proposalId,
      kind: 'vault_write_note',
      intent: '',
      paths: [],
    },
    decision: { ...decision, outcome: 'error' },
    result: { ok: false, error: `not_found: ${proposalId}` },
  }
}
