/**
 * T-MPS-063 — `CursorCliAdapter`: subscription-transport implementation of
 * `ChatTransportPort` driving the user-installed `cursor-agent` binary as a
 * short-lived child process per turn. Sibling of `ClaudeSubprocessAdapter`.
 *
 * Mirrors the Claude subprocess shape:
 *   - argv built by the pure `buildCursorSubprocessArgs` (SPEC-MPS-001 §6);
 *   - spawn / kill via shared `SubprocessLifecycle`;
 *   - stdout line reassembly via shared `NdjsonChannel`;
 *   - wire→`StreamDelta` translation via shared `StreamDeltaReducer`.
 *
 * Satisfies:
 *   - REQ-MPS-015 (Cursor CLI transport)
 *   - REQ-MPS-016 (no home-dir Cursor reads — enforced in T-MPS-057 lint test)
 *   - NFR-MPS-007 (abort → SIGTERM then SIGKILL via lifecycle)
 *
 * Spec reference: SPEC-MPS-001 §6 / DESIGN §C9.
 */
import {
  StreamDeltaReducer,
  type RawClaudeEvent,
  type RawStreamEventInner,
} from '@/application/chat/StreamDeltaReducer'
import {
  ChatTransportError,
  type ChatTransportPort,
  type ChatTransportStreamOptions,
  type StreamDelta,
} from '@/domain/ports/ChatTransportPort'
import type { LoggerPort } from '@/domain/ports/LoggerPort'
import type { TransportLifecyclePort } from '@/domain/ports/TransportLifecyclePort'
import type { PluginSettings } from '@/domain/settings/PluginSettings'
import type { SessionId } from '@/domain/chat/SessionId'
import { ok, type Result } from '@/domain/shared/Result'
import { buildCursorSubprocessArgs } from '@/infrastructure/obsidian/buildCursorSubprocessArgs'
import {
  createNdjsonChannel,
  type NdjsonChannel,
} from '@/infrastructure/obsidian/NdjsonChannel'
import {
  SubprocessLifecycle,
  type ChildProcessLike,
  type SpawnFn,
} from '@/infrastructure/obsidian/SubprocessLifecycle'

export type { SpawnFn }

const MIN_TIMEOUT_MS = 1_000
const MAX_TIMEOUT_MS = 300_000
const DEFAULT_TIMEOUT_MS = 30_000

export interface CursorCliAdapterDeps {
  readonly getSettings: () => PluginSettings
  readonly logger: LoggerPort
  readonly resolveCliPath: () => Promise<string | null>
  readonly spawn: SpawnFn
  /**
   * QW-A — vault root forwarded to `child_process.spawn` as `cwd`. Mirrors
   * `ClaudeSubprocessAdapterDeps.getVaultBasePath`. Optional; falls back to
   * the renderer cwd when absent or `null`.
   */
  readonly getVaultBasePath?: () => string | null
}

interface TurnProc {
  readonly child: ChildProcessLike
  readonly reducer: StreamDeltaReducer
  readonly channel: NdjsonChannel<StreamDelta>
  onSessionId: ((sessionId: SessionId) => void) | null
}

/**
 * Subscription-transport implementation of `ChatTransportPort` for Cursor.
 */
export class CursorCliAdapter implements ChatTransportPort, TransportLifecyclePort {
  public readonly kind = 'subscription' as const

  private _available = false
  private _startupCompleted = false
  private _binaryPath: string | null = null
  private _lastResolvedCursorCliPath: string | null = null
  private readonly _lifecycle: SubprocessLifecycle

  private readonly _getSettings: () => PluginSettings
  private readonly _logger: LoggerPort
  private readonly _resolveCliPath: () => Promise<string | null>
  private readonly _getVaultBasePath: () => string | null

  constructor(deps: CursorCliAdapterDeps) {
    this._getSettings = deps.getSettings
    this._logger = deps.logger
    this._resolveCliPath = deps.resolveCliPath
    this._lifecycle = new SubprocessLifecycle({ spawn: deps.spawn, logger: deps.logger })
    this._getVaultBasePath = deps.getVaultBasePath ?? ((): string | null => null)
  }

