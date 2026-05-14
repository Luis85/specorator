/**
 * T-ASM-011 — `ClaudeSubprocessAdapter`: subscription-transport implementation of
 * `ClaudeCliPort` driving the user-installed `claude` binary as a short-lived
 * child process per turn. Multi-turn continuity is achieved by forwarding
 * `--resume <sessionId>` argv (REQ-ASM-035) supplied by the caller, NOT by
 * reusing a long-lived process across turns.
 *
 * Why short-lived (Codex P1 fix, PR #325 review):
 *   `claude -p '<prompt>'` is a one-shot invocation — the prompt is baked into
 *   argv and the subprocess exits after responding. Reusing a single child
 *   across turns means turn 2/3/... prompts never reach the subprocess (no one
 *   writes them to stdin), so multi-turn conversations silently drop user input.
 *   The fix is to spawn a fresh child per `query()` call and let the caller
 *   thread `resumeSessionId` from the prior turn's response back into the next
 *   turn's `ClaudeCliQueryOptions`. Session-id ownership lives in chatStore /
 *   PR-ASM-3 session persistence — this adapter is stateless wrt threads.
 *
 * Satisfies:
 *   - REQ-ASM-001 (transport-agnostic port construction; no I/O in ctor)
 *   - REQ-ASM-006/027/028 (argv invariants delegated to `buildSubprocessArgs`)
 *   - REQ-ASM-009 (graceful degradation when the binary cannot be found)
 *   - REQ-ASM-010 (one subprocess per turn; multi-turn via --resume chaining —
 *     see Codex P1 note above; original "one spawn per thread, reused across
 *     turns" reading of REQ-ASM-010 was incompatible with `claude -p` semantics)
 *   - REQ-ASM-013 (forward `--append-system-prompt` via argv)
 *   - REQ-ASM-029 (chunked stdout reassembled via `readline`)
 *   - REQ-ASM-030 (non-zero exit / `is_error: true` → QUERY_FAILED)
 *   - REQ-ASM-031 (capture `session_id` from `system/init`)
 *   - REQ-ASM-035 (forward `--resume <sessionId>` via argv — load-bearing for
 *     multi-turn after the Codex P1 fix)
 *   - NFR-ASM-004 (never touches `~/.claude/`)
 *   - NFR-ASM-005, NFR-ASM-012 (log redaction; no prompt, binary path, or $HOME)
 *   - NFR-ASM-006 (startup never throws)
 *
 * Spec reference: SPEC-ASM-001 §4 (class outline, method table, helpers,
 *                 error map, long-lived vs. short-lived process discipline).
 * Design ref:     design.md §C6 / §C7.
 *
 * ToS posture (NFR-ASM-004, ADR-0031): this class never reads, opens, copies,
 * transmits, persists, or watches `~/.claude/.credentials.json` or any file
 * under the user's home Claude directory. The only interaction is that the
 * spawned `claude` binary, executing under the user's own UID, may read its
 * own credentials. The string literal for that directory is INTENTIONALLY
 * absent from this file; lint enforcement lives in T-ASM-049.
 *
 * `runStructured` / `queryStructured` are deferred to T-ASM-038 (PR-ASM-2).
 */
import type { ChildProcess, SpawnOptions } from 'node:child_process'

import {
  ClaudeCliError,
  type ClaudeCliPort,
  type ClaudeCliQueryOptions,
} from '@/domain/ports/ClaudeCliPort'
import type { LoggerPort } from '@/domain/ports/LoggerPort'
import type { PluginSettings } from '@/domain/settings/PluginSettings'
import { asSessionId, type SessionId } from '@/domain/chat/SessionId'
import { err, ok, type Result } from '@/domain/shared/Result'
import { buildSubprocessArgs } from '@/infrastructure/obsidian/buildSubprocessArgs'

// -----------------------------------------------------------------------------
// Minimal child-process surface — kept loose so the tests' EventEmitter-based
// fake satisfies it without coercion to the full `ChildProcess` type.
// -----------------------------------------------------------------------------
interface ChildProcessLike {
  readonly stdout: NodeJS.EventEmitter | null
  readonly stderr: NodeJS.EventEmitter | null
  readonly stdin?: { write: (chunk: string) => unknown; end: () => unknown } | null
  kill: (signal?: number | string) => unknown
  on(event: string, listener: (...args: unknown[]) => void): unknown
  once?(event: string, listener: (...args: unknown[]) => void): unknown
  removeAllListeners?(event?: string): unknown
  killed?: boolean
  exitCode?: number | null
}

