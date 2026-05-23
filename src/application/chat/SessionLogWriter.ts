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
 * Thrown by {@link SessionLogWriter.appendProposalDecision} when the
 * caller-supplied thread has no captured `session_id`. Audit rows are
 * load-bearing (REQ-ASM-046) — the commit pipeline must surface this as a
 * hard failure (`SESSION_LOG_FAILED`) so a vault write is not reported
 * successful while its decision row is silently dropped.
 *
 * Free-text turns (`appendUserAssistant`) remain fire-and-forget per
 * REQ-ASM-040 and continue to drop the write with a debug log when no
 * session id is present — they do not throw this error.
 */
export class SessionLogNoSessionError extends Error {
  public readonly name = 'SessionLogNoSessionError'

  constructor(threadId: string) {
    super(
      `SessionLogWriter: cannot append proposal decision — thread ${threadId} has no captured session_id`,
    )
    Object.setPrototypeOf(this, new.target.prototype)
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

/**
 * Serialise the four-key frontmatter (REQ-ASM-033; Q-E.2 dropped `transport:`).
 *
 * Q-E.2 rationale: `transport` is a runtime concern of the in-memory
 * `ChatThreadRecord` (REQ-MPS-005), not a property of the chat history itself.
 * Downstream tools that grep the log do not branch on transport, and including
 * it in the YAML couples the persisted history to the discriminated provider
 * model. Dropping the key keeps the on-disk schema stable across provider
 * migrations.
 */
function buildFrontmatter(frontmatter: {
  readonly session_id: string
  readonly feature: string | null
  readonly created: string
  readonly updated: string
}): string {
  return [
    '---',
    `session_id: ${quoteYamlString(frontmatter.session_id)}`,
    `feature: ${frontmatter.feature === null ? 'null' : quoteYamlString(frontmatter.feature)}`,
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

/**
 * Decision value for a `## proposal` audit row.
 *
 *   - `accepted` — user clicked Accept and the vault write landed.
 *   - `rejected` — user clicked Reject (or cancelled the overwrite modal).
 *   - `failed`   — user clicked Accept but the vault write failed; the audit
 *                  row mirrors the terminal failure state so the session log
 *                  reflects every decided outcome (trust-first invariant —
 *                  SPEC-ASM-001 §3.6 step 3, REQ-ASM-046).
 */
export type ProposalDecisionValue = 'accepted' | 'rejected' | 'failed'

/** Body text for a `## proposal` audit block (REQ-ASM-046). */
function formatProposalBlock(args: {
  readonly path: string
  readonly decision: ProposalDecisionValue
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
   *
   * REQ-ASM-040: when the thread has no captured `session_id`, drops the
   * write with a debug log and resolves successfully — the free-text path
   * tolerates a missing session for the first turn.
   */
  appendUserAssistant(
    thread: ChatThreadRecord,
    turn: { readonly user: string; readonly assistant: string },
  ): Promise<void> {
    if (thread.sessionId === null) {
      // No `session_id` captured yet — drop with a debug line, do NOT throw
      // (matches REQ-ASM-040 fire-and-forget contract).
      this.logger.debug('SessionLogWriter: drop write (no sessionId)', {
        threadId: thread.threadId,
      })
      return Promise.resolve()
    }
    return this._runQueued(thread, turn.user, async (resolvedPath) => {
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
    }).catch((thrown: unknown) => {
      // Fire-and-forget swallow — route to logger.error with a redacted
      // sessionId (NFR-ASM-005) and resolve successfully so external callers
      // never see a rejection (REQ-ASM-040).
      this.logger.error(
        'SessionLogWriter append failed',
        thrown instanceof Error ? thrown : new Error(String(thrown)),
        { redactedSessionId: redactSessionId(thread.sessionId) },
      )
    })
  }

  /**
   * Appends a `## proposal` audit row. Callers **do** await this (REQ-ASM-046)
   * — the proposal-commit pipeline treats a missing audit row as a hard
   * failure. Internal queueing still goes through the same mutex so we keep a
   * single linearised history per log file.
   *
   * **Unlike `appendUserAssistant`, this method rejects** on either:
   *   - missing `session_id` on the thread (throws {@link SessionLogNoSessionError}); or
   *   - underlying `VaultPort.writeFile` / `readFile` failure (re-thrown).
   *
   * The commit pipeline surfaces both as `SESSION_LOG_FAILED` so the user
   * never sees a vault-mutating action reported successful while its audit
   * row was silently dropped (trust-first invariant, NFR-ASM-011).
   */
  appendProposalDecision(args: {
    readonly thread: ChatThreadRecord
    readonly proposal: SessionLogProposalInput
    readonly decision: ProposalDecisionValue
    readonly decidedAt: string
  }): Promise<void> {
    if (args.thread.sessionId === null) {
      // Audit-row writes are load-bearing — surface the missing session as a
      // hard failure rather than silently dropping. The commit pipeline maps
      // this to `SESSION_LOG_FAILED`.
      this.logger.error(
        'SessionLogWriter.appendProposalDecision: no sessionId',
        new SessionLogNoSessionError(args.thread.threadId),
        { threadId: args.thread.threadId },
      )
      return Promise.reject(new SessionLogNoSessionError(args.thread.threadId))
    }
    return this._runQueued(args.thread, null, async (resolvedPath) => {
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
   * Wraps the `op` in the per-log mutex. Resolves the conflict-suffix path
   * once per sessionId and ensures the parent folder exists. **Rethrows** any
   * failure so the caller decides whether to swallow (fire-and-forget for
   * `appendUserAssistant` per REQ-ASM-040) or surface (load-bearing for
   * `appendProposalDecision` per REQ-ASM-046).
   *
   * Pre-condition: `thread.sessionId !== null`. Both public callers check
   * this before invoking `_runQueued`.
   */
  private _runQueued(
    thread: ChatThreadRecord,
    firstUserMessage: string | null,
    op: (resolvedPath: string) => Promise<void>,
  ): Promise<void> {
    // Type-narrow: both callers gate on `sessionId !== null` already, but a
    // defensive runtime assertion keeps this method total even if a future
    // caller forgets.
    if (thread.sessionId === null) {
      return Promise.reject(new SessionLogNoSessionError(thread.threadId))
    }
    const sessionId = thread.sessionId
    // Q-E.1 — slug-based path is the new default. Backwards-compat probe in
    // `resolveConflictSuffix` falls back to the legacy `<sessionId>.md` path
    // when it already exists with our session_id, so existing user vaults
    // continue writing to the file they already have.
    const slugPath =
      firstUserMessage === null
        ? resolveSessionLogPath(thread.feature, sessionId, this.specsFolder)
        : resolveSessionLogPath(thread.feature, sessionId, this.specsFolder, {
            createdAt: thread.createdAt,
            firstUserMessage,
          })
    const legacyPath = resolveSessionLogPath(thread.feature, sessionId, this.specsFolder)
    // Queue under the legacy path so concurrent appends on the same thread —
    // regardless of which call-site supplied `firstUserMessage` — serialise
    // through the same mutex. The legacy path is stable per (feature, sessionId).
    const queueKey = legacyPath
    const previous = this.mutex.get(queueKey) ?? Promise.resolve()
    const next = previous
      .catch(() => {
        // Prior op failed; the original caller has already received that
        // rejection (or swallowed it). Reset the chain so this op still runs.
      })
      .then(async () => {
        const resolvedPath = await this.resolveConflictSuffix(
          slugPath,
          legacyPath,
          sessionId,
        )
        await this.ensureParentFolder(resolvedPath)
        await op(resolvedPath)
      })
    // Store the chain on the mutex; subsequent enqueues link off this `next`.
    // We deliberately do NOT swallow rejections here — the queue must propagate
    // failure to the caller, while still allowing follow-on writes to proceed
    // (the `.catch(() => {})` above on the next iteration handles chain reset).
    this.mutex.set(queueKey, next)
    return next
  }

  /**
   * Resolve the final path for a write to `sessionId`.
   *
   * Q-E.1: callers prefer the slug-based `slugPath`; the writer probes for
   * a pre-existing legacy `<sessionId>.md` file first (a thread minted before
   * Q-E.1 landed) and reuses it when its frontmatter carries our session_id.
   * Otherwise the slug path is used as the base, with the `-2`, `-3`, …
   * conflict-suffix loop applied if a different `session_id` already squats
   * on the slug path.
   *
   * Memoised per `sessionId` so subsequent appends in the same writer
   * instance skip the probes.
   */
  private async resolveConflictSuffix(
    slugPath: string,
    legacyPath: string,
    sessionId: string,
  ): Promise<string> {
    const cached = this.resolvedPaths.get(sessionId)
    if (cached !== undefined) return cached
    const reuse = await this.tryReuseExistingLog(slugPath, legacyPath, sessionId)
    if (reuse !== null) {
      this.resolvedPaths.set(sessionId, reuse)
      return reuse
    }
    const exists = await this.vault.fileExists(slugPath)
    if (!exists) {
      this.resolvedPaths.set(sessionId, slugPath)
      return slugPath
    }
    const existing = await this.vault.readFile(slugPath)
    const existingSession = extractSessionIdFromFrontmatter(existing)
    if (existingSession === sessionId) {
      this.resolvedPaths.set(sessionId, slugPath)
      return slugPath
    }
    // Conflicting `session_id` (or missing frontmatter): walk the suffix loop.
    if (!this.warnedSessions.has(sessionId)) {
      this.warnedSessions.add(sessionId)
      this.logger.warn('SessionLogWriter: session-id conflict; appending suffix', {
        basePath: slugPath,
        redactedSessionId: redactSessionId(sessionId),
      })
    }
    let n = 2
    // Bounded to keep tests deterministic; in practice we expect ≤ 1.
    while (n < 1000) {
      const candidate = withSuffix(slugPath, n)
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
    const overflow = `${slugPath}-${sessionId}`
    this.resolvedPaths.set(sessionId, overflow)
    return overflow
  }

  /**
   * Backwards-compat probe (Q-E.1): if a pre-Q-E thread already has a file
   * at the legacy `<sessionId>.md` basename and its frontmatter session_id
   * matches, return that path so continuing turns append to the same file
   * instead of orphaning history. Returns `null` when no reuse is possible.
   */
  private async tryLegacyReuse(
    slugPath: string,
    legacyPath: string,
    sessionId: string,
  ): Promise<string | null> {
    if (legacyPath === slugPath) return null
    const legacyExists = await this.vault.fileExists(legacyPath)
    if (!legacyExists) return null
    const legacyContent = await this.vault.readFile(legacyPath)
    const legacySession = extractSessionIdFromFrontmatter(legacyContent)
    return legacySession === sessionId ? legacyPath : null
  }

  /**
   * Probe for an existing log this writer should reuse for `sessionId`.
   * Runs the legacy `<sessionId>.md` probe first (back-compat for files
   * minted before Q-E.1). When the caller had no `firstUserMessage` hint
   * (proposal-decision callers, REQ-ASM-046) the slug path collapses to the
   * legacy path and we cannot reconstruct the human-readable basename a
   * previous user-assistant turn wrote to — a plugin restart leaves the
   * in-memory `resolvedPaths` cache empty, so without this fallback the
   * proposal audit row would land in a new file and split the conversation.
   * Scan the sessions folder for any existing log whose frontmatter
   * `session_id` matches and reuse it. Returns `null` when no reuse applies.
   */
  private async tryReuseExistingLog(
    slugPath: string,
    legacyPath: string,
    sessionId: string,
  ): Promise<string | null> {
    const legacyReuse = await this.tryLegacyReuse(slugPath, legacyPath, sessionId)
    if (legacyReuse !== null) return legacyReuse
    if (legacyPath !== slugPath) return null
    const folder = parentFolder(slugPath)
    if (folder === '') return null
    const files = await this.vault.listFiles(folder)
    for (const file of files) {
      if (!file.endsWith('.md')) continue
      const content = await this.vault.readFile(file)
      if (extractSessionIdFromFrontmatter(content) === sessionId) {
        return file
      }
    }
    return null
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
    // Q-E.2 — the YAML schema is now four keys (no `transport`). The
    // in-memory `ChatThreadRecord.transport` discriminator stays where it
    // belongs (Pinia + chatThreads persistence) and no longer leaks into the
    // chat history itself.
    const fm = buildFrontmatter({
      session_id: thread.sessionId ?? '',
      feature: thread.feature,
      created: at,
      updated: at,
    })
    const body = blocks.join('')
    await this.vault.writeFile(path, `${fm}\n${body}`)
  }
}
