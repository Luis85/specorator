/**
 * T-ASM-048 — `SessionLogWriter`.
 *
 * Application-layer service that mirrors a chat thread to a vault-portable
 * markdown file under `<specsFolder>/<feature>/sessions/<sessionId>.md` (or
 * `.specorator/sessions/<sessionId>.md` when no feature is active). The file
 * has a five-key YAML frontmatter (`session_id`, `feature`, `transport`,
 * `created`, `updated`) followed by a chronological sequence of `## user`,
 * `## assistant`, and `## proposal` blocks (SPEC-ASM-001 §2.3, §6.7).
 *
 * Behaviour (SPEC-ASM-001 §6.7):
 *   - Per-log-file mutex (`Map<logPath, Promise<void>>`) serialises writes so
 *     concurrent `appendUserAssistant` calls on the same thread do not
 *     interleave (REQ-ASM-040).
 *   - On the first write to a given path, calls `vault.createFolder` on the
 *     parent directory (REQ-ASM-038). The call is idempotent at the
 *     `VaultPort` boundary.
 *   - If the target path already exists with a *conflicting* `session_id` in
 *     its frontmatter, the writer appends `-2`, `-3`, … to the file stem until
 *     a unique path is found and logs `warn` exactly once (REQ-ASM-039).
 *   - All write failures are caught and routed to `logger.error` with a
 *     redacted `sessionId` (NFR-ASM-005); `appendUserAssistant` is
 *     fire-and-forget and never returns a rejected promise. The single
 *     departure from fire-and-forget is `appendProposalDecision`, which the
 *     proposal-commit pipeline awaits for its audit row (REQ-ASM-046).
 *
 * Trust-first invariant (NFR-ASM-004 / ADR-0031): this class never reads
 * anything under `~/.claude/`; all I/O is mediated by `VaultPort`.
 *
 * Pure application layer (ADR-008): no `obsidian` imports, no `node:fs`. The
 * file relies only on the narrow `VaultPort` + `LoggerPort` surface and the
 * pure `resolveSessionLogPath` helper.
 *
 * Satisfies REQ-ASM-033, REQ-ASM-034, REQ-ASM-038, REQ-ASM-039, REQ-ASM-040,
 * REQ-ASM-046, NFR-ASM-002, NFR-ASM-005.
 */

import type { LoggerPort, VaultPort } from '@/domain/ports'
import { tryAsync } from '@/domain/shared/tryAsync'
import type { ChatThreadRecord } from '@/domain/chat/ChatThreadRecord'
import { resolveSessionLogPath } from '@/application/chat/sessionLogPath'

/**
 * Minimal proposal shape consumed by `appendProposalDecision`. The full
 * `FileWriteProposal` aggregate lands in PR-ASM-4; the writer only needs the
 * envelope's `path` and `rationale` to populate the audit row (REQ-ASM-046).
 */
export interface SessionLogProposalInput {
  readonly envelope: {
    readonly path: string
    readonly rationale?: string
  }
}

/**
 * Redact a session id to its first 8 characters (NFR-ASM-005). Returns
 * `'<none>'` when `null` so log lines remain deterministic. Pure helper, kept
 * private to the module so callers cannot accidentally surface raw ids.
 */
function redactSessionId(sessionId: string | null): string {
  if (sessionId === null) return '<none>'
  return sessionId.slice(0, 8)
}

/** Compute the parent directory of a vault-relative POSIX path. */
function parentFolder(path: string): string {
  const idx = path.lastIndexOf('/')
  return idx === -1 ? '' : path.slice(0, idx)
}

/**
 * Replace the file stem with `<stem>-<n>` while preserving the `.md`
 * extension. `n` is `2`, `3`, … per REQ-ASM-039.
 */
function withSuffix(path: string, n: number): string {
  // The writer only ever produces `.md` files via `resolveSessionLogPath`.
  // Defensive fallback: if the extension is absent, treat the whole basename
  // as the stem so the function remains total.
  const dotIdx = path.lastIndexOf('.')
  const slashIdx = path.lastIndexOf('/')
  if (dotIdx === -1 || dotIdx < slashIdx) return `${path}-${n}`
  return `${path.slice(0, dotIdx)}-${n}${path.slice(dotIdx)}`
}

