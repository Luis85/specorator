/**
 * T-ASM-052 — Placeholder type definitions for the `FileWriteProposal`
 * aggregate (SPEC-ASM-001 §2.5). The full proposal lifecycle (envelope parse,
 * path validation, commit) lands in PR-ASM-4; this file declares only the
 * minimal shape the Pinia chat store (§8.1) needs to track an unresolved
 * proposal across UI state transitions.
 *
 * Satisfies REQ-ASM-041, REQ-ASM-043, REQ-ASM-045.
 *
 * Application layer (ADR-001 / ADR-008): no `obsidian` imports.
 */
import type { CreateFileEnvelope } from './createFileEnvelopeSchema'
import type { CommitProposalErrorCode } from './errors'

/**
 * Lifecycle status of a `FileWriteProposal`. Per SPEC §2.5 the lifecycle is
 * `pending` → (`accepted` | `rejected` | `failed`); once decided, terminal.
 * No `committed` value — `accepted` covers a successful commit; `failed`
 * covers any commit-time error (with the specific reason in `failureReason`).
 */
export type FileWriteProposalStatus =
  | 'pending'
  | 'accepted'
  | 'rejected'
  | 'failed'

/**
 * A pending or decided file-write proposal originating from an assistant
 * structured-envelope response. The aggregate is plain DTO so it can cross
 * the Pinia store boundary (CLAUDE.md Vue conventions).
 */
export interface FileWriteProposal {
  /** Plugin-generated UUID v4; unique per proposal across the session. */
  readonly proposalId: string

  /** Thread that produced the envelope. */
  readonly threadId: string

  /** Parsed, schema-validated envelope (§2.4). */
  readonly envelope: CreateFileEnvelope

  /** Current lifecycle position. */
  readonly status: FileWriteProposalStatus

  /** ISO 8601 UTC timestamp when the proposal was created. */
  readonly proposedAt: string

  /** ISO 8601 UTC timestamp when the proposal moved out of `pending`, or `null`. */
  readonly decidedAt: string | null

  /** Commit-time failure reason; populated when `status === 'failed'`, else `null`. */
  readonly failureReason: CommitProposalErrorCode | null
}
