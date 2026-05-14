/**
 * Session-log frontmatter and body block types — SPEC-ASM-001 §2.3.
 *
 * The session log is a vault-portable markdown file that mirrors the chat
 * thread: YAML frontmatter with five named keys followed by a chronological
 * sequence of `## user` / `## assistant` / `## proposal` blocks.
 *
 * Pure types module: no I/O, no `obsidian` imports.
 *
 * Satisfies REQ-ASM-033, REQ-ASM-046.
 */

/**
 * YAML frontmatter on every session log (REQ-ASM-033).
 *
 * - `session_id`  CLI-issued UUID from `system/init`; the file's basename.
 * - `feature`     Active feature slug at log creation, or `null`.
 * - `transport`   Which transport produced the conversation. Mirrors
 *                 `ChatThreadRecord.transport`; `'degraded'` threads are not
 *                 persisted so they cannot appear here (SPEC-ASM-001 §2.2).
 * - `created`     ISO 8601 UTC timestamp; set once on first write.
 * - `updated`     ISO 8601 UTC timestamp; refreshed on every subsequent write
 *                 so REQ-ASM-034 can assert `updated > created` after a turn.
 */
export interface SessionLogFrontmatter {
  readonly session_id: string
  readonly feature: string | null
  readonly transport: 'api-key' | 'subscription'
  readonly created: string
  readonly updated: string
}

/** A single user + assistant exchange in the log body. */
export interface SessionTurnBlock {
  readonly kind: 'turn'
  readonly user: string
  readonly assistant: string
  readonly at: string
}

/** Proposal accept/reject audit row (REQ-ASM-046). */
export interface SessionProposalBlock {
  readonly kind: 'proposal'
  readonly path: string
  readonly decision: 'accepted' | 'rejected'
  readonly decidedAt: string
  readonly rationale: string | null
}

export type SessionLogBlock = SessionTurnBlock | SessionProposalBlock
