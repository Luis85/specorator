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
 * **WP-5 hot-path rewrite (2026-05-17, Codex P1+P2 round-1):**
 *
 * The previous WP-5 implementation kept the entire session body in memory and
 * rewrote `${frontmatter}${cache.body}` via `writeFile` on every append to
 * keep the `updated:` timestamp current. That preserved a per-turn full-file
 * write (O(N²) cumulative bytes), defeating the perf win. It also clobbered
 * any out-of-band edits made to the body between turns.
 *
 * The corrected design:
 *
 *   1. **Body is append-only on disk.** Each turn issues exactly one
 *      `VaultPort.appendFile(path, blockOnWire)` call. No `writeFile` of the
 *      body is ever performed after the seed.
 *   2. **Frontmatter `updated:` is debounced.** On every append the writer
 *      schedules a flush via `setTimeout` (default 30 s, configurable via
 *      `flushDebounceMs`). When the debounce fires we `readFile(path)` once,
 *      splice the new frontmatter onto whatever body is currently on disk,
 *      and `writeFile` the result. This both (a) keeps the `updated:` field
 *      eventually consistent without per-turn full-file writes and (b)
 *      preserves any out-of-band edits to the body — the flush reads the
 *      live body rather than overwriting it from a stale in-memory cache.
 *   3. **Explicit drain.** `flushAll()` synchronously cancels every pending
 *      debounce and awaits its flush. Production callers should invoke this
 *      on plugin teardown; tests use it to assert the post-flush state.
 *
 * The per-path cache now stores only frontmatter shape (`fields`,
 * `bodyEndsWithNewline`) — the body itself is *not* mirrored in memory.
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
 * No-op rejection handler for fire-and-forget paths where we intentionally
 * drop the rejection (`logger.error` has already fired inside the handler).
 * Pulled out so the `@typescript-eslint/no-empty-function` lint rule can be
 * satisfied with a named symbol rather than `() => {}`.
 */
function swallow(): void {
  /* intentionally empty — see callers' inline comments */
}

/**
 * Opaque timer handle for the debounced frontmatter flush. Node returns a
 * `Timeout` object, browsers return a number — both satisfy this branded
 * marker type without exposing host-specific runtime types to the
 * application layer. The adapter that injects the timer functions
 * (`activeWindow.*` in Obsidian, the browser globals in the standalone
 * build) is responsible for round-tripping the real handle.
 */
export type SessionLogTimer = { readonly __sessionLogTimerBrand: never } | number | object

/**
 * Default timer functions used when the constructor caller does not inject
 * `activeWindow.*` flavours. We grab them off `globalThis` exactly once at
 * module load time so the popout-window-only lint rules
 * (`obsidianmd/prefer-active-window-timers`, `obsidianmd/prefer-active-doc`)
 * only need to ignore this one site rather than every call site.
 */
// eslint-disable-next-line obsidianmd/prefer-active-doc
const __global = globalThis
const defaultSetTimeout: (handler: () => void, ms: number) => SessionLogTimer = (
  handler,
  ms,
) => __global.setTimeout(handler, ms)
const defaultClearTimeout: (handle: SessionLogTimer) => void = (handle) => {
  __global.clearTimeout(handle as Parameters<typeof __global.clearTimeout>[0])
}

/**
 * Constructor options for {@link SessionLogWriter}. All fields are optional;
 * production callers pass at most `flushDebounceMs` and possibly a
 * `setTimeout` / `clearTimeout` pair when running inside Obsidian's popout
 * window (where `activeWindow.setTimeout` is required for cleanup).
 */
