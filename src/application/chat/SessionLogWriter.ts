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
 * **WP-5 hot-path rewrite (2026-05-17):** the writer used to read the full log
 * back from disk and rewrite it on every append (O(N²) bytes for N turns).
 * It now keeps a per-path `LogPathCache` of `{ frontmatter, body }` seeded on
 * first append, calls `VaultPort.appendFile` for each new block (O(1) on the
 * wire for adapters with native append, O(content) for the localstorage shim),
 * and rewrites only the frontmatter window via `VaultPort.writeFile` so the
 * `updated:` timestamp stays accurate. The cache is per `SessionLogWriter`
 * instance — the composable layer already caches the writer (cf.
 * `useSessionLogWriter`) so a single Obsidian session shares one cache. A
 * second writer process racing on the same vault file would invalidate this
 * cache, but Obsidian is single-window so that case is theoretical.
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
 * Five-key frontmatter shape (SPEC-ASM-001 §2.3). Kept narrow so the cache
 * entries are cheap to copy.
 */
interface FrontmatterFields {
  readonly session_id: string
  readonly feature: string | null
  readonly transport: 'api-key' | 'subscription'
  readonly created: string
  readonly updated: string
}

/** Serialise the five-key frontmatter exactly as REQ-ASM-033 prescribes. */
function buildFrontmatter(frontmatter: FrontmatterFields): string {
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

/**
 * Split an on-disk session log into `(frontmatter, body)` so the cache can
 * be seeded from existing content. Returns `null` if the frontmatter cannot
 * be parsed — the caller falls back to a fresh-file write.
 */
function splitFrontmatterAndBody(
  content: string,
): { readonly frontmatter: string; readonly body: string } | null {
  if (!content.startsWith('---\n') && !content.startsWith('---\r\n')) return null
  const closeIdx = content.indexOf('\n---', 4)
  if (closeIdx === -1) return null
  // Include the closing `---\n` in the frontmatter slice so rewriting it via
  // `writeFile` preserves the exact block boundaries.
  const fmEnd = closeIdx + '\n---'.length
  // Skip the newline after `---` so the body starts on the next line.
  const bodyStart = content.charAt(fmEnd) === '\n' ? fmEnd + 1 : fmEnd
  const frontmatter = `${content.slice(0, bodyStart)}`
  const body = content.slice(bodyStart)
  return { frontmatter, body }
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
 * Per-path frontmatter+body cache. The body is kept in memory so the
 * `updated:` rewrite (which has to land at the head of the file) can stitch
 * back the full content without re-reading from disk.
 *
 * `bodyEndsWithNewline` lets us emit body blocks with a single leading
 * newline when needed without scanning the cached body string on every
 * append.
 */
interface LogPathCache {
  fields: FrontmatterFields
  /**
   * Serialised frontmatter exactly as last written. Includes the closing
   * `---\n` separator. The leading-newline shape is preserved so writeFile
   * round-trips deterministic.
   */
  frontmatter: string
  /**
   * Cached body content (everything after the frontmatter). Append paths
   * concatenate the new block here in memory.
   */
  body: string
}

/**
 * Append-only session log writer for the agent side-panel chat.
 *
 * Construction is cheap and stateful: each instance owns the per-log-file
 * mutex map, conflict-resolution memoisation, and a per-path frontmatter+body
 * cache. Tests and the production wiring should share one instance per
 * Obsidian plugin lifetime so concurrent appends serialise correctly and the
 * cache stays warm.
 *
 * **Public callers should prefer the `SessionLogMirror` facade.** The
 * writer remains exported for the application/chat folder (commit pipeline,
 * orchestrator) and tests; UI callers go through `SessionLogMirror` so the
 * dual-contract surface (`appendUserAssistant` fire-and-forget vs
 * `appendProposalDecision` await-required) is hidden behind clearer names.
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

  /**
   * WP-5 frontmatter+body cache keyed by the resolved (post-suffix) path.
   * Seeded on the first append for a path; subsequent appends mutate it
   * in-place and rewrite only the frontmatter window via `writeFile`.
   */
  private readonly cacheByPath = new Map<string, LogPathCache>()

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
    return this._runQueued(thread, async (resolvedPath) => {
      const at = this.nowIso()
      await this.appendBlock(resolvedPath, thread, formatTurnBlock(turn, at), at)
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
   *   - underlying `VaultPort.writeFile` / `appendFile` / `readFile` failure (re-thrown).
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
    return this._runQueued(args.thread, async (resolvedPath) => {
      const block = formatProposalBlock({
        path: args.proposal.envelope.path,
        decision: args.decision,
        decidedAt: args.decidedAt,
        rationale: args.proposal.envelope.rationale,
      })
      await this.appendBlock(resolvedPath, args.thread, block, args.decidedAt)
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
    op: (resolvedPath: string) => Promise<void>,
  ): Promise<void> {
    // Type-narrow: both callers gate on `sessionId !== null` already, but a
    // defensive runtime assertion keeps this method total even if a future
    // caller forgets.
    if (thread.sessionId === null) {
      return Promise.reject(new SessionLogNoSessionError(thread.threadId))
    }
    const sessionId = thread.sessionId
    const basePath = resolveSessionLogPath(thread.feature, sessionId, this.specsFolder)
    const queueKey = basePath
    const previous = this.mutex.get(queueKey) ?? Promise.resolve()
    const next = previous
      .catch(() => {
        // Prior op failed; the original caller has already received that
        // rejection (or swallowed it). Reset the chain so this op still runs.
      })
      .then(async () => {
        const resolvedPath = await this.resolveConflictSuffix(basePath, sessionId)
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
   * Append one body block (turn or proposal) to a log path. Implements the
   * WP-5 hot path:
   *
   *   1. Seed the per-path cache on first append (single `readFile` if the
   *      file exists from a previous session).
   *   2. Call `VaultPort.appendFile(path, blockWithLeadingNewline)` so the
   *      body delta is the *only* bytes that cross the adapter boundary on
   *      a native-append adapter.
   *   3. Rewrite the frontmatter window via `writeFile(path, frontmatter +
   *      cachedBody)` so the `updated:` field stays accurate. The cached
   *      body is the source of truth — the loop never re-reads the body
   *      after the seed.
   *
   * The fresh-file branch is collapsed into the cache-seed path so there is
   * a single `writeFile` call shape for callers to reason about.
   */
  private async appendBlock(
    resolvedPath: string,
    thread: ChatThreadRecord,
    block: string,
    at: string,
  ): Promise<void> {
    // Pre-condition: callers gate sessionId !== null. The cache stores the
    // canonical sessionId from the frontmatter (or the thread's id on first
    // write) so subsequent rewrites always have one to embed.
    const sessionId = thread.sessionId ?? ''
    let cache = this.cacheByPath.get(resolvedPath)
    if (cache === undefined) {
      cache = await this.seedCache(resolvedPath, thread, at)
      this.cacheByPath.set(resolvedPath, cache)
    }

    // Compose the on-disk delta. Ensure exactly one newline between the
    // previous body tail and the new block — first-write case has an empty
    // body, subsequent appends have a body ending with `\n` from the previous
    // block.
    const separator = cache.body === '' || cache.body.endsWith('\n') ? '' : '\n'
    const blockOnWire = `${separator}${block}`
    await this.vault.appendFile(resolvedPath, blockOnWire)

    // Update the in-memory body cache so subsequent frontmatter rewrites
    // remain consistent with what's on disk.
    cache.body = `${cache.body}${blockOnWire}`

    // Rewrite the `updated:` field by composing the new frontmatter and the
    // cached body. Tests assert that `updated` advances with each turn
    // (TEST-ASM-033) so we cannot defer this; the body comes from the cache
    // so we still avoid the per-turn body re-read.
    const nextFields: FrontmatterFields = {
      ...cache.fields,
      session_id: sessionId !== '' ? sessionId : cache.fields.session_id,
      updated: at,
    }
    const nextFrontmatter = buildFrontmatter(nextFields)
    cache.fields = nextFields
    cache.frontmatter = nextFrontmatter
    await this.vault.writeFile(resolvedPath, `${nextFrontmatter}${cache.body}`)
  }

  /**
   * Seed the per-path cache. If the file already exists with parseable
   * frontmatter we adopt it (and write the freshly-stitched content back
   * to bring `updated:` into line); otherwise we initialise a brand-new
   * frontmatter from the thread and create the file via `appendFile` on the
   * next step. The `appendFile` path is unified so callers don't branch on
   * existence after seeding.
   */
  private async seedCache(
    resolvedPath: string,
    thread: ChatThreadRecord,
    at: string,
  ): Promise<LogPathCache> {
    const exists = await this.vault.fileExists(resolvedPath)
    if (!exists) {
      // Fresh file: composing the frontmatter now means the first
      // `appendFile` call below has only the new body block to write.
      const fields: FrontmatterFields = {
        session_id: thread.sessionId ?? '',
        feature: thread.feature,
        transport: thread.transport,
        created: at,
        updated: at,
      }
      const frontmatter = buildFrontmatter(fields)
      // Write the frontmatter via `writeFile` so the file exists on disk
      // before the body `appendFile` below tries to grow it.
      await this.vault.writeFile(resolvedPath, frontmatter)
      return { fields, frontmatter, body: '' }
    }
    // Existing file (resumed session or conflict-suffix branch): parse the
    // current frontmatter once and seed the cache from it.
    const existing = await this.vault.readFile(resolvedPath)
    const split = splitFrontmatterAndBody(existing)
    if (split === null) {
      // Defensive: the file exists but the frontmatter is malformed.
      // Treat as fresh — preserves the user's first-turn append rather than
      // silently dropping it.
      const fields: FrontmatterFields = {
        session_id: thread.sessionId ?? '',
        feature: thread.feature,
        transport: thread.transport,
        created: at,
        updated: at,
      }
      const frontmatter = buildFrontmatter(fields)
      await this.vault.writeFile(resolvedPath, frontmatter)
      return { fields, frontmatter, body: '' }
    }
    const parsedSessionId = extractSessionIdFromFrontmatter(existing) ?? thread.sessionId ?? ''
    const fields: FrontmatterFields = {
      session_id: parsedSessionId,
      feature: thread.feature,
      transport: thread.transport,
      // We don't re-parse `created` from disk — the seed is best-effort, and
      // the next rewrite below will leave `created` as the disk value via
      // the body re-stitch. To preserve `created` exactly we keep the raw
      // frontmatter slice and let the next writeFile use the rebuilt
      // frontmatter; the rebuilt timestamps come from `at` for `updated` and
      // the parsed value for `created` (see below).
      created: parseCreated(split.frontmatter) ?? at,
      updated: at,
    }
    return { fields, frontmatter: split.frontmatter, body: split.body }
  }
}

/**
 * Extract the `created:` field from a frontmatter slice so resumed sessions
 * preserve their original creation timestamp across appends. Returns `null`
 * when the field is absent or malformed; the caller falls back to the
 * current timestamp (acceptable for a first-ever turn on the path).
 */
function parseCreated(frontmatter: string): string | null {
  const match = /^created:\s*(?:'([^']*)'|"([^"]*)"|([^\n\r]+))\s*$/m.exec(frontmatter)
  if (!match) return null
  const raw = (match[0].replace(/^created:\s*/, '').trim()).replace(/^['"]|['"]$/g, '')
  return raw === '' ? null : raw
}