  async startup(): Promise<void> {
    const settings = this._getSettings()
    if (
      this._startupCompleted &&
      this._lastResolvedCursorCliPath === settings.cursorCliPath
    ) {
      return
    }
    this._startupCompleted = true
    this._lastResolvedCursorCliPath = settings.cursorCliPath

    const explicit = settings.cursorCliPath.trim()
    if (explicit.length > 0) {
      this._binaryPath = explicit
    } else {
      try {
        this._binaryPath = await this._resolveCliPath()
      } catch (e: unknown) {
        this._logger.warn('cursor.startup.resolver_failed', {
          transport: 'cursor-cli',
          event: 'startup.resolver_failed',
        })
        void e
        this._binaryPath = null
      }
    }

    this._available = this._binaryPath !== null
    if (!this._available) {
      this._logger.warn('cursor.startup.binary_not_found', {
        transport: 'cursor-cli',
        event: 'startup.binary_not_found',
      })
    }
  }

  async isAvailable(): Promise<boolean> {
    return this._available && this._binaryPath !== null
  }

  isAvailableSync(): boolean {
    return this._available
  }

  shutdown(): void {
    if (this._lifecycle.shuttingDown) return
    this._lifecycle.shutdownAll()
    this._available = false
  }

  queryStream(prompt: string, options?: ChatTransportStreamOptions): AsyncIterable<StreamDelta> {
    return this._runStream(prompt, options)
  }

  private async *_runStream(
    prompt: string,
    options?: ChatTransportStreamOptions,
  ): AsyncIterable<StreamDelta> {
    const pre = this._preflightStream(options)
    if (pre !== null) {
      yield pre
      return
    }

    const reducer = new StreamDeltaReducer({ turnId: CursorCliAdapter._randomTurnId() })
    const argv = this._buildArgv(prompt, options)

    const spawned = this._spawnChild(this._binaryPath!, argv, options?.onSessionId ?? null, reducer)
    if (!spawned.ok) {
      yield { type: 'error', error: spawned.error }
      return
    }
    const proc = spawned.value

    const timeoutMs = this._clampTimeout(options?.timeoutMs)
    const timeoutHandle = this._installStreamTimeout(proc, timeoutMs)
    const detachAbort = this._installStreamAbort(proc, options?.signal)

    try {
      yield* proc.channel.iterate()
    } finally {
      // eslint-disable-next-line obsidianmd/prefer-active-window-timers -- infra layer, no Obsidian context
      clearTimeout(timeoutHandle)
      detachAbort()
      if (!proc.reducer.terminated) {
        this._lifecycle.kill(proc.child)
        this._lifecycle.release(proc.child)
        proc.channel.complete()
      }
    }
  }

  private _preflightStream(options: ChatTransportStreamOptions | undefined): StreamDelta | null {
    if (!this._available || this._binaryPath === null) {
      return {
        type: 'error',
        error: new ChatTransportError(
          'CLI_LAUNCH_FAILED',
          'Cursor CLI transport is not available — cursor-agent binary not found',
        ),
      }
    }
    if (options?.signal?.aborted === true) {
      return {
        type: 'error',
        error: new ChatTransportError('QUERY_FAILED', 'Request was aborted before send'),
      }
    }
    return null
  }

  private _installStreamTimeout(
    proc: TurnProc,
    timeoutMs: number,
  ): ReturnType<typeof setTimeout> {
    // eslint-disable-next-line obsidianmd/prefer-active-window-timers -- infra layer, no Obsidian context
    return setTimeout(() => {
      if (proc.reducer.terminated) return
      this._lifecycle.kill(proc.child)
      this._emitTerminalError(
        proc,
        new ChatTransportError('TIMEOUT', `Cursor CLI query exceeded ${timeoutMs.toString()} ms`),
      )
    }, timeoutMs)
  }

  private _installStreamAbort(proc: TurnProc, signal: AbortSignal | undefined): () => void {
    const onAbort = (): void => {
      if (proc.reducer.terminated) return
      this._lifecycle.kill(proc.child)
      this._emitTerminalError(
        proc,
        new ChatTransportError('QUERY_FAILED', 'Request was aborted'),
      )
    }
    if (signal === undefined) return () => undefined
    signal.addEventListener('abort', onAbort, { once: true })
    if (signal.aborted) onAbort()
    return () => {
      signal.removeEventListener('abort', onAbort)
    }
  }