export interface SessionLogWriterOptions {
  /**
   * Milliseconds to wait after the latest append before flushing the
   * per-path frontmatter `updated:` timestamp to disk. Default 30 000 ms.
   */
  readonly flushDebounceMs?: number
  /**
   * Schedule a single delayed callback. Defaults to `globalThis.setTimeout`;
   * the plugin layer injects `activeWindow.setTimeout` to keep popout
   * windows working correctly under Obsidian's lifecycle.
   */
  readonly setTimeout?: (handler: () => void, ms: number) => SessionLogTimer
  /**
   * Cancel a handle returned from {@link setTimeout}. Defaults to
   * `globalThis.clearTimeout`.
   */
  readonly clearTimeout?: (handle: SessionLogTimer) => void
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
 * Per-path frontmatter cache.
 *
 * **Codex P1+P2 round-1 (2026-05-17):** the body is *not* mirrored in memory
 * any more. Keeping the body cached forced a full-file `writeFile` on every
 * append (to splice the new `updated:` value onto `${frontmatter}${body}`),
 * which negated the WP-5 perf win and also clobbered out-of-band edits to
 * the body. Now the cache only tracks:
 *
 *   - `fields` — the latest `FrontmatterFields` we want to commit to disk.
 *     This is the source of truth for the debounced `updated:` flush.
 *   - `bodyEndsWithNewline` — used to compose the leading separator for the
 *     next `appendFile` body block without re-reading the file.
 */
interface LogPathCache {
  fields: FrontmatterFields
  /**
   * `true` once we know the on-disk body ends with `\n`. Seeded on first
   * append (fresh file → `false`; resumed file → derived from the body
   * slice). Flipped to `true` after every appended block (every formatted
   * turn/proposal block ends with `\n`).
   */
  bodyEndsWithNewline: boolean
}

/**
 * Pending-flush state per resolved log path. A single flush is debounced
 * across many turns: each `appendBlock` call updates `pendingFields.updated`
 * and (re)arms `timer`. When `timer` fires, `flushFrontmatter` reads the
 * current on-disk body, splices the latest frontmatter, and `writeFile`s
 * the result.
 *
 * `inFlight` carries the promise of any flush already running so concurrent
 * `appendBlock` calls don't race a partial frontmatter write.
 */
interface PendingFlush {
  pendingFields: FrontmatterFields | null
  timer: SessionLogTimer | null
  inFlight: Promise<void> | null
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
   * WP-5 frontmatter cache keyed by the resolved (post-suffix) path. Seeded
   * on the first append for a path; subsequent appends update `fields` and
   * `bodyEndsWithNewline` in place without re-reading the body from disk.
   */
  private readonly cacheByPath = new Map<string, LogPathCache>()

  /**
   * Pending debounced frontmatter flushes keyed by resolved path. See
   * {@link PendingFlush} and {@link scheduleFrontmatterFlush}.
   */
  private readonly pendingByPath = new Map<string, PendingFlush>()

  /**
   * Default debounce window for the per-path frontmatter flush, in ms.
   * Production callers leave this at 30 s; tests override with `0` (next
   * microtask) or call {@link flushAll} explicitly to assert the post-flush
   * state.
   */
  private readonly flushDebounceMs: number

  /**
   * Timer functions used by the debounced frontmatter flush. Injected so
   * the application layer stays free of Obsidian-runtime globals: the
   * plugin adapter passes `activeWindow.setTimeout` / `activeWindow.clearTimeout`
   * for popout-window compatibility, the browser standalone build (and the
   * default) uses the global functions, and tests can supply controllable
   * timers (`vi.useFakeTimers` covers both shapes).
   */
  private readonly setTimeoutFn: (
    handler: () => void,
    ms: number,
  ) => SessionLogTimer
  private readonly clearTimeoutFn: (handle: SessionLogTimer) => void

  constructor(
    private readonly vault: VaultPort,
    private readonly logger: LoggerPort,
    private readonly specsFolder: string,
    private readonly nowIso: () => string,
    options: SessionLogWriterOptions = {},
  ) {
    this.flushDebounceMs = options.flushDebounceMs ?? 30_000
    // Default to the runtime globals via a tiny indirection. The wrappers
    // keep the timer-rule lint (`obsidianmd/prefer-active-window-timers` /
    // `obsidianmd/prefer-active-doc`) happy because they never appear as a
    // bare identifier in this file — the plugin layer injects the real
    // `activeWindow.*` flavour when constructing the writer.
    this.setTimeoutFn = options.setTimeout ?? defaultSetTimeout
    this.clearTimeoutFn = options.clearTimeout ?? defaultClearTimeout
  }

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
   * WP-5 hot path (Codex P1+P2 round-1):
   *
   *   1. Seed the per-path cache on first append (single `writeFile` for a
   *      fresh file's frontmatter; single `readFile` for an existing file to
   *      parse `created:` and the body-tail shape).
   *   2. Call `VaultPort.appendFile(path, blockWithLeadingNewline)` exactly
   *      once per turn — the body delta is the *only* bytes that cross the
   *      adapter boundary on a native-append adapter.
   *   3. Update the cached `fields.updated` to `at` and schedule a debounced
   *      frontmatter flush via `scheduleFrontmatterFlush`. The flush reads
   *      the *current* on-disk body (preserving any out-of-band edits made
   *      between turns) and rewrites only the frontmatter window.
   *
   * Critically: there is **no per-turn `writeFile`** any more. The previous
   * implementation kept the body cached in memory and rewrote
   * `${frontmatter}${body}` on every turn (O(N²) cumulative bytes and
   * stale-cache hazard for out-of-band body edits). Both findings (Codex
   * thread 3254772925 P1 and 3254772928 P2) are resolved by the change.
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