/**
 * Escape a string for inclusion in a YAML single-quoted scalar: literal
 * single quotes are doubled, all other characters are preserved verbatim.
 * (Single-quoted YAML strings have no further escape syntax — newlines and
 * unicode pass through.)
 */
function quoteYamlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

/** Serialise the five-key frontmatter exactly as REQ-ASM-033 prescribes. */
function buildFrontmatter(frontmatter: {
  readonly session_id: string
  readonly feature: string | null
  readonly transport: 'api-key' | 'subscription'
  readonly created: string
  readonly updated: string
}): string {
  return [
    '---',
    `session_id: ${quoteYamlString(frontmatter.session_id)}`,
    `feature: ${frontmatter.feature === null ? 'null' : quoteYamlString(frontmatter.feature)}`,
    `transport: ${frontmatter.transport}`,
    `created: ${quoteYamlString(frontmatter.created)}`,
    `updated: ${quoteYamlString(frontmatter.updated)}`,
    '---',
    '',
  ].join('\n')
}

/**
 * Parse the `session_id` field from a frontmatter block (single-quoted,
 * double-quoted, or bare). Returns `null` when the file has no frontmatter or
 * the key is absent — both cases imply the file does *not* belong to a known
 * session and the conflict-suffix loop should treat the path as colliding.
 */