  private _buildArgv(
    prompt: string,
    options: ChatTransportStreamOptions | undefined,
  ): readonly string[] {
    const resume =
      typeof options?.resumeSessionId === 'string' && options.resumeSessionId.length > 0
        ? options.resumeSessionId
        : null
    const model = this._getSettings().providerModel.cursor
    return buildCursorSubprocessArgs({
      prompt,
      model: typeof model === 'string' && model.length > 0 ? model : null,
      planMode: false,
      resumeSessionId: resume,
    })
  }

  private _spawnChild(
    binaryPath: string,
    argv: readonly string[],
    onSessionId: ((sessionId: SessionId) => void) | null,
    reducer: StreamDeltaReducer,
  ): Result<TurnProc, ChatTransportError> {
    const spawned = this._lifecycle.spawn(
      binaryPath,
      argv,
      'spawn.failed',
      this._getVaultBasePath(),
    )
    if (!spawned.ok) return spawned
    const child = spawned.value

    const procRef: { current: TurnProc | null } = { current: null }
    const channel = createNdjsonChannel<StreamDelta>({
      onLine: (line) => {
        if (procRef.current === null) return
        this._handleNdjsonLine(procRef.current, line)
      },
      onOverflow: (bufferBytes) => {
        if (procRef.current === null) return
        this._logger.warn('cursor.stdout.overflow', {
          transport: 'cursor-cli',
          event: 'stdout.overflow',
          bufferBytes,
        })
        this._lifecycle.kill(procRef.current.child)
        this._emitTerminalError(
          procRef.current,
          new ChatTransportError(
            'QUERY_FAILED',
            'Cursor CLI stdout exceeded the buffer cap without a newline',
          ),
        )
      },
    })

    const proc: TurnProc = { child, reducer, channel, onSessionId }
    procRef.current = proc

    this._wireChildListeners(proc)
    return ok(proc)
  }

  private _wireChildListeners(proc: TurnProc): void {
    const childLike = proc.child
    const stdout = childLike.stdout
    if (stdout !== null) {
      stdout.on('data', (chunk: Buffer | string) => {
        proc.channel.pushBytes(chunk)
      })
    }
    childLike.on('error', (errArg: unknown) => {
      const code = (errArg as NodeJS.ErrnoException | undefined)?.code
      this._logger.warn('cursor.child.error', {
        transport: 'cursor-cli',
        event: 'child.error',
        code: code ?? null,
      })
      if (proc.reducer.terminated) return
      this._lifecycle.release(proc.child)
      this._emitTerminalError(
        proc,
        new ChatTransportError(
          'CLI_LAUNCH_FAILED',
          'Cursor CLI subprocess emitted error before completion',
          errArg,
        ),
      )
    })
    childLike.on('close', (...args: unknown[]) => {
      const exitCode = typeof args[0] === 'number' ? args[0] : null
      this._handleClose(proc, exitCode)
    })
  }

  private _handleNdjsonLine(proc: TurnProc, line: string): void {
    const event = this._parseNdjsonLine(line)
    if (event === null) return
    const raw = CursorCliAdapter._ndjsonToRawEvent(event)
    if (raw === null) return
    this._emitFromReducer(proc, raw)
  }

  /**
   * Map an NDJSON record into a `RawClaudeEvent`. Cursor's wire shape mirrors
   * Claude's NDJSON envelope (`system/init`, `assistant/message`, `result`),
   * so the same reducer alphabet applies. Unknown event types are dropped.
   */
  private static _ndjsonToRawEvent(event: Record<string, unknown>): RawClaudeEvent | null {
    const eventType = typeof event.type === 'string' ? event.type : ''
    if (eventType === 'system/init') return CursorCliAdapter._systemInitRaw(event)
    if (eventType === 'assistant/message') {
      const text = typeof event.text === 'string' ? event.text : ''
      return { kind: 'assistant-message', text }
    }
    if (eventType === 'result') return CursorCliAdapter._resultRaw(event)
    if (eventType === 'stream_event') return CursorCliAdapter._streamEventRaw(event)
    return null
  }