/** Injectable spawn signature — structurally compatible with `child_process.spawn`. */
export type SpawnFn = (
  command: string,
  args: readonly string[],
  options?: SpawnOptions,
) => ChildProcess

export interface ClaudeSubprocessAdapterDeps {
  readonly getSettings: () => PluginSettings
  readonly logger: LoggerPort
  readonly resolveCliPath: () => Promise<string | null>
  readonly spawn: SpawnFn
  readonly now?: () => number
}

/** SPEC §4.3 `_clampTimeout` floor / ceiling. */
const MIN_TIMEOUT_MS = 1_000
const MAX_TIMEOUT_MS = 300_000
const DEFAULT_TIMEOUT_MS = 30_000

/** SPEC §4.3 `_kill` SIGTERM → SIGKILL grace window. */
const SIGKILL_GRACE_MS = 200

// -----------------------------------------------------------------------------
// Per-turn streaming-process record. One entry per spawn — short-lived; the
// child exits as soon as the `result` event arrives (or on error / timeout).
// -----------------------------------------------------------------------------
interface TurnProc {
  readonly child: ChildProcessLike
  /** Stdout chunk buffer for line-based NDJSON reassembly (REQ-ASM-029). */
  stdoutBuffer: string
  /** Resolver for this turn's pending promise, if still in flight. */
  pending: PendingTurn | null
  /** Most recently captured session id from a `system/init` event. */
  sessionId: SessionId | null
  /** Sticky terminal error (e.g. spawn-error before any stdout). */
  fatal: ClaudeCliError | null
}

interface PendingTurn {
  readonly resolve: (r: Result<string, ClaudeCliError>) => void
  readonly textBuffer: string[]
  readonly timeoutHandle: ReturnType<typeof setTimeout>
}

/**
 * Implementation note (REQ-ASM-001, REQ-ASM-009, REQ-ASM-010).
 *
 * `kind` is intentionally declared so that downstream `selectTransport` and
 * `isSubscriptionCapable()` narrowing (§2.1 / §9.1) can identify this adapter
 * structurally without an `instanceof` check that would force a domain ⇄
 * infrastructure import.
 */
export class ClaudeSubprocessAdapter implements ClaudeCliPort {
  public readonly kind = 'subscription' as const

  // Internal state — all I/O-free at construction time.
  private _available = false
  private _startupCompleted = false
  private _binaryPath: string | null = null
  private _shutdownCalled = false
  /**
   * The `settings.claudeCliPath` value used for the most recent resolve. We
   * re-run `startup()` whenever this differs from the current setting so a
   * user who configures the CLI path AFTER first load isn't stuck on
   * `_available = false` until plugin reload (Codex P1).
   */
  private _lastResolvedClaudeCliPath: string | null = null
  /**
   * In-flight short-lived children. We track them only so `shutdown()` can
   * SIGTERM any subprocess mid-response. On clean close / error / timeout the
   * child removes itself from this set.
   */
  private readonly _activeChildren = new Set<ChildProcessLike>()

  private readonly _getSettings: () => PluginSettings
  private readonly _logger: LoggerPort
  private readonly _resolveCliPath: () => Promise<string | null>
  private readonly _spawn: SpawnFn
  /** Injectable clock — currently unused; reserved for T-ASM-038 latency telemetry. */
  // @ts-expect-error TS6133: reserved for telemetry hooks landing in T-ASM-038.
  private readonly _now: () => number