function extractSessionIdFromFrontmatter(content: string): string | null {
  if (!content.startsWith('---\n') && !content.startsWith('---\r\n')) return null
  const closeIdx = content.indexOf('\n---', 4)
  if (closeIdx === -1) return null
  const block = content.slice(0, closeIdx)
  // Combine the three alternation branches into one capture group so we get a
  // single, always-defined string without juggling `match[1] | match[2] | match[3]`.
  // The outer `(?:…)` strips the value's quotes if present.
  const match = /^session_id:\s*(?:'([^']*)'|"([^"]*)"|([^\n\r]+))\s*$/m.exec(block)
  if (!match) return null
  const captured = (match[0].replace(/^session_id:\s*/, '').trim()).replace(/^['"]|['"]$/g, '')
  return captured === '' ? null : captured
}

/** Whether a string already contains a frontmatter opener (`---\n…\n---`). */
function hasFrontmatter(content: string): boolean {
  return (
    (content.startsWith('---\n') || content.startsWith('---\r\n')) &&
    content.includes('\n---', 4)
  )
}

/**
 * Replace the `updated:` key inside an existing frontmatter block with the
 * new timestamp. Falls back to a no-op if the frontmatter is malformed — the
 * append still proceeds so the user's turn is not lost.
 */
function rewriteUpdated(content: string, isoTimestamp: string): string {
  if (!hasFrontmatter(content)) return content
  const closeIdx = content.indexOf('\n---', 4)
  if (closeIdx === -1) return content
  const block = content.slice(0, closeIdx)
  const rest = content.slice(closeIdx)
  const newBlock = block.replace(
    /^updated:.*$/m,
    `updated: ${quoteYamlString(isoTimestamp)}`,
  )
  return newBlock + rest
}

/** Body text for a `## user` / `## assistant` turn block. */
function formatTurnBlock(turn: { readonly user: string; readonly assistant: string }, at: string): string {
  return [
    `## user`,
    `<!-- at: ${at} -->`,
    '',
    turn.user,
    '',
    `## assistant`,
    `<!-- at: ${at} -->`,
    '',
    turn.assistant,
    '',
  ].join('\n')
}

/** Body text for a `## proposal` audit block (REQ-ASM-046). */
function formatProposalBlock(args: {
  readonly path: string
  readonly decision: 'accepted' | 'rejected'
  readonly decidedAt: string
  readonly rationale: string | undefined
}): string {
  const lines = [
    `## proposal`,
    `<!-- decided_at: ${args.decidedAt} -->`,
    '',
    `- path: ${args.path}`,
    `- decision: ${args.decision}`,
    `- decided_at: ${args.decidedAt}`,
  ]
  if (args.rationale !== undefined && args.rationale !== '') {
    lines.push(`- rationale: ${args.rationale}`)
  }
  lines.push('')
  return lines.join('\n')
}

/**
 * Append-only session log writer for the agent side-panel chat.
 *
 * Construction is cheap and stateful: each instance owns the per-log-file
 * mutex map. Tests and the production wiring should share one instance per
 * Obsidian plugin lifetime so concurrent appends serialise correctly.
 */
export class SessionLogWriter {
  /** Per-log-file write queue. The promise chain serialises appends. */
  private readonly mutex = new Map<string, Promise<void>>()

  /**
   * Conflict resolution memoisation: once `session_id=A` has been redirected
   * from `<base>.md` to `<base>-2.md`, subsequent appends for the same
   * `sessionId` reuse `<base>-2.md` without re-running the suffix loop.
   */
  private readonly resolvedPaths = new Map<string, string>()

  /**
   * Per-sessionId guard so the conflict warning fires exactly once
   * (REQ-ASM-039 DoD).
   */
  private readonly warnedSessions = new Set<string>()

  constructor(
    private readonly vault: VaultPort,
    private readonly logger: LoggerPort,
    private readonly specsFolder: string,
    private readonly nowIso: () => string,
  ) {}

  /**
   * Idempotent: ensures the parent sessions folder exists. Used by the wiring
   * code on thread creation. Returns a Result rather than throwing so the
   * call site stays in the never-throws application-layer style (REQ-ASM-015).
   */
  async ensureSessionsFolder(feature: string | null): Promise<void> {
    const probe = resolveSessionLogPath(feature, '__probe__', this.specsFolder)
    const folder = parentFolder(probe)
    if (folder === '') return
    const result = await tryAsync(() => this.vault.createFolder(folder))
    if (!result.ok) {
      // Most VaultPort impls throw when the folder already exists; that is a
      // success from our point of view. Log at `debug` so the production
      // surface stays quiet.
      this.logger.debug('SessionLogWriter.ensureSessionsFolder ignored', {
        folder,
        reason: String(result.error.message),
      })
    }
  }

  /**
   * Fire-and-forget: serialises onto the per-log-file mutex and never rejects.
   * Errors are routed to `logger.error` with a redacted `sessionId`
   * (NFR-ASM-005). Callers do **not** await (T-ASM-048 DoD).
   */
  appendUserAssistant(
    thread: ChatThreadRecord,
    turn: { readonly user: string; readonly assistant: string },
  ): Promise<void> {
    return this.enqueue(thread, async (resolvedPath) => {
      const at = this.nowIso()
      const exists = await this.vault.fileExists(resolvedPath)
      if (!exists) {
        await this.writeFreshFile(resolvedPath, thread, [formatTurnBlock(turn, at)], at)
        return
      }
      const existing = await this.vault.readFile(resolvedPath)
      const updated = rewriteUpdated(existing, at)
      const next = `${updated.endsWith('\n') ? updated : `${updated}\n`}${formatTurnBlock(turn, at)}`
      await this.vault.writeFile(resolvedPath, next)
    })
  }

  /**
   * Appends a `## proposal` audit row. Callers **do** await this (REQ-ASM-046)
   * — the proposal-commit pipeline treats a missing audit row as a hard
   * failure. Internal queueing still goes through the same mutex so we keep a
   * single linearised history per log file.
   */
  appendProposalDecision(args: {
    readonly thread: ChatThreadRecord
    readonly proposal: SessionLogProposalInput
    readonly decision: 'accepted' | 'rejected'
    readonly decidedAt: string
  }): Promise<void> {
    return this.enqueue(args.thread, async (resolvedPath) => {
      const exists = await this.vault.fileExists(resolvedPath)
      const block = formatProposalBlock({
        path: args.proposal.envelope.path,
        decision: args.decision,
        decidedAt: args.decidedAt,
        rationale: args.proposal.envelope.rationale,
      })
      if (!exists) {
        await this.writeFreshFile(resolvedPath, args.thread, [block], args.decidedAt)
        return
      }
      const existing = await this.vault.readFile(resolvedPath)
      const updated = rewriteUpdated(existing, args.decidedAt)
      const next = `${updated.endsWith('\n') ? updated : `${updated}\n`}${block}`
      await this.vault.writeFile(resolvedPath, next)
    })
  }

  /**
   * Wraps the `op` in the per-log mutex and a top-level catch that routes
   * failures to `logger.error`. Resolves the conflict-suffix path once per
   * sessionId.
   *
   * `appendProposalDecision` callers await this promise (REQ-ASM-046);
   * `appendUserAssistant` callers do not (REQ-ASM-040).
   */
  private enqueue(
    thread: ChatThreadRecord,
    op: (resolvedPath: string) => Promise<void>,
  ): Promise<void> {
    if (thread.sessionId === null) {
      // No `session_id` captured yet — the writer cannot resolve a path
      // (RES-ASM-001 §F1). Surface as a debug line and drop the write.
      this.logger.debug('SessionLogWriter: drop write (no sessionId)', {
        threadId: thread.threadId,
      })
      return Promise.resolve()
    }
    const sessionId = thread.sessionId
    const basePath = resolveSessionLogPath(thread.feature, sessionId, this.specsFolder)
    const queueKey = basePath
    const previous = this.mutex.get(queueKey) ?? Promise.resolve()
    const next = previous
      .catch(() => {
        // Prior op failed; we've already logged. Reset the chain so this op
        // still runs.
      })
      .then(async () => {
        const resolvedPath = await this.resolveConflictSuffix(basePath, sessionId)
        await this.ensureParentFolder(resolvedPath)
        await op(resolvedPath)
      })
      .catch((thrown: unknown) => {
        this.logger.error(
          'SessionLogWriter append failed',
          thrown instanceof Error ? thrown : new Error(String(thrown)),
          { redactedSessionId: redactSessionId(sessionId) },
        )
      })
    this.mutex.set(queueKey, next)
    return next
  }

  /**
   * Walk `-2`, `-3`, … suffixes until we find a path that either does not
   * exist or carries our own `session_id`. Memoised per `sessionId`.
   */
  private async resolveConflictSuffix(basePath: string, sessionId: string): Promise<string> {
    const cached = this.resolvedPaths.get(sessionId)
    if (cached !== undefined) return cached
    const exists = await this.vault.fileExists(basePath)
    if (!exists) {
      this.resolvedPaths.set(sessionId, basePath)
      return basePath
    }
    const existing = await this.vault.readFile(basePath)
    const existingSession = extractSessionIdFromFrontmatter(existing)
    if (existingSession === sessionId) {
      this.resolvedPaths.set(sessionId, basePath)
      return basePath
    }
    // Conflicting `session_id` (or missing frontmatter): walk the suffix loop.
    if (!this.warnedSessions.has(sessionId)) {
      this.warnedSessions.add(sessionId)
      this.logger.warn('SessionLogWriter: session-id conflict; appending suffix', {
        basePath,
        redactedSessionId: redactSessionId(sessionId),
      })
    }
    let n = 2
    // Bounded to keep tests deterministic; in practice we expect ≤ 1.
    while (n < 1000) {
      const candidate = withSuffix(basePath, n)
      const candidateExists = await this.vault.fileExists(candidate)
      if (!candidateExists) {
        this.resolvedPaths.set(sessionId, candidate)
        return candidate
      }
      const candidateContent = await this.vault.readFile(candidate)
      const candidateSession = extractSessionIdFromFrontmatter(candidateContent)
      if (candidateSession === sessionId) {
        this.resolvedPaths.set(sessionId, candidate)
        return candidate
      }
      n += 1
    }
    // Defensive: fall back to a UUID-keyed path so we never silently overwrite.
    const overflow = `${basePath}-${sessionId}`
    this.resolvedPaths.set(sessionId, overflow)
    return overflow
  }

  /** Idempotent parent-folder creation; swallows already-exists errors. */
  private async ensureParentFolder(path: string): Promise<void> {
    const folder = parentFolder(path)
    if (folder === '') return
    const result = await tryAsync(() => this.vault.createFolder(folder))
    if (!result.ok) {
      // Most likely the folder already exists; downgrade to debug.
      this.logger.debug('SessionLogWriter: createFolder ignored', {
        folder,
        reason: String(result.error.message),
      })
    }
  }

  /**
   * Write a brand-new session log with its frontmatter + one body block.
   * `at` is reused as both `created` and `updated` on first write so
   * REQ-ASM-034 (`updated > created`) can hold true on the second write.
   */
  private async writeFreshFile(
    path: string,
    thread: ChatThreadRecord,
    blocks: ReadonlyArray<string>,
    at: string,
  ): Promise<void> {
    const fm = buildFrontmatter({
      session_id: thread.sessionId ?? '',
      feature: thread.feature,
      transport: thread.transport,
      created: at,
      updated: at,
    })
    const body = blocks.join('')
    await this.vault.writeFile(path, `${fm}\n${body}`)
  }
}
