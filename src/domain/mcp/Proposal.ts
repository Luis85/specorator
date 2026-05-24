/**
 * Domain data model for MCP proposals.
 *
 * Spec: SPEC §"Data structures" (specs/mcp-host-side-proposals/spec.md).
 * Satisfies: REQ-MHP-022, REQ-MHP-034, REQ-MHP-036, REQ-MHP-037, REQ-MHP-040.
 *
 * Per ADR-008 / ADR-001 this lives in the domain layer; no infrastructure
 * imports are permitted.
 */

export type ProposalKind =
  // Vault / CLI writes (3)
  | 'vault_write_note'
  | 'vault_append_to_note'
  | 'obsidian_cli_append_note'
  // Canvas writes (5)
  | 'canvas_create'
  | 'canvas_add_text_node'
  | 'canvas_add_file_node'
  | 'canvas_add_edge'
  | 'canvas_update_node'
  // DevTools (8)
  | 'dev_screenshot'
  | 'dev_errors'
  | 'dev_console'
  | 'dev_dom'
  | 'dev_cdp'
  | 'dev_debug'
  | 'dev_mobile'
  | 'devtools'

export type DecisionBy = 'auto' | 'user' | 'client' | 'shutdown'

export type DecisionOutcome =
  | 'accepted'
  | 'rejected'
  | 'discarded'
  | 'error'
  | 'already-decided'

export interface ClientIdentity {
  readonly id: string
  readonly transport: 'in-process' | 'loopback'
  readonly address: string
}

export interface ProposalDecision {
  readonly outcome: DecisionOutcome
  readonly by: DecisionBy
  readonly rule: string
  readonly at: string
}

export interface ProposalResult {
  readonly ok: boolean
  readonly error: string | null
}

export interface PendingProposal {
  readonly proposalId: string
  readonly kind: ProposalKind
  readonly tool: string
  readonly intent: string
  readonly paths: string[]
  readonly client: ClientIdentity
  readonly status: 'pending' | 'accepted' | 'rejected' | 'error'
  readonly enqueuedAt: string
  readonly decision?: ProposalDecision
  readonly params: unknown
}

export interface AuditRow {
  readonly ts: string
  readonly schema: 1
  readonly client: ClientIdentity
  readonly tool: string
  readonly proposal: {
    readonly id: string
    readonly kind: ProposalKind
    readonly intent: string
    readonly paths: string[]
  }
  readonly decision: ProposalDecision
  readonly result: ProposalResult
}

export interface ProposalEnqueuedEvent {
  readonly proposalId: string
  readonly kind: ProposalKind
  readonly tool: string
  readonly client: ClientIdentity
  readonly enqueuedAt: string
  readonly status: 'pending' | 'accepted'
}

export interface ProposalDecidedEvent {
  readonly proposalId: string
  readonly decision: ProposalDecision
  readonly decidedByClient: ClientIdentity
}