  private static _systemInitRaw(event: Record<string, unknown>): RawClaudeEvent {
    const sid =
      typeof event.session_id === 'string' && event.session_id.length > 0
        ? event.session_id
        : null
    return { kind: 'system-init', sessionId: sid }
  }

  private static _resultRaw(event: Record<string, unknown>): RawClaudeEvent {
    const subtype = typeof event.subtype === 'string' ? event.subtype : undefined
    const result = typeof event.result === 'string' ? event.result : undefined
    const isError = event.is_error === true ? true : undefined
    return { kind: 'result', subtype, result, is_error: isError }
  }

  private static _streamEventRaw(event: Record<string, unknown>): RawClaudeEvent {
    const inner =
      typeof event.event === 'object' && event.event !== null
        ? (event.event as RawStreamEventInner)
        : (event as RawStreamEventInner)
    return { kind: 'stream-event', event: inner }
  }

  private _emitFromReducer(proc: TurnProc, raw: RawClaudeEvent): void {
    if (proc.reducer.terminated) return
    const deltas = proc.reducer.consume(raw)
    let terminal = false
    for (const delta of deltas) {
      if (delta.type === 'session-id') {
        this._fireOnSessionId(proc, delta.sessionId)
      }
      if (delta.type === 'done' || delta.type === 'error') terminal = true
      proc.channel.push(delta)
    }
    if (terminal) proc.channel.complete()
  }

  private _emitTerminalError(proc: TurnProc, error: ChatTransportError): void {
    for (const delta of proc.reducer.emitError(error)) {
      proc.channel.push(delta)
    }
    proc.channel.complete()
  }

  private _fireOnSessionId(proc: TurnProc, sid: SessionId): void {
    if (proc.onSessionId === null) return
    const cb = proc.onSessionId
    proc.onSessionId = null
    try {
      cb(sid)
    } catch (e: unknown) {
      this._logger.debug('cursor.onSessionId.threw', {
        transport: 'cursor-cli',
        event: 'onSessionId.threw',
      })
      void e
    }
  }

  private static _randomTurnId(): string {
    const c =
      typeof window !== 'undefined'
        ? (window as { crypto?: { randomUUID?: () => string } }).crypto
        : undefined
    if (c !== undefined && typeof c.randomUUID === 'function') {
      return c.randomUUID()
    }
    return `t-${Date.now().toString()}-${Math.floor(Math.random() * 1_000_000).toString()}`
  }

  private _parseNdjsonLine(line: string): Record<string, unknown> | null {
    const trimmed = line.trim()
    if (trimmed.length === 0) return null
    try {
      const parsed: unknown = JSON.parse(trimmed)
      if (parsed === null || typeof parsed !== 'object') {
        this._logger.debug('cursor.ndjson.non_object', {
          transport: 'cursor-cli',
          event: 'ndjson.non_object',
        })
        return null
      }
      return parsed as Record<string, unknown>
    } catch {
      this._logger.debug('cursor.ndjson.parse_failed', {
        transport: 'cursor-cli',
        event: 'ndjson.parse_failed',
      })
      return null
    }
  }

  private _handleClose(proc: TurnProc, exitCode: number | null): void {
    this._lifecycle.release(proc.child)
    if (proc.reducer.terminated) return
    if (exitCode !== null && exitCode !== 0) {
      this._emitTerminalError(
        proc,
        new ChatTransportError(
          'QUERY_FAILED',
          `Cursor CLI subprocess exited with code ${exitCode.toString()}`,
        ),
      )
      return
    }
    this._emitTerminalError(
      proc,
      new ChatTransportError('QUERY_FAILED', 'Subprocess closed before result event'),
    )
  }

  private _clampTimeout(raw?: number): number {
    return Math.min(Math.max(raw ?? DEFAULT_TIMEOUT_MS, MIN_TIMEOUT_MS), MAX_TIMEOUT_MS)
  }
}