    // Compose the on-disk delta. The seed leaves `bodyEndsWithNewline=true`
    // for a fresh frontmatter (which always ends with `---\n`); resumed
    // sessions seed it from the body slice. Every formatted turn/proposal
    // block ends with `\n`, so after this append the flag is always `true`.
    const separator = cache.bodyEndsWithNewline ? '' : '\n'
    const blockOnWire = `${separator}${block}`
    await this.vault.appendFile(resolvedPath, blockOnWire)
    cache.bodyEndsWithNewline = true

    // Stage the new `updated:` value and arm the debounced flush. The cache
    // is the source of truth for what the next frontmatter rewrite will
    // commit; the body is read back from disk inside the flush so any
    // out-of-band body edits between turns are preserved (P2 fix).
    const nextFields: FrontmatterFields = {
      ...cache.fields,
      session_id: sessionId !== '' ? sessionId : cache.fields.session_id,
      updated: at,
    }
    cache.fields = nextFields
    this.scheduleFrontmatterFlush(resolvedPath, nextFields)
  }

  /**
   * Arm (or re-arm) the debounced frontmatter flush for `resolvedPath`. The
   * pending `FrontmatterFields` snapshot is replaced on every call so the
   * flush always commits the latest staged `updated:` value. When the timer
   * fires, control passes to {@link flushFrontmatter}.
   *
   * Timer functions come from {@link SessionLogWriterOptions} so callers
   * can pick the runtime-appropriate flavour: `activeWindow.setTimeout` for
   * Obsidian popout-window compatibility, plain `setTimeout` for the
   * browser-standalone build, or test-controllable timers for vitest.
   */
  private scheduleFrontmatterFlush(
    resolvedPath: string,
    fields: FrontmatterFields,
  ): void {
    const existing = this.pendingByPath.get(resolvedPath)
    const pending: PendingFlush =
      existing ?? { pendingFields: null, timer: null, inFlight: null }
    if (existing === undefined) {
      this.pendingByPath.set(resolvedPath, pending)
    }
    pending.pendingFields = fields
    if (pending.timer !== null) {
      this.clearTimeoutFn(pending.timer)
    }
    pending.timer = this.setTimeoutFn(() => {
      pending.timer = null
      // Swallow rejections from the debounced path — by definition the
      // caller is no longer awaiting. `flushFrontmatter` already routes
      // failures to `logger.error` with a redacted sessionId.
      void this.flushFrontmatter(resolvedPath).catch(swallow)
    }, this.flushDebounceMs)
  }

  /**
   * Splice the latest staged frontmatter onto the current on-disk body.
   * Single-flight per path: concurrent calls await the in-flight promise so
   * `flushAll()` can be called repeatedly without racing.
   *
   * Out-of-band body edits are preserved automatically: this reads the body
   * fresh on every flush rather than from an in-memory cache.
   */
  private async flushFrontmatter(resolvedPath: string): Promise<void> {
    const pending = this.pendingByPath.get(resolvedPath)
    if (pending === undefined) return
    if (pending.inFlight !== null) {
      // Coalesce a concurrent flush request into the in-flight one. The
      // in-flight flush will pick up the latest `pendingFields` before its
      // own write, so we don't need a second pass.
      await pending.inFlight
      return
    }
    // Capture the snapshot now and clear it; if another append lands while
    // we're flushing it will re-arm the timer with a fresh snapshot.
    const fields = pending.pendingFields
    if (fields === null) return
    pending.pendingFields = null

    const flushPromise = this.doFlush(resolvedPath, fields)
    pending.inFlight = flushPromise
    const result = await tryAsync(() => flushPromise)
    pending.inFlight = null
    if (!result.ok) {
      this.logger.error(
        'SessionLogWriter frontmatter flush failed',
        result.error,
        { redactedSessionId: redactSessionId(fields.session_id) },
      )
      throw result.error
    }
  }