  constructor(deps: ClaudeSubprocessAdapterDeps) {
    // REQ-ASM-001 / NFR-ASM-006 — store deps only; never touch the filesystem
    // or PATH from the constructor. All discovery is deferred to startup().
    this._getSettings = deps.getSettings
    this._logger = deps.logger
    this._resolveCliPath = deps.resolveCliPath
    this._spawn = deps.spawn
    this._now = deps.now ?? Date.now
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────

  /**
   * Resolve the binary path and cache it. Idempotent on identical input —
   * subsequent calls re-run only if `settings.claudeCliPath` has changed
   * since the last successful resolve. Without this, a user who configures
   * the CLI path AFTER first plugin load would have `_available === false`
   * for the rest of the session (Codex P1, PR-ASM-1 review).
   *
   * Never throws — any resolver failure degrades to `_available = false`.
   * Satisfies REQ-ASM-009, NFR-ASM-006.
   */
  async startup(): Promise<void> {
    const settings = this._getSettings()
    // Short-circuit if we've already resolved against the current setting
    // value. `_lastResolvedClaudeCliPath` is null sentinel for "never resolved".
    if (
      this._startupCompleted &&
      this._lastResolvedClaudeCliPath === settings.claudeCliPath
    ) {
      return
    }
    this._startupCompleted = true
    this._lastResolvedClaudeCliPath = settings.claudeCliPath

    // Precedence: explicit settings path wins; otherwise call the injected
    // resolver. Empty string == "not configured".
    const explicit = settings.claudeCliPath.trim()

    if (explicit.length > 0) {
      this._binaryPath = explicit
    } else {
      try {
        this._binaryPath = await this._resolveCliPath()
      } catch (e: unknown) {
        // NFR-ASM-006 — graceful degradation. Log without leaking PATH info.
        this._logger.warn('subscription.startup.resolver_failed', {
          transport: 'subscription',
          event: 'startup.resolver_failed',
        })
        void e
        this._binaryPath = null
      }
    }

    this._available = this._binaryPath !== null

    if (!this._available) {
      this._logger.warn('subscription.startup.binary_not_found', {
        transport: 'subscription',
        event: 'startup.binary_not_found',
      })
    }
  }

  /** REQ-ASM-009 — never throws. */
  async isAvailable(): Promise<boolean> {
    return this._available && this._binaryPath !== null
  }

  /**
   * Class-only synchronous accessor (SPEC §4.2). Returns the cached
   * `_available` flag without any I/O — used by `selectTransport()` at
   * view-registration time where awaiting is not possible.
   */
  isAvailableSync(): boolean {
    return this._available
  }

  /**
   * Synchronous SIGTERM ladder over every in-flight short-lived child.
   * Idempotent and safe to call before `startup()`. Never throws.
   * REQ-CCS-017 family.
   */
  shutdown(): void {
    if (this._shutdownCalled) return
    this._shutdownCalled = true

    for (const child of this._activeChildren) {
      this._killChild(child)
    }
    this._activeChildren.clear()

    this._available = false
  }

  // ── query() — free-text stream-json path ─────────────────────────────────

  /**
   * Free-text streaming query. Spawns a FRESH short-lived `claude` subprocess
   * for each call (the CLI's `-p` mode is one-shot — see class header). The
   * prompt is baked into argv; multi-turn continuity is the caller's
   * responsibility via `options.resumeSessionId`, which `buildSubprocessArgs`
   * translates to `--resume <id>` per INV-5 / REQ-ASM-035.
   *
   * Returns Result<string, ClaudeCliError>; never throws.
   *
   * Satisfies REQ-ASM-010, REQ-ASM-029, REQ-ASM-030, REQ-ASM-031, REQ-ASM-035.
   */
  async query(
    prompt: string,
    options?: ClaudeCliQueryOptions,
  ): Promise<Result<string, ClaudeCliError>> {
    if (!this._available || this._binaryPath === null) {
      return err(
        new ClaudeCliError(
          'CLI_LAUNCH_FAILED',
          'Subscription transport is not available — Claude CLI binary not found',
        ),
      )
    }

    const timeoutMs = this._clampTimeout(options?.timeoutMs)
    const argv = this._buildArgv(prompt, options)

    // Fresh spawn per turn (Codex P1 fix, PR #325). Context continuity is
    // already encoded in `argv` via --resume when the caller supplied
    // `resumeSessionId`; no per-thread state lives on this adapter.
    const spawned = this._spawnChild(this._binaryPath, argv)
    if (!spawned.ok) {
      return spawned
    }
    const proc = spawned.value

    // If the child has already emitted a fatal error synchronously between
    // spawn and the await below, surface it rather than hanging.
    if (proc.fatal !== null) {
      this._activeChildren.delete(proc.child)
      return err(proc.fatal)
    }

    return new Promise<Result<string, ClaudeCliError>>((resolve) => {
      const p = proc

      // eslint-disable-next-line obsidianmd/prefer-active-window-timers -- infra layer, no Obsidian context
      const timeoutHandle = setTimeout(() => {
        if (p.pending === null) return
        p.pending = null
        this._killChild(p.child)
        this._activeChildren.delete(p.child)
        resolve(
          err(
            new ClaudeCliError(
              'TIMEOUT',
              `Subscription query exceeded ${timeoutMs} ms`,
            ),
          ),
        )
      }, timeoutMs)

      p.pending = {
        resolve: (r) => {
          // eslint-disable-next-line obsidianmd/prefer-active-window-timers -- infra layer, no Obsidian context
          clearTimeout(timeoutHandle)
          resolve(r)
        },
        textBuffer: [],
        timeoutHandle,
      }
    })
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  /** Build the argv vector for a `query()` invocation. Extracted for complexity. */
  private _buildArgv(
    prompt: string,
    options: ClaudeCliQueryOptions | undefined,
  ): readonly string[] {
    const resume =
      typeof options?.resumeSessionId === 'string' && options.resumeSessionId.length > 0
        ? options.resumeSessionId
        : null
    return buildSubprocessArgs({
      prompt,
      systemPromptSuffix: options?.systemPromptSuffix ?? '',
      resumeSessionId: resume,
      jsonSchema: null,
    })
  }

  /**
   * Spawn the child and wire up readline + lifecycle listeners. Synchronous
   * throws (ENOENT) → err({ CLI_LAUNCH_FAILED }). Async `error` events that
   * fire before the pending turn is registered become a sticky fatal on the
   * TurnProc.
   */
  private _spawnChild(
    binaryPath: string,
    argv: readonly string[],
  ): Result<TurnProc, ClaudeCliError> {
    let child: ChildProcess
    try {
      child = this._spawn(binaryPath, argv, { stdio: ['pipe', 'pipe', 'pipe'] })
    } catch (e: unknown) {
      // NFR-ASM-005 — never log the binary path. Capture only the error code.
      const code = (e as NodeJS.ErrnoException | undefined)?.code
      this._logger.warn('subscription.spawn.failed', {
        transport: 'subscription',
        event: 'spawn.failed',
        code: code ?? null,
      })
      return err(
        new ClaudeCliError(
          'CLI_LAUNCH_FAILED',
          'Failed to spawn Claude CLI subprocess',
          e,
        ),
      )
    }

    const childLike = child as unknown as ChildProcessLike
    if (childLike.stdout === null) {
      // Defensive: spawn returned without a stdout stream. Treat as launch fail.
      return err(
        new ClaudeCliError(
          'CLI_LAUNCH_FAILED',
          'Spawned Claude CLI subprocess has no stdout',
        ),
      )
    }

    const proc: TurnProc = {
      child: childLike,
      stdoutBuffer: '',
      pending: null,
      sessionId: null,
      fatal: null,
    }

    this._activeChildren.add(childLike)

    // Manual line-based NDJSON reassembly (REQ-ASM-029). The spec mentions
    // `readline.createInterface` but the streaming surface our tests inject
    // (and what Obsidian's plugin host hands us in some packaging modes) is
    // a plain EventEmitter without the `.pause/.resume` methods readline
    // requires. Buffer-and-split keeps the semantics identical: chunks split
    // mid-line are concatenated, then any complete `\n`-terminated lines are
    // dispatched in order.
    childLike.stdout.on('data', (chunk: Buffer | string) => {
      const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8')
      proc.stdoutBuffer += text
      let newlineIdx = proc.stdoutBuffer.indexOf('\n')
      while (newlineIdx !== -1) {
        const line = proc.stdoutBuffer.slice(0, newlineIdx)
        proc.stdoutBuffer = proc.stdoutBuffer.slice(newlineIdx + 1)
        this._handleNdjsonLine(proc, line)
        newlineIdx = proc.stdoutBuffer.indexOf('\n')
      }
    })

    childLike.on('error', (errArg: unknown) => {
      const code = (errArg as NodeJS.ErrnoException | undefined)?.code
      this._logger.warn('subscription.child.error', {
        transport: 'subscription',
        event: 'child.error',
        code: code ?? null,
      })
      const fatal = new ClaudeCliError(
        'CLI_LAUNCH_FAILED',
        'Claude CLI subprocess emitted error before completion',
        errArg,
      )
      proc.fatal = fatal
      if (proc.pending !== null) {
        const pending = proc.pending
        proc.pending = null
        this._activeChildren.delete(proc.child)
        pending.resolve(err(fatal))
      }
    })

    childLike.on('close', (...args: unknown[]) => {
      const exitCode = typeof args[0] === 'number' ? args[0] : null
      this._handleClose(proc, exitCode)
    })

    return ok(proc)
  }

  /**
   * NDJSON dispatch (SPEC §4.3 `_parseNdjson`). Unparseable lines are dropped
   * silently (debug log without payload). Recognised events:
   *
   *   - `system/init`     → capture `session_id`
   *   - `assistant/message` → accumulate `text`
   *   - `result`          → resolve the pending turn (success or QUERY_FAILED)
   */
  private _handleNdjsonLine(proc: TurnProc, line: string): void {
    const event = this._parseNdjsonLine(line)
    if (event === null) return

    const eventType = typeof event.type === 'string' ? event.type : ''

    if (eventType === 'system/init') {
      this._handleSystemInit(proc, event)
    } else if (eventType === 'assistant/message') {
      this._handleAssistantMessage(proc, event)
    } else if (eventType === 'result') {
      this._handleResult(proc, event)
    }
    // Unknown event types are ignored (forward-compat with new CLI events).
  }

  /**
   * Parse one NDJSON line into a plain object, or return `null` (with a debug
   * log) for blank, non-object, or unparseable lines. Never logs payload.
   */
  private _parseNdjsonLine(line: string): Record<string, unknown> | null {
    const trimmed = line.trim()
    if (trimmed.length === 0) return null

    try {
      const parsed: unknown = JSON.parse(trimmed)
      if (parsed === null || typeof parsed !== 'object') {
        this._logger.debug('subscription.ndjson.non_object', {
          transport: 'subscription',
          event: 'ndjson.non_object',
        })
        return null
      }
      return parsed as Record<string, unknown>
    } catch {
      // SPEC §4.3 — drop unparseable lines with a debug log. Never log the
      // line content itself (may contain prompt fragments).
      this._logger.debug('subscription.ndjson.parse_failed', {
        transport: 'subscription',
        event: 'ndjson.parse_failed',
      })
      return null
    }
  }

  /** REQ-ASM-031 — capture `session_id` from a `system/init` event. */
  private _handleSystemInit(proc: TurnProc, event: Record<string, unknown>): void {
    const sid = event.session_id
    if (typeof sid === 'string' && sid.length > 0) {
      proc.sessionId = asSessionId(sid)
    }
  }

  /** Accumulate `text` deltas from `assistant/message` events into the pending turn. */
  private _handleAssistantMessage(proc: TurnProc, event: Record<string, unknown>): void {
    if (proc.pending !== null && typeof event.text === 'string') {
      proc.pending.textBuffer.push(event.text)
    }
  }

  /**
   * Resolve the in-flight turn from a `result` event. Maps `is_error: true`
   * to QUERY_FAILED per REQ-ASM-030.
   */
  private _handleResult(proc: TurnProc, event: Record<string, unknown>): void {
    const pending = proc.pending
    if (pending === null) return
    proc.pending = null

    const isError = event.is_error === true
    if (isError) {
      pending.resolve(
        err(
          new ClaudeCliError(
            'QUERY_FAILED',
            'Claude CLI returned result event with is_error=true',
          ),
        ),
      )
      return
    }

    // Prefer explicit `result` payload from the event; fall back to the
    // accumulated assistant deltas (covers transports that omit the field).
    const explicit = typeof event.result === 'string' ? event.result : null
    const text = explicit ?? pending.textBuffer.join('')
    pending.resolve(ok(text))
  }

  /**
   * Subprocess close handler. Non-zero exit while a turn is in flight →
   * QUERY_FAILED (REQ-ASM-030). The child is removed from `_activeChildren`
   * so it no longer counts toward `shutdown()`'s SIGTERM ladder.
   */
  private _handleClose(proc: TurnProc, exitCode: number | null): void {
    this._activeChildren.delete(proc.child)

    const pending = proc.pending
    if (pending !== null) {
      proc.pending = null
      if (exitCode !== null && exitCode !== 0) {
        pending.resolve(
          err(
            new ClaudeCliError(
              'QUERY_FAILED',
              `Claude CLI subprocess exited with code ${exitCode}`,
            ),
          ),
        )
      } else if (proc.fatal === null) {
        // Clean close with a pending turn (no result event) — treat as
        // QUERY_FAILED rather than hanging.
        pending.resolve(
          err(new ClaudeCliError('QUERY_FAILED', 'Subprocess closed before result event')),
        )
      }
    }

    // No readline interface to close — stdout listeners detach with the
    // EventEmitter as the underlying process is torn down.
  }

  /** SPEC §4.3 — SIGTERM, then SIGKILL after a short grace window. */
  private _killChild(child: ChildProcessLike): void {
    try {
      child.kill('SIGTERM')
    } catch {
      // Ignore — child may already be gone.
    }
    // eslint-disable-next-line obsidianmd/prefer-active-window-timers -- infra layer, no Obsidian context
    const ladder = setTimeout(() => {
      if (child.killed === true) return
      try {
        child.kill('SIGKILL')
      } catch {
        // Ignore.
      }
    }, SIGKILL_GRACE_MS)
    // Allow Node to exit even if this timer is still pending.
    if (typeof (ladder as { unref?: () => void }).unref === 'function') {
      ;(ladder as { unref: () => void }).unref()
    }
  }

  /** SPEC §4.3 `_clampTimeout`. */
  private _clampTimeout(raw?: number): number {
    return Math.min(Math.max(raw ?? DEFAULT_TIMEOUT_MS, MIN_TIMEOUT_MS), MAX_TIMEOUT_MS)
  }
}