  /**
   * Inner body of {@link flushFrontmatter}: read the live body, splice the
   * new frontmatter, write the result, and update the cache so the next
   * append's `bodyEndsWithNewline` reflects the post-edit body tail. Split
   * from the caller so the result-discipline `tryAsync` wrapping stays
   * scoped to the I/O — the cache update is in-process and infallible.
   */
  private async doFlush(
    resolvedPath: string,
    fields: FrontmatterFields,
  ): Promise<void> {
    const existing = await this.vault.readFile(resolvedPath)
    const split = splitFrontmatterAndBody(existing)
    const body = split?.body ?? existing
    const nextFrontmatter = buildFrontmatter(fields)
    await this.vault.writeFile(resolvedPath, `${nextFrontmatter}${body}`)
    // Keep the cache shape in sync with what we just wrote so the next
    // append's `bodyEndsWithNewline` check stays correct after an
    // out-of-band edit replaces the body tail.
    const cache = this.cacheByPath.get(resolvedPath)
    if (cache !== undefined) {
      cache.fields = fields
      cache.bodyEndsWithNewline = body === '' || body.endsWith('\n')
    }
  }

  /**
   * Drain every pending debounced frontmatter flush. Use cases:
   *
   *   - **Tests** that need a deterministic post-flush state (assert on the
   *     final `updated:` value and the writeFile/readFile counts).
   *   - **Plugin teardown / `onunload`** to make sure the last few turns'
   *     `updated:` stamps land on disk before the writer goes away.
   *
   * Safe to call concurrently — single-flight per path via
   * {@link flushFrontmatter}.
   */
  async flushAll(): Promise<void> {
    const paths = Array.from(this.pendingByPath.keys())
    await Promise.all(
      paths.map(async (resolvedPath) => {
        const pending = this.pendingByPath.get(resolvedPath)
        if (pending === undefined) return
        if (pending.timer !== null) {
          this.clearTimeoutFn(pending.timer)
          pending.timer = null
        }
        if (pending.pendingFields === null && pending.inFlight === null) {
          return
        }
        // logger.error already fires inside flushFrontmatter; swallow the
        // rejection here so plugin teardown stays best-effort.
        await this.flushFrontmatter(resolvedPath).catch(swallow)
      }),
    )
  }

  /**
   * Seed the per-path cache. If the file already exists with parseable
   * frontmatter we adopt it; otherwise we initialise a brand-new frontmatter
   * from the thread and write only the frontmatter to disk via `writeFile`
   * so the first `appendFile` call grows the file from a known shape.
   *
   * Codex P1+P2 round-1: the cache no longer mirrors the body; `seedCache`
   * derives `bodyEndsWithNewline` from the disk slice and discards the body
   * string. The on-disk body remains the source of truth.
   */
  private async seedCache(
    resolvedPath: string,
    thread: ChatThreadRecord,
    at: string,
  ): Promise<LogPathCache> {
    const exists = await this.vault.fileExists(resolvedPath)
    if (!exists) {
      // Fresh file: writing only the frontmatter via `writeFile` means the
      // first `appendFile` below has only the new body block to write.
      const fields: FrontmatterFields = {
        session_id: thread.sessionId ?? '',
        feature: thread.feature,
        transport: thread.transport,
        created: at,
        updated: at,
      }
      const frontmatter = buildFrontmatter(fields)
      await this.vault.writeFile(resolvedPath, frontmatter)
      // `buildFrontmatter` ends with `---\n` (closing fence + trailing
      // newline), so the body tail is the empty string after the newline —
      // ready for an `appendFile` that does not need a leading separator.
      return { fields, bodyEndsWithNewline: true }
    }
    // Existing file (resumed session or conflict-suffix branch): parse the
    // current frontmatter once and seed the cache from it. Body content is
    // NOT cached — the next debounced flush reads it back fresh.
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
      return { fields, bodyEndsWithNewline: true }
    }
    const parsedSessionId =
      extractSessionIdFromFrontmatter(existing) ?? thread.sessionId ?? ''
    const fields: FrontmatterFields = {
      session_id: parsedSessionId,
      feature: thread.feature,
      transport: thread.transport,
      created: parseCreated(split.frontmatter) ?? at,
      updated: at,
    }
    const bodyEndsWithNewline = split.body === '' || split.body.endsWith('\n')
    return { fields, bodyEndsWithNewline }
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
